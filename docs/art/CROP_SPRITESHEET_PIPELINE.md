# FarmVerse — Crop Spritesheet Generation Pipeline

Technical specification and AI generation pipeline for producing cohesive, game-ready crop lifecycle spritesheets.

---

## 1. Spritesheet Grid Layout

Each generated crop asset consists of a horizontal spritesheet containing **6 to 7 growth states** arranged from left to right on a pure white background (`#FFFFFF`), with generous separating margins:

| Column | Asset Name | Lifecycle Stage | Output Dimensions |
|:---:|---|---|:---:|
| **1** | `{crop}_seed.png` | Rustic seed pouch with illustrative crop label | 48×48 / 64×64 px |
| **2** | `{crop}_stage1_sprout.png` | Fresh sprouts emerging from the ground plane | 200×100 px (2:1 isometric) |
| **3** | `{crop}_stage2_seedling.png` | Young plant with early tender leaves | 200×100 px (2:1 isometric) |
| **4** | `{crop}_stage3_growing.png` | Expanding foliage cluster in active growth | 200×100 px (2:1 isometric) |
| **5** | `{crop}_stage4_flowering.png` | Flowering stage with small blossoms or immature fruit | 200×100 px (2:1 isometric) |
| **6** | `{crop}_stage5_ripe.png` | Mature, harvest-ready plant bearing ripe produce | 200×120 px (2:1 isometric) |
| **7** | `{crop}_item.png` | Isolated single produce item for Warehouse/Shop icon | 100×100 px (1:1 square) |

---

## 2. Visual DNA & Invariants

- **Camera Angle & Projection:** Stages 1 through 5 strictly follow a **2.5D Isometric 2:1 dimetric projection (~30° inclination)** to align seamlessly with FarmVerse farm plots.
- **Lighting:** Warm golden afternoon sunlight directed from the **upper-left**, casting soft contact shadows toward the lower-right.
- **Rendering Style:** High-polish stylized casual 3D art (*Hay Day / Farmery*). Avoid pixel art, gritty photorealism, and oversaturated neon tones.
- **Background:** Seamless solid white (`#FFFFFF`) without checkerboards, drop shadows, bounding boxes, or watermarks.

---

## 3. Template Generation Blueprint

```text
A professional horizontal game sprite sheet for a casual farming game, featuring the complete growth lifecycle of [CROP_NAME] from left to right on a seamless pure flat white (#FFFFFF) background. 

All stages share the exact same 2.5D isometric camera angle (2:1 dimetric ratio, ~30-degree tilt), warm afternoon sunlight from the upper-left, soft hand-painted 3D casual game finish, and cohesive color palette inspired by FarmVerse / Hay Day aesthetics.

Left to right sequence (7 distinct items evenly spaced horizontally with generous gaps):
1. SEED PACKET: A rustic kraft paper seed pouch with stitched edges and a cute illustrated [CROP_NAME] label.
2. SPROUT (Stage 1): Tiny fresh lime-green shoots just emerging from the ground plane.
3. SEEDLING (Stage 2): Small young plant with a few fresh tender leaves in 2:1 isometric plane.
4. GROWING (Stage 3): Bushy vibrant green foliage growing vigorously.
5. FLOWERING (Stage 4): Full mature plant in bloom with small delicate blossoms and tiny unripe pale green fruits.
6. RIPE (Stage 5): Lush mature plant heavily laden with plump, glossy, harvest-ready ripe [CROP_NAME].
7. HARVEST ITEM: A single isolated, high-resolution ripe [CROP_NAME] produce item for an inventory icon.

Isolated on pure white background, generous empty space between objects, clean crisp contours, zero text, no labels, no checkerboard, no soil boxes or frames.
```

---

## 4. Specific Prompts by Crop

### Strawberry (Crop 1)
```text
A professional horizontal game sprite sheet for a casual farming game, featuring the complete growth lifecycle of STRAWBERRY from left to right on a seamless pure flat white (#FFFFFF) background.

All stages share the exact same 2.5D isometric camera angle (2:1 dimetric ratio, ~30-degree tilt), warm afternoon sunlight from the upper-left, soft hand-painted 3D casual game finish, and cohesive palette of lush emerald greens and ruby reds.

Left to right sequence (7 distinct items evenly spaced horizontally with generous margins):
1. SEED PACKET: A charming rustic kraft seed pouch with a hand-painted red strawberry label.
2. SPROUT: Tiny vibrant lime-green strawberry shoots peeking up on the 2:1 isometric ground plane.
3. SEEDLING: Young strawberry plant with 2-3 delicate serrated leaves.
4. GROWING: Bushy lush emerald-green strawberry foliage cluster with lime edge highlights.
5. FLOWERING: Mature strawberry foliage with delicate white 5-petal flowers (sunny yellow centers) and small green berry nubs.
6. RIPE: Lush strawberry plant covered in plump, glossy, ruby-red ripe strawberries with golden seeds.
7. HARVEST ITEM: A single plump ruby-red strawberry with green leaf calyx cap for an inventory icon.

Isolated on seamless pure white (#FFFFFF), ample spacing between objects, crisp readable silhouettes, zero text, no checkerboard, no soil beds.
```

### Carrot (Crop 4)
```text
A professional horizontal game sprite sheet for a casual farming game, featuring the complete growth lifecycle of CARROT from left to right on a seamless pure flat white (#FFFFFF) background.

All stages share the exact same 2.5D isometric camera angle (2:1 dimetric ratio, ~30-degree tilt), warm afternoon sunlight from the upper-left, soft hand-painted 3D casual game finish, and vivid orange and feathery green palette.

Left to right sequence (7 distinct items evenly spaced horizontally with generous margins):
1. SEED PACKET: A charming rustic seed packet with a hand-painted bright orange carrot label.
2. SPROUT: Tiny delicate feathery green carrot shoots emerging on the 2:1 isometric ground plane.
3. SEEDLING: Small young carrot tops with frilly green leaves.
4. GROWING: Tall, dense, vibrant feathery carrot greens spreading out.
5. MATURING: Plump orange carrot shoulders just crowning above ground level under dense feathery greens.
6. RIPE: Full mature carrot plant ready for harvest with thick bright orange carrot crowns visible beneath lush leafy tops.
7. HARVEST ITEM: A clean, plump, freshly pulled bright orange carrot with leafy green stem for an inventory icon.

Isolated on seamless pure white (#FFFFFF), ample spacing between objects, crisp readable silhouettes, zero text, no checkerboard, no soil beds.
```

### White Radish / Daikon (Crop 3)
```text
A professional horizontal game sprite sheet for a casual farming game, featuring the complete growth lifecycle of WHITE RADISH (Daikon) from left to right on a seamless pure flat white (#FFFFFF) background.

All stages share the exact same 2.5D isometric camera angle (2:1 dimetric ratio, ~30-degree tilt), warm afternoon sunlight from the upper-left, soft hand-painted 3D casual game finish, and ivory white and crisp green palette.

Left to right sequence (7 distinct items evenly spaced horizontally with generous margins):
1. SEED PACKET: A charming rustic seed packet with a hand-painted white radish label.
2. SPROUT: Tiny lime-green radish sprouts on the 2:1 isometric ground plane.
3. SEEDLING: Young radish plant with ruffled green leaves.
4. GROWING: Broad vigorous dark-green radish leaves rosette.
5. MATURING: Smooth ivory-white radish root shoulder surfacing above the ground line under green foliage.
6. RIPE: Plump, heavy white radish root crowned with fresh green leafy tops ready for pulling.
7. HARVEST ITEM: A clean, glossy ivory-white daikon radish with green leafy crown for an inventory icon.

Isolated on seamless pure white (#FFFFFF), ample spacing between objects, crisp readable silhouettes, zero text, no checkerboard, no soil beds.
```

---

## 5. Asset Hierarchy & Sprite Alignment

In-game crop sprites are rendered with anchor `(0.5, 0.84)` to align organically with tilled soil tiles:

| Role in Game | Standard Asset Path | Sourcing & Scaling Note |
|---|---|---|
| **Seed in Bag/Shop** | `image/crops/crop{id}/seed.png` | Crops 1–5 use unique seed packet artwork; Crops 6–15 use 48×48 icons. |
| **Freshly Planted** | `image/crops/crop{id}/planted.png` | Shared initial sprout tile. |
| **Growth Frames** | `image/crops/crop{id}/stage-{n}.png` | Sequential stages matching crop definition unit times. |
| **Harvest Produce** | `image/crops/crop{id}/produce.png` | Single produce icon used in Warehouse and Shop inventories. |
| **Cleared Plot** | `image/crops/crop{id}/cron_end.png` | Harvested stubble awaiting shovel clearing. |
