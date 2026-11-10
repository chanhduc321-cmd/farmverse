# FarmVerse — Phaser Web Demo Implementation Guide

- **Version** — 1.1
- **Date** — 2026-11-09
- **Status** — LOCKED for hackathon MVP

This guide records the approved stack and technical amendments. The [MVP contract](FARMVERSE_MVP_CONTRACT.md) defines C01, C02 Lite, and C03 Micro.

## 1. Goal & product pitch

Build a **browser-playable** casual farming game: **Farm → Harvest → Town Square/Store → NPC Trade → Upgrade**, with a **real, independently verifiable NEAR testnet transfer** accessible from the Store. Judges should be able to open a URL and play immediately—no installation, registration, or wallet connection.

- **Primary target:** NEAR Hackathon — Games With Real Economies.
- **Game differentiator:** A merchant NPC has a bounded inventory, demand and real GOLD budget; its prices and behavior respond deterministically to trades.
- **Non-goal:** A production-ready autonomous AI ecosystem or real-value economy.

## 2. Technology decisions [LOCKED]

| Layer | Choice | Rationale |
|---|---|---|
| Game engine | **Phaser 3 + TypeScript** | Browser-first 2D game; fast iteration and easy judge access |
| Build tooling | **Vite** | Simple development/build pipeline |
| Presentation | 2D sprites with **fixed isometric-like / 2.5D viewpoint** | No 3D world/rigging needed |
| Game UI | Phaser canvas with optional HTML/CSS overlay for Store, HUD, modal | Clear UX and quick UI implementation |
| Backend | **Node.js + TypeScript + Hono** | Authoritative HTTP/JSON API and server-side NEAR integration |
| Persistence | **PostgreSQL** | Save session, GOLD, inventory, NPC/offer state |
| Blockchain | **`near-api-js` on the server** | Sign and send a native NEAR testnet transfer for C03 Micro |
| Deployment | Public **HTTPS web demo URL** + publicly accessible backend | No client installation |
| Art production | **Premium hand-painted 2.5D**, following the shared [Art Bible](art/ART_BIBLE.md) | Keep Codex and Antigravity assets consistent |

**Future development:** Khi có đủ nguồn lực hoặc thắng giải hackathon, team có thể đánh giá chuyển sang engine mạnh hơn để phát triển FarmVerse dài hạn.

## 3. Visual direction [LOCKED]

- Reference mood: classic cheerful social-farming games, upgraded with more refined **hand-painted 2.5D** assets.
- Palette follows the owner-approved [Art Bible](art/ART_BIBLE.md), including brighter grass greens, warm earth browns, and golden crops.
- Light: warm afternoon; slightly deeper soft shadows and restrained ambient depth.
- Mood: cozy, premium casual, lightly mature; **not** dark fantasy, photorealistic or pixel art.
- Fixed projection/camera and consistent visual scale across all generated assets.
- Assets are separate reusable sprites; do **not** treat a full-scene illustration as a clickable game level.
- Approve one `approved_style.png` and an `ART_BIBLE.md` before batch generation. Technical checks: dimensions, transparency, cropping, anchor, scale, frame consistency and ownership/license.

## 4. MVP scenes [LOCKED]

### Scene A — My Farm

- Open instantly as **Guest** (no login/wallet).
- Two initially usable plots, one crop species, normal/golden harvest variants.
- One-tap free planting; growth states `EMPTY → GROWING → READY → EMPTY` (initial grow time **10s**).
- Harvest yields **exactly one** normal or golden crop (10% golden, configurable); if silo full, crop remains READY.
- Silo capacity **10**, visible GOLD, **Quick Sell** at base GOLD price, plot unlock starting with Plot #3 for **20 GOLD**.
- Minimal gameplay feedback: planting/growing/harvesting, Golden Crop visual, transaction feedback.

### Scene B — Town Square / Store

- One small static square/store with **one** merchant NPC, opened by click/tap; no avatar free-roaming or multiplayer.
- NPC **BUY**: takes 1 player-owned crop, pays GOLD; NPC **SELL**: sells 1 owned crop for GOLD.
- Display current offer plus NPC GOLD budget, inventory and demand; show why the offer changes using rule-based text (no LLM).
- In the Store, provide a clearly separated **NEAR Testnet Demo** action/modal.
- Farm ↔ Store navigation preserves state; reload restores the same game session.

## 5. Gameplay & economy contracts [LOCKED]

**C01**: Follow `FARMVERSE_MVP_CONTRACT.md` for initial values, item states, silo/quick sell, offer refresh (20s), accept cooldown (5s), plot upgrade and C01 acceptance criteria.

**C02 Lite**: One deterministic merchant; exact formulas, money and inventory transitions, operating grant, failure streak and event idempotency are defined in the MVP contract. Key invariants:

- NPC actual GOLD budget is **uncapped**; only pricing normalization uses `min(Budget/300, 1)`.
- NPC inventory tracks **Normal** and **Golden** separately; max 10 total.
- NPC GOLD BUY quote `round(BaseGold * M_buy)`; GOLD SELL quote `round(3 * BaseGold * M_sell)` to block immediate GOLD buy/resell arbitrage.
- NPC is **rule-driven**, not an autonomous LLM agent; do not claim otherwise.
- GOLD is the main in-game currency. **No GOLD↔NEAR conversion** for MVP.

## 6. C03 Micro — NEAR integration [LOCKED]

**MVP deliverable:** In the NPC Store, a testnet-only demo action makes **one actual native NEAR transfer** from a dedicated demo payer account to a dedicated NPC receiving account. Show pending/verified success/failure, network, transaction hash and explorer link.

**What is not implemented:** NEAR crop purchase fulfillment, player wallet onboarding, smart contracts, escrow, NFTs, payment reconciliation/order matching or mainnet transfers.

- Use [`near-api-js`](https://docs.near.org/tools/near-api#send-tokens) from the Node.js service. Keep demo payer signing credentials in server-side environment variables or secret management.
- Use a small fixed testnet amount in exact **yoctoNEAR** units.
- Report success only after [NEAR RPC](https://docs.near.org/api/rpc/transactions) returns a successful execution outcome at `EXECUTED` or stronger. Keep the transaction pending while the outcome is unknown.
- A NEAR demo transfer **must not** change player/NPC inventory, GOLD or crop ownership.
- Basic UI/API double-click protection; do not falsely promise production-grade settlement idempotency.
- README must explicitly state the proof-of-integration boundary.

## 7. Monorepo layout

```text
farmverse/
├── AGENTS.md
├── README.md
├── docs/
│   ├── FARMVERSE_MVP_CONTRACT.md
│   ├── FARMVERSE_PHASER_MVP_GUIDE.md
│   ├── agents/
│   └── art/                   # Art Bible and approved style reference
├── art/
│   └── source/                # Editable art originals
├── web/                       # Phaser 3, Vite, TypeScript
│   ├── src/scenes/FarmScene.ts
│   ├── src/scenes/TownSquareScene.ts
│   ├── src/ui/
│   └── public/assets/
├── backend/                   # Hono API on Node.js
│   ├── src/
│   └── migrations/            # PostgreSQL migrations
└── shared/                    # Request and response schemas and types
```

**Authority boundary:** The API owns balances, crops, inventory, NPC state, and trade transitions. PostgreSQL persists them. Phaser renders the server state and sends player intents. Share request and response schemas between client and server, validate incoming data at runtime, and keep the HTTP/JSON contract usable by another engine.

## 8. Implementation phases and deliverables

| Phase | Deliverable | Acceptance gate |
|---|---|---|
| P0 — Farm foundation | Phaser/Vite app, Node.js/Hono skeleton, PostgreSQL connectivity, run instructions, and placeholder sprites | Frontend and backend start with documented commands. Verify that the browser calls `GET /health` through the web API path on the integrated `develop` branch. |
| P1 — Farm vertical slice | Plant, growth, harvest, GOLD, silo, Quick Sell and plot unlock | C01 ACs demonstrable without wallet |
| P2 — Town Square + Merchant | Farm/Store navigation, BUY/SELL GOLD, NPC Budget/Inventory/Demand and state transitions | C02 ACs and reload/session continuity pass |
| P3 — Art calibration and polish | Master style reference; approved farm/store/merchant/crop sprites; feedback | Legible at target browser size; consistent art and click targets |
| P4 — NEAR testnet micro | Verify a server-side testnet transfer, then wire it into the Store with pending, success, and failure states | A Store action sends a real transfer and shows verified execution and an explorer link. C03 Micro acceptance criteria pass. |
| P5 — QA & hackathon submission | Public URL, public repo, README/run steps, concise demo video/post | Another person can open and follow demo; no fake on-chain claims |

**Parallelization:** Produce art while gameplay uses placeholder sprites. Do not block P1/P2 waiting for perfect artwork. Preserve time for integration, crash recovery and submission materials.

**Submission gate (P5):** Make the repository public and include a `LICENSE` file. Publish a public demo post on X with a video or screenshots, tag `@NEARProtocol` and `#NEARHackathon`, then submit the repository and post links by 2026-11-14 23:59 UTC. The organizers accept testnet-only projects. See the [official submission rules](https://nearhackathon.com/HACKATHON.md).

### Run the integrated P0 build locally

Use a `develop` checkout with Docker Desktop running, Node.js 20.12 or newer, and pnpm. In the first PowerShell window, start from the repository root and run the database and API.

```powershell
cd backend
if (!(Test-Path -LiteralPath '.env')) { Copy-Item -LiteralPath '.env.example' -Destination '.env' }
docker compose up -d --wait postgres
pnpm install --frozen-lockfile
pnpm dev
```

In a second PowerShell window, start from the same repository root and run the web app.

```powershell
cd web
pnpm install --frozen-lockfile
pnpm dev --host 127.0.0.1
```

Open the URL printed by Vite. The Farm should show two empty plots and `API: OK (200)`. In the browser Network panel, `/api/health` should return `200 {"status":"ok"}` through Hono on port 8080. If another worktree uses 8080, set `$env:PORT = '8081'` in the backend terminal and `$env:VITE_BACKEND_URL = 'http://127.0.0.1:8081'` in the web terminal before starting the servers.

## 9. Acceptance checklist (cross-contract)

- [ ] **GAME-01:** Open public URL and begin playing immediately; no account/wallet gate.
- [ ] **GAME-02:** Plant two plots, harvest and quick sell, unlock Plot #3 following C01; silo never loses READY crops at capacity.
- [ ] **GAME-03:** GOLD, normal/golden inventory and plots survive Farm ↔ Store and page reload.
- [ ] **ECON-01:** NPC BUY/SELL GOLD transfer exactly one item and preserve inventory/GOLD invariants.
- [ ] **ECON-02:** Demand, inventory and budget alter future offers deterministically; no instant GOLD arbitrage and no repeat offer effects.
- [ ] **UI-01:** Town Square has one merchant with clear actions, prices and visible economic state.
- [ ] **NEAR-01:** Store action creates a real testnet native transfer between configured demo accounts.
- [ ] **NEAR-02:** Show valid hash, explorer link and verified success/failure; no false settled crop sale.
- [ ] **SEC-01:** No signing secrets in frontend, source control or client logs.
- [ ] **SUBMIT-01:** README includes setup, implemented vs roadmap, demo steps, licensing and credits, a public demo link, and submission evidence. It links to the project documentation for architecture, stack, and repository layout.

For full numeric and state-transition tests, consult the C01/C02/C03 acceptance criteria in `FARMVERSE_MVP_CONTRACT.md`; this guide does **not** replace them.

## 10. Explicitly out of scope

No Godot implementation for this web demo; no multiplayer or WebSocket position sync; no 3D world; no extra crop species/merchants; no LLM NPC autonomy; no NFT marketplace; no smart contracts; no real token economy or GOLD/NEAR exchange; no profit-sharing, sponsored reward system or full player wallet/on-chain item settlement.

## 11. Change control

**MVP feature scope and stack are frozen.** Any feature outside C01, C02 Lite and C03 Micro is roadmap-only unless it replaces an existing feature with demonstrably lower effort. Prioritize a working 60–90-second judge demo over additional functionality.

### MVP-TECH-01 — Backend runtime

**Approved 2026-11-09.** Replace the proposed Go service with Node.js, TypeScript, and Hono before P0. This lets the same API service use `near-api-js` for testnet signing and share request and response schemas with the web client.

PostgreSQL remains the persistence layer. Follow the current delivery order below for NEAR testnet work.

### MVP-PLAN-01 — Farm-first delivery

Complete the Farm foundation and playable loop first, then the merchant and Store. Verify the server-side NEAR transfer and integrate it in P4 before final QA. The [task dashboard](../TASKS.md) and [collaboration workflow](agents/workflow.md) define task ownership and integration.
