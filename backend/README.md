# FarmVerse backend

Run these commands in `backend/` with Docker Desktop, Node.js 20.12 or newer, and pnpm. The example values are for local development.

```powershell
Copy-Item .env.example .env
docker compose up -d --wait postgres
pnpm install
pnpm dev
```

The API listens on `http://127.0.0.1:8080` by default. Open `/health` or use `curl.exe -i http://127.0.0.1:8080/health`. The API returns `200 {"status":"ok"}` after a successful PostgreSQL query and `503 {"status":"unavailable"}` when the database cannot be reached. The Vite dev server proxies the browser's `/api/health` request to this route.

Run `pnpm typecheck` to check TypeScript. Use `docker compose stop postgres` to stop the database and keep its data volume. Start it again with `docker compose up -d --wait postgres`.
