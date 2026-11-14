# FV-GAME-01 — Crop Catalog & Gameplay Balance Specification

Technical gameplay amendment governing crop growth mathematics, agricultural mechanics, care tool multipliers, and the 15-crop progression catalog.

---

## 1. Gameplay Loop & Agricultural Rules

| Domain | Rule & System Behavior |
|---|---|
| **Starting State** | Initial balance of **200 GOLD**, Level 1, 0 XP, 6 tilled plots (`EMPTY`), empty seed bag and warehouse. Guest and authenticated accounts follow unified rules. |
| **Seed Shop** | Features all 15 crops. Players purchase 1–99 seeds per order. Gold is deducted atomically; seeds are credited to the player's Bag. |
| **Bag & Planting** | Consumes 1 seed of selected crop ID, records planting timestamp (`plantedAt`), transitions plot to `GROWING`, and awards **5 XP**. |
| **Growth Math** | Growth stages (frames $k \in [1, \dots, N]$) are computed deterministically via $t_k = \text{unitTime} \times \frac{k(k + 1)}{2}\text{ seconds}$. The final frame marks maturity. Server time governs stage transitions. |
| **Harvest & Yield** | Mature crops yield a deterministic batch of **10–29 produce units** into the Warehouse, award **1 XP**, and transition the plot to `NEED_CLEAR`. |
| **Clearing Land** | Using the shovel tool clears dead stalks, awards **3 XP**, and resets the plot state to `EMPTY`. |
| **Warehouse Sales** | Bulk sell up to 999 units of stored produce. Revenue = $\text{Quantity} \times \text{Unit Sale Price}$. |

---

## 2. Crop Care Mechanics

Players can apply care tools to accelerate growing crops:
- **Watering Can:** Free action; reduces base growth time by **10%**.
- **Fertilizer:** Costs 5 Gold per bag; reduces base growth time by **20%**.
- **Stacking:** Applying both tools reduces base growth duration by **30%**. If elapsed time meets the adjusted threshold, the plant matures immediately.
- **Constraints:** Each tool can be applied at most once per plot per crop cycle.

---

## 3. The 15-Crop Catalog & Maturation Schedule

Prices and rewards are specified in GOLD:

| ID | Crop Name | Growth Frames | Unit Time ($s$) | Maturation Time ($s$) | Seed Cost | Sale Price | Recommended Level |
|:---:|---|:---:|:---:|:---:|:---:|:---:|:---:|
| **1** | Strawberry | 5 | 2 | 30 | 10 | 20 | 1 |
| **2** | Corn | 5 | 12 | 180 | 15 | 30 | 1 |
| **3** | White Radish | 4 | 15 | 150 | 18 | 35 | 1 |
| **4** | Carrot | 4 | 16 | 160 | 19 | 37 | 1 |
| **5** | Sweet Potato | 5 | 18 | 270 | 20 | 40 | 2 |
| **6** | Eggplant | 5 | 19 | 285 | 22 | 42 | 2 |
| **7** | Tomato | 5 | 20 | 300 | 24 | 44 | 2 |
| **8** | Mung Bean | 5 | 22 | 330 | 26 | 46 | 3 |
| **9** | Chili Pepper | 5 | 24 | 360 | 28 | 48 | 3 |
| **10** | Pumpkin | 5 | 26 | 390 | 30 | 50 | 4 |
| **11** | Apple | 6 | 28 | 588 | 33 | 55 | 4 |
| **12** | Watermelon | 5 | 30 | 450 | 35 | 57 | 5 |
| **13** | Banana | 6 | 32 | 672 | 37 | 60 | 5 |
| **14** | Peach | 5 | 34 | 510 | 38 | 62 | 6 |
| **15** | Pineapple | 6 | 36 | 756 | 39 | 64 | 6 |

---

## 4. Visiting & Crop Stealing Guardrails

1. **Visiting Neighbor Farms:** Authenticated players can visit other farms via the Friends or Resident list.
2. **Stealing Limits:**
   - Visitors can harvest at most **1 fruit** per ripe plot per crop cycle.
   - **Protection Threshold:** Stealing is only permitted if the plot has at least **2 fruits** remaining, guaranteeing the farm owner receives the majority harvest.
   - Steal attempts update target farm yields in real time and trigger guard pet defense checks.
