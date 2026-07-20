# Database migration workflow

The backend container runs `alembic upgrade head` before starting Uvicorn.

## New database

No manual action is needed. The initial revision creates the complete schema.

## Existing database

Before deploying this migration workflow to an existing database:

1. Take and verify a database backup.
2. Confirm the existing schema contains the current application tables and columns.
3. Run `alembic stamp 74045f2052b0` once against that database.
4. Deploy the new container. Future releases use `alembic upgrade head`.

Never stamp a database unless its schema has been checked. Stamping records a
revision without applying DDL.

## Creating a future migration

From `backend/`, with `DATABASE_URL` pointing to a development or staging
database:

```bash
alembic revision --autogenerate -m "describe the schema change"
alembic upgrade head
```

Review generated migrations before committing them. Test every migration in
staging before production.
