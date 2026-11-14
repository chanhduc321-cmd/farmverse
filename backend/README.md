# FarmVerse Backend

The FarmVerse backend is a high-performance RESTful API built on **Node.js** and **Hono**, using **PostgreSQL** for persistent game state (guest sessions, player accounts, plots, warehouse inventory, social connections, and activity logs).

---

## 1. Quickstart

Prerequisites: Node.js >= 22.22.2, pnpm, and Docker (or a local PostgreSQL instance).

```bash
cd backend

# Copy environment variables
cp -n .env.example .env

# Start local PostgreSQL via Docker
docker compose up -d --wait postgres

# Install dependencies, run migrations, and seed sample neighbors
pnpm install --frozen-lockfile
pnpm migrate
pnpm seed:friends

# Start development server (Port 8092)
pnpm dev
```

---

## 2. Configuration & Environment

- `PORT`: Defaults to `8092`, matching the Vite proxy configuration in `web/vite.config.ts`.
- `DATABASE_URL`: Connection string for PostgreSQL (e.g. `postgresql://postgres:postgres@127.0.0.1:5432/farmverse`). Required for gameplay persistence; if unavailable, the API responds with `503 Service Unavailable`.
- **Database Migrations:** Schema files (`003` to `014`) execute inside an atomic transaction guarded by `pg_advisory_xact_lock`.
- **Session Lifespan:** Guest and registered accounts use 30-day HttpOnly cookies. Progress (Gold, XP, seeds, warehouse, plots, pets, and merchant state) survives server restarts.

---

## 3. Concurrency & Optimistic Locking

All gameplay mutations enforce an `expectedRevision` parameter:
- Concurrent requests with identical revisions result in only one winning write; subsequent writes return `409 Conflict`.
- On 409 responses, the client fetches the latest snapshot before allowing subsequent player actions.
- Details in [API Reference](../docs/API.md).

---

## 4. Seeding & Testing

- `pnpm seed:friends`: Seeds 10 resident neighbor farms (`farm_ban_01` through `farm_ban_10`) with mature crops and randomized companion pets (dog, cat, goose).
- `pnpm typecheck`: Runs TypeScript static type checks without emitting code.
- `pnpm test`: Runs backend test suites:
  ```bash
  node --env-file=.env --import tsx --test test/*.test.ts
  ```

---

## 5. Web3 & Payment Integrations

- **NEAR USDC Adapter:** Gasless payments and sponsored transfers. See [NEAR USDC Adapter Guide](../docs/NEAR_USDC_ADAPTER.md).
- **Trade Demo Setup:** Creates the Player A $\rightarrow$ NPC $\rightarrow$ Player B demo loop. See [Trade Demo API Specification](../docs/TRADE_DEMO_API.md).
- **Vercel Deployment:** Production serverless setup and database pooler configurations are documented in the [PostgreSQL & Vercel Guide](../docs/POSTGRES_MIGRATION_PLAN.md).
