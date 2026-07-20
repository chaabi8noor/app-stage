import unittest
from unittest.mock import MagicMock, patch

from fastapi import HTTPException
from sqlalchemy.exc import SQLAlchemyError

from app.routers.health import health_check, readiness_check


class HealthCheckTests(unittest.TestCase):
    def test_liveness_returns_ok(self):
        self.assertEqual(health_check(), {"status": "ok"})

    @patch("app.routers.health.engine")
    def test_readiness_returns_ready_when_database_is_available(self, mock_engine):
        mock_engine.connect.return_value.__enter__.return_value = MagicMock()

        self.assertEqual(readiness_check(), {"status": "ready"})

    @patch("app.routers.health.engine")
    def test_readiness_returns_503_when_database_is_unavailable(self, mock_engine):
        mock_engine.connect.side_effect = SQLAlchemyError("database unavailable")

        with self.assertRaises(HTTPException) as context:
            readiness_check()

        self.assertEqual(context.exception.status_code, 503)


if __name__ == "__main__":
    unittest.main()
