# FarmVerse API

The Node.js service owns state. In development, the browser calls `/api/...` through the Vite proxy to the matching Hono route without the `/api` prefix. Send JSON POST bodies with `Content-Type: application/json` and include cookies. Responses carrying game state use `Cache-Control: no-store`.

## Session and Farm

Call `GET /api/farm` first. It starts or resumes the same Guest session using the persistent HttpOnly cookie. Reuse that cookie in both scenes. The existing [Farm contract](../shared/farm.mts) defines the snapshot and mutation payloads. The backend [setup instructions](../backend/README.md) describe migrations and local startup.

## Merchant interface for P2

The [merchant contract](../shared/merchant.mts) defines the interface to implement in T-10 and consume in T-11.

| Browser request | Hono route | Result |
|---|---|---|
| `GET /api/merchant` | `GET /merchant` | Read Farm and merchant snapshots for the current Guest. Process due offer expiry and recovery before returning state. |
| `POST /api/merchant/accept` | `POST /merchant/accept` | Resolve one active offer and transfer exactly one crop for the quoted GOLD amount. |
| `POST /api/merchant/reject` | `POST /merchant/reject` | Resolve one active offer as rejected and apply its demand and failure-streak effects once. |

The merchant endpoints require an existing Guest session. A successful read returns `{ farm, merchant }`. Accept and reject return the same snapshots plus `resolvedOffer` identifying the accepted or rejected offer. All success responses use HTTP 200.

Both actions use this body, with values taken from the latest merchant response.

```json
{
  "offerId": "server-generated-offer-id",
  "expectedRevision": 4,
  "expectedMerchantRevision": 2
}
```

`expectedRevision` is `farm.revision`. `expectedMerchantRevision` is `merchant.revision`. The server looks up the quoted crop, side, quantity, and GOLD price from `offerId` and checks both revisions in the same transaction as the action. Acceptance updates both snapshots. Rejection and expiry affect merchant state while retaining the Farm revision when no player assets change.

### Offers, timing, and UI

- Offer sides use the NPC's perspective. `BUY` pays the player and adds one player crop to NPC inventory. `SELL` takes player GOLD and delivers one NPC crop to the silo.
- The server sends active offers in `merchant.offers`. Render the offers returned by the server, using `priceGold` as the quote. `pricing` describes the multipliers at the current state and can explain future price changes.
- `canAccept` and `unavailableReason` describe acceptance using the current player and NPC state. An onboarding BUY offer may be visible before the player has a crop. Enable acceptance only when `canAccept` is true. Rejection remains available for active offers during their window.
- Use `farm.serverTimeMs` as the shared time reference. `expiresAtMs`, `cooldownUntilMs`, and `nextOfferAtMs` are Unix milliseconds. Reuse the monotonic elapsed-time approach from Farm to display countdowns. Refresh from the server when a timer elapses. The 20-second offer window and 5-second accept cooldown follow C02 Lite.
- Expired or resolved IDs leave the active-offer list. Requests for resolved or expired offers return a conflict and apply no second effect. An action received at or after `expiresAtMs` cannot accept or reject that offer. Refresh on a 401 or 409, display the returned error, and let the player decide whether to act again.
- Empty offers can occur during cooldown, when the merchant is out of business, or when no feasible quote exists. Quick Sell in Farm continues to use its own endpoint.

### State and accounting

The merchant state is scoped to the Guest session. Initial budget, inventory, demand, pricing, recovery rules, and all transfer checks follow [C02 Lite](FARMVERSE_MVP_CONTRACT.md#3-c02-lite--one-deterministic-merchant-npc-locked). Store the actual `goldBudget` even above 300. `referenceBudget` is only the normalization constant.

`recoveryEvents` records simulated liquidation with the crop consumed, the one-time operating grant, and out-of-business events. The merchant snapshots expose `grantUsed`, `isSelfSustaining`, and `sellFailStreak` so the Store can explain those changes. Crop counts remain separate for Normal and Golden.

Merchant offers in this interface use GOLD. C03 Micro uses the separate testnet transfer flow scheduled in P4.

### Errors

Errors use `{ "error": { "code": "STALE_MERCHANT", "message": "..." } }`. The shared `MERCHANT_ERROR_STATUS` maps codes to HTTP status. Request validation is required at runtime. `isMerchantOfferRequest` checks the request shape, and the server checks session ownership, active offer identity, affordability, capacity, and timing against persisted state.
