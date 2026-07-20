# Operations and reliability runbook

This runbook closes the operations layer of the DevOps architecture. Repository-side controls are versioned here; the platform-side controls below require access to the Vercel project and Railway workspace.

## Release gate

1. Open a pull request; require review and successful **CI** and **Security** workflows.
2. Review Alembic revisions for compatibility and take a database backup before destructive or data-transforming work.
3. Merge only to the protected `main` branch.
4. When the providers deploy, run **Deployment smoke test** from Actions with the public frontend and API URLs.
5. Record the deployment IDs, migration revision, smoke-test result, and any rollback decision in the release ticket.

## GitHub administrator setup

In **Settings -> Code security and analysis**, enable secret scanning and push protection. In **Settings -> Rules**, protect `main` with:

- pull request required before merge, with at least one approving review;
- required status checks: `CI` and `Security`;
- resolved conversations required;
- force pushes and branch deletion blocked; and
- no routine administrator bypass.

Dependabot opens weekly update pull requests for npm, pip, and GitHub Actions. Review its changes through the same gate.

## Production variables

Set the following only in Railway's API service; do not copy them to Vercel:

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | Yes | Railway PostgreSQL reference variable |
| `SECRET_KEY` | Yes | Long random JWT signing secret |
| `FRONTEND_URL` | Yes | Exact Vercel production origin(s) |
| `METRICS_TOKEN` | Yes | Bearer token required to scrape `/metrics` in production |
| `SENTRY_DSN` | Recommended | Backend exception and performance tracking |
| `ANTHROPIC_API_KEY` | If AI is enabled | Server-side AI key only |
| `TRUST_PROXY_HEADERS` | Railway only | Set `true` only after confirming Railway overwrites `X-Forwarded-For` |

Set these in Vercel only:

| Variable | Required | Purpose |
| --- | --- | --- |
| `VITE_API_URL` | Yes | Public Railway API URL compiled into the React build |
| `VITE_SENTRY_DSN` | Recommended | Public browser error-tracking DSN |
| `VITE_ENVIRONMENT` | Yes | `production`, `staging`, or `preview` label for browser events |

Every variable change requires a fresh deployment. Keep preview values pointed at staging infrastructure, never production data.

## Monitoring and alerts

1. Create external uptime checks for the Vercel URL and Railway `/ready` URL. Alert after two consecutive failures and route alerts to the on-call owner.
2. Configure Sentry projects for the browser and API. Alert on a new unhandled exception, a sustained increase in error rate, and failed releases.
3. Scrape `GET /metrics` with `Authorization: Bearer <METRICS_TOKEN>` from an approved monitoring service. Track API 5xx rate, latency, and request volume. The request logs already include timestamp, route, status, duration, and request ID without request bodies or credentials.
4. Use Railway logs and metrics to alert on restart loops, CPU or memory saturation, database connection errors, and migration failures.

## Backups and recovery

Before production launch, enable Railway PostgreSQL backups with documented retention. At least quarterly, restore a backup into a separate non-production database and record the elapsed recovery time and result.

For an incident:

1. Identify the failing release from its deployment ID, request ID, Sentry event, or uptime alert.
2. If the issue is frontend-only, promote the previous healthy Vercel deployment.
3. If the API is faulty, roll back Railway only after verifying the current Alembic revision remains compatible with the previous application version.
4. Do not run a destructive migration downgrade during an incident. Restore a tested backup only when the incident commander approves it.
5. Rotate any credential exposed in Git, logs, a browser build, or chat; then redeploy all consumers.

## Capacity decision: uploaded files

The current application stores uploaded file content in PostgreSQL. Before documents become large or numerous, provision S3-compatible object storage and migrate files to object keys while keeping metadata in PostgreSQL. This needs a provider/account decision and is not safe to invent in the repository without a storage destination.
