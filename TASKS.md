# FarmVerse — Bảng công việc

[Mở dashboard HTML](TASKS.html) · [Sổ lỗi](BUGS.md) · [Quy trình phối hợp](docs/agents/workflow.md) · [Timeline P0–P5](docs/FARMVERSE_TIMELINE.md)

Codex là người duy nhất ghi trạng thái trong bảng này. Antigravity báo tiến độ và bàn giao qua chat. Chủ dự án đã duyệt phân rã P0. Các mốc tính theo giờ Việt Nam trong tháng 11/2026. Phân công và phạm vi P2–P5 là dự thảo để chủ dự án review trước khi giao việc.

## Giao diện P0 đã duyệt

- Hono phục vụ `GET /health`. Trong môi trường dev, web gọi `GET /api/health` qua Vite proxy và proxy chuyển request đến `/health` của Hono.
- PostgreSQL sẵn sàng thì API trả `200` với `{"status":"ok"}`. PostgreSQL chưa sẵn sàng thì API trả `503` với `{"status":"unavailable"}`.
- P0 nghiệm thu Farm canvas với sprite tạm và đường gọi API chạy trên `develop`. Vòng chơi Farm thuộc P1 và tích hợp NEAR thuộc P4.

| ID | Phase | Mốc | Công việc | Owner | Scope | Branch | Status | Phụ thuộc | Nghiệm thu |
|---|---|---|---|---|---|---|---|---|---|
| T-01 | P0 | 09/11 | Chốt giao diện kiểm tra API | Codex | `shared/` | `feat/p0-backend` | DONE | — | Ghi giao diện đã duyệt trong `shared/`. Hono phục vụ `GET /health` với `200 {"status":"ok"}` hoặc `503 {"status":"unavailable"}`. Web gọi qua `/api/health`. |
| T-02 | P0 | 09/11 | Dựng khung Phaser và Vite | Antigravity | `web/` | `feat/p0-web` | DONE | Giao diện P0 đã duyệt | `pnpm dev` mở Farm canvas có hai ô đất với sprite tạm. Vite proxy chuyển `/api/health` đến `/health` của Hono. |
| T-03 | P0 | 09/11 | Dựng khung Hono và kết nối PostgreSQL | Codex | `backend/` | `feat/p0-backend` | DONE | Giao diện T-01 có trong `shared/` | `pnpm dev` khởi động Hono. Cấu hình kết nối bằng `DATABASE_URL`. `GET /health` trả `200` khi kiểm tra DB thành công và `503` khi DB chưa sẵn sàng. |
| T-04 | P0 | 09/11 | Tích hợp web và API | Codex | Tích hợp diff T-01–T-03 | `develop` | DONE | T-01–T-03 đã bàn giao | Ghi lệnh chạy web và API từ bản tích hợp. Mở Farm trong trình duyệt và xác minh request `/api/health` trả `200 {"status":"ok"}` từ Hono. |
| T-07 | P1 | 10/11 | Chốt giao diện API Farm | Codex | `shared/` | `feat/farm-contract` | DONE | T-04 DONE | Request, response và lỗi cho trạng thái Farm, Plant, Harvest, Quick Sell và Unlock được ghi rõ và tích hợp vào `develop`. |
| T-05 | P1 | 10/11 | Làm API Farm và lưu tiến độ | Codex | `backend/` | `feat/farm-api` | TODO | T-07 DONE | Guest có 2 ô trống. Cây chín sau 10 giây. Thu hoạch đúng một crop, silo đầy giữ ô READY, Quick Sell và mở Plot #3 cập nhật GOLD chính xác. |
| T-06 | P1 | 10/11 | Làm Farm scene và thao tác chơi | Antigravity | `web/` | `feat/farm-web` | TODO | T-07 DONE | Có trạng thái ô và phản hồi trồng, lớn, thu hoạch. Hiển thị GOLD, silo, Quick Sell và Unlock. Chạy thử bằng dữ liệu mẫu đúng giao diện khi API đang làm. |
| T-08 | P1 | 10/11 | Nghiệm thu vòng chơi Farm | Codex | Tích hợp diff T-05 và T-06 | `develop` | TODO | T-05 và T-06 ở REVIEW | Từ Guest đến mở Plot #3 trong kịch bản 45 giây. Reload giữ tiến độ, bấm thu hoạch hai lần chỉ nhận một crop, silo đầy giữ cây READY và mở ô chỉ trừ GOLD một lần. |
| T-09 | P2 | 11/11 | Chốt giao diện merchant | Codex | `shared/` | `feat/merchant-contract` | TODO | T-08 DONE | Chốt schema trạng thái merchant, báo giá, mua, bán và lỗi để hai bên phát triển theo cùng giao diện. |
| T-10 | P2 | 11/11 | Làm API merchant và giao dịch GOLD | Codex | `backend/` | `feat/merchant-api` | TODO | T-09 DONE | Kiểm tra giá, cập nhật GOLD và tồn kho trong cùng giao dịch, xử lý offer tối đa một lần và kiểm tra quy tắc phục hồi C02 Lite. |
| T-11 | P2 | 11/11 | Dựng Town Square và cửa hàng | Antigravity | `web/src/` | `feat/merchant-web` | TODO | T-09 DONE | Đi qua lại Farm ↔ Store, đọc được báo giá, ngân sách, tồn kho và nhu cầu. Mua hoặc bán cập nhật trạng thái hiển thị và báo lỗi rõ ràng. |
| T-12 | P2 | 11/11 | Nghiệm thu merchant | Codex | Tích hợp diff T-10 và T-11 | `develop` | TODO | T-10 và T-11 ở REVIEW | Từ trình duyệt, mua và bán làm thay đổi GOLD và đúng một vật phẩm. Reload giữ tiến độ, giao dịch lặp không áp dụng lại. |
| T-13 | P3 | 10/11 | Chốt mẫu art | Antigravity | `docs/art/`, `art/source/` | `feat/art-style` | TODO | Brief art được giao | Chủ dự án duyệt góc nhìn, tỷ lệ và ánh sáng. Lưu `approved_style.png` và các thông số đã chốt trong Art Bible. |
| T-14 | P3 | 10–12/11 | Tạo bộ sprite cho hai cảnh | Antigravity | `art/source/`, `web/public/assets/` | `feat/art-assets` | TODO | T-13 DONE | Bàn giao sprite Farm, Store, merchant, crop và icon HUD đã duyệt. Kiểm tra kích thước, anchor, độ trong suốt và ghi nguồn hoặc credits. |
| T-15 | P3 | 12/11 | Tích hợp và kiểm tra art | Antigravity | `web/src/` | `feat/art-integration` | TODO | T-12 và T-14 DONE | Farm và Store dùng asset đã duyệt. Kiểm tra tỷ lệ, vùng bấm và độ rõ của trạng thái ở kích thước chơi thực tế. |
| T-16 | P4 | 12/11 | Thử giao dịch NEAR và chốt API demo | Codex | `backend/`, `shared/` | `feat/near-contract` | TODO | T-12 DONE | Gửi một native transfer testnet giữa hai tài khoản demo. Xác minh thực thi qua RPC và ghi hash, explorer link cùng schema trạng thái cho Store. |
| T-17 | P4 | 13/11 | Làm API NEAR Testnet Demo | Codex | `backend/` | `feat/near-api` | TODO | T-16 DONE | API gửi lượng testnet NEAR cố định, giữ khóa ký phía server, chống yêu cầu lặp và trả trạng thái theo kết quả thực thi RPC. |
| T-18 | P4 | 13/11 | Nối nút NEAR vào Store | Antigravity | `web/src/` | `feat/near-web` | TODO | T-16 DONE | Hiển thị pending, thành công đã xác minh hoặc lỗi. Có network, hash và explorer link khi có giao dịch. |
| T-19 | P4 | 13/11 | Nghiệm thu C03 trong trình duyệt | Codex | Tích hợp diff T-17 và T-18 | `develop` | TODO | T-17 và T-18 ở REVIEW | Bấm nút Store tạo giao dịch thật và mở được explorer. Kiểm tra bấm lặp, xử lý lỗi và đối chiếu GOLD cùng inventory trước và sau. |
| T-20 | P5 | 13–14/11 | QA bản tích hợp và chuẩn bị hồ sơ | Codex | `README.md`, `LICENSE`, `docs/` | `feat/release-qa` | TODO | T-15 và T-19 DONE | Chạy walkthrough 60–90 giây từ trình duyệt sạch. Kiểm tra lệnh setup, README, giao dịch mẫu, ảnh hoặc video, credits và license đã được chủ dự án chốt. |
| T-21 | P5 | 14/11 | Duyệt bản chạy và kiểm tra link public | Codex | Bản phát hành và cấu hình deploy theo brief | `develop` → `main` sau khi duyệt | TODO | T-20 DONE, chủ dự án duyệt release | Mở demo từ trình duyệt sạch qua URL public. Repo public, README trỏ đúng demo và explorer. Ghi lại phiên bản đã kiểm tra. |
| T-22 | P5 | 14/11 · 22:00 | Đăng demo và nộp bài | Chủ dự án | Bài đăng X và form hackathon | — | TODO | T-21 DONE | Bài đăng công khai có video hoặc ảnh, tag `@NEARProtocol` và `#NEARHackathon`. Nộp URL repo và bài đăng, lưu xác nhận nộp. |

## Trạng thái

- **TODO** — Đã ghi vào kế hoạch, chờ người phụ trách bắt đầu.
- **DOING** — Owner đã nhận và đang làm trong scope đã giao.
- **BLOCKED** — Có blocker cần xử lý. Ghi nguyên nhân và bước tiếp theo ở Ghi chú.
- **REVIEW** — Đã bàn giao diff và kết quả tự kiểm tra.
- **DONE** — Đã tích hợp và đạt tiêu chí trên `develop`. Với việc phát hành hoặc nộp bài, có URL hoặc xác nhận hoàn thành tương ứng.

## Ghi chú

- **T-01 và T-03** — Commit `0c18f71` trên `feat/p0-backend`. `pnpm typecheck` đạt. PostgreSQL trong Docker trả `SELECT 1` thành công. `/health` trả `200` khi DB chạy, `503` khi DB dừng và trở lại `200` khi DB chạy lại.
- **T-02** — Review commit `035ef37` trên `feat/p0-web`. Diff nằm trong `web/`. `pnpm install --frozen-lockfile` và `pnpm build` đạt. Lỗi viewport hẹp được theo dõi ở [BUG-01](BUGS.md).
- **T-04** — Commit tích hợp `adaf8f5` trên `develop`. `pnpm typecheck` backend, `pnpm build` web và `SELECT 1` trên PostgreSQL đều đạt. Edge 1024×768 thấy hai ô trống, `API: OK (200)` và request `/api/health` trả `200 {"status":"ok"}`. Xem [lệnh chạy P0](docs/FARMVERSE_PHASER_MVP_GUIDE.md#run-the-integrated-p0-build-locally).
- **T-07** — [Giao diện Farm](shared/farm.mts) đã tích hợp vào `develop` ở `55f03f9`. Kiểm tra TypeScript ở chế độ backend NodeNext và web Bundler đều đạt. Kiểm tra request hợp lệ, plot ID sai, revision sai và crop ngoài danh sách đều đạt. T-05 và T-06 có thể bắt đầu song song từ `develop`.
- P2 mở Store và merchant. P3 art chạy song song khi có brief riêng. P4 tích hợp NEAR sau khi Farm và Store chạy. P5 dành cho QA và nộp bài.
- Sau mỗi lần cập nhật bảng, Codex tạo lại bản HTML bằng `node tools/build-task-dashboard.mjs` từ root của repo.
