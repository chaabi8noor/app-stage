# Security policy

## Reporting a vulnerability

Do not open a public issue for a suspected vulnerability, exposed credential, or sensitive-data incident. Contact the repository owner privately with the affected URL or commit, a concise reproduction path, and the impact. Rotate any exposed credential immediately; do not wait for a release.

## Repository controls

The repository runs secret scanning, CodeQL analysis, dependency review, and critical container scans. A repository administrator must also enable GitHub secret scanning and push protection, then protect `main` with required reviews and the `CI` and `Security` checks. Do not allow administrators to bypass those requirements for normal releases.

## Runtime controls

- Production secrets are set only in Railway or Vercel project variables.
- The API rejects wildcard CORS and missing critical configuration in production.
- Login, upload, and AI routes have process-level rate limits. Configure an edge/WAF rate limit as well before scaling beyond one API instance.
- API and Vercel responses include baseline browser-security headers.
- Prometheus metrics require `METRICS_TOKEN` in production; Sentry DSNs are optional and must never be logged.
