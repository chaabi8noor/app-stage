import * as Sentry from "@sentry/react";

const dsn = import.meta.env.VITE_SENTRY_DSN;

export function initializeMonitoring() {
  if (!dsn) {
    return;
  }

  Sentry.init({
    dsn,
    environment: import.meta.env.VITE_ENVIRONMENT || import.meta.env.MODE,
    tracesSampleRate: 0.1,
    sendDefaultPii: false,
  });
}

export { Sentry };
