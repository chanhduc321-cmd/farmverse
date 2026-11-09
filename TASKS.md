# FarmVerse — Bảng công việc

[Mở dashboard HTML](TASKS.html) · [Quy trình phối hợp](docs/agents/workflow.md) · [Timeline P0–P5](docs/FARMVERSE_TIMELINE.md)

Codex là người duy nhất ghi trạng thái trong bảng này. Antigravity báo tiến độ và bàn giao qua chat. Các nhánh dưới đây là nhánh dự kiến cho từng nhiệm vụ. Chủ dự án đã duyệt phân rã P0. Các task đang chờ người phụ trách bắt đầu.

## Giao diện P0 đã duyệt

- Hono phục vụ `GET /health`. Trong môi trường dev, web gọi `GET /api/health` qua Vite proxy và proxy chuyển request đến `/health` của Hono.
- PostgreSQL sẵn sàng thì API trả `200` với `{"status":"ok"}`. PostgreSQL chưa sẵn sàng thì API trả `503` với `{"status":"unavailable"}`.
- P0 nghiệm thu Farm canvas với sprite tạm và đường gọi API chạy trên `develop`. Vòng chơi Farm thuộc P1 và tích hợp NEAR thuộc P4.

| ID | Phase | Công việc | Owner | Scope | Branch | Status | Phụ thuộc | Nghiệm thu |
|---|---|---|---|---|---|---|---|---|
| T-01 | P0 | Chốt giao diện kiểm tra API | Codex | `shared/` | `feat/p0-backend` | TODO | — | Ghi giao diện đã duyệt trong `shared/`. Hono phục vụ `GET /health` với `200 {"status":"ok"}` hoặc `503 {"status":"unavailable"}`. Web gọi qua `/api/health`. |
| T-02 | P0 | Dựng khung Phaser và Vite | Antigravity | `web/` | `feat/p0-web` | TODO | Giao diện P0 đã duyệt | `pnpm dev` mở Farm canvas có hai ô đất với sprite tạm. Vite proxy chuyển `/api/health` đến `/health` của Hono. |
| T-03 | P0 | Dựng khung Hono và kết nối PostgreSQL | Codex | `backend/` | `feat/p0-backend` | TODO | Giao diện T-01 có trong `shared/` | `pnpm dev` khởi động Hono. Cấu hình kết nối bằng `DATABASE_URL`. `GET /health` trả `200` khi kiểm tra DB thành công và `503` khi DB chưa sẵn sàng. |
| T-04 | P0 | Tích hợp web và API | Codex | Tích hợp diff T-01–T-03 | `develop` | TODO | T-01–T-03 ở REVIEW | Ghi lệnh chạy web và API từ bản tích hợp. Mở Farm trong trình duyệt và xác minh request `/api/health` trả `200 {"status":"ok"}` từ Hono. |
| T-07 | P1 | Chốt giao diện API Farm | Codex | `shared/` | `feat/farm-contract` | TODO | T-04 DONE | Request, response và lỗi cho trạng thái Farm, Plant, Harvest, Quick Sell và Unlock được ghi rõ và tích hợp vào `develop`. |
| T-05 | P1 | Làm API Farm và lưu tiến độ | Codex | `backend/` | `feat/farm-api` | TODO | T-07 DONE | Guest có 2 ô trống. Cây chín sau 10 giây. Thu hoạch đúng một crop, silo đầy giữ ô READY, Quick Sell và mở Plot #3 cập nhật GOLD chính xác. |
| T-06 | P1 | Làm Farm scene và thao tác chơi | Antigravity | `web/` | `feat/farm-web` | TODO | T-07 DONE | Có trạng thái ô và phản hồi trồng, lớn, thu hoạch. Hiển thị GOLD, silo, Quick Sell và Unlock. Chạy thử bằng dữ liệu mẫu đúng giao diện khi API đang làm. |
| T-08 | P1 | Nghiệm thu vòng chơi Farm | Codex | Tích hợp diff T-05 và T-06 | `develop` | TODO | T-05 và T-06 ở REVIEW | Từ Guest đến mở Plot #3 trong kịch bản 45 giây. Reload giữ tiến độ, bấm thu hoạch hai lần chỉ nhận một crop, silo đầy giữ cây READY và mở ô chỉ trừ GOLD một lần. |

## Trạng thái

- **TODO** — Đã ghi vào kế hoạch, chờ người phụ trách bắt đầu.
- **DOING** — Owner đã nhận và đang làm trong scope đã giao.
- **BLOCKED** — Có blocker cần xử lý. Ghi nguyên nhân và bước tiếp theo ở Ghi chú.
- **REVIEW** — Đã bàn giao diff và kết quả tự kiểm tra.
- **DONE** — Đã tích hợp và đạt tiêu chí trên `develop`.

## Ghi chú

- P2 mở Store và merchant. P3 art chạy song song khi có brief riêng. P4 tích hợp NEAR sau khi Farm và Store chạy. P5 dành cho QA và nộp bài.
- Sau mỗi lần cập nhật bảng, Codex tạo lại bản HTML bằng `node tools/build-task-dashboard.mjs` từ root của repo.
