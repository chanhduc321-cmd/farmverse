# FarmVerse backend

**Tên tiếng Anh:** FarmVerse · **Tên tiếng Việt:** Nông Trại Mộng Mơ

Backend chạy Hono và lưu Guest, tài khoản, ruộng, kho, bạn bè và nhật ký vào PostgreSQL. Các script tự nạp `.env` trong `backend/`. Chạy các lệnh dưới đây trong `backend/` với Docker Desktop, Node.js 20.12 trở lên và pnpm.

```powershell
if (!(Test-Path -LiteralPath '.env')) { Copy-Item .env.example .env }
docker compose up -d --wait postgres
pnpm install --frozen-lockfile
pnpm migrate
pnpm seed:friends
pnpm dev
```

Dùng `PORT=8092` trong `.env` để khớp proxy mặc định của web. Nếu cổng PostgreSQL 5432 đang được dùng, chọn cổng khác qua `POSTGRES_PORT` và dùng cùng cổng trong `DATABASE_URL`. Nếu dùng database có sẵn, đặt `DATABASE_URL` theo thông tin kết nối của database đó.

`DATABASE_URL` bắt buộc cho gameplay; thiếu cấu hình hoặc mất kết nối trả 503, không chuyển sang RAM. Migrations `003` đến `009` chạy trong một transaction với khóa để hai lượt không chạy xen nhau. Có thể chạy lại trên tiến độ đã lưu. Phiên Guest và phiên tài khoản dùng cookie HttpOnly 30 ngày. Khi backend khởi động lại, cùng cookie mở đúng Gold, XP, Túi hạt, Kho, thời điểm gieo, Pet và trạng thái NPC đã lưu. `/health` trả 503 nếu schema hoặc kết nối chưa sẵn sàng.

`pnpm seed:friends` tạo 10 cư dân `farm_ban_01`–`farm_ban_10`, mỗi ruộng sáu cây chín. Tổng cộng bao phủ 15 giống, có Pet ngẫu nhiên giữa chó, mèo và ngỗng. Chạy lại giữ ruộng và Pet đã tạo. Tài khoản seed dùng hash ngẫu nhiên và không có mật khẩu đăng nhập được bàn giao.

Mọi tài khoản đăng nhập thấy cư dân seed cùng người chơi thật. Bạn bè đã xác nhận được ẩn khỏi Cư dân. Với dữ liệu test, `pnpm seed:friends ten_tai_khoan` nối 10 cư dân thành bạn đã xác nhận của tài khoản đó.

API tạo tài khoản gắn đúng ruộng của phiên Guest hiện tại. Đăng nhập từ trình duyệt khác mở lại ruộng đã gắn. [API tài khoản](../docs/API.md#accounts-t-24)

Chế độ offline và lưu RAM đã bỏ. Guest cũng lưu tiến độ vào PostgreSQL.

Mỗi yêu cầu thay đổi gameplay mang `expectedRevision`. Nếu hai yêu cầu dùng cùng revision đến đồng thời, PostgreSQL chỉ nhận một lần ghi. Khi nhận 409, web đọc trạng thái mới trước khi người chơi thử lại. [API](../docs/API.md)

Dùng `docker compose stop postgres` để dừng database và giữ volume. Chạy `pnpm typecheck` và `pnpm exec node --env-file=.env --import tsx --test test/*.test.ts` để kiểm tra backend. Kiểm thử nhật ký cần database test riêng.

Web báo lỗi kết nối và hiện nút Thử lại khi API chưa sẵn sàng. Máy dev hiện dùng PostgreSQL ở `127.0.0.1:55431`. API Vercel yêu cầu `DATABASE_URL`. [Kế hoạch migration và setup Vercel](../docs/POSTGRES_MIGRATION_PLAN.md)
