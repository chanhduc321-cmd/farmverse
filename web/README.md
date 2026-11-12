# Nông Trại Mộng Mơ · Web

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
