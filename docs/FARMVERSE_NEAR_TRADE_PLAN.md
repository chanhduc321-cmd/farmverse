# FV-NEAR-01 — Vòng giao dịch USDC testnet

Ngày 13/11/2026, chủ dự án chốt dùng USDC cho kịch bản A đổi Dâu tây, NPC bán cho B, B nhận badge và NPC hiện PnL. Giá mua là 1 USDC, giá bán là 1,5 USDC. Đơn vị trên UI là **USDC testnet**. Ngày 14/11 đã kiểm tra hai danh tính Google, khởi tạo ví, log và hai khoản USDC thật qua adapter. Cả A/B giữ 0 NEAR, sponsor trả gas. Giao vật phẩm/badge/PnL theo `runId` là phần tiếp theo. [Bằng chứng T-17](NEAR_USDC_ADAPTER.md).

Kịch bản dùng một quả Dâu tây và một Mâm quả trong dữ liệu demo riêng theo `runId`. Backend giữ vật phẩm, badge và PnL trong PostgreSQL. Số dư USDC lấy từ NEAR testnet. [Amendment FV-NEAR-01](FARMVERSE_MVP_CONTRACT.md#fv-near-01--usdc-testnet-trade-demo)

## Kịch bản quay demo

Mở hai phiên trình duyệt độc lập cho A và B. Cả hai bấm **Tiếp tục với Google** bằng hai tài khoản khác nhau. Backend gắn A/B với ví NEAR Auth đã xác minh. NPC và ví tài trợ có cấu hình phía server.

| Bước | Thao tác trên màn hình | Thanh toán và kết quả |
|---|---|---|
| Chuẩn bị | A có 1 Dâu tây demo. B thấy Mâm quả 2/3. | NPC có tối thiểu 1 USDC. B có tối thiểu 1,5 USDC. A/B/NPC đã đăng ký nhận USDC. |
| A nhận lời mời | “Đổi 1 Dâu tây lấy 1 USDC?” — Đổi / Bỏ qua. | Đổi tạo lệnh và giữ quả. NPC trả A 1 USDC, FarmVerse tài trợ gas. |
| Hoàn tất A | A thấy “Đã nhận 1 USDC”. | Sau xác minh thanh toán, quả thuộc NPC và giá vốn là 1 USDC. B bắt đầu thấy lời mời mua. |
| B nhận lời mời | “Mâm quả thiếu 1 Dâu tây. Dùng 1,5 USDC để hoàn thiện và nhận badge?” — Mua / Bỏ qua. | Mua giữ suất và mở xác nhận NEAR Auth cho khoản trả 1,5 USDC từ B cho NPC. |
| Hoàn tất B | B thấy Mâm quả 3/3 và badge. | Sau xác minh thanh toán, sử dụng quả NPC đang giữ để hoàn thiện mâm. Ghi badge và doanh thu trong cùng transaction PostgreSQL. |
| Xem NPC | Giá vốn 1 · Doanh thu 1,5 · Lãi gộp +0,5 USDC. | Lịch sử có hai khoản USDC, ví gửi/nhận, phí và link Explorer. Reload giữ kết quả. |

A xác nhận ý định đổi bằng phiên FarmVerse. NPC dùng khóa server để chi tiền. B duyệt khoản chi từ ví của mình qua NEAR Auth. Bỏ qua lời mời giữ nguyên tài sản và có thể lưu trạng thái đã bỏ qua trong lượt demo.

## Số dư và PnL

| Tài khoản | Sau lượt A | Sau lượt B |
|---|---:|---:|
| A | +1 USDC | +1 USDC |
| B | 0 USDC | −1,5 USDC |
| NPC | −1 USDC và có 1 quả | +0,5 USDC so với đầu lượt, đã bán quả |
| Mâm quả B | 2/3 | 3/3 và 1 badge |

Đây là biến động so với số dư đầu lượt. PnL ghi **lãi gộp 0,5 USDC** sau khi B mua thành công. Lượt A mới xong ghi giá vốn và hàng tồn. Gas lưu bằng NEAR trong log và hiển thị riêng ở chi phí FarmVerse.

## Chuẩn bị testnet

1. Xác minh hai danh tính Google mở hai farm/ví khác nhau và đăng nhập lại mở đúng farm.
2. Khởi tạo ví khi cần, đăng ký nhận USDC cho đúng địa chỉ A, B và NPC. FarmVerse trả phí thiết lập.
3. Nạp NPC tối thiểu 1 USDC và B tối thiểu 1,5 USDC. Kiểm tra số dư thật trước khi bật giao dịch.
4. Lưu vai trò A/B, `runId` và số dư đầu lượt. Mỗi lượt mới có ID riêng và kiểm tra lại số dư on-chain sau khi lệnh trước đã được xử lý.

Contract Circle USDC trên NEAR testnet là `3e2210e1184b45b64c8a434c0a7e7b23cc04ea7eb7a6c3c32520d03d4afcb8af`. RPC kiểm tra ngày 13/11 xác nhận `symbol=USDC`, `decimals=6`, storage tối thiểu `1250000000000000000000` yoctoNEAR mỗi tài khoản. API dùng chuỗi số nguyên `1000000`, `1500000`, `500000` cho giá và lãi. [Circle contracts](https://developers.circle.com/stablecoins/usdc-contract-addresses#testnet) · [Circle faucet](https://faucet.circle.com/)

Các ví demo được đăng ký USDC trước đây chứng minh phần thiết lập đã chạy. T-60 vẫn cần đăng ký đúng địa chỉ A/B mà NEAR Auth trả về trong lượt này.

## Module và dữ liệu

| Phần | Phạm vi | Điểm bàn giao |
|---|---|---|
| Auth | Google → Farm → ví và callback ký | Web dùng module đăng nhập hiện có. |
| Thanh toán chung | Lệnh, ID đối tác, tài sản, số tiền, tham chiếu và trạng thái | Adapter nhận lệnh server chốt qua `prepare`, `submit`, `getStatus`. |
| Adapter NEAR | USDC, storage, RPC, nonce, NEP-366, MPC và khóa server | Chuẩn hóa kết quả và bước duyệt về module thanh toán. |
| Gameplay demo | Quả, lời mời, giữ suất, mâm, badge và PnL theo `runId` | Dùng ID lệnh và kết quả thanh toán đã xác minh. |
| Log | Token contract, USDC 6 chữ số và phí NEAR 24 chữ số | API lịch sử trả đơn vị/độ chính xác cho từng tài sản. |

Schema trong `shared/` độc lập Phaser. Snapshot gồm `runId`, vai trò, lời mời, tiến độ mâm, badge, lệnh đang mở và PnL. Chốt API đọc snapshot, nhận/bỏ qua lời mời, đọc lệnh và đọc PnL. Client gửi `offerId` cùng mã chống gửi lặp. Server quyết định giá và kết quả.

Lệnh gameplay liên kết với `farm_blockchain_transactions` và giữ mốc đã áp dụng kết quả vào vật phẩm. Log giữ bằng chứng của từng giao dịch on-chain.

## Nhất quán và khôi phục

1. Giữ quả/suất mua và tạo lệnh trong PostgreSQL trước khi thanh toán.
2. Ghi hash trước broadcast. NPC → A dùng khóa NPC ở server. B → NPC dùng NEAR Auth ký delegate action gọi `ft_transfer`. Ví tài trợ trả gas cho cả hai lượt.
3. Xác minh execution thành công, đúng token contract, ví gửi/nhận và số tiền qua RPC/receipt cùng sự kiện FT. Đối chiếu số dư trước/sau khi nghiệm thu.
4. Ghi lệnh, chủ sở hữu quả, tiến độ mâm, badge và PnL trong một transaction PostgreSQL sau xác minh. Mỗi lệnh áp dụng kết quả một lần.
5. Timeout/reload đọc lại lệnh và hash đã lưu. Hủy hoặc thất bại đã xác minh giải phóng suất giữ. Thanh toán chưa rõ kết quả giữ lệnh để tiếp tục đối chiếu.

## Phân việc và ước tính còn lại

| Task | Owner | Ước tính | Nghiệm thu |
|---|---|---|---|
| T-56 · Chốt luật | Chủ dự án + Codex | Đã chốt | USDC testnet, giá 1/1,5, badge khi mua xong, lãi gộp 0,5. |
| T-16 · JSON/fixture | Codex | Đã xong | Snapshot A/B, lời mời, lệnh, PnL và 17 fixture đã bàn giao. |
| T-60 · Ví/vốn | Codex | Đã xong | Hai ví Google đã đăng ký USDC. B có 1,5, NPC có 17,5 USDC sau thử adapter; sponsor có NEAR. |
| T-17 · Adapter USDC | Codex | Đã xong | Hai lượt USDC thật đã xác minh FINAL, module NEAR riêng, log đúng tài sản/phí. |
| T-57 · Lệnh/quả | Codex | Đã xong | API và migration 013 giữ một quả/suất. Kiểm thử adapter giả lập xác nhận B thấy lời mời sau khi thanh toán A hoàn tất. |
| T-58 · Mâm/badge | Codex | Đã xong | Adapter giả lập và PostgreSQL xác nhận mâm 3/3, một badge bền qua reload và callback lặp. |
| T-64 · UI lịch sử | Antigravity + Codex | Đã xong | Đã tích hợp và nghiệm thu local, định dạng USDC và phí NEAR. |
| T-18 · UI lời mời | Antigravity | 60–90 phút | Đổi/Mua/Bỏ qua, chờ, thành công/lỗi, mâm và badge. |
| T-62 · UI PnL | Antigravity | 20–40 phút | Giá vốn, doanh thu và lãi gộp theo server. |
| T-19 · Tích hợp | Codex | 45–75 phút | Hai phiên thật, số dư/hash/log, bấm đúp/hủy/reload/timeout. |

T-18, T-62 và T-65 đã tích hợp. T-19 đã chạy trọn vòng local với hai khoản USDC testnet. T-67 đưa lời mời và sổ quầy vào một màn riêng. T-66 dùng `NEAR_DEMO_ENABLED` để bật ở local và tắt mặc định trên server. Sau khi chủ dự án review, mã có thể lên main cho hackathon. Nghiệm thu public thực hiện sau khi callback được chấp nhận.

## Quyền ghi khi làm song song

Antigravity dùng `D:/Project/pet-project/farmverse-near-auth-ui`, base `86bfc94`, nhánh `feat/near-auth-ui`. T-64 giữ `web/src/transactions/`. Sau bàn giao schema, T-18/T-62 nhận `web/src/trade-demo/`. Codex giữ `backend/`, migrations, `shared/`, dashboard, `web/src/main.ts`, HTML và CSS dùng chung. Module web import CSS riêng và xuất hàm mount/refresh/reset để Codex tích hợp.

Fixture gồm A có lời mời, A đang nhận tiền, NPC đã nhận quả, B có lời mời, B đang duyệt ký, thanh toán chờ xác minh, thành công có badge, hủy và thất bại. API giữ cùng schema giữa fixture và dữ liệu thật.

## Checklist nghiệm thu

- Hai tài khoản Google giữ đúng farm/vai trò/ví qua đăng nhập lại.
- A Đổi nhận 1 USDC, quả thuộc NPC sau xác minh. A Bỏ qua giữ nguyên tài sản.
- B mua đúng quả NPC đang có, trả 1,5 USDC và nhận mâm 3/3 cùng một badge.
- NPC hiện giá vốn 1, doanh thu 1,5, lãi gộp 0,5 USDC. Sponsor trả gas NEAR.
- PostgreSQL có lệnh, log, hash và phí. Reload khôi phục cùng lệnh và kết quả.
- Bấm đúp, hai lượt mua tranh cùng quả, callback lặp và lỗi RPC giữ nhất quán quả/badge/PnL.
- Lượt demo mới có `runId` riêng và kiểm tra số dư thật.
