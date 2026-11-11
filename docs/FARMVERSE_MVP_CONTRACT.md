# FarmVerse — MVP Contract

- **Version** — 1.1
- **Date** — 2026-11-06
- **Last updated** — 2026-11-09
- **Status** — LOCKED for MVP implementation

Implement a small, playable casual farming game with one NPC trader and one verifiable NEAR testnet transaction demonstration. This is a product/implementation contract, not a promise of production readiness or hackathon placement.

## 1. Product vision and success condition

FarmVerse is a **casual-first farming game** with a small, reactive NPC economy. The player plants, harvests, stores crops, trades with a merchant and expands the farm. NEAR is demonstrated through one testnet transaction in the merchant store. Advanced AI economy, real-value trading and financial mechanisms are postponed.

**MVP definition of done:** A guest can enter the Farm, complete a farming/trading/upgrading loop, visit the Town Square / Store, buy and sell with a merchant using GOLD, and trigger a **real, independently verifiable NEAR testnet transaction** from the store UI. Game state persists across scene changes and reloads. The README accurately distinguishes implemented functionality from the roadmap.

### Scope boundary

- **Scene A — My Farm:** small, friendly, isometric/2D casual farm inspired by the *feel* of classic cheerful farming games; original assets and UI, not a reproduction of another game's copyrighted assets.
- **Scene B — Town Square / Store:** a small static square or merchant stall containing **one NPC**. Clicking/tapping the merchant opens a trading panel. No multiplayer movement or networked world simulation.
- **NEAR demo** is an action/modal **within the Store**, not a third game scene.
- Game currency is **GOLD**. No GOLD ↔ NEAR conversion in MVP.
- See the [Phaser MVP guide](FARMVERSE_PHASER_MVP_GUIDE.md#2-technology-decisions-locked) for the approved implementation stack and delivery phases.

## 2. C01 — Core gameplay [LOCKED]

The approved [FV-GAME-01](FARMVERSE_GAMEPLAY_AMENDMENT_01.md) supersedes the Farm rules and acceptance checks below for the crop, seed shop, and warehouse loop. C02 remains a separate NPC contract.

### C01 initial state and tunable values

| Key | MVP value |
|---|---|
| Guest entry | No mandatory login or wallet connection |
| Unlocked plots | 2 plots in `EMPTY` state |
| Additional plots | 4 initially `LOCKED`; Plot #3 costs 20 GOLD; later plot costs configurable |
| Player GOLD | 0 |
| Player silo | 0 / 10 items |
| Crop species | One species with `NORMAL` and `GOLDEN` variants |
| Seed cost | 0 GOLD; one-tap planting |
| Grow time | 10 seconds (MVP constant) |
| Harvest yield | Exactly **one** item per plot: 90% `NORMAL`, 10% `GOLDEN` |
| Base values | Normal = 10 GOLD; Golden = 30 GOLD |
| Quick Sell | One item per tap, at its base GOLD price; always available when item exists |
| NPC offer | `Q = 1` item, active/renewed on a 20-second window; after accepting, 5-second cooldown |
| Required upgrade | Unlock new plot; soil/time/mutation upgrades deferred |

### C01 state machine

- **Plot:** `LOCKED --(pay GOLD)--> EMPTY --(tap)--> GROWING --(grow time)--> READY --(harvest if capacity)--> EMPTY`.
- Harvest adds exactly one normal **or** golden item to silo; if silo is full, the plot **stays READY** without losing its crop.
- Quick Sell removes one item from player's silo and credits base GOLD price. It is independent of NPC budget and allows progression if the NPC has no offer.
- Merchant offers can be accepted or rejected. Rejection does not remove any player item. Offer timeout is handled independently from player assets.
- GOLD is spent on plot unlocks; planting is free, eliminating the zero-GOLD softlock.
- Golden-drop randomness must be testable using a deterministic RNG seed or equivalent test injection.

### C01 acceptance criteria

| ID | Verifiable outcome |
|---|---|
| C01-AC-01 | A scripted, first-time guest onboarding test can plant 2 plots, harvest, sell, and unlock Plot #3 **within 45 seconds**; this is a configured flow target, not a guarantee for every human user. |
| C01-AC-02 | Every harvest yields one and only one item; normal/golden are mutually exclusive; seeded RNG tests both outcomes and the 10% configured probability. |
| C01-AC-03 | Quick Sell is available for each item in the silo even when the NPC's GOLD budget is zero or offers are declined. |
| C01-AC-04 | At 10/10 silo capacity, READY crops cannot be harvested or lost; selling one item restores harvest ability. |
| C01-AC-05 | A player with 0 GOLD and 0 inventory can plant again; no softlock from seed cost or NPC inaction. |
| C01-AC-06 | Unlocking a plot deducts the configured GOLD exactly once and makes that plot usable immediately. |

## 3. C02 Lite — One deterministic merchant NPC [LOCKED]

**Purpose:** Show a reactive market using a single merchant, without claiming LLM reasoning or an autonomous economic agent. **One NPC** can BUY player crops for GOLD and SELL its owned inventory for GOLD or optionally through the separate C03 NEAR demo. NPC inventory is real state, not a perpetual store catalog.

### C02 initial state

| Field | Initial value / meaning |
|---|---|
| `gold_budget` | 200 GOLD (uncapped actual balance) |
| `reference_budget` | 300 GOLD (normalization constant, **not** balance ceiling) |
| `inventory_normal` | 3 |
| `inventory_golden` | 1 |
| `inventory_capacity` | 10 total items |
| `demand` | 5, integer constrained to `[0,10]` for price calculations; event floors noted below |
| `sell_fail_streak` | 0 |
| `grant_used` | `false` (per demo game session) |
| `is_self_sustaining` | `true` until receiving a grant |
| `status` | `ACTIVE`; can become `OUT_OF_BUSINESS` |
| `base_price_normal` / `golden` | 10 / 30 GOLD |
| `base_near_normal` / `golden` | 0.01 / 0.03 NEAR **testnet demo price, not a conversion rate** |

An onboarding BUY offer is active at game entry (a one-off scripted configuration to guide the first loop). Normal generation uses the pricing function below. The very first offer may use multiplier `1.5` as previously agreed; all later offers are deterministic based on current NPC state.

### C02 pricing

Define `I = inventory_normal + inventory_golden`, `B = gold_budget`, `D = demand` and

```text
B_norm = min(max(B, 0) / 300, 1)
M_buy  = round(1 + 1.5 * (D/10) * ((10-I)/10) * B_norm, 2)
M_sell = round(1 + 1.5 * (D/10) * ((10-I)/10) * (1-B_norm), 2)
```

Both multipliers remain in `[1.00, 2.50]` for valid states.

- **NPC BUY from player (GOLD):** `buy_gold = round(base_gold * M_buy)`; `Q = 1`; only when budget covers quoted price and inventory has room. If insufficient for the computed quote but enough for base price, quote may be lowered **no lower than base price**, with the price bound and affordability checked before offer creation. Otherwise no BUY offer.
- **NPC SELL to player (GOLD):** `sell_gold = round(3 * base_gold * M_sell)`; only when NPC owns that item and player's silo has capacity. This **explicitly adopts the anti-arbitrage pricing amendment** to finish the contract: minimum sale prices are 30 GOLD (Normal) and 90 GOLD (Golden), while maximum NPC purchase prices are 25 GOLD and 75 GOLD. No instant GOLD loop profit from reselling to NPC or Quick Sell.
- **NPC SELL with NEAR:** independently advertised demo prices (Normal 0.01, Golden 0.03 testnet NEAR), never calculated from GOLD. **C03 Micro does not settle real inventory ownership**; on-chain exchange of crops for NEAR is a post-MVP payment feature. Store UI must not imply otherwise.
- An offer must correspond to a real item type and feasible quantity (`Q=1`). The NPC may advertise both BUY and SELL choices based on its holdings; when at full inventory, BUY is disabled; when out of inventory, SELL is disabled.
- If player has Golden Crop, the merchant may prioritize buying Golden (if affordable); otherwise Normal; an offer must never require unavailable player inventory to be accepted.

### C02 state transitions

| Event | Budget | NPC inventory | Demand / flags |
|---|---|---|---|
| Accept NPC BUY (player sells 1 crop) | `-buy_gold` | +1 item of accepted type | `demand = max(1, demand-2)`; `sell_fail_streak=0`; 5s cooldown |
| Accept NPC SELL for GOLD (player buys 1 crop) | `+sell_gold` | -1 sold item | `demand = min(10, demand+1)`; `sell_fail_streak=0`; 5s cooldown |
| Reject or expire BUY offer | unchanged | unchanged | `demand = min(10, demand+1)` |
| Reject or expire SELL offer | unchanged | unchanged | `demand = max(1, demand-1)`; `sell_fail_streak += 1` |
| Accept NPC SELL for NEAR | **Deferred to production settlement** | **No inventory mutation by C03 Micro** | Testnet demonstration only; no claim of item delivery |

Each offer has an ID and only one terminal transition: `ACTIVE → ACCEPTED | REJECTED | EXPIRED`. Apply each event once. Rejected/expired offers must not double-count demand changes. New offers appear as specified by the 20s cycle and 5s accept cooldown. Do not apply an additional passive inventory drain on timeout.

### C02 recovery / accounting

- **No full inventory or budget reset.** NPC sells stock to recover GOLD and buys stock when it has GOLD and capacity.
- **Emergency liquidation:** Just before generating an offer, if `gold_budget < 30`, `I > 0`, and `sell_fail_streak >= 3`, consume **one owned crop** and credit its base GOLD value (off-screen sale to city); reset failure streak. The item consumed must be identified in the log. This is a **simulation sink/source event**, not an external on-chain trade.
- **One-time operating grant:** If `gold_budget < 30` and `I == 0` and `grant_used == false`, add 60 GOLD, set `grant_used=true`, `is_self_sustaining=false`. On the same trigger again in the same session, mark NPC `OUT_OF_BUSINESS` with no new offer until session reset.
- The grant is simulated subsidy, not proof of autonomous profitability. Record it separately in reporting. Budget may exceed 300 after profitable sales; `B_norm` remains clamped.
- **Known modeling simplification:** Golden and Normal share one aggregate scarcity factor, although their item quantities are separate. This is acceptable in Lite.

### C02 acceptance criteria

| ID | Verifiable outcome |
|---|---|
| C02-AC-01 | Deterministic price function yields the same values for identical inputs, including `B=350` → `B_norm=1`, `M_sell=1.00`, and `M_buy<=2.50`. |
| C02-AC-02 | At inventory 10/10, NPC cannot BUY; it can SELL an owned item. GOLD SELL floor exceeds the maximum NPC BUY quote and Quick Sell quote for that item (no instantaneous GOLD arbitrage). |
| C02-AC-03 | GOLD BUY/SELL each transfers exactly one item and updates budget, demand, and both inventories consistently; currency-specific NEAR behavior is **not** claimed as settled under C03 Micro. |
| C02-AC-04 | Accept/Reject/Timeout for the same offer is applied at most once, including its demand and streak effects. |
| C02-AC-05 | Emergency liquidation consumes one specific inventory item when triggered; the operating grant is at most once per session, sets `is_self_sustaining=false`, and the second empty-and-low-budget trigger marks `OUT_OF_BUSINESS`. |

## 4. C03 Micro — NEAR proof of integration [LOCKED SCOPE, intentionally NOT full settlement]

**Goal:** From the NPC Store UI, trigger **one real NEAR testnet native transfer between two dedicated demo accounts** and show the verifiable result on a block explorer. Demonstrate NEAR connectivity, not user custody or a completed on-chain crop purchase.

### In scope

1. Configure a **testnet-only demo payer** and **testnet-only NPC receiving account**. No real user key collection; no production wallet management.
2. A button/action within Store triggers a small, fixed-value **demo transfer** from payer to NPC through the backend. The payer covers testnet gas.
3. Show pending/success/failure status and a transaction hash/link after submitting; **do not treat the hash alone as proof of successful execution**. Where status check is implemented, verify final successful outcome through NEAR RPC/explorer.
4. Prevent repeated unintended payments for one UI action at least at the UI/API demo-request level. No complete order reservation, payment-to-item mapping, or production-grade reconciliation required.
5. README states plainly: **NEAR transfer is a technical demo. NPC item inventory and player GOLD transactions are off-chain; completing a NEAR-for-crop purchase is not implemented.**

### Explicitly out of C03 Micro

- Player wallet onboarding/connection; mainnet; custody of real users' keys.
- Automatic crop fulfillment against an on-chain payment; atomic settlement; escrow; item ownership tokenization; smart contracts; DEX; GOLD-to-NEAR conversion.
- Production-grade idempotent payment ledger, durable signer recovery, reconciliation workers or cross-chain intents.

### C03 Micro acceptance criteria

| ID | Verifiable outcome |
|---|---|
| C03-AC-01 | Pressing NEAR demo action from Store produces **an actual native transfer on NEAR testnet**, from the configured payer to NPC receiving account. |
| C03-AC-02 | UI exposes the transaction hash, network (`testnet`), and a valid explorer link, and does not label a mere submitted hash as confirmed payment. |
| C03-AC-03 | Demo displays success only after a successful execution result is verified; RPC or transfer failure shows failure/pending without fake success. |
| C03-AC-04 | Demo transfer **does not mint a crop, credit GOLD, or mutate NPC/player inventory**, avoiding a false settlement claim. |
| C03-AC-05 | README includes run/config steps, expected transaction evidence, testnet-only security limits, and clearly separate roadmap for full NPC↔player settlement. |

## 5. Cross-scene UI / data acceptance criteria

| ID | Verifiable outcome |
|---|---|
| UI-AC-01 | A guest enters the Farm scene without login or wallet prompts. |
| UI-AC-02 | Farm shows at least two usable plots, crop growth/harvest feedback, visible GOLD, silo occupancy, and Unlock Plot action. |
| UI-AC-03 | The user can navigate Farm ↔ Town Square/Store without losing farm, silo or GOLD state; reload preserves the same server-side save/session state. |
| UI-AC-04 | Store has exactly one merchant NPC with clearly labeled GOLD BUY and GOLD SELL actions plus a distinct **NEAR Testnet Demo** action; the latter is not disguised as a completed crop purchase. |
| UI-AC-05 | Basic animation/audio/feedback may enhance farming but must not require multiplayer, real-time map sync, or additional content systems. |

## 6. Minimal data model / invariants

Data entities: `game_session`, `plot`, `player_balance`, `player_inventory`, `npc_state`, `npc_inventory`, `npc_offer`, optionally `demo_near_transaction` for hash/status. Exact SQL schema is implementation-phase work.

**Invariants:**

- Player silo items never negative or above capacity of 10; NPC inventory never negative or above capacity of 10.
- Each harvest creates exactly one item; each off-chain trade transfers exactly one item; GOLD balance cannot go negative due to purchase/upgrade.
- NPC GOLD budget is nonnegative and not capped at 300; only normalized ratio is clamped.
- Every NPC offer reaches at most one terminal state and cannot update balances twice.
- Golden and Normal amounts must be separately tracked and cannot be substituted silently.
- C03 Micro transaction never mutates in-game item balances or credits GOLD.
- Testnet NEAR amount must be represented exactly (yoctoNEAR integer/string), never floating-point currency arithmetic.
- Server is the authority for GOLD, inventory, upgrade, and NPC state; client input cannot directly grant items or GOLD.

## 7. Out of scope / deferred (do not implement for hackathon MVP)

- Multiplayer, networked world map, WebSocket character position sync, multiple merchants/NPCs, agent-vs-agent trades.
- More crops/production chains, soil upgrades, complex farming mechanics, auctions, premium passes or seasonal rankings.
- LLM-driven autonomous NPC behavior, agent frameworks and learning strategies. NPC is **deterministic**, not a fully autonomous AI agent.
- NFT/NEP-171/NEP-245 tokens, NFT marketplace, boosters tied to on-chain assets.
- GOLD ↔ NEAR exchange, tokenomics, liquidity pool, real-money returns, economic fund, profit sharing, sponsored rewards.
- Full C03 NEAR crop purchase settlement and C04 wallet onboarding; smart contract and cross-chain NEAR Intents.

## 8. Demonstration checklist

1. Start as a guest in **Farm** with 2 plots, 0 GOLD; one-tap plant.
2. Harvest Normal/Golden crops; see silo and GOLD via Quick Sell, and unlock Plot #3.
3. Enter **Town Square / Store** and encounter one merchant NPC.
4. Execute one GOLD trade with NPC; demonstrate deterministic changes in budget, inventory and demand; optionally show opposite trade direction.
5. Trigger **NEAR Testnet Demo** in the same Store; show transaction hash and confirmed explorer evidence, explicitly describing it as **proof of integration**, not item settlement.
6. Return to Farm or reload; prior off-chain progress persists.

**Pitch truthfulness:** Describe FarmVerse as a playable farming vertical slice with a deterministic economic merchant and NEAR testnet transaction integration. The roadmap may include autonomous agent wallets, NEAR settlement for trading, and richer AI economies, but they are **not implemented in this MVP**.

## 9. README and submission artifacts

The judge-facing README must cover the gameplay concept, local setup, demo account and testnet requirements, screenshots or a GIF of the two scenes, testnet transaction evidence, implemented features and roadmap, known limitations, and a short reproduction script. Keep the high-level architecture diagram, tech stack, and repository layout in the project documentation and link to it from the README. Never commit private keys or seed phrases. Check the official rules for hackathon-specific submission requirements and deadlines before submitting.

## 10. Change control and next phase

- **Locked now:** Product scope; two-scene game; C01; C02 Lite v0.3 with explicit GOLD SELL anti-arbitrage price floor; C03 Micro as an isolated NEAR proof-of-integration; acceptance criteria above.
- **Next design phase:** UI/UX screens, Phaser scenes and input behaviors, art direction, API schemas, persistence, and task decomposition. These decisions must honor the locked behavior and may not silently add new mechanics.
- **Approved stack amendment:** See [MVP-TECH-01](FARMVERSE_PHASER_MVP_GUIDE.md#mvp-tech-01--backend-runtime) for the backend runtime decision.
- **Change process:** Any change to a locked rule or AC requires a labeled amendment with reason, impact and approval before implementation.

