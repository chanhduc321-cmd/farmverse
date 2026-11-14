# FarmVerse Web Client

The FarmVerse web frontend is built with **Phaser 3**, **Vite**, and **TypeScript**. It communicates with the backend API to render real-time farm states, animations, player interactions, and Web3 trading components.

---

## 1. Quickstart

Run both services in separate terminal windows from the repository root:

**Terminal 1 — Backend:**
```bash
pnpm --dir backend install --frozen-lockfile
pnpm --dir backend migrate
pnpm --dir backend start
```

**Terminal 2 — Web Client:**
```bash
pnpm --dir web install --frozen-lockfile
pnpm --dir web dev
```

Open `http://127.0.0.1:5174/` in your browser. The Vite dev server automatically proxies `/api` requests to the backend at port 8092.

---

## 2. Gameplay Controls & Tools

- **Planting:** Open the Seed Shop to buy seeds, select a crop from your Bag, and tap an empty plot to plant.
- **Care Tools:** Select **Watering Can** or **Fertilizer** from the lower toolbar and tap growing crops to reduce maturation time. Press `Escape` or tap the active tool icon again to cancel tool selection.
- **Harvest & Clear:** Tap a ripe crop to harvest produce into your Warehouse, then select the **Shovel** to clear the plot for the next cycle.
- **Community:** Open the Friends icon on the top HUD to view friends and neighbors, visit other farms, and harvest produce.

---

## 3. Google Analytics 4 (GA4) Tracking

The client tracks user journeys and engagement via GA4 when `VITE_GA_MEASUREMENT_ID` (format `G-XXXXXXXXXX`) is provided at build time. If omitted, no tracking scripts are injected.

- **Local Debugging:** Copy `web/.env.example` to `web/.env.local`, set your test measurement ID, and open `http://127.0.0.1:5174/?ga_debug=1` to inspect live events in GA4 DebugView.
- **Testing:** Run frontend test suites via `pnpm --dir web test`.

### Tracked Gameplay Events:
| Event Name | Trigger | Parameters |
|---|---|---|
| `page_view` | Initial page load (automatic) | — |
| `game_boot` / `game_boot_failed` | Phaser game canvas ready / Loading error | `load_ms` |
| `tutorial_complete` / `tutorial_skip` | Onboarding tour finished / skipped | — |
| `sign_up`, `login`, `logout` | Authentication lifecycle | `method` |
| `farm_buy`, `farm_sell` | Seed shop purchase, warehouse sales | `crop_id`, `quantity` |
| `farm_buy_fertilizer` | Fertilizer purchase | `quantity` |
| `farm_plant` | Crop planting action | `crop_id` |
| `farm_harvest`, `farm_clear` | Harvest ripe crop, shovel plot | — |
| `farm_water`, `farm_fertilize` | Care tool applied | — |
| `farm_check_in` | Daily attendance streak recorded | — |
| `farm_select_pet`, `farm_claim_mission` | Pet companion chosen, mission reward claimed | `pet`, `mission` |
| `farm_visit`, `farm_steal` | Neighbor farm visited, crop steal action | `blocked` |

*Events dispatch strictly after backend API confirmation. Personally identifiable information (PII) is never tracked.*
