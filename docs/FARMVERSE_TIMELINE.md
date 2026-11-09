# FarmVerse — Timeline Hackathon MVP

Các mốc dưới đây là **mục tiêu nội bộ**, tính theo giờ Việt Nam (UTC+7). Mục tiêu nộp bài là **22:00 ngày 14/11/2026**. Hạn chính thức là **06:59 ngày 15/11/2026**. [Thể lệ NEAR Hackathon](https://nearhackathon.com/HACKATHON.md)

[MVP Contract](FARMVERSE_MVP_CONTRACT.md) quy định tiêu chí nghiệm thu. [Phaser Guide](FARMVERSE_PHASER_MVP_GUIDE.md#8-implementation-phases-and-deliverables) quy định stack và nội dung từng phase. Cập nhật trạng thái trong bảng khi có kết quả kiểm tra, bản chạy hoặc bằng chứng tương ứng.

| Phase | Mốc mục tiêu | Tiêu chí hoàn thành | Trạng thái |
|---|---|---|---|
| Chuẩn bị | 09/11 | Có cấu trúc repo, MVP Contract, stack, README cho giám khảo, quy tắc phối hợp và Art Bible. | Đã chốt |
| **P0 — Dựng nền Farm** | 09/11 | Web Phaser/Vite và API Hono chạy bằng lệnh đã ghi lại. PostgreSQL kết nối được. Có sprite tạm. Browser gọi được `GET /api/health` từ bản tích hợp trên `develop`. | Hoàn thành |
| **P1 — Farm (C01)** | 10/11 | Guest trồng hai ô, thu hoạch, Quick Sell đủ 20 GOLD và mở Plot #3. Luồng có kịch bản kiểm tra trong 45 giây. Kiểm tra cả hai loại crop, giữ nguyên cây READY khi silo đầy và trừ GOLD đúng một lần khi mở ô. | Chờ |
| **P2 — Town Square và merchant (C02 Lite)** | 11/11 | Đi qua lại Farm và Store rồi reload vẫn giữ tiến độ. NPC mua và bán bằng GOLD, mỗi lần chuyển đúng một vật phẩm và cập nhật tồn kho, ngân sách, nhu cầu. Kiểm tra công thức giá, giới hạn giao dịch, offer chỉ xử lý một lần và các quy tắc phục hồi của NPC. | Chờ |
| **P3 — Art và phản hồi** | 09–12/11, song song P0–P2 | Duyệt ảnh mẫu và Art Bible trước khi gen theo lô. Tích hợp bộ sprite Farm, Store, merchant và crop. Kiểm tra tỷ lệ, anchor, độ rõ của trạng thái và vùng bấm trên trình duyệt. | Chờ |
| **P4 — NEAR trong Store (C03 Micro)** | 12–13/11 | Thử và xác minh một giao dịch testnet từ server, sau đó nối vào nút Store. UI hiển thị pending, thành công đã xác minh hoặc lỗi, kèm network, hash và explorer link khi có. Kiểm tra chống bấm lặp và xác nhận giao dịch không thay đổi GOLD, vật phẩm hay quyền sở hữu crop. | Chờ |
| **P5 — QA và nộp bài** | 13–14/11, mục tiêu nộp trước 22:00 ngày 14/11 | Mở bản public từ trình duyệt sạch và chạy trọn walkthrough 60–90 giây. Đối chiếu lệnh chạy, trạng thái tính năng và bằng chứng NEAR trong README. Repo public có `LICENSE` và credits. Bài demo công khai trên X có video hoặc ảnh, tag `@NEARProtocol` và `#NEARHackathon`. Nộp link repo và bài demo qua form. | Chờ |

## Phối hợp và thứ tự triển khai

- **Codex Lead** giữ `backend/` và `shared/`, chốt API, tích hợp và nghiệm thu trên `develop`. **Antigravity Collaborator** giữ `web/` theo brief. Xem ID, scope và trạng thái trong [TASKS.md](../TASKS.md) và cách bàn giao trong [quy trình phối hợp](agents/workflow.md).
- **P4 bắt đầu sau P2.** Thử giao dịch server trước khi nối Store UI. Nếu tài khoản hoặc RPC testnet vướng, ghi blocker ở P4.
- **P3 chạy song song.** Dùng sprite tạm để nghiệm thu gameplay. Hai agent dùng cùng [Art Bible](art/ART_BIBLE.md) và ảnh mẫu đã duyệt. Nếu sát hạn, ưu tiên đủ asset cho hai cảnh và độ rõ của thao tác trước hiệu ứng trang trí.
- **P5 bắt đầu khi có bản tích hợp để thử.** Codex kiểm tra link công khai và ghi lại phiên bản đã test. Chủ dự án đăng bài demo và xác nhận nộp bài.
