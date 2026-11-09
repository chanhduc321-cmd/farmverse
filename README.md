# FarmVerse

A browser-playable casual farming game with a **bounded, reactive NPC economy** and a **verifiable NEAR testnet transfer**. Plant crops, trade with a merchant whose prices shift based on its own stock, budget, and demand, and trigger a real on-chain transfer — all without installing anything or connecting a wallet.

Built for **NEAR HACKATHON 2026 · Track: Games With Real Economies**. Testnet only.

## Status

The game is under active development. A public demo URL and a verified testnet transaction link will be added here once available.

## Demo walkthrough (target: 60–90 seconds)

1. **Enter the Farm** — Open the URL. You land on your farm immediately as a guest. Two plots are ready; no login required.
2. **Plant & Harvest** — Tap a plot to plant (free). After 10 seconds it's ready. Harvest into your silo — most crops are Normal (10 GOLD), roughly 1 in 10 is a rare Golden variant (30 GOLD).
3. **Quick Sell & Expand** — Sell crops from the silo at base price anytime. Once you reach 20 GOLD, unlock a third plot.
4. **Visit Town Square** — Switch to the merchant scene. The NPC has its own stock, GOLD budget, and demand level. It buys your crops and sells its own — prices rise or fall as those three values change.
5. **Trade with the Merchant** — Accept a BUY or SELL offer. Watch the NPC's budget and inventory update, and the next quote adjust. A 3× markup on NPC sales prevents instant buy-and-resell arbitrage.
6. **Trigger the NEAR Demo** — In the store, click the testnet transfer action. The server signs a small native NEAR transfer between two demo accounts and returns a transaction hash with an explorer link for independent verification.
7. **Reload** — Refresh the page or navigate back to the farm. Your plots, GOLD, and silo contents persist.

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

> [!IMPORTANT]
> The project is in Phase 0 (scaffold). Exact commands will be documented once the web and backend packages are initialised.

**Prerequisites:** Node.js ≥ 20, pnpm (or npm), PostgreSQL.

```bash
# Frontend
cd web && pnpm install && pnpm dev

# Backend
cd backend && cp .env.example .env && pnpm install && pnpm dev
```

## Honesty & limits

- **Deterministic NPC, not an LLM agent.** The merchant uses fixed math based on supply, demand, and budget. No live language-model calls.
- **Single-player guest sessions.** No multiplayer, avatar roaming, or WebSocket sync in this MVP.
- **Proof of integration, not on-chain settlement.** The NEAR demo sends a real testnet transfer. Crops and GOLD are off-chain demo assets, not mainnet tokens or NFTs.
- **One crop species, two variants.** Normal and Golden — enough to demonstrate the economy without spreading scope.

## Security

- Private keys for the NEAR demo payer live on the server in environment variables, never in the frontend bundle or version control.
- `.gitignore` excludes `.env`, `*.key`, `*.pem`, and credential directories.
- All blockchain calls target NEAR Testnet. No mainnet funds are involved.

## License

A license file has not been added yet. It will be included before the public submission.
