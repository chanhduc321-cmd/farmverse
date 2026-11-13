# Nông Trại Mộng Mơ · Web

**Tên tiếng Anh:** FarmVerse · **Tên tiếng Việt:** Nông Trại Mộng Mơ

Bản web dùng Phaser, Vite và Hono. Xem [luật và cách nghiệm thu gameplay](../docs/FARMVERSE_GAMEPLAY.md).

Chạy hai terminal từ thư mục gốc.

**Backend**

```powershell
pnpm --dir backend install --frozen-lockfile
pnpm --dir backend migrate
pnpm --dir backend start
```

**Web**

```powershell
pnpm --dir web install --frozen-lockfile
pnpm --dir web dev
```

Mở http://127.0.0.1:5174/. Mua hạt dâu trong Tiệm hạt, chọn gieo trong Túi hạt và bấm ô trống. Bấm cây chín để hái, bấm gốc để dọn và bán dâu trong Kho. Chọn Tưới nước hoặc Bón phân để rút ngắn thời gian chín. Mua phân trong Tiệm hạt với giá 5 Gold mỗi bịch. Bấm lại nút đang chọn hoặc nhấn Escape để về thao tác theo ô đất. Backend nạp cấu hình PostgreSQL từ backend/.env. [Cách kết nối PostgreSQL](../backend/README.md)

Web gọi API để mở Guest hoặc tài khoản. Khi API lỗi, màn tải báo lỗi và có nút Thử lại. Nút Bạn bè yêu cầu đăng nhập. Tab Cư dân gồm dữ liệu seed và người chơi thật, loại các bạn bè đã xác nhận. [Seed và kế hoạch migration](../docs/POSTGRES_MIGRATION_PLAN.md)

## Google Analytics 4

Web gửi sự kiện tới GA4 khi biến `VITE_GA_MEASUREMENT_ID` (dạng `G-XXXXXXXXXX`) có mặt lúc build. Không đặt biến thì không tải script và không gửi gì, nên chạy local mặc định không ghi dữ liệu. Mẫu biến nằm trong [.env.example](.env.example).

- **Production:** đặt `VITE_GA_MEASUREMENT_ID` trong Vercel (chỉ môi trường Production) rồi deploy lại, vì Vite gắn giá trị lúc build.
- **Thử local:** chép `.env.example` thành `.env.local`, điền ID thử nghiệm và mở `http://127.0.0.1:5174/?ga_debug=1` để xem sự kiện trong GA4 DebugView.
- **Kiểm thử:** `pnpm --dir web test`.

| Sự kiện | Khi nào | Tham số |
|---|---|---|
| `page_view` | Mở trang (tự động) | |
| `game_boot` / `game_boot_failed` | Nông trại hiện xong / màn tải báo lỗi | `load_ms` |
| `tutorial_complete` / `tutorial_skip` | Xong hướng dẫn / bấm Bỏ qua | |
| `sign_up`, `login`, `logout` | Tài khoản thành công | `method` |
| `farm_buy`, `farm_sell` | Mua hạt, bán nông sản | `crop_id`, `quantity` |
| `farm_buy_fertilizer` | Mua phân | `quantity` |
| `farm_plant` | Gieo hạt | `crop_id` |
| `farm_harvest`, `farm_clear`, `farm_water`, `farm_fertilize` | Thao tác trên ô đất | |
| `farm_theme`, `farm_check_in` | Đổi giao diện, điểm danh | |
| `farm_select_pet`, `farm_claim_mission` | Chọn pet, nhận thưởng nhiệm vụ | `pet`, `mission` |
| `farm_visit`, `farm_steal` | Thăm ruộng, lấy quả | `blocked` |

Chỉ gửi sự kiện sau khi API báo thành công. Không gửi tên đăng nhập hay dữ liệu cá nhân; thêm sự kiện mới qua `trackEvent` trong [src/analytics.ts](src/analytics.ts). Hiện chưa có hộp xin đồng ý cookie.
