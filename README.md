# Nông Trại Mộng Mơ

A browser-playable casual farming game. Buy seeds, grow crops, harvest, and sell produce to fund the next batch.

Built for **NEAR HACKATHON 2026 · Track: Games With Real Economies**. Testnet only.

## Status

The game is under active development. A public demo URL and a verified testnet transaction link will be added here once available.

The local build supports the crop, seed shop, and warehouse loop. The NPC market and NEAR testnet demo are tracked separately. [Gameplay guide](docs/FARMVERSE_GAMEPLAY.md) · [Task board](TASKS.md)

## Demo walkthrough (target: 60–90 seconds)

1. Open the farm as a Guest with 200 GOLD and six empty plots.
2. Buy a strawberry seed in the seed shop. Select it in the seed bag, then plant it on an empty plot.
3. Watch the crop change stages and harvest when it ripens at 30 seconds.
4. Sell fruit from the warehouse, then use the shovel to clear the plot before planting again.
5. Reload to check the plots, GOLD, XP, and warehouse within the same running server session.

> [!NOTE]
> The NEAR transfer is a proof of integration only. It does not exchange crops for crypto or convert GOLD to NEAR. Player inventory stays off-chain.

## Tech stack

| Layer | Choice |
|---|---|
| Game engine | Phaser 3 + TypeScript |
| Build tooling | Vite |
| Backend | Node.js + TypeScript + Hono |
| Database | PostgreSQL |
| Blockchain | `near-api-js` (server-side, testnet) |
| Deployment | Static frontend + API on a public HTTPS URL |

For architecture details, pricing formulas, NPC state transitions, and acceptance criteria see the [project documentation](docs/FARMVERSE_PHASER_MVP_GUIDE.md) and the [MVP contract](docs/FARMVERSE_MVP_CONTRACT.md).

## Run locally

The Farm build connects to the Hono API and PostgreSQL through `backend/.env`. API connection failures show a retry screen. [Setup and commands](web/README.md) · [Database migration and Vercel setup](docs/POSTGRES_MIGRATION_PLAN.md)

## Honesty & limits

- **Deterministic NPC, not an LLM agent.** The merchant uses fixed math based on supply, demand, and budget. No live language-model calls.
- **Single-player guest sessions.** No multiplayer, avatar roaming, or WebSocket sync in this MVP.
- **Proof of integration, not on-chain settlement.** The NEAR demo sends a real testnet transfer. Crops and GOLD are off-chain demo assets, not mainnet tokens or NFTs.
- **15 crop species.** Seed prices, harvest prices, and growth times vary by crop.

## Security

- Private keys for the NEAR demo payer live on the server in environment variables, never in the frontend bundle or version control.
- `.gitignore` excludes `.env`, `*.key`, `*.pem`, and credential directories.
- All blockchain calls target NEAR Testnet. No mainnet funds are involved.

## License

A license file has not been added yet. It will be included before the public submission.
