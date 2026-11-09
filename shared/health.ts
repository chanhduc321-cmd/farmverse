/** GET /health on Hono, reached via /api/health from the Vite dev server. */
export type HealthResponse =
  | { status: 'ok' } // HTTP 200
  | { status: 'unavailable' }; // HTTP 503
