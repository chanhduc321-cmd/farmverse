# FarmVerse — Danh mục Sprite Asset (Task T-14 Sprite Manifest)

Tài liệu này quy chuẩn toàn bộ danh mục sprite 2.5D Isometric cần thiết cho **Scene A (My Farm)**, **Scene B (Town Square / Store)**, nông sản, tiền tệ và HUD.

- **Phong cách chuẩn:** Bám sát [`docs/art/approved_style.png`](approved_style.png) và [`docs/art/ART_BIBLE.md`](ART_BIBLE.md).
- **T-14:** Chủ dự án đã duyệt đủ 23 sprite. Tạo từng sprite với nền alpha, dùng ảnh toàn cảnh làm mẫu về góc nhìn, ánh sáng và chất liệu. Các trạng thái của cùng một vật thể dùng chung ảnh nguồn để giữ tỷ lệ và vị trí chân.
- **Quy cách kỹ thuật chung:**
  - Định dạng PNG RGBA, 8 bit mỗi kênh. Vùng ngoài vật thể có alpha bằng 0. Giữ alpha bán trong suốt cho viền khử răng cưa và hiệu ứng.
  - Góc camera: Isometric 2.5D cố định nghiêng ~30° (tỷ lệ 2:1 dimetric).
  - Ánh sáng: Nắng ấm tự nhiên từ góc trên bên trái (Top-left warm afternoon sunlight, bóng đổ mềm phía dưới bên phải).
  - Thư mục xuất file game-ready: `web/public/assets/`.
  - Thư mục lưu ảnh nguồn độ phân giải cao: `art/source/t14/`.
  - Prompt đã dùng, nguồn tham chiếu, đường dẫn và origin của từng sprite có trong [hồ sơ sinh ảnh](../../art/source/t14/generation.json).

---

## Bảng danh mục sprite (23 asset)

### Nhóm 1: Cảnh Nông Trại (Scene A — My Farm)

| ID / Tên File | Kích thước | Anchor (X, Y) | Trạng thái | Prompt Gen ảnh AI (Isolated Sprite on Transparent Background) |
| :--- | :--- | :--- | :--- | :--- |
| `plot_empty.png` | 150 × 95 px | (0.5, 0.7) | `APPROVED` | `2.5D isometric single empty tilled soil farming plot, neat rectangular furrow bed with rich dark chocolate brown dirt, clean defined soil borders, warm soft afternoon sunlight, pure isolated asset on clean transparent background, high resolution casual mobile game asset, no grass, no background.` |
| `plot_growing.png` | 150 × 95 px | (0.5, 0.7) | `APPROVED` | `2.5D isometric tilled soil farming plot with fresh young green seedling sprouts growing in the center, bright vibrant lime green leaves, rich brown earth furrow bed, pure isolated asset on clean transparent background, high resolution casual game asset, no background.` |
| `plot_ready_normal.png` | 150 × 115 px | (0.5, 0.75) | `APPROVED` | `2.5D isometric farming plot with fully ripe golden wheat crop stalks full of grains ready to harvest, warm amber yellow wheat, clean dark soil base, pure isolated asset on clean transparent background, casual mobile game asset, no background.` |
| `plot_ready_golden.png` | 150 × 120 px | (0.5, 0.75) | `APPROVED` | `2.5D isometric farming plot with magical radiant pure golden wheat stalks, glowing sparkles, gleaming gold aura, high value fantasy harvest, pure isolated asset on clean transparent background, stylized game asset, no background.` |
| `plot_locked.png` | 150 × 95 px | (0.5, 0.7) | `APPROVED` | `2.5D isometric overgrown locked farm plot, dry weed patches, small brass lock emblem floating in center indicating locked area, pure isolated asset on clean transparent background, casual game asset.` |
| `farmhouse_tier1.png` | 220 × 240 px | (0.5, 0.85) | `APPROVED` | `2.5D isometric cozy rustic wooden farmhouse cottage, warm red clay tiled roof, wooden stairs, cheerful flower pots, warm sunlight, charming mobile game building, pure isolated asset on clean transparent background, no ground, no background.` |
| `silo_tier1.png` | 120 × 180 px | (0.5, 0.85) | `APPROVED` | `2.5D isometric rustic wooden grain silo, circular wood plank walls with metal iron bands, conical terracotta cap, farm grain storage building, pure isolated asset on clean transparent background, casual mobile game style, no background.` |
| `fish_pond.png` | 180 × 140 px | (0.5, 0.7) | `APPROVED` | `2.5D isometric small clear garden koi pond, smooth rounded grey pebble stone rim, crystal clear azure blue water, pink water lilies with green floating pads, orange koi fish, pure isolated asset on clean transparent background, no grass border.` |
| `fence_locked.png` | 160 × 90 px | (0.5, 0.7) | `APPROVED` | `2.5D isometric rustic wooden post-and-rail farm fence segment with a small wooden gate in center, secured with a brass padlock and iron chain, pure isolated asset on clean transparent background.` |
| `fence_open.png` | 160 × 90 px | (0.5, 0.7) | `APPROVED` | `2.5D isometric wooden farm fence segment with an open wooden gate, welcoming entrance, pure isolated asset on clean transparent background.` |

---

### Nhóm 2: Cảnh Thị Trấn & Cửa Hàng (Scene B — Town Square / Store)

| ID / Tên File | Kích thước | Anchor (X, Y) | Trạng thái | Prompt Gen ảnh AI (Isolated Sprite on Transparent Background) |
| :--- | :--- | :--- | :--- | :--- |
| `merchant_stall.png` | 200 × 180 px | (0.5, 0.85) | `APPROVED` | `2.5D isometric wooden market merchant stall, vibrant red and white striped fabric canvas awning, wooden crates overflowing with fresh red apples and orange carrots, pure isolated asset on clean transparent background, mobile game art.` |
| `npc_merchant_idle.png` | 110 × 140 px | (0.5, 0.85) | `APPROVED` | `Cute friendly anthropomorphic blue wolf farmer merchant character, standing pose, wearing denim dungarees and a straw sun hat, holding a wooden hoe, smiling cheerfully, pure isolated game sprite on clean transparent background.` |
| `town_square_ground.png` | 360 × 240 px | (0.5, 0.5) | `APPROVED` | `2.5D isometric modular cobblestone pavement floor tile, smooth ancient rounded river stones, warm sunlight, crisp outer edges, pure isolated asset on clean transparent background.` |
| `store_signboard.png` | 90 × 70 px | (0.5, 0.8) | `APPROVED` | `2.5D isometric rustic wooden signboard post with carved fruit basket icon, timber pole, pure isolated asset on clean transparent background.` |

---

### Nhóm 3: Nông Sản & Tiền Tệ (Items & Currency)

| ID / Tên File | Kích thước | Anchor (X, Y) | Trạng thái | Prompt Gen ảnh AI (Game UI Icon on Transparent Background) |
| :--- | :--- | :--- | :--- | :--- |
| `crop_normal.png` | 64 × 64 px | (0.5, 0.5) | `APPROVED` | `Game UI icon of a neat tied bundle of ripe golden wheat stalks with grains, vibrant warm colors, smooth casual mobile style, pure isolated icon on clean transparent background.` |
| `crop_golden.png` | 64 × 64 px | (0.5, 0.5) | `APPROVED` | `Game UI icon of a shimmering pure golden wheat bundle, sparkling light glints, glowing luxury crop item, pure isolated icon on clean transparent background.` |
| `coin_gold.png` | 48 × 48 px | (0.5, 0.5) | `APPROVED` | `Game UI icon of a shiny thick golden coin with embossed wheat sprout symbol, warm golden glow, casual stylized game icon, pure isolated icon on clean transparent background.` |
| `token_near.png` | 48 × 48 px | (0.5, 0.5) | `APPROVED` | `Game UI icon of NEAR Protocol round crypto token badge, crisp stylized logo, pure isolated icon on clean transparent background.` |

---

### Nhóm 4: Giao Diện HUD & Hiệu Ứng (UI & Effects)

| ID / Tên File | Kích thước | Anchor (X, Y) | Trạng thái | Prompt Gen ảnh AI (Game UI Icon on Transparent Background) |
| :--- | :--- | :--- | :--- | :--- |
| `hud_silo_icon.png` | 40 × 40 px | (0.5, 0.5) | `APPROVED` | `Game UI icon of a cute compact wooden grain silo, storage icon, clean vector-like mobile game style, pure isolated icon on transparent background.` |
| `hud_cart_icon.png` | 40 × 40 px | (0.5, 0.5) | `APPROVED` | `Game UI icon of a cute wooden wheelbarrow filled with harvested crops, market navigation icon, pure isolated icon on transparent background.` |
| `hud_camera_icon.png` | 36 × 36 px | (0.5, 0.5) | `APPROVED` | `Game UI icon of a brass telescope / camera viewfinder, crisp clean stylized icon on transparent background.` |
| `icon_lock.png` | 36 × 36 px | (0.5, 0.5) | `APPROVED` | `Game UI icon of a small polished brass padlock, locked indicator, pure isolated icon on transparent background.` |
| `sparkle_effect.png` | 48 × 48 px | (0.5, 0.5) | `APPROVED` | `Game VFX sprite of a 4-point shining golden star sparkle with soft glow, particle effect asset on transparent background.` |

## Bàn giao cho T-15

- Đặt origin theo từng dòng để các trạng thái plot và cổng giữ cùng vị trí chân. Bộ plot có cùng bề rộng phần nhìn thấy sau khi xuất, với chênh lệch mép chân dưới 1 px so với origin.
- Dùng `plot_ready_normal.png` cho trạng thái READY hiện tại. Backend trả loại crop sau khi thu hoạch. Các sprite Golden và `sparkle_effect.png` có thể dùng để thể hiện kết quả đó.
- `token_near.png` là icon cho demo NEAR. `coin_gold.png` là icon cho GOLD trong Farm và Store.
