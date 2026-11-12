# PostgreSQL và Vercel

Cập nhật ngày 12/11/2026. Chủ dự án đã tạo Supabase. Source gồm web Vite, API Hono, migrations 003–009 và seed 10 cư dân. Backend local tự nạp `backend/.env`. Pet của cư dân seed lưu trong JSON tiến độ và xuất hiện khi thăm ruộng. Lựa chọn Pet lưu cùng ruộng. Pet chặn miễn phí và ghi nhật ký theo quyết định T-41 ngày 12/11. Backend không còn fallback RAM; thiếu DB trả 503.

## Chuẩn bị database

1. Trong Supabase, mở project → Connect → Session pooler. Copy URI cổng 5432 vào `DATABASE_URL` trong `backend/.env.migration.local`. Thay phần mật khẩu bằng mật khẩu database, mã hóa URL nếu có ký tự đặc biệt.
2. Thêm `sslmode=require` nếu URI chưa có cấu hình SSL. Với pg hiện tại, dùng thêm `uselibpqcompat=true` để áp dụng đúng chế độ require của libpq. Session pooler hỗ trợ IPv4 cho lượt chạy migration từ máy local. Direct connection cũng dùng được nếu máy có IPv6.
3. Đối với API Vercel, dùng URI Transaction pooler cổng 6543 trong biến server `DATABASE_URL`. Pool `pg` của mỗi instance Vercel giữ tối đa một kết nối. Source dùng truy vấn tham số mà không đặt tên prepared statement. Máy dev giữ DB local trong `backend/.env`.
4. Trước khi cập nhật database có người chơi, sao lưu bằng `pg_dump --format=custom --file=backup.dump` với `PGDATABASE` trỏ tới DB đích, hoặc dùng snapshot của nhà cung cấp. Thử restore vào DB riêng để xác nhận bản sao dùng được.

## Migration và seed

Chạy từ thư mục `backend/`. Với DB cloud đã khai báo trong `.env.migration.local`:

```powershell
node --env-file=.env.migration.local --import tsx src/check-database.ts
node --env-file=.env.migration.local --import tsx src/migrate.ts
node --env-file=.env.migration.local --import tsx src/check-database.ts
node --env-file=.env.migration.local --import tsx src/seed-friends.ts
```

Kết quả kiểm tra kết nối chỉ ghi host, tên DB, TLS và trạng thái bảng. Lượt đầu DB mới có 0/6 bảng Farm. Sau migration cần có 6/6 bảng với RLS bật. Backend dùng role database `postgres` qua URI pooler của Supabase để quản lý tài khoản và gameplay.

| File | Dữ liệu |
|---|---|
| 003 | JSON tiến độ ruộng Guest |
| 004 | Tài khoản, quyền sở hữu ruộng và phiên đăng nhập |
| 005 | Trạng thái NPC |
| 006 | Lời mời, bạn bè và lượt Steal |
| 007 | Nhật ký và mốc đã đọc |
| 008 | Bật RLS và thu hồi quyền Data API cho sáu bảng Farm cùng sequence nhật ký |
| 009 | Cho phép sự kiện pet_block và chống trùng nhật ký Pet chặn |

Migrations chạy lại an toàn trong một transaction. Lỗi giữa chừng rollback cả lượt. Khóa PostgreSQL giữ thứ tự khi hai tiến trình cùng chạy migration.

Seed chạy riêng sau migration. Tạo `farm_ban_01`–`farm_ban_10`, mỗi ruộng sáu cây chín, đủ 15 giống trên tổng 60 ô. Pet ngẫu nhiên, có đủ chó, mèo, ngỗng. Chạy lại giữ nguyên tài khoản và ruộng đã seed.

Sau đăng nhập, mọi người thấy cư dân seed cùng tài khoản thật qua API có phân trang và tìm kiếm. Bạn bè đã xác nhận được ẩn khỏi Cư dân. Lời mời chờ xác nhận vẫn có thể xuất hiện ở Cư dân. Để dựng test có sẵn bạn bè, truyền tên tài khoản sau script seed. Luồng kết bạn thông thường vẫn yêu cầu xác nhận.

Ruộng đang chơi trên PostgreSQL tiếp tục dùng JSON hiện có. Phân bón, tiến trình nhiệm vụ và loài Pet là trường JSON. Nhật ký Pet chặn cần migration 009 trước khi deploy API mới. Ruộng cũ thiếu trường vẫn đọc được. Dữ liệu chỉ nằm trong RAM ở các phiên cũ cần kế hoạch xuất riêng nếu muốn mang sang DB.

## Setup project Vercel

1. Mở project đang phục vụ `farmverse-ml2a.vercel.app`, hoặc import repo `chanhduc321-cmd/farmverse` nếu cần project mới.
2. Đặt Root Directory về gốc repo. Source có `vercel.json` ở root, frontend trong `web/` và function trong `api/`.
3. Đặt framework Vite. Cấu hình trong source cài dependencies của cả `backend/` và `web/`, build web và xuất `web/dist`.
4. Trong Settings → Environment Variables, tạo `DATABASE_URL` cho Preview và Production bằng URI Supabase Transaction pooler của từng DB tương ứng. Máy local đã có URI cho project hiện tại trong `backend/.env.vercel.local`, giữ ngoài Git. Dùng DB preview riêng để thử migration trước.
5. Chạy migration và seed vào DB preview, tạo Preview Deployment từ source đã cập nhật.
6. Kiểm tra `/api/health` trả JSON 200, `/api/crops` có 15 giống và `/api/farm` tạo Guest với cookie. API guard trả 503 nếu thiếu `DATABASE_URL`.
7. Chạy trọn vòng mua, gieo, hái, bán, dọn, F5. Tạo tài khoản giữ tiến độ Guest, đăng nhập từ phiên khác, xem cư dân và thăm ruộng có Pet.
8. Sau khi Preview đạt, sao lưu DB production, chạy migration và seed production rồi redeploy source đã duyệt. Đối chiếu lại health, đăng nhập, tiến độ và số lượng cư dân.

Browser và API dùng chung domain. `/api/*` đi qua function `api/farmverse.ts`, bỏ prefix rồi gọi cùng Hono app với backend local. Danh mục 15 giống được đóng gói vào function. Node server local nằm ở `backend/src/index.ts`. Vercel nhận request qua export `fetch` trong function.

## Khôi phục và nghiệm thu

Nếu migration báo lỗi, kiểm tra log mã lỗi, sửa cấu hình rồi chạy lại. Nếu code mới gây lỗi, dùng deployment trước đã xác nhận tương thích schema. Nếu cần khôi phục dữ liệu, restore snapshot vào DB riêng, đối chiếu rồi chuyển `DATABASE_URL` tới DB đã xác nhận.

Giữ giá trị ruộng của vài tài khoản trước và sau để đối chiếu Gold, XP, kho, mốc cây và quyền sở hữu. Mở hai tab để thử hành động trùng revision. Khi DB tạm mất kết nối, web phải báo lỗi, khóa thao tác phụ thuộc và cho thử lại.

## Tình trạng Vercel hiện tại

Ngày 12/11/2026 đã chạy migrations 003–009 và seed lên Supabase. Kiểm tra được 6/6 bảng RLS bật, Data API không có quyền đọc/ghi các bảng Farm, 10 cư dân, 60 ô cây, 15 giống và ba loại Pet. Chạy lại seed tạo thêm 0 tài khoản. Đường Session pooler 5432 và Transaction pooler 6543 đều kết nối được bằng TLS.

Adapter `api/farmverse.ts` đã được kiểm tra local với Supabase Transaction pooler, gồm health, 15 giống, cookie, mua hạt và đọc lại tiến độ trong DB. Bản public tại `https://farmverse-ml2a.vercel.app/api/health` và `/api/farm` còn trả 404 ở lượt kiểm tra trước deploy. Vercel cần source đã cập nhật và `DATABASE_URL`.

`backend/.env` vẫn trỏ PostgreSQL local. `backend/.env.migration.local` dùng Supabase Session pooler cho migration. `backend/.env.vercel.local` chứa biến runtime cần điền vào Vercel. Lượt migration này tạo schema và cư dân seed trên Supabase. Dữ liệu tài khoản và ruộng từ DB local nằm trong DB local cùng bản backup đã kiểm tra restore.

Nguồn kỹ thuật là [Supabase PostgreSQL connections](https://supabase.com/docs/guides/database/connecting-to-postgres), [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [Vercel Node.js Functions](https://vercel.com/docs/functions/runtimes/node-js), [Vite trên Vercel](https://vercel.com/docs/frameworks/frontend/vite) và [đóng gói file trong Functions](https://vercel.com/kb/guide/how-can-i-use-files-in-serverless-functions).
