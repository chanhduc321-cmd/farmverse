# Bàn giao Antigravity — T-61 NEAR Auth

**Mục tiêu:** Thêm một nút **Tiếp tục với Google** vào mỗi tab **Đăng ký** và **Đăng nhập**. Cả hai nút dẫn đến Google qua NEAR Auth. Luồng đăng nhập mới đi cùng phiên Farm hiện tại. Một danh tính đã liên kết mở lại đúng Farm.

**Base:** `develop` tại `86bfc94`. Nhánh `feat/near-auth-ui` trong worktree riêng `D:/Project/pet-project/farmverse-near-auth-ui`. Codex giữ `backend/`, `shared/`, migrations và dashboard. Antigravity giữ `web/index.html`, `web/src/auth/`, style tài khoản và điểm nối trong `web/src/main.ts` của T-61.

## Hợp đồng HTTP

- Dùng `SOCIAL_AUTH_API.near.path` và `SOCIAL_AUTH_API.resultParam` từ `shared/social-auth.mts` khi tích hợp. `GET /api/account/social/near` bắt đầu đăng nhập và chuyển hướng sang Google khi backend đã cấu hình. Nút điều hướng trình duyệt đến endpoint này, dùng cùng một URL ở cả hai tab. Backend xử lý OAuth, callback và cookie phiên.
- Callback thành công quay về `/?nearAuth=success` và cấp cookie FarmVerse. Dùng luồng tải `/api/farm` hiện có để lấy Farm mới nhất. Sau khi xử lý, xóa riêng tham số `nearAuth` bằng `history.replaceState`.
- `/?nearAuth=unavailable` nghĩa là backend chưa có cấu hình testnet. `/?nearAuth=failed` nghĩa là đăng nhập lỗi, bị hủy hoặc hết hạn. Mở dialog tài khoản và hiển thị thông báo tiếng Việt qua toast hiện có. Phiên Guest và hai form tài khoản vẫn dùng được.
- Callback public là `/api/account/social/near/callback`. Auth0 testnet dùng chung trả `Callback URL mismatch` cho URL Vercel của FarmVerse.
- Để thử local với client testnet dùng chung, cấu hình backend `NEAR_AUTH_CALLBACK_URL=http://localhost:3000/`, chạy web với `PORT=3000` rồi mở `http://localhost:3000/`. Vite chuyển phản hồi OAuth tại `/` sang handler callback của backend.
- Sau khi đăng nhập bằng Google, mở `/api/account/social/near/test-signature` để thử ký giao dịch 0 NEAR. Backend kiểm tra địa chỉ đã liên kết, tự khởi tạo tài khoản testnet nếu cần rồi xác minh khóa công khai trước khi yêu cầu ký. Route này cần `NEAR_TEST_SIGNING_SPONSOR_KEY` của ví demo trên backend và callback `http://localhost:3000/`. Kết quả thành công có liên kết giao dịch đã xác nhận.

## Nghiệm thu

- Desktop và mobile có đúng một nút trong tab đang mở. Dùng được bằng bàn phím. Nút social không gửi form tên/mật khẩu.
- Thử `success`, `unavailable` và `failed`, xóa query sau khi xử lý, tải lại không lặp toast. Sau `success`, HUD và hồ sơ lấy tên tài khoản từ API.
- Đăng ký, đăng nhập và đăng xuất bằng mật khẩu hiện tại vẫn chạy. `pnpm build` trong `web/` đạt. Bàn giao commit, kích thước màn hình đã thử và kết quả thực tế để Codex review.
