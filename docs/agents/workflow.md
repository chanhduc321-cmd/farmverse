# Quy trình phối hợp FarmVerse

Quy trình này áp dụng cho mọi task do Codex Lead và Google Antigravity Collaborator thực hiện trong FarmVerse. Đọc [AGENTS.md](../../AGENTS.md) và [TASKS.md](../../TASKS.md) trước khi nhận việc.

## Phạm vi ghi file

| Vai trò | Trách nhiệm |
|---|---|
| **Codex Lead** | Giữ `backend/`, gồm migrations, và `shared/`. Chốt giao diện API, sở hữu `TASKS.md` và bản HTML, giao scope và tích hợp vào `develop`. |
| **Antigravity Collaborator** | Giữ `web/` theo brief, tự kiểm tra và bàn giao diff. Báo trạng thái, blocker và đề nghị đổi giao diện qua chat để Codex cập nhật bảng. |
| **Chủ dự án** | Duyệt ảnh mẫu và art direction, xem bản tích hợp, quyết định đưa bản đã đạt lên `main`. |

Các file dùng chung ở root, lockfile và cấu hình deploy có đúng một người ghi tại một thời điểm. Lead nêu người đó trong brief. Task art có phạm vi riêng và dùng chung [Art Bible](../art/ART_BIBLE.md). Khi cần mở rộng scope hoặc chuyển quyền ghi file, thống nhất với Lead và cập nhật `TASKS.md` trước khi sửa.

## Nhánh và giao diện API

1. Dùng `develop` làm mốc tích hợp. Mỗi agent làm trong worktree hoặc checkout riêng với feature branch xuất phát từ commit `develop` đã thống nhất. Đưa diff đã review về `develop` để kiểm tra chung. Chủ dự án duyệt bản chạy trước khi đưa lên `main`.
2. Chốt giao diện trước khi triển khai phần phụ thuộc. P0 thống nhất `GET /health`. P1 chốt trạng thái Farm, request, response và lỗi trong `shared/`, rồi tích hợp giao diện trước khi tách hai nhánh Farm. P2 áp dụng cùng quy trình cho merchant.
3. Antigravity có thể dùng dữ liệu mẫu đúng giao diện để phát triển UI song song. Backend kiểm tra request tại runtime và giữ quyền quyết định trạng thái game. Lead điều phối mọi thay đổi đối với giao diện đã chốt và báo cả hai phía trước khi sửa.

## Nhận việc và bàn giao

1. Chủ dự án review và duyệt bản phân rã phase trước khi Codex cập nhật kế hoạch trong `TASKS.md`. Codex ghi ID, owner, scope, branch, phụ thuộc và tiêu chí nghiệm thu. Khi owner nhận việc, Codex chuyển `TODO` sang `DOING`.
2. Owner báo `BLOCKED` kèm lý do và bước cần hỗ trợ. Khi hoàn thành, owner bàn giao branch hoặc commit, diff, các lệnh kiểm tra thực sự đã chạy và kết quả. Codex ghi `REVIEW`.
3. Codex tích hợp vào `develop` và kiểm tra các luồng liên quan. Chuyển `DONE` sau khi bản tích hợp đạt nghiệm thu. Mọi thay đổi trạng thái đều đi qua `TASKS.md`.
4. Khi review phát hiện lỗi đã tái hiện, Codex ghi vào [BUGS.md](../../BUGS.md) và tham chiếu ID lỗi từ task liên quan. Chuyển `FIXED` sau khi kiểm tra lại trên bản tích hợp.
5. Sau mỗi lần cập nhật `TASKS.md` hoặc `BUGS.md`, chạy `node tools/build-task-dashboard.mjs` để đồng bộ `TASKS.html` và `BUGS.html`. Dùng `node tools/build-task-dashboard.mjs --check` để kiểm tra hai bản HTML khớp với nguồn trước khi bàn giao.
