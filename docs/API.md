# FarmVerse API

The USDC testnet trade scenario has a shared contract and fixtures in the [USDC Trade Demo API](TRADE_DEMO_API.md).

The [USDC adapter](NEAR_USDC_ADAPTER.md) handles sponsored testnet transfers and Google payment approval callbacks. Its transaction history metadata is available on `/api/account/transactions`.

The Node.js service owns state. In development, the browser calls `/api/...` through the Vite proxy to the matching Hono route without the `/api` prefix. Send JSON POST bodies with `Content-Type: application/json` and include cookies. Responses carrying game state use `Cache-Control: no-store`.

## Session and Farm

Call `GET /api/farm` first to start or resume a Guest session with an HttpOnly cookie. If the browser has a valid account session, this endpoint opens its farm. `GET /api/crops` returns the 15 crop definitions. Farm responses include the current farm revision and server time. Backend scripts load `DATABASE_URL` from `backend/.env`. Vercel requires the same server-side variable. Connection failures show a retry screen. [Gameplay](FARMVERSE_GAMEPLAY.md) · [Backend setup](../backend/README.md)

`POST /api/farm/check-in` accepts `expectedRevision`. It records attendance and grants the scheduled reward in the same Farm write. The response carries the updated Farm and a reward message. The web UI uses `missionStatus(farm, now).attendanceDays` for the current seven-day cycle.

| Browser request | JSON fields alongside `expectedRevision` | Effect |
|---|---|---|
| `POST /api/farm/buy` | `cropId`, `quantity` | Buy 1–99 seeds |
| `POST /api/farm/buy-fertilizer` | `quantity` | Buy 1–99 bags of fertilizer for 5 Gold per bag |
| `POST /api/farm/plant` | `cropId`, `plot` | Consume one seed and plant in a vacant plot |
| `POST /api/farm/harvest` | `plot` | Harvest a ripe crop and mark the plot for clearing |
| `POST /api/farm/sell` | `cropId`, `quantity` | Sell up to 999 items within warehouse stock |
| `POST /api/farm/clear` | `plot` | Clear a harvested plot |
| `POST /api/farm/water` | `plot` | Water a growing crop once per lifecycle and reduce its base growth time by 10% |
| `POST /api/farm/fertilize` | `plot` | Use one bag of fertilizer once per lifecycle on a growing crop and reduce its base growth time by 20% |

`plot` is the zero-based position from 0 to 5. A stale revision returns HTTP 409. Read the current farm before retrying. [Shared Farm contract](../shared/farm.mts)

`farm.fertilizer` is the number of bags available. Older saves may omit the field, which represents zero bags.

## Accounts

`GET /api/farm` returns a `FarmSessionResponse` with `farm`, `serverTime`, `accountsAvailable` and `account`. Render the Guest identity when `account` is `null`. A signed-in player has `account: { username }`. When `accountsAvailable` is `false`, allow play as Guest and disable account actions. [Shared API paths and types](../shared/farm.mts)

| Browser request | JSON body | Success |
|---|---|---|
| `POST /api/account/register` | `{ username, password }` | 201 with `FarmSessionResponse`. The new account takes ownership of the current Guest farm, including Gold, XP, seeds, warehouse, crop timestamps and revision. |
| `POST /api/account/login` | `{ username, password }` | 200 with `FarmSessionResponse` for the account's farm. |
| `POST /api/account/logout` | `{}` | 204. Call `GET /api/farm` to resume an independent Guest farm or start a new one. |

Usernames accept 3–24 ASCII letters, digits or underscores. The server trims and lowercases them. Passwords require 15–128 characters. Call `GET /api/farm` before registering so the browser has a Guest session. After successful registration or login, replace the current farm snapshot and selected actions with the returned session state. Authentication uses cookies managed by the browser.

Account routes return `{ error: string }` on failure. Show the returned message. Common cases are 400 for invalid input, 401 for an invalid login or missing Guest session, 409 for a name conflict or active account, 429 for too many attempts, and 503 when account storage is unavailable. Account POSTs require JSON from the game origin and a body of at most 2,048 bytes. On 401 from a gameplay mutation, refresh via `GET /api/farm` before the player chooses their next action.

## Merchant Interface

Use `MERCHANT_API` for routes and `MERCHANT_CROP_IDS` to resolve the NPC's two crop slots against the Farm catalog. [Shared merchant contract](../shared/merchant.mts)

| Browser request | Hono route | Result |
|---|---|---|
| `GET /api/merchant` | `GET /merchant` | Read Farm and merchant snapshots for the current Guest or account. Process due offer expiry and recovery before returning state. |
| `POST /api/merchant/accept` | `POST /merchant/accept` | Resolve one active offer and transfer exactly one crop for the quoted GOLD amount. |
| `POST /api/merchant/reject` | `POST /merchant/reject` | Resolve one active offer as rejected and apply its demand and failure-streak effects once. |

Open `GET /api/farm` first to establish a session. A successful read returns `{ farm, serverTime, merchant }`. Accept and reject return the same snapshots plus `resolvedOffer` identifying the accepted or rejected offer. All success responses use HTTP 200.

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

- Offer sides use the NPC's perspective. `BUY` pays the player and takes one crop from the warehouse. `SELL` takes player Gold and adds one crop to the warehouse. `NORMAL` maps to Dâu tây (1) and `GOLDEN` maps to Ngô (2).
- The server sends active offers in `merchant.offers`. Render the offers returned by the server, using `priceGold` as the quote. `pricing` describes the multipliers at the current state and can explain future price changes.
- `canAccept` and `unavailableReason` describe acceptance using the current player and NPC state. An onboarding BUY offer may be visible before the player has a crop. Enable acceptance only when `canAccept` is true. Rejection remains available for active offers during their window.
- Use `serverTime` as the shared time reference. `expiresAtMs`, `cooldownUntilMs`, and `nextOfferAtMs` are Unix milliseconds. Reuse the monotonic elapsed-time approach from Farm to display countdowns. Refresh from the server when a timer elapses. The 20-second offer window and 5-second accept cooldown follow C02 Lite.
- Expired or resolved IDs leave the active-offer list. Requests for resolved or expired offers return a conflict and apply no second effect. An action received at or after `expiresAtMs` cannot accept or reject that offer. Refresh on a 401 or 409, display the returned error, and let the player decide whether to act again.
- Empty offers can occur during cooldown, when the merchant is out of business, or when no feasible quote exists. Farm warehouse sales use their own endpoint. Buying from the NPC requires fewer than 10 combined strawberries and corn in the player's warehouse.

### State and accounting

The merchant state belongs to the Farm profile. Account registration adopts it with the Guest farm. PostgreSQL saves both sides of a trade in a single write and requires migration `005`. No RAM/offline gameplay fallback remains. Initial budget, inventory, demand, pricing, recovery rules, and transfer checks follow [C02 Lite](FARMVERSE_MVP_CONTRACT.md#3-c02-lite--one-deterministic-merchant-npc-locked). Display the actual `goldBudget` even above 300. `referenceBudget` is the normalization constant.

`recoveryEvents` records simulated liquidation with the crop consumed, the one-time operating grant, and out-of-business events. The merchant snapshots expose `grantUsed`, `isSelfSustaining`, and `sellFailStreak` so the Store can explain those changes. Crop counts remain separate for Normal and Golden.

Merchant offers in this interface use GOLD. C03 Micro uses the separate testnet transfer flow scheduled in P4.

### Errors

Errors use `{ "error": { "code": "STALE_MERCHANT", "message": "..." } }`. The shared `MERCHANT_ERROR_STATUS` maps codes to HTTP status. Request validation is required at runtime. `isMerchantOfferRequest` checks the request shape, and the server checks session ownership, active offer identity, affordability, capacity, and timing against persisted state.

## Community & Social Features

Community routes require a signed-in PostgreSQL account and migration `006`. Use the same browser cookies and API prefix as Farm. [Shared route templates and response types](../shared/community.mts)

| Browser request | Input | Result |
|---|---|---|
| `GET /api/community/players` | Query `list` set to `residents`, `friends` or `invitations`, with optional `q` (empty or 3–24 characters) and `offset` (0–119) | `PlayerPage` with up to 12 usernames and `nextOffset`. Pagination stops at 120 results per filter. Invitations lists pending incoming requests. |
| `POST /api/community/friends/:username/invite` | `{}` | 204. Sends an invitation. |
| `POST /api/community/friends/:username/confirm` | `{}` | 204. The recipient confirms the named sender. Both players appear in each other's friends lists. |
| `GET /api/community/farms/:username` | Target username | `FarmVisit` with plot snapshots, remaining ripe fruit and `canSteal` for the current visitor. |
| `POST /api/community/farms/:username/steal` | `{ plot, plantedAt }` | `StealResponse` with `farm`, updated `visit`, `serverTime` and `blocked`. |

Search filters the current list by username substring. Residents lists the other accounts except confirmed friends. Use the zero-based plot index and `plantedAt` from the visit response to identify the crop. The server rolls a 50% block chance after claiming a valid attempt. Both outcomes return 200. With `blocked: true`, the visitor sees the guard reaction. With `blocked: false`, the server transfers one fruit from the host's crop to the visitor's warehouse and increments both Farm revisions. Each visitor gets one attempt per plot and crop. Replays and invalid attempts return 409. The client displays the error and refreshes the visit. [Pet rules](FARMVERSE_GAMEPLAY.md#5-guard-pets-system)

Directory pages are cached for 15 seconds in the active browser session and 20 seconds per account in each backend instance. Successful invites and confirmations invalidate both accounts' pages in the instance that processed the write. The directory allows 18 reads per session per 30 seconds in each instance, then returns `429` with `Retry-After`. Reads within this limit verify the session before accessing cached data.

`POST /api/farm/pet` accepts `{ pet: 'dog' | 'cat' | 'goose', expectedRevision }` for Guest and account sessions, and returns `FarmResponse`. A new or legacy farm defaults to dog. Selection persists in Farm JSON and uses the same revision protection as other mutations.

## Farm Activity & Journal

Activity routes require the signed-in account and migrations through `009`. The server identifies the owner from the session cookie. [Shared response types](../shared/activity.mts)

| Browser request | Input | Result |
|---|---|---|
| `GET /api/activity` | Optional `offset`, `limit` from 1 to 50 and `through` | Newest events first, unread summary and next offset. For subsequent pages, set `through` to the first event ID from the initial page to keep the list stable. |
| `POST /api/activity/read` | JSON `{ "through": "event-id" }` | Mark events up to the displayed event for the current owner. Returns the remaining unread count. |

The first page without `through` returns an `ETag`. The client can send it in `If-None-Match` to receive `304` when the latest event and read marker match. The web client keeps one page in memory for the signed-in account and checks at most once per 30 seconds while the player has their own farm open in a visible tab. It sends `X-Farm-Account` with the displayed username to detect when another tab changed the account cookie. A mismatch returns `401`.

After displaying an unread page, acknowledge its newest displayed event ID. An event that arrives during the read remains unread. The summary lists up to five distinct visitors, totals stolen fruit and counts `recentBlockedSteals`. `pet_block` events use `amount: 0` and include the visitor, crop, plot and timestamp. Visits from the same player to the same Farm are grouped within ten minutes. Blocked attempts and their journal events commit in the same transaction.
