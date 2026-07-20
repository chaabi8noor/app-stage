# Production deployment runbook

This repository deploys as two services:

```text
Browser -> Vercel (React single-page application) -> Railway (FastAPI API + PostgreSQL)
```

Vercel serves only the frontend. Railway hosts the API and database migration. Do not put a database connection string or Anthropic key in Vercel: a Create React App variable is included in the browser bundle.

## Access required

Ask workspace owners to invite your individual work account. They should not share passwords, API tokens, or secret values.

| Platform | Scope to request | Reason |
| --- | --- | --- |
| GitHub | `chaabi8noor/app-stage` write access; admin only for branch protection or Actions settings | merge approved pull requests and inspect CI |
| Vercel | team/project member who can deploy, view logs, set project variables, and manage domains | operate the frontend |
| Railway | workspace/project member who can deploy, view logs, set service variables, link PostgreSQL, and manage domains | operate the API and database |

The owner uses **Team/Workspace settings -> Members -> Invite**, enters your email, chooses the least role covering those actions, and sends the invitation. You accept it from your own email.

## Railway: API and PostgreSQL

1. Create a Railway project with a `Postgres` service and an API service connected to `chaabi8noor/app-stage`.
2. Set the API service root directory to `backend` and config-as-code path to `/backend/railway.toml`. The checked-in config uses the Dockerfile, runs `alembic upgrade head` before deployment, checks `/health`, and restarts failures.
3. Set these production variables on the API service:

   ```dotenv
   DATABASE_URL=${{Postgres.DATABASE_URL}}
   ENVIRONMENT=production
   SECRET_KEY=<a-new-long-random-secret>
   FRONTEND_URL=https://<vercel-production-domain>
   LOG_LEVEL=INFO
   SEED_ADMIN=0
   ANTHROPIC_API_KEY=<optional-server-only-key>
   ```

   `DATABASE_URL` is a Railway reference variable; replace `Postgres` if the database service has another name. Railway supplies `PORT`; do not configure it manually.
4. Generate a public API domain, deploy, then check `https://<api-domain>/health` and `https://<api-domain>/ready`. The first checks process liveness; the second also checks database connectivity.
5. Before the first deployment against an existing database, follow the backup and stamping procedure in [`../backend/alembic/README.md`](../backend/alembic/README.md). Never stamp an unknown schema or run a downgrade during an incident without a tested recovery plan.

## Vercel: frontend

1. Import `chaabi8noor/app-stage` as a Vercel project, set root directory to `frontend`, and make `main` the production branch.
2. [`../frontend/vercel.json`](../frontend/vercel.json) provides `npm ci`, the build command, output directory, and SPA fallback. Do not add conflicting build overrides in the dashboard.
3. Add the following production environment variable and redeploy:

   ```dotenv
   REACT_APP_API_URL=https://<api-domain>
   ```

   The API URL is intentionally public; it is compiled into the frontend. It must never contain credentials. Variable changes affect only new deployments.
4. Copy the Vercel production URL to Railway's `FRONTEND_URL`, redeploy the API, then verify browser sign-in and an authenticated API request.

For preview deployments, point `REACT_APP_API_URL` at a staging API/database. Do not point every preview at production. The production API permits only explicitly configured CORS origins, so define a deliberate preview-domain policy before connecting previews to it.

## Release and recovery checklist

1. Require the GitHub **CI** workflow to pass before merging.
2. Review every Alembic revision and back up the database before destructive or data-transforming changes.
3. Merge to `main`, then check the Railway logs, `/health`, `/ready`, Vercel deployment status, browser console, login, one read action, and one write action.
4. For a frontend-only regression, promote the prior Vercel deployment. For API rollback, verify the database migration is compatible with the previous application before using Railway rollback.
5. Rotate any secret exposed in a repository, chat, browser bundle, or deployment log.

## Source documentation

- [Railway config as code](https://docs.railway.com/config-as-code)
- [Railway config reference](https://docs.railway.com/config-as-code/reference)
- [Railway variable references](https://docs.railway.com/integrations/api/manage-variables)
- [Vercel `vercel.json` configuration](https://vercel.com/docs/project-configuration/vercel-json)
- [Vercel environment variables](https://vercel.com/docs/environment-variables)
