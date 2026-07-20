# InternHub

Intern & project management app for 3 admins + interns.

## Run locally (with Docker)

```bash
cp .env.example .env
# Edit .env and set POSTGRES_PASSWORD and SECRET_KEY.
docker-compose up --build
```

- Frontend: http://localhost:3000
- Backend API: http://localhost:8000/docs

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
uvicorn app.main:app --reload
```

**Frontend:**
```bash
cd frontend
npm install
npm start
```

> Set `REACT_APP_API_URL=http://localhost:8000` in `frontend/.env`.

## Runtime checks

- `GET /health` confirms the FastAPI process is running.
- `GET /ready` confirms the API can connect to PostgreSQL.

For production, configure `DATABASE_URL`, `SECRET_KEY`, `FRONTEND_URL`, and `ENVIRONMENT=production` through the hosting platform's secret manager. The backend rejects wildcard CORS and missing critical settings in production.

## Features

- 3 admin accounts can manage interns, projects, and tasks
- Interns log in and see only their assigned tasks & projects
- Projects have GitHub repo links attached
- Kanban-style task board per project (Todo / In Progress / Done)
- Task priority (low / medium / high) and deadlines
