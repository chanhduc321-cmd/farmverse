# PostgreSQL Architecture & Vercel Deployment Guide

Engineering reference for configuring the PostgreSQL database (Supabase), executing database migrations, seeding fixture accounts, and deploying to Vercel.

---

## 1. Database Architecture & Connection Pooling

FarmVerse uses PostgreSQL for all persistent game state: farm progress, player accounts, social relationships, inventory, and activity logs.

### Supabase Connection Topology
1. **Migration & Administrative Access (Session Pooler — Port 5432):**
   * Connect using the Session Pooler over IPv4 when running database migrations and administrative scripts.
   * Requires `sslmode=require` and `uselibpqcompat=true` for strict TLS compliance with node `pg`.
2. **Production Serverless Runtime (Transaction Pooler — Port 6543):**
   * Serverless Functions on Vercel connect via the Transaction Pooler (port 6543) specified in `DATABASE_URL`.
   * Instances maintain short-lived connections and use parameterized queries without named prepared statements.

---

## 2. Migration & Seeding Procedures

All database management scripts reside under `backend/`.

### Execution:
```bash
cd backend

# 1. Verify connectivity and table status
node --env-file=.env.migration.local --import tsx src/check-database.ts

# 2. Execute pending database migrations (003 through 014)
node --env-file=.env.migration.local --import tsx src/migrate.ts

# 3. Seed resident neighbor accounts (10 sample farms)
node --env-file=.env.migration.local --import tsx src/seed-friends.ts
```

### Database Schema Migrations:
| ID | Domain & Schema Responsibility |
|---|---|
| `003` | JSON farm state persistence for Guest sessions |
| `004` | Player accounts, credentials, farm ownership, and session tokens |
| `005` | NPC Merchant inventory, pricing state, and timed offers |
| `006` | Friend invitations, friendships, and crop stealing cooldowns |
| `007` | Activity journals, read markers, and event logging |
| `008` | Row Level Security (RLS) enforcement and Data API permission revokes |
| `009` | Guard pet block events and journal deduplication |
| `010` | Social authentication identities (Google / NEAR Auth) |
| `011` | Blockchain transaction ledger and status tracking |
| `012` | NEAR USDC payment records and verification receipts |
| `013` | Trade demo state, orders, requests, and PnL accounting |
| `014` | NPC visit scheduling and arrival timers |

> [!NOTE]
> All migration scripts execute inside an atomic transaction guarded by `pg_advisory_xact_lock(9810626)`, ensuring safe concurrent executions with automatic rollback on errors.

---

## 3. Vercel Project Configuration

1. **Root Directory:** Repository root (`/`).
2. **Framework Preset:** `Vite`.
3. **Build & Package Commands:**
   * **Install Command:**
     ```bash
     pnpm install --frozen-lockfile && pnpm --dir backend install --frozen-lockfile && pnpm --dir web install --frozen-lockfile
     ```
   * **Build Command:**
     ```bash
     pnpm build
     ```
     *(Builds the frontend web bundle and packages the Hono API function into `.vercel/output` via `tools/build-vercel.mjs`).*
4. **Environment Variables:**
   * `DATABASE_URL`: Transaction pooler URI (Port 6543) with SSL enabled.

---

## 4. Verification & Health Checks

Following deployment to Preview or Production environments:
1. `GET /api/health` returns `200 OK` with database connection confirmation.
2. `GET /api/crops` returns the complete 15-crop catalog.
3. New visitors receive a valid Guest session cookie (`farmverse_guest`).
4. Full gameplay loop verification: Seed Purchase → Planting → Care → Harvest → Warehouse Sale → Account Registration → Cross-session login.
