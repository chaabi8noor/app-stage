import unittest

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.core.observability import (
    RateLimitMiddleware,
    RequestObservabilityMiddleware,
    SecurityHeadersMiddleware,
)


class ObservabilityMiddlewareTests(unittest.TestCase):
    def test_security_headers_and_request_id_are_returned(self):
        app = FastAPI()
        app.add_middleware(SecurityHeadersMiddleware)
        app.add_middleware(RequestObservabilityMiddleware)

        @app.get("/ok")
        def ok():
            return {"status": "ok"}

        response = TestClient(app).get("/ok", headers={"X-Request-ID": "request-123"})

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers["X-Request-ID"], "request-123")
        self.assertEqual(response.headers["X-Content-Type-Options"], "nosniff")
        self.assertEqual(response.headers["X-Frame-Options"], "DENY")

    def test_login_requests_are_rate_limited(self):
        app = FastAPI()
        app.add_middleware(
            RateLimitMiddleware,
            window_seconds=60,
            login_limit=2,
            upload_limit=10,
            ai_limit=10,
            trust_proxy_headers=False,
        )

        @app.post("/auth/login")
        def login():
            return {"status": "ok"}

        client = TestClient(app)
        self.assertEqual(client.post("/auth/login").status_code, 200)
        self.assertEqual(client.post("/auth/login").status_code, 200)
        limited = client.post("/auth/login")

        self.assertEqual(limited.status_code, 429)
        self.assertEqual(limited.headers["X-RateLimit-Remaining"], "0")
        self.assertIn("Retry-After", limited.headers)
