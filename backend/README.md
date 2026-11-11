# FarmVerse backend

Chạy `pnpm --dir backend start` từ thư mục gốc để thử nhanh với RAM. Để giữ tiến độ khi khởi động lại, chạy các lệnh dưới đây trong `backend/` với Docker Desktop, Node.js 20.12 trở lên và pnpm.

```powershell
if (!(Test-Path -LiteralPath '.env')) { Copy-Item .env.example .env }
docker compose up -d --wait postgres
pnpm install --frozen-lockfile
pnpm exec tsx --env-file=.env src/migrate.ts
pnpm exec tsx --env-file=.env src/index.ts
```

Dùng `PORT=8092` trong `.env` để khớp proxy mặc định của web. Nếu cổng PostgreSQL 5432 đang được dùng, chọn cổng khác qua `POSTGRES_PORT` và dùng cùng cổng trong `DATABASE_URL`. Nếu dùng database có sẵn, đặt `DATABASE_URL` theo thông tin kết nối của database đó.

`DATABASE_URL` chọn chế độ PostgreSQL. Có thể chạy lại migrations `003` đến `006` trên tiến độ đã lưu. Phiên Guest và phiên tài khoản dùng cookie HttpOnly 30 ngày ở chế độ này. Khi backend khởi động lại, cùng cookie mở đúng Gold, XP, Túi hạt, Kho, thời điểm gieo và trạng thái NPC đã lưu. `/health` trả 503 nếu schema hoặc kết nối chưa sẵn sàng.

API tạo tài khoản gắn đúng ruộng của phiên Guest hiện tại. Đăng nhập từ trình duyệt khác mở lại ruộng đã gắn. Chế độ RAM hỗ trợ chơi Guest để thử nhanh. [API tài khoản](../docs/API.md#accounts-t-24)

Tiến độ đang nằm trong RAM sẽ đặt lại khi chuyển sang PostgreSQL. Lần đầu vào chế độ PostgreSQL tạo một phiên Guest mới.

Mỗi yêu cầu thay đổi gameplay mang `expectedRevision`. Nếu hai yêu cầu dùng cùng revision đến đồng thời, PostgreSQL chỉ nhận một lần ghi. Khi nhận 409, web đọc trạng thái mới trước khi người chơi thử lại. [API](../docs/API.md)

Dùng `docker compose stop postgres` để dừng database và giữ volume. Chạy `pnpm typecheck` và `pnpm exec tsx --test test/farm.test.ts` để kiểm tra gameplay.
