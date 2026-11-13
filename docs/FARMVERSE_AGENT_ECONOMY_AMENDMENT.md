# FV-ECON-01 — Agent economy design

| Field | Value |
|---|---|
| Amends | [MVP contract](FARMVERSE_MVP_CONTRACT.md) C02 Lite and C03 Micro; [Phaser MVP guide](FARMVERSE_PHASER_MVP_GUIDE.md) scope exclusions |
| Proposed | 2026-11-13 |
| Status | **Pending project owner approval** |
| Design | [ARCHITECTURE.md](ARCHITECTURE.md) |

## What changes

The contract and guide describe one deterministic merchant per farm, exclude language-model NPCs, and limit NEAR to one demo transfer that touches no game asset. This amendment adopts the agent economy in [ARCHITECTURE.md](ARCHITECTURE.md) as the project's design direction:

1. **Merchants gain an AI persona.** A language model supplies a merchant's voice and proposed price. This replaces the exclusion of LLM-driven NPCs.
2. **The deterministic engine stays in charge.** C02 Lite pricing, budgets, offer lifetime and recovery rules become the policy engine that bounds every AI offer. No C02 formula changes.
3. **Merchants hold NEAR accounts.** Each merchant is a named sub-account with a restricted function-call key. This replaces the two demo accounts in C03 Micro.
4. **Items and GOLD are NEP-245 token ids** in one game contract, settled from PostgreSQL after each merchant trade. This replaces the rule that NEAR never touches game state.
5. **Merchants pay for their own inference** from an operating balance, and can be funded by player investment.

## What does not change

- The server stays authoritative; the client sends intents.
- Contract invariants: no negative balances, stock within capacity, each offer ends once.
- The farm rules in [FV-GAME-01](FARMVERSE_GAMEPLAY_AMENDMENT_01.md).
- Signing keys stay server-side and out of version control.
- GOLD has no price outside the game.

## Code impact

None in this amendment. It changes documentation only.

## Approval

Project owner: ________________  Date: __________
