# T-64 · UI lịch sử giao dịch

Antigravity nhận phần UI lịch sử giao dịch. Codex giữ migration 011, bảng `farm_blockchain_transactions`, backend, `shared/`, dashboard và điểm nối vào màn tài khoản.

## Workspace và quyền ghi

- Mở `D:/Project/pet-project/farmverse-near-auth-ui`, nhánh `feat/near-auth-ui`, base `86bfc94` từ `develop`.
- Đọc `AGENTS.md`, `docs/agents/collaborator.md`, `docs/agents/workflow.md` và brief này.
- Ghi trong `web/src/transactions/`. Có thể tạo `history.ts`, `history.css` và fixture theo schema để kiểm tra UI.
- Codex giữ `web/src/main.ts`, `web/index.html`, `web/src/style.css`, `web/vite.config.ts`, `backend/`, `shared/` và dashboard trong đợt này.
- `shared/blockchain.mts` đã được Codex chép sang worktree để đọc và import. Khi bàn giao, chỉ commit file trong phạm vi UI đã nhận.

## Điểm nối

Xuất hàm `mountTransactionHistory(container: HTMLElement)` từ `web/src/transactions/history.ts`. Hàm thêm nút **Lịch sử giao dịch** và phần nội dung mở/đóng trong container. Codex sẽ gọi hàm này với vùng hồ sơ tài khoản đang đăng nhập. Import CSS riêng trong module.

Giá trị trả về gồm `refresh(): Promise<void>` để tải lại khi đổi phiên và `reset(): void` để xóa dữ liệu đã hiển thị khi đăng xuất. Nút mở lịch sử gọi API mỗi lần mở. Khi reset, đóng lịch sử, xóa dữ liệu người cũ và vô hiệu hóa phản hồi fetch đang chạy. Dùng AbortController hoặc kiểm tra phiên của request để phản hồi cũ không xuất hiện sau khi đổi tài khoản.

## API đã chốt

Gọi `GET /api/account/transactions?limit=25` bằng cookie cùng origin. Import kiểu `BlockchainHistoryResponse` và đường dẫn `BLOCKCHAIN_API.history.path` từ `shared/blockchain.mts`.

Response là `{ transactions: BlockchainTransaction[] }`, mới nhất trước. Địa chỉ, số tiền nguyên tử, gas và phí đều là chuỗi. Thời gian theo ISO 8601. `transactionHash`, `explorerUrl`, `gasBurnt`, `feeAtomic`, `confirmedAt` và `errorCode` có thể null.

- HTTP 200 trả lịch sử của tài khoản hiện tại.
- HTTP 401 hiển thị yêu cầu đăng nhập và xóa dữ liệu đang hiện.
- HTTP 400 báo tham số không hợp lệ.
- HTTP 503 hoặc lỗi mạng hiển thị thông báo và nút Thử lại.
- Endpoint đã chạy trên bản local của Codex ở `http://localhost:3000/`. Antigravity có thể dùng fixture đúng schema để xây và kiểm tra trong worktree riêng.

## Nội dung và trạng thái

Mỗi dòng có tên thao tác, thời gian, trạng thái, số tiền và link **Xem giao dịch** khi `explorerUrl` có giá trị. Hiện nhãn **Testnet** cho mạng testnet. Có thể cho xem ví gửi, ví nhận và ví tài trợ trong phần chi tiết của dòng.

| API | Hiển thị |
|---|---|
| `account_activation` | Khởi tạo ví |
| `signature` | Xác nhận ký |
| `transfer` | Chuyển tiền thử |
| `awaiting_signature` | Chờ xác nhận |
| `signing` | Đang ký |
| `prepared` | Đã chuẩn bị |
| `submitted` | Chờ mạng xác nhận |
| `confirmed` | Thành công |
| `failed` | Thất bại |
| `cancelled` | Đã hủy |
| `expired` | Hết hạn |

Giữ trạng thái API làm căn cứ hiển thị. Với mã operation/provider mới, dùng nhãn trung tính. Định dạng NEAR từ chuỗi nguyên tử với 24 chữ số thập phân bằng xử lý chuỗi hoặc BigInt để giữ độ chính xác. Phí null hiển thị dấu gạch ngang. Chỉ mở link HTTPS hợp lệ và dùng `rel="noopener noreferrer"` khi mở tab mới.

T-16 bổ sung field tùy chọn `assetDecimals`, `tokenContractId`, `feeAsset`, `feeDecimals`. Dùng metadata khi có để định dạng USDC 6 chữ số và phí NEAR 24 chữ số. Response NEAR cũ thiếu metadata dùng 24 cho số tiền/phí. Fixture `shared/fixtures/blockchain.mts` có 1,5 USDC và phí 0,0001 NEAR. Chi tiết ở `docs/TRADE_DEMO_API.md`.

## Nghiệm thu và bàn giao

- Giao diện phù hợp màn tài khoản hiện tại, dùng được trên desktop 1280×800 và mobile 390×844.
- Kiểm tra loading, danh sách rỗng, đầy đủ trạng thái, lỗi mạng, 401, thử lại và reset trong lúc fetch đang chạy.
- Dùng bàn phím mở/đóng và thao tác link. Nội dung dài không tràn ngang.
- Chạy `pnpm --dir web build` trong worktree và bàn giao commit/diff, ảnh hai kích thước cùng các kiểm tra đã chạy.
- Ước tính 45–90 phút cho agent. T-18 lời mời giao dịch và T-62 PnL là các task tiếp theo sau khi Codex bàn giao schema tương ứng.
