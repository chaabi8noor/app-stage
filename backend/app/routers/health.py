from fastapi import APIRouter, HTTPException, status
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from app.core.database import engine


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
