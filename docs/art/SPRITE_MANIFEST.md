# FarmVerse — Danh mục Sprite Asset (Task T-14 Sprite Manifest)

Tài liệu này quy chuẩn toàn bộ danh mục sprite 2.5D Isometric cần thiết cho **Scene A (My Farm)**, **Scene B (Town Square / Store)**, nông sản, tiền tệ và HUD.

- **Phong cách chuẩn:** Bám sát [`docs/art/approved_style.png`](approved_style.png) và [`docs/art/ART_BIBLE.md`](ART_BIBLE.md).
- **Quy cách kỹ thuật chung:**
  - Định dạng: `.png` (24-bit RGB + Alpha channel trong suốt 100%, không dính viền trắng/đen).
  - Góc camera: Isometric 2.5D cố định nghiêng ~30° (tỷ lệ 2:1 dimetric).
  - Ánh sáng: Nắng ấm tự nhiên từ góc trên bên trái (Top-left warm afternoon sunlight, bóng đổ mềm phía dưới bên phải).
  - Thư mục xuất file game-ready: `web/public/assets/`.
  - Thư mục lưu bản gốc/nguồn: `art/source/`.

---

## Bảng danh mục Sprite chi tiết (20 Assets)

### Nhóm 1: Cảnh Nông Trại (Scene A — My Farm)

| ID / Tên File | Kích thước | Anchor (X, Y) | Mô tả chi tiết & Prompt Gen ảnh | Cách trích xuất từ `approved_style.png` |
| :--- | :--- | :--- | :--- | :--- |
| `plot_empty.png` | 150 × 95 px | (0.5, 0.7) | **Luống đất cày trống:** Đất tơi xốp màu nâu sô-cô-la ấm, các đường rãnh cày rõ nét, viền đất mịn gọn gàng đặt trên nền trong suốt.<br>*Prompt:* `2.5D isometric single empty tilled soil farming plot, rectangular furrow bed with rich dark chocolate brown dirt, clean edges, warm soft sunlight, transparent background, casual mobile game asset.` | Vùng ô đất trống ở hàng trên bên phải. |
| `plot_growing.png` | 150 × 95 px | (0.5, 0.7) | **Luống đất mầm cây đang lớn:** Đất cày nâu với chồi non xanh tươi mọc lên ở giữa, lá mầm nhỏ xanh nõn chuối.<br>*Prompt:* `2.5D isometric tilled soil farming plot with fresh young green seedling sprouts growing in the center, bright vibrant green leaves, rich brown earth, transparent background, casual game asset.` | Vùng ô đất có mầm cây mới nhú. |
| `plot_ready_normal.png` | 150 × 115 px | (0.5, 0.75) | **Luống đất lúa chín (Normal):** Bụi lúa mì chín vàng ươm trĩu bông xòe đều trên luống đất, sẵn sàng thu hoạch.<br>*Prompt:* `2.5D isometric farming plot with fully ripe golden wheat crop stalks full of grains ready to harvest, warm amber yellow, clean soil base, transparent background, casual game asset.` | Vùng ruộng lúa mì chín vàng ở giữa luống. |
| `plot_ready_golden.png` | 150 × 120 px | (0.5, 0.75) | **Luống đất lúa vàng kim (Golden Crop):** Bụi lúa vàng óng ánh rực rỡ, phát sáng hào quang nhẹ, có các hạt bụi lấp lánh (sparkles) xung quanh.<br>*Prompt:* `2.5D isometric farming plot with magical radiant pure golden wheat stalks, glowing sparkles, gleaming gold aura, high value fantasy harvest, transparent background, stylized game asset.` | Tô sáng/chỉnh màu rực rỡ từ ruộng lúa chín + effect vàng. |
| `plot_locked.png` | 150 × 95 px | (0.5, 0.7) | **Luống đất bị khóa (Plot #3):** Luống đất phủ cỏ dại khô/dây leo hoặc có biểu tượng ổ khóa gỗ/đồng nổi ở giữa.<br>*Prompt:* `2.5D isometric overgrown locked farm plot, dry weed patches, small brass lock emblem in center indicating locked area, transparent background.` | Ghép ô đất với icon ổ khóa. |
| `farmhouse_tier1.png` | 220 × 240 px | (0.5, 0.85) | **Nhà nông trại chính (Tier 1):** Ngôi nhà gỗ mộc 2 tầng xinh xắn, mái ngói đỏ đất nung ấm cúng, có cầu thang gỗ bên hông, chậu hoa nhỏ trước hiên.<br>*Prompt:* `2.5D isometric cozy rustic wooden farmhouse cottage, red clay tiled roof, wooden stairs, cheerful flower pots, warm sunlight, charming mobile game building asset, transparent background.` | Cắt từ tòa nhà chính góc trái trên của ảnh master. |
| `silo_tier1.png` | 120 × 180 px | (0.5, 0.85) | **Kho thóc Silo (Tier 1):** Tháp chứa thóc bằng gỗ ghép vòng kim loại, mái chóp nón ngói đỏ, chứa tối đa 10 nông sản.<br>*Prompt:* `2.5D isometric rustic wooden grain silo, circular wood plank walls, conical terracotta cap, farm storage building, transparent background, casual mobile game style.` | Cắt từ tháp silo/kho phụ cạnh nhà. |
| `fish_pond.png` | 180 × 140 px | (0.5, 0.7) | **Ao cá cảnh (Koi Pond):** Bờ ao viền đá cuội tròn nhẵn, mặt nước xanh lam ngọc trong veo, vài bông hoa súng hồng, lá súng xanh và đàn cá koi bơi.<br>*Prompt:* `2.5D isometric small clear garden pond, smooth pebble stone rim, azure blue water, pink water lilies with floating green lily pads, orange koi fish swimming, transparent background.` | Cắt từ hồ nước góc dưới bên trái của ảnh master. |
| `fence_locked.png` | 160 × 90 px | (0.5, 0.7) | **Hàng rào khóa mở rộng:** Đoạn hàng rào cọc gỗ mộc 2 thanh ngang, ở giữa có cổng gỗ nhỏ khóa bằng dây xích và ổ khóa đồng thau.<br>*Prompt:* `2.5D isometric rustic wooden post-and-rail farm fence segment with a small locked wooden gate, brass padlock and iron chain, marking locked expansion zone, transparent background.` | Dựng từ cọc rào gỗ quanh vườn. |
| `fence_open.png` | 160 × 90 px | (0.5, 0.7) | **Hàng rào mở cổng:** Đoạn hàng rào gỗ với cổng mở toang thân thiện khi đã unlock.<br>*Prompt:* `2.5D isometric wooden farm fence with an open wooden gate, welcoming entrance to expanded territory, transparent background.` | Cắt mở phần cổng rào. |

---

### Nhóm 2: Cảnh Thị Trấn & Cửa Hàng (Scene B — Town Square / Store)

| ID / Tên File | Kích thước | Anchor (X, Y) | Mô tả chi tiết & Prompt Gen ảnh | Cách trích xuất từ `approved_style.png` |
| :--- | :--- | :--- | :--- | :--- |
| `merchant_stall.png` | 200 × 180 px | (0.5, 0.85) | **Sạp hàng thương nhân:** Quầy gỗ mộc buôn bán ngoài trời, mái bạt sọc đỏ-trắng nổi bật, các thùng gỗ đầy ắp táo đỏ, cà rốt và rau quả tươi.<br>*Prompt:* `2.5D isometric wooden market merchant stall, vibrant red and white striped fabric canvas awning, wooden crates overflowing with red apples and vegetables, chalkboard price sign, transparent background.` | Cắt từ góc sạp hàng có bạt sọc đỏ trắng bên phải ảnh master. |
| `npc_merchant_idle.png` | 110 × 140 px | (0.5, 0.85) | **Thương nhân Sói Ca (NPC Merchant):** Chú sói xanh thân thiện, đeo nón cói rộng vành, mặc yếm bò đỏ, tay vẫy chào hoặc cầm cuốc.<br>*Prompt:* `Cute friendly anthropomorphic blue wolf farmer merchant character, wearing denim dungarees and a straw sun hat, standing cheerfully beside stall, casual mobile game mascot, transparent background.` | Cắt nhân vật sói xanh đang cầm cuốc đứng cạnh sạp hàng. |
| `town_square_ground.png` | 360 × 240 px | (0.5, 0.5) | **Mặt nền thị trấn đá cuội:** Khối nền đá cuội tròn lát gạch cổ điển (Cobblestone), làm nền đặt sạp hàng và khu thương mại.<br>*Prompt:* `2.5D isometric cobblestone pavement floor tile, smooth ancient rounded river stones, warm sunlight, clean edges, transparent background.` | Dùng mảng đường đá cạnh ao và nhà. |
| `store_signboard.png` | 90 × 70 px | (0.5, 0.8) | **Biển hiệu Chợ Gỗ:** Biển gỗ treo trên 2 cọc nhỏ có chữ "MARKET" hoặc icon giỏ hàng.<br>*Prompt:* `2.5D isometric wooden market signboard post with carved fruit icon, rustic timber post, transparent background.` | Biển chỉ dẫn nhỏ. |

---

### Nhóm 3: Nông Sản & Tiền Tệ (Items & Currency)

| ID / Tên File | Kích thước | Anchor (X, Y) | Mô tả chi tiết & Prompt Gen ảnh |
| :--- | :--- | :--- | :--- |
| `crop_normal.png` | 64 × 64 px | (0.5, 0.5) | **Bó lúa mì thường (Normal Crop Icon):** Bó lúa mì vàng óng buộc nơ rơm gọn gàng.<br>*Prompt:* `Game UI icon of a neat tied bundle of ripe golden wheat stalks with grains, vibrant warm colors, smooth casual mobile style, transparent background.` |
| `crop_golden.png` | 64 × 64 px | (0.5, 0.5) | **Bó lúa vàng kim (Golden Crop Icon):** Bó lúa bằng vàng rực rỡ, lấp lánh ánh kim lộng lẫy.<br>*Prompt:* `Game UI icon of a shimmering pure golden wheat bundle, sparkling light glints, glowing luxury crop item, transparent background.` |
| `coin_gold.png` | 48 × 48 px | (0.5, 0.5) | **Đồng tiền vàng (GOLD Coin):** Đồng tiền vàng tròn dày dặn, viền nổi, mặt đúc hình hạt mầm cách điệu.<br>*Prompt:* `Game UI icon of a shiny thick golden coin with embossed wheat sprout symbol, warm golden glow, casual stylized game icon, transparent background.` |
| `token_near.png` | 48 × 48 px | (0.5, 0.5) | **NEAR Token Icon:** Biểu tượng logo NEAR Protocol tròn màu đen/xanh ngọc dùng cho nút NEAR Testnet Demo.<br>*Prompt:* `Game UI icon of NEAR Protocol round crypto token badge, crisp stylized logo, transparent background.` |

---

### Nhóm 4: Giao Diện HUD & Hiệu Ứng (UI & Effects)

| ID / Tên File | Kích thước | Anchor (X, Y) | Mô tả chi tiết |
| :--- | :--- | :--- | :--- |
| `hud_silo_icon.png` | 40 × 40 px | (0.5, 0.5) | Icon bao thóc / tháp silo nhỏ trên thanh đếm sức chứa kho (0/10). |
| `hud_cart_icon.png` | 40 × 40 px | (0.5, 0.5) | Icon giỏ hàng / xe đẩy để chuyển nhanh sang Chợ (Scene B). |
| `hud_camera_icon.png` | 36 × 36 px | (0.5, 0.5) | Icon camera / ống nhòm chuyển đổi Góc rộng ↔ Cận cảnh. |
| `icon_lock.png` | 36 × 36 px | (0.5, 0.5) | Ổ khóa đồng nhỏ báo hiệu tính năng/ô đất chưa mở. |
| `sparkle_effect.png` | 48 × 48 px | (0.5, 0.5) | Hiệu ứng ngôi sao lấp lánh màu vàng 4 cánh khi gặt lúa vàng hoặc nhận tiền. |

---

## Hướng dẫn triển khai cho Codex hoặc Antigravity

1. **Ưu tiên 1 (Trích xuất ngay từ master art):** Bức ảnh [`approved_style.png`](approved_style.png) đã có sẵn toàn bộ các thành phần chính (Nhà, Kho, Ao cá, Sạp hàng, Sói thương nhân, Luống đất, Cánh đồng lúa). Dùng công cụ cắt ảnh và tách nền trong suốt lưu vào `web/public/assets/`.
2. **Ưu tiên 2 (Gen bổ sung bằng AI khi quota mở):** Sử dụng chính xác các đoạn Prompt mẫu đã cung cấp ở bảng trên cho các icon HUD, coin và các biến thể animation nếu cần.
