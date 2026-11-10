# FarmVerse — Quy trình Sinh Asset Nông sản dạng Sprite Sheet (Crop Pipeline)

Quy trình tối ưu hóa tạo vòng đời cây trồng theo cơ chế **1 Lượt Gọi (Prompt) = 1 Sprite Sheet Hoàn Chỉnh** nhằm tiết kiệm 85% hạn mức AI và đảm bảo tính đồng bộ mỹ thuật 100%.

---

## 1. Cấu trúc Lưới Sprite Sheet (Sprite Grid Layout)

Mỗi ảnh tạo ra sẽ là một dải ngang gồm **6 đến 7 trạng thái cây trồng** xếp thứ tự từ trái qua phải trên nền trắng thuần khiết (`#FFFFFF`), có khoảng đệm phân tách rõ ràng giữa các cột:

| Cột | Tên Asset | Ý nghĩa trạng thái | Kích thước sau cắt |
| :---: | :--- | :--- | :---: |
| **1** | `{crop}_seed.png` | Gói hạt giống giấy mộc mạc có nhãn minh họa quả | 48×48 / 64×64 |
| **2** | `{crop}_stage1_sprout.png` | Mầm non mới nhú khỏi mặt đất | 200×100 (2:1 isometric) |
| **3** | `{crop}_stage2_seedling.png` | Cây con 2–3 lá nhỏ mọc nghiêng 30° | 200×100 (2:1 isometric) |
| **4** | `{crop}_stage3_growing.png` | Bụi cây phát triển tán lá xanh mướt | 200×100 (2:1 isometric) |
| **5** | `{crop}_stage4_flowering.png` | Cây nở hoa điểm quả xanh non | 200×100 (2:1 isometric) |
| **6** | `{crop}_stage5_ripe.png` | Cây mang quả chín rộ sẵn sàng thu hoạch | 200×120 (2:1 isometric) |
| **7** | `{crop}_item.png` | 1 nông sản đơn lẻ làm icon Kho Silo & Merchant | 100×100 (1:1 vuông) |

---

## 2. Tiêu chuẩn DNA FarmVerse (Invariants)

- **Góc chiếu (Projection):** Toàn bộ các cột cây từ Stage 1 $\rightarrow$ Stage 5 đều tuân thủ nghiêm ngặt **2.5D Isometric 2:1 Dimetric (~30° nghiêng)** khớp với ô đất ruộng FarmVerse.
- **Ánh sáng (Lighting):** Nắng vàng chiều ấm áp chiếu từ **góc trên bên trái (Upper-Left)**, bóng tiếp xúc chân cây mềm mại đổ về góc dưới bên phải.
- **Phong cách vẽ:** Stylized Casual 3D Hand-painted (*Hay Day / Farmery*). Không vẽ pixel, không tả thực 3D thô ráp.
- **Nền ảnh:** Nền trắng tuyệt đối `#FFFFFF`, không kẻ ô ca-rô giả lập, không viền khung hộp, không kèm chữ viết.

---

## 3. Khung Prompt Mẫu (Template Blueprint)

### Cú pháp chung:
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

## 4. Danh sách Prompt Cụ thể Chuẩn bị Sẵn cho Đợt Gen Tiếp Theo

### 1. Dâu Tây (Strawberry — Crop 1)
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

### 2. Cà Rốt (Carrot — Crop 4)
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

### 3. Củ Cải Trắng (Radish / Daikon — Crop 3)
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

## 5. Quy trình Cắt Tự Động (Automation Tooling)

Sau khi ảnh Sprite Sheet được gen xong, chạy script:
```powershell
powershell -File tools/slice-spritesheet.ps1 -InputPath <path_to_sheet.jpg> -CropName strawberry -OutputDirectory art/source/crops/strawberry
```
Script sẽ tự động:
1. Nhận diện các cột đối tượng theo khoảng trống nền trắng.
2. Tách nền alpha trong suốt cho từng đối tượng (loại bỏ `#FFFFFF`).
3. Xuất ra từng file chuẩn: `{crop}_seed.png`, `{crop}_stage1_sprout.png`, ..., `{crop}_item.png`.
