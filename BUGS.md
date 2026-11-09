# FarmVerse — Sổ lỗi

[Mở dashboard lỗi](BUGS.html) · [Bảng công việc](TASKS.md) · [Quy trình phối hợp](docs/agents/workflow.md)

Codex ghi lỗi đã tái hiện, kết quả kiểm tra và người xử lý dự kiến. Chuyển `FIXED` sau khi kiểm tra lại trên bản tích hợp. Phase trong bảng là mốc dự kiến xử lý.

| ID | Phase | Lỗi | Phụ trách | Mức độ | Trạng thái | Phát hiện ở | Cách tái hiện | Hiện tại | Mong đợi và nghiệm thu |
|---|---|---|---|---|---|---|---|---|---|
| BUG-01 | P3 | Canvas Farm bị cắt hai bên trên màn hình hẹp | Antigravity | MEDIUM | FIXED | T-02 · `035ef37` · `web/index.html:24` | Mở Farm qua `pnpm dev`, mở Edge DevTools và đặt viewport rộng 390 px. | Đã xác minh trên `develop` với T-06 `b96b4ea`. Canvas rộng 370 px, nằm trong viewport 390 px và giữ tỷ lệ 4:3. | Canvas vừa khung ở desktop và màn hình dọc. Kiểm tra HUD khi zoom được theo dõi riêng tại BUG-06. |
| BUG-02 | P1 | API từ chối thao tác nhưng Farm báo thành công bằng dữ liệu mock | Antigravity | HIGH | FIXED | T-06 · `326fc19` · `web/src/api.ts:50` | Mở hai tab cùng Guest. Trồng Plot #2 ở tab thứ nhất để tăng revision, rồi trồng Plot #1 từ tab thứ hai đang giữ revision cũ. | Đã xác minh trên `develop` với T-06 `b96b4ea`. UI hiện STALE_FARM, đọc lại snapshot và giữ Plot #1 EMPTY. Ca 401 cũng đọc lại Guest. Không tạo local mock. | Khi dùng API thật, hiển thị lỗi và đọc lại trạng thái Farm theo contract cho 401 hoặc 409. Mock chỉ chạy khi chọn chế độ test tường minh. |
| BUG-03 | P1 | Reset Test Loop báo đặt lại phiên khi đang dùng API thật | Antigravity | MEDIUM | FIXED | T-06 · `326fc19` · `web/src/scenes/FarmScene.ts:323` | Chơi bằng API thật, mở Plot #3 rồi bấm Reset Test Loop. | Đã xác minh trên `develop` với T-06 `b96b4ea`. Nút Reset không xuất hiện ở live, có trong `?mock=1`. Reload giữ tiến độ trên server. | Chỉ hiển thị Reset Test Loop trong chế độ test mock. Giữ UI live đồng bộ với trạng thái server. |
| BUG-04 | P1 | Cây hiện READY sớm khi đồng hồ trình duyệt chạy nhanh | Antigravity | MEDIUM | FIXED | T-06 · `326fc19` · `web/src/scenes/FarmScene.ts:142` | Trong phiên test, đặt `Date.now()` của trình duyệt nhanh hơn 60 giây rồi trồng Plot #1 qua API thật. | Đã xác minh trên `develop` với T-06 `b96b4ea`. Khi đồng hồ client lệch 60 giây, cả UI và server đều giữ GROWING sau khi trồng. | Tính countdown từ `serverTimeMs` và `readyAtMs`, cộng thời gian đã trôi qua kể từ lúc nhận snapshot. Đồng hồ máy lệch 60 giây vẫn hiển thị đúng thời gian chờ. |
| BUG-05 | P3 | Vùng bấm plot lệch khỏi hình vẽ ở màn hình thấp | Antigravity | MEDIUM | FIXED | T-06 · `326fc19` · `web/index.html:24` | Đặt viewport 844×390 và bấm giữa Plot #1 đang trống. | Đã xác minh trên `develop` với T-06 `b96b4ea`. Bấm giữa hình Plot #1 ở 844×390 gửi plant thành công và server chuyển GROWING. | Canvas giữ đúng tỷ lệ 4:3 và Phaser dùng cùng vùng hiển thị để tính tọa độ bấm. Bấm giữa Plot #1 ở 844×390 vẫn trồng được. |
| BUG-06 | P3 | Camera cận cảnh làm Quick Sell và tiêu đề ra ngoài khung dọc | Antigravity | MEDIUM | OPEN | T-06 · `b96b4ea` · `web/src/scenes/FarmScene.ts:537` | Mở live Farm ở viewport 390×844. Camera tự chọn FOCUS 1,3x. | Tiêu đề và hai nút Quick Sell nằm ngoài khung hình ban đầu. HUD di chuyển cùng camera khi kéo. Muốn thấy nút bán phải kéo camera hoặc đổi góc nhìn. | HUD, nút Quick Sell và thông báo luôn thấy và bấm được ở camera cận cảnh. Kiểm tra lại cả thao tác kéo và đổi góc nhìn. |

## Trạng thái

- **OPEN** — Đã tái hiện, chờ xử lý.
- **DOING** — Đã giao người sửa trong scope được duyệt.
- **BLOCKED** — Đang chờ điều kiện để sửa hoặc kiểm tra.
- **REVIEW** — Có bản sửa, chờ kiểm tra lại.
- **FIXED** — Đã xác minh trên bản tích hợp.

Sau khi cập nhật sổ lỗi, chạy `node tools/build-task-dashboard.mjs` để đồng bộ hai dashboard.
