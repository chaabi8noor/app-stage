# Frontend

The React single-page application is built with Vite.

## Local development

1. Copy `.env.example` to `.env`. It is preconfigured with `VITE_API_URL=http://localhost:8000`.
2. Run `npm ci`.
3. Run `npm start` and open the URL shown by Vite.

## Validation

- `npm run lint` checks the frontend source for static errors.
- `npm test` runs the frontend test suite.
- `npm run build` creates the production bundle in `dist/`.

Only variables prefixed with `VITE_` are compiled into the browser bundle. Do not put credentials, database URLs, or AI keys in this project or in Vercel variables.

## Vercel

Set `VITE_API_URL` to the public HTTPS Railway API URL, for example
`https://api.example.com`. This is a build-time variable: redeploy the Vercel
project after changing it. If it is missing, a production build uses relative
paths for a reverse proxy (the Docker/nginx deployment); it never falls back to
the visitor's `localhost`.
