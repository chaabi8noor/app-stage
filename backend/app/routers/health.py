from fastapi import APIRouter, Header, HTTPException, status
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from app.core.database import engine
from app.core.observability import prometheus_metrics


router = APIRouter(tags=["operations"])


@router.get("/health", summary="Liveness check")
def health_check():
    """Return success when the API process is running."""
    return {"status": "ok"}


@router.get("/ready", summary="Readiness check")
def readiness_check():
    """Return success only when the API can connect to its database."""
    try:
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))
    except SQLAlchemyError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database is unavailable",
        ) from exc

    return {"status": "ready"}


@router.get("/metrics", include_in_schema=False)
def metrics(authorization: str | None = Header(default=None)):
    """Return Prometheus metrics; production access requires a bearer token."""
    return prometheus_metrics(authorization)
