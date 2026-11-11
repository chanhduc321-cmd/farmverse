# Bàn giao T-24 cho Antigravity

Mở worktree `D:/Project/pet-project/farmverse-account-ui` trên nhánh `codex/farm-account-ui`. Nhánh được tạo từ bản chụp local của `develop` tại `414ae2f`, gồm API tài khoản đã kiểm tra và giao diện Farm hiện tại. Đọc [quy tắc Collaborator](collaborator.md) trước khi sửa.

Người chơi vào Farm ngay bằng Guest. Thêm giao diện tạo tài khoản, đăng nhập và đăng xuất. Khi tạo tài khoản, người chơi tiếp tục trên đúng ruộng Guest đang chơi. Khi đăng nhập, HUD hiện tên tài khoản và Farm hiện đúng dữ liệu từ phiên đó.

- Phạm vi ghi gồm `web/index.html`, `web/src/` và `web/README.md` nếu cần cập nhật cách chạy. Dùng `ACCOUNT_API` và `FarmSessionResponse` trong [giao diện dùng chung](../../shared/farm.mts). Codex giữ backend, schema dùng chung và dashboard.
- Mở phiên bằng `GET /api/farm`. Dùng snapshot trả về sau đăng ký hoặc đăng nhập để cập nhật Farm, HUD và công cụ đang chọn. Sau khi đăng xuất nhận HTTP 204, gọi lại `GET /api/farm`. Hiển thị lỗi từ API và khóa gửi lặp trong lúc chờ phản hồi. Khi chạy RAM hoặc demo offline, người chơi tiếp tục chơi với Guest hoặc ruộng demo tương ứng.
- Nghiệm thu trên PostgreSQL. Vào Guest, mua và gieo một hạt, tạo tài khoản khi cây đang lớn, rồi đối chiếu cây, thời điểm gieo, Gold, XP, Túi và Kho. Tải lại, đăng xuất và đăng nhập lại từ một phiên trình duyệt khác. Kiểm tra đăng nhập sai, trùng tên, gửi lặp, bàn phím và mobile 390×844. Kiểm tra thêm Guest trên RAM và demo offline. [Hợp đồng API](../API.md#accounts-t-24) · [Cách bật PostgreSQL](../../backend/README.md)
- Bàn giao commit riêng cho phần web, kết quả `pnpm --dir web build` và các ca trình duyệt đã chạy. Chỉ gửi phần thay đổi sau commit mốc trên nhánh này.

T-25 Store NPC và phần Store trên mobile của T-27 đang tạm giữ. T-39 Tooltip và T-40 Animation/âm thanh nằm trong hàng chờ giao diện sau T-24.

## Kết quả review T-24

Đã nhận `9affa6e` trên nhánh `codex/farm-account-ui` ngay sau mốc `fea0b24`. Diff gồm `web/index.html`, `web/src/main.ts` và `web/src/style.css`. Codex chạy `pnpm --dir web build` thành công trên worktree bàn giao.

Chromium và PostgreSQL đã qua ca tạo tài khoản từ ruộng có cây đang lớn, tải lại, đăng xuất, đăng nhập trên trình duyệt khác, mật khẩu sai, tên trùng và gửi form hai lần chỉ tạo một POST.

Sửa BUG-22 trên nhánh hiện tại, tiếp nối `9affa6e` trong phạm vi ba file web đã bàn giao. Nếu POST đăng xuất trả 204 rồi GET Farm trả 503, cookie tài khoản đã mất nhưng HUD còn tên cũ. Khi ruộng Guest có cùng revision, thao tác tiếp theo có thể ghi vào ruộng Guest. Sau khi chuyển phiên, chỉ bật thao tác Farm khi đã đồng bộ snapshot và HUD. [Sổ lỗi](../../BUGS.md)

Nghiệm thu bằng cách cho GET Farm đầu tiên sau đăng xuất trả 503. Đóng hộp tài khoản và thử mua hạt hoặc thao tác ô đất. Xác nhận giao diện báo lỗi tải phiên và không gửi yêu cầu thay đổi Farm. Thử tải lại phiên thành công, xác nhận HUD và ruộng cùng hiển thị Guest rồi mua hạt để kiểm tra thao tác đã hoạt động lại. Gửi commit sửa, kết quả build và kết quả các ca trình duyệt thực sự đã chạy.

### Review bản sửa `09425c4`

Web build đạt. Chromium với PostgreSQL qua ca đăng xuất 204, GET Farm nhận 503, thao tác bị chặn và tải lại phiên Guest thành công. Bài kiểm thử trả HTTP 503 qua trình duyệt.

Còn tái hiện BUG-22 khi có thao tác Farm đang chờ phản hồi. Bấm đổi nền lúc đăng nhập và giữ phản hồi 200. Đăng xuất thành công, cho GET Farm trả 503, đóng hộp tài khoản rồi trả phản hồi 200 cũ. `setSnapshot` mở lại khóa với dữ liệu cũ và thao tác đổi nền tiếp theo gửi POST trước khi tải được ruộng Guest. POST đó trả 401 trong lần thử.

Tiếp tục trên nhánh `codex/farm-account-ui` trong phạm vi web đã giao. Giữ khóa đến khi đồng bộ phiên mới và chặn phản hồi phiên cũ cập nhật Farm. Bỏ nhánh `test_logout_503` khỏi frontend, dùng bài kiểm thử để trả 503. Bàn giao commit và kết quả build, ca lỗi thông thường và ca phản hồi về muộn.

### Kết quả tích hợp

Codex tiếp quản phần sửa cuối và ghép vào worktree `develop`. Đổi phiên chờ thao tác Farm đang chạy hoàn tất, còn Farm giữ khóa trong lúc đổi phiên hoặc sau lỗi tải phiên. Ca `503` được tạo từ bài kiểm thử Chromium. Bản tích hợp đã qua build, kiểm tra đăng ký và đăng nhập trên PostgreSQL, kiểm tra phản hồi bị giữ và thử lại sau lỗi, cùng ca mua hạt trên RAM và offline. T-24 `DONE`, BUG-22 `FIXED`.
