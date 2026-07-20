import secrets
import warnings

from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql://postgres:password@localhost:5432/internapp"
    SECRET_KEY: str = ""
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24
    ANTHROPIC_API_KEY: str = ""
    FRONTEND_URL: str = "http://localhost:3000"
    ENVIRONMENT: str = "development"
    LOG_LEVEL: str = "INFO"

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    @property
    def is_production(self) -> bool:
        return self.ENVIRONMENT.lower() == "production"

settings = Settings()

# Production must never silently use local defaults or an ephemeral JWT signing key.
if settings.is_production:
    if not settings.SECRET_KEY:
        raise RuntimeError("SECRET_KEY must be configured in production")
    if settings.DATABASE_URL == "postgresql://postgres:password@localhost:5432/internapp":
        raise RuntimeError("DATABASE_URL must be configured in production")
    if not settings.FRONTEND_URL or "*" in settings.FRONTEND_URL:
        raise RuntimeError("FRONTEND_URL must contain explicit production origins")

if not settings.ANTHROPIC_API_KEY:
    warnings.warn("ANTHROPIC_API_KEY is not configured; AI features are unavailable", stacklevel=1)

if not settings.SECRET_KEY:
    # Local development can use an ephemeral key. Production is rejected above.
    settings.SECRET_KEY = secrets.token_hex(32)
    warnings.warn(
        "SECRET_KEY is not configured; generated a temporary development key. "
        "Configure SECRET_KEY before deploying.",
        stacklevel=1,
    )
