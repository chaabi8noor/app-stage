"""Safe, platform-neutral observability primitives for the API."""

from __future__ import annotations

import hmac
import json
import logging
import time
import uuid
from collections import defaultdict, deque
from datetime import datetime, timezone
from threading import Lock
from typing import Deque

from fastapi import HTTPException, Request, status
from prometheus_client import CONTENT_TYPE_LATEST, Counter, Histogram, generate_latest
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse, Response

from app.core.config import settings


REQUESTS_TOTAL = Counter(
    "internhub_http_requests_total",
    "HTTP responses returned by the InternHub API.",
    ("method", "route", "status_code"),
)
REQUEST_DURATION = Histogram(
    "internhub_http_request_duration_seconds",
    "Time spent serving InternHub API requests.",
    ("method", "route"),
)


class JsonFormatter(logging.Formatter):
    """Emit only structured operational metadata; never request bodies or headers."""

    _extra_fields = ("request_id", "method", "path", "route", "status_code", "duration_ms")

    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, object] = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }
        for field in self._extra_fields:
            value = getattr(record, field, None)
            if value is not None:
                payload[field] = value
        if record.exc_info:
            payload["exception"] = self.formatException(record.exc_info)
        return json.dumps(payload, ensure_ascii=False)


def configure_logging() -> None:
    """Configure a single JSON logger without changing Uvicorn's own log handlers."""

    logger = logging.getLogger("internhub")
    logger.setLevel(settings.LOG_LEVEL.upper())
    logger.propagate = False
    if logger.handlers:
        return

    handler = logging.StreamHandler()
    handler.setFormatter(JsonFormatter())
    logger.addHandler(handler)


def initialize_sentry() -> None:
    """Enable error tracking only when a server-side DSN is configured."""

    if not settings.SENTRY_DSN:
        return

    import sentry_sdk
    from sentry_sdk.integrations.fastapi import FastApiIntegration

    sentry_sdk.init(
        dsn=settings.SENTRY_DSN,
        environment=settings.ENVIRONMENT,
        integrations=[FastApiIntegration()],
        traces_sample_rate=settings.SENTRY_TRACES_SAMPLE_RATE,
        send_default_pii=False,
    )


class RequestObservabilityMiddleware(BaseHTTPMiddleware):
    """Attach a request ID, JSON access log, and low-cardinality Prometheus metrics."""

    async def dispatch(self, request: Request, call_next):  # type: ignore[no-untyped-def]
        incoming_request_id = request.headers.get("X-Request-ID", "")
        request_id = incoming_request_id[:128] if incoming_request_id.isprintable() else ""
        request_id = request_id or uuid.uuid4().hex
        started_at = time.perf_counter()
        logger = logging.getLogger("internhub.request")

        try:
            response = await call_next(request)
        except Exception:
            logger.exception(
                "request_failed",
                extra={
                    "request_id": request_id,
                    "method": request.method,
                    "path": request.url.path,
                },
            )
            raise

        duration_seconds = time.perf_counter() - started_at
        route = request.scope.get("route")
        route_path = getattr(route, "path", "unmatched")
        REQUESTS_TOTAL.labels(request.method, route_path, response.status_code).inc()
        REQUEST_DURATION.labels(request.method, route_path).observe(duration_seconds)
        response.headers["X-Request-ID"] = request_id
        logger.info(
            "request_completed",
            extra={
                "request_id": request_id,
                "method": request.method,
                "path": request.url.path,
                "route": route_path,
                "status_code": response.status_code,
                "duration_ms": round(duration_seconds * 1000, 2),
            },
        )
        return response


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Add conservative browser-facing headers to every API response."""

    async def dispatch(self, request: Request, call_next):  # type: ignore[no-untyped-def]
        response = await call_next(request)
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
        response.headers.setdefault("Permissions-Policy", "camera=(), geolocation=(), microphone=()")
        if settings.is_production:
            response.headers.setdefault("Strict-Transport-Security", "max-age=31536000")
        if request.url.path.startswith("/auth/"):
            response.headers.setdefault("Cache-Control", "no-store")
        return response


class RateLimitMiddleware(BaseHTTPMiddleware):
    """In-memory protection for expensive and credential-bearing routes.

    The limits are per API process. For multi-instance production deployments, put
    the API behind a provider/WAF rate limit as documented in the operations guide.
    """

    def __init__(
        self,
        app,
        *,
        window_seconds: int,
        login_limit: int,
        upload_limit: int,
        ai_limit: int,
        trust_proxy_headers: bool,
    ) -> None:
        super().__init__(app)
        self.window_seconds = window_seconds
        self.login_limit = login_limit
        self.upload_limit = upload_limit
        self.ai_limit = ai_limit
        self.trust_proxy_headers = trust_proxy_headers
        self._requests: dict[tuple[str, str], Deque[float]] = defaultdict(deque)
        self._lock = Lock()

    def _client_address(self, request: Request) -> str:
        if self.trust_proxy_headers:
            forwarded_for = request.headers.get("X-Forwarded-For", "")
            if forwarded_for:
                return forwarded_for.split(",", maxsplit=1)[0].strip()
        return request.client.host if request.client else "unknown"

    def _limit_for(self, request: Request) -> tuple[str, int] | None:
        path = request.url.path
        if path == "/auth/login" and request.method == "POST":
            return "login", self.login_limit
        if path.endswith("/resources/file") and request.method == "POST":
            return "upload", self.upload_limit
        if request.method == "POST" and ("/analyze/" in path or path.startswith("/feedback")):
            return "ai", self.ai_limit
        return None

    async def dispatch(self, request: Request, call_next):  # type: ignore[no-untyped-def]
        rate_limit = self._limit_for(request)
        if not rate_limit:
            return await call_next(request)

        bucket, maximum = rate_limit
        now = time.monotonic()
        key = (self._client_address(request), bucket)
        with self._lock:
            timestamps = self._requests[key]
            cutoff = now - self.window_seconds
            while timestamps and timestamps[0] <= cutoff:
                timestamps.popleft()
            if len(timestamps) >= maximum:
                retry_after = max(1, int(self.window_seconds - (now - timestamps[0])))
                return JSONResponse(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    content={"detail": "Rate limit exceeded. Try again later."},
                    headers={
                        "Retry-After": str(retry_after),
                        "X-RateLimit-Limit": str(maximum),
                        "X-RateLimit-Remaining": "0",
                    },
                )
            timestamps.append(now)
            remaining = maximum - len(timestamps)

        response = await call_next(request)
        response.headers.setdefault("X-RateLimit-Limit", str(maximum))
        response.headers.setdefault("X-RateLimit-Remaining", str(remaining))
        return response


def prometheus_metrics(authorization: str | None) -> Response:
    """Expose metrics only with a token in production; local development stays easy."""

    if settings.is_production:
        if not settings.METRICS_TOKEN:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
        expected = f"Bearer {settings.METRICS_TOKEN}"
        if not authorization or not hmac.compare_digest(authorization, expected):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unauthorized")
    return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST)
