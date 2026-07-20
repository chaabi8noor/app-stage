# Frontend

The React single-page application is built with Vite.

## Local development

1. Copy `.env.example` to `.env` and set `VITE_API_URL=http://localhost:8000`.
2. Run `npm ci`.
3. Run `npm start` and open the URL shown by Vite.

## Validation

- `npm test` runs the frontend test suite.
- `npm run build` creates the production bundle in `dist/`.

Only variables prefixed with `VITE_` are compiled into the browser bundle. Do not put credentials, database URLs, or AI keys in this project or in Vercel variables.
