# FarmVerse — Sổ lỗi

[Mở dashboard lỗi](BUGS.html) · [Bảng công việc](TASKS.md) · [Quy trình phối hợp](docs/agents/workflow.md)

Codex ghi lỗi đã tái hiện, kết quả kiểm tra và người xử lý dự kiến. Chuyển `FIXED` sau khi kiểm tra lại trên bản tích hợp. Phase trong bảng là mốc dự kiến xử lý.

| ID | Phase | Lỗi | Phụ trách | Mức độ | Trạng thái | Phát hiện ở | Cách tái hiện | Hiện tại | Mong đợi và nghiệm thu |
|---|---|---|---|---|---|---|---|---|---|
| BUG-01 | P3 | Canvas Farm bị cắt hai bên trên màn hình hẹp | Antigravity (dự kiến) | MEDIUM | OPEN | T-02 · `035ef37` · `web/index.html:24` | Mở Farm qua `pnpm dev`, mở Edge DevTools và đặt viewport rộng 390 px. | Khung game vẫn rộng 800 px, tràn từ −205 px đến 595 px. Canvas bị cắt ở hai bên. Bản desktop 1024×768 đạt review P0. | Khung game vừa viewport và giữ tỷ lệ 4:3. Ở 390 px và 1024×768, thấy trọn hai ô đất cùng HUD. |

## Trạng thái

- **OPEN** — Đã tái hiện, chờ xử lý.
- **DOING** — Đã giao người sửa trong scope được duyệt.
- **BLOCKED** — Đang chờ điều kiện để sửa hoặc kiểm tra.
- **REVIEW** — Có bản sửa, chờ kiểm tra lại.
- **FIXED** — Đã xác minh trên bản tích hợp.

Sau khi cập nhật sổ lỗi, chạy `node tools/build-task-dashboard.mjs` để đồng bộ hai dashboard.
