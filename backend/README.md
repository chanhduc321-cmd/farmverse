# FarmVerse backend

Run these commands in `backend/` with Docker Desktop, Node.js 20.12 or newer, and pnpm. The example values are for local development.

```powershell
if (!(Test-Path -LiteralPath '.env')) { Copy-Item .env.example .env }
docker compose up -d --wait postgres
Get-Content -Raw migrations/001_farm.sql | docker compose exec -T postgres psql -v ON_ERROR_STOP=1 -U farmverse -d farmverse
Get-Content -Raw migrations/002_merchant.sql | docker compose exec -T postgres psql -v ON_ERROR_STOP=1 -U farmverse -d farmverse
pnpm install --frozen-lockfile
pnpm dev
```

The API listens on `http://127.0.0.1:8080` by default. Open `/health` or use `curl.exe -i http://127.0.0.1:8080/health`. The API returns `200 {"status":"ok"}` after a successful PostgreSQL query and `503 {"status":"unavailable"}` when the database cannot be reached. The Vite dev server proxies the browser's `/api/health` request to this route.

Run `pnpm typecheck` to check TypeScript. Use `docker compose stop postgres` to stop the database and keep its data volume. Start it again with `docker compose up -d --wait postgres`.

`GET /farm` starts or resumes a guest using a 30-day HttpOnly cookie. Send mutations with the latest `expectedRevision` from the farm response. On a stale revision or another conflict, read the farm again before retrying. The shared contract lives in [`shared/farm.mts`](../shared/farm.mts). The initial unlock prices are set in `PLOT_UNLOCK_COSTS` for newly created farms.

## Merchant API

Apply both migrations before starting this version of the API. Migration 002 adds merchant state, offers and recovery events; it preserves existing Farm saves. New guests receive an onboarding Normal BUY offer at game entry, priced at 15 GOLD. Saves created before migration 002 receive their initial merchant on their first merchant request.

`GET /merchant` requires the same Guest cookie as Farm and returns `{ farm, merchant }`. `POST /merchant/accept` and `POST /merchant/reject` take `offerId`, `expectedRevision` and `expectedMerchantRevision` from the latest response. The server uses the persisted quote and checks both revisions, balances, crop ownership, silo capacity and expiry. Responses follow [`shared/merchant.mts`](../shared/merchant.mts) and the [API guide](../docs/API.md).

There is one active offer per 20-second window. After onboarding, generation prioritizes BUY of an affordable player-owned Golden crop, then Normal. Otherwise the merchant offers SELL of owned Normal stock, then Golden, when the player's silo has room. A BUY quote may be reduced to the merchant's remaining budget while retaining the crop's base-price floor. SELL keeps the C02 anti-arbitrage floor. Accepting starts a 5-second cooldown; rejecting waits until the original window ends.

Timers advance on merchant requests using server time. A late request expires the persisted offer exactly once and starts a fresh window; it does not simulate unobserved offers for every elapsed window. At a due generation, recovery follows C02: liquidate one owned crop (Normal first), grant 60 GOLD at most once, or mark the merchant out of business. `recoveryEvents` persists the specific crop/liquidation amount, grants and closure. Quick Sell remains independent of merchant state.

Farm mutations and merchant requests lock the same Guest row. A GOLD trade, its offer's terminal status and both inventories commit in one PostgreSQL transaction. Recovery and expiry also persist when a stale action returns a conflict; refresh both snapshots before retrying.

Run `pnpm test` against local PostgreSQL. Farm and merchant integration tests create and remove separate isolated schemas, including concurrency, expiry, recovery and rollback checks. No test modifies the playable saves.
