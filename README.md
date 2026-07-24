# InternHub

Intern & project management app for 3 admins + interns.

## Run locally (with Docker)

```bash
cp .env.example .env
# Edit .env and set POSTGRES_PASSWORD and SECRET_KEY.
docker-compose up --build
```

- Frontend: http://localhost:3000
- Backend API documentation: http://localhost:3000/docs (proxied through nginx)

## Optional local admin seed

The application does not ship a production default password. To create a local admin on an empty database, set these values in `.env` before the first start:

```text
SEED_ADMIN=1
SEED_ADMIN_PASSWORD=choose-a-strong-local-password
```

The seeded account uses `admin@intern.app`. Never enable this seed process in production.

## Run without Docker

**Backend:**
```bash
cd backend
pip install -r requirements.txt
alembic upgrade head
uvicorn app.main:app --reload
```

**Frontend:**
```bash
cd frontend
npm install
npm start
```

> Set `VITE_API_URL=http://localhost:8000` in `frontend/.env`.

## Runtime checks

- `GET /health` confirms the FastAPI process is running.
- `GET /ready` confirms the API can connect to PostgreSQL.

For production, configure `DATABASE_URL`, `SECRET_KEY`, `FRONTEND_URL`, and `ENVIRONMENT=production` through the hosting platform's secret manager. The backend rejects wildcard CORS and missing critical settings in production.

## Database migrations

The backend now applies versioned Alembic migrations before it starts. New databases initialize automatically. For an existing database, follow the one-time backup and stamping procedure in [`backend/alembic/README.md`](backend/alembic/README.md) before deploying this change.

## Continuous integration

GitHub Actions validates every pull request and change pushed to `main` or a `devops/*` branch. It runs frontend tests and production build, backend tests, a real PostgreSQL migration, both container builds, and Docker Compose configuration validation. The workflow is in [`.github/workflows/ci.yml`](.github/workflows/ci.yml).

## Production deployment

The frontend is configured for Vercel and the API for Railway. Follow the [production deployment runbook](docs/DEPLOYMENT.md) to request access, set the platform variables, deploy safely, and verify or roll back a release.

## Security and operations

The repository has CI, secret scanning, CodeQL, dependency review, image scans, deployment smoke checks, rate limiting, request logging, metrics, and optional Sentry integration. See the [security policy](SECURITY.md) and [operations runbook](docs/OPERATIONS.md) for the administrator and platform setup that completes the production controls.

## Features

- 3 admin accounts can manage interns, projects, and tasks
- Interns log in and see only their assigned tasks & projects
- Projects have GitHub repo links attached
- Kanban-style task board per project (Todo / In Progress / Done)
- Task priority (low / medium / high) and deadlines
