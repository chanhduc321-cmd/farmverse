# FarmVerse backend

Run these commands in `backend/` with Docker Desktop, Node.js 20.12 or newer, and pnpm. The example values are for local development.

```powershell
if (!(Test-Path -LiteralPath '.env')) { Copy-Item .env.example .env }
docker compose up -d --wait postgres
Get-Content -Raw migrations/001_farm.sql | docker compose exec -T postgres psql -v ON_ERROR_STOP=1 -U farmverse -d farmverse
pnpm install --frozen-lockfile
pnpm dev
```

The API listens on `http://127.0.0.1:8080` by default. Open `/health` or use `curl.exe -i http://127.0.0.1:8080/health`. The API returns `200 {"status":"ok"}` after a successful PostgreSQL query and `503 {"status":"unavailable"}` when the database cannot be reached. The Vite dev server proxies the browser's `/api/health` request to this route.

Run `pnpm typecheck` to check TypeScript. Use `docker compose stop postgres` to stop the database and keep its data volume. Start it again with `docker compose up -d --wait postgres`.

`GET /farm` starts or resumes a guest using a 30-day HttpOnly cookie. Send mutations with the latest `expectedRevision` from the farm response. On a stale revision or another conflict, read the farm again before retrying. The shared contract lives in [`shared/farm.mts`](../shared/farm.mts). The initial unlock prices are set in `PLOT_UNLOCK_COSTS` for newly created farms.

Run `pnpm test` against local PostgreSQL. The Farm integration tests create and remove an isolated schema.
