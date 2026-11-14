# T-18/T-62 · Hai lời mời, Mâm quả và PnL

T-16 chốt schema ngày 14/11/2026. Antigravity nhận UI lời mời/badge/PnL. Codex giữ backend, dữ liệu gameplay, provider, schema và điểm nối vào Farm.

## Workspace và quyền ghi

- Dùng `D:/Project/pet-project/farmverse-near-auth-ui`, nhánh `feat/near-auth-ui`, base `86bfc94`.
- Đọc `AGENTS.md`, `docs/agents/collaborator.md`, `docs/agents/workflow.md`, brief này và `docs/TRADE_DEMO_API.md`.
- T-18/T-62 ghi trong `web/src/trade-demo/`. T-64 tiếp tục giữ `web/src/transactions/` theo brief riêng.
- Codex giữ backend/migrations/shared/dashboard, `web/src/main.ts`, `web/index.html`, CSS dùng chung và Vite config.
- Schema/fixture do Codex chép sang worktree để import. Chỉ commit UI được giao, bàn giao theo từng task.

## Hợp đồng và fixture

Import path/type từ `shared/trade-demo.mts` và `shared/payments.mts`. API ở `docs/TRADE_DEMO_API.md`. Route gameplay triển khai ở T-57/T-58, thanh toán nối ở T-17. Dùng `getTradeDemoFixture(name)` từ `shared/fixtures/trade-demo.mts` để lấy bản copy của từng snapshot.

Fixture có địa chỉ/số liệu giả và URL `.invalid`. Transport fixture tự chuyển giữa snapshot để thử UI trong harness local.

## Module bàn giao

Xuất `mountTradeDemo(container, options)` từ `web/src/trade-demo/index.ts`. Options nhận `client?: TradeDemoClient` từ schema, cùng `onSnapshot?: (snapshot: TradeDemoSnapshot) => void` để đồng bộ PnL. Client có `read()`, `accept(request)`, `skip(request)`, `readOrder(orderId)` trả đúng kiểu schema. Default client dùng fetch tới route cùng origin.

Handle có `refresh(): Promise<void>`, `reset(): void`. Codex tích hợp mount vào Farm. Reset xóa dữ liệu, hủy fetch/polling và ngăn phản hồi cũ cập nhật phiên mới. Module import CSS riêng.

Xuất `mountTradeDemoPnl(container)` trong cùng thư mục. Handle có `render(pnl: TradeDemoPnl): void`, `reset(): void`. Feed fixture.pnl khi thử riêng T-62. Codex render lời mời/PnL từ cùng snapshot.

## T-18

- A thấy “Đổi 1 Dâu tây lấy 1 USDC?” cùng **Đổi**, **Bỏ qua**.
- B trước lượt A thấy Mâm quả 2/3 và đang chờ NPC có quả.
- Khi có hàng, B thấy “Mâm quả thiếu 1 Dâu tây. Dùng 1,5 USDC để hoàn thiện và nhận badge?” cùng **Mua**, **Bỏ qua**.
- Hiển thị USDC testnet. Giá/số dư đọc từ PaymentAmount, định dạng theo asset.decimals bằng BigInt hoặc chuỗi.
- Khóa Accept khi canAccept=false và giải thích unavailableReason. Khi có lệnh đang xử lý, theo dõi cùng ID.
- Tạo requestId một lần, retry cùng body. Giá/ví/badge lấy từ server. Render response rồi xử lý redirect đã trả về nếu cần.
- Chỉ hiện hoàn thành khi order.status=succeeded. Thanh toán confirmed mà order còn processing tiếp tục chờ.
- Badge lấy từ basket.filled=3 và basket.badge. Dùng icon hiện có. Bỏ qua hiển thị trạng thái đã bỏ qua.

## T-62

Hiện giá vốn, doanh thu, lãi gộp. grossProfit=null hiển thị dấu gạch ngang. Sau bán thành công hiện +0,5 USDC từ API. Chi phí sponsor định dạng theo sponsorGas.asset, đơn vị NEAR.

## Sửa sau review 5a52a60

Chủ dự án muốn màn giao dịch có background cửa hàng và một NPC. Dùng bộ sprite T-14 đã duyệt gồm nền lát đá `town_square_ground.png`, quầy gỗ mái sọc `merchant_stall.png` và NPC sói đội nón rơm `npc_merchant_idle.png`. Xem [Art Bible](../art/ART_BIBLE.md) và [manifest](../art/SPRITE_MANIFEST.md). File nguồn trong `art/source/t14/`. Codex giữ quyền đưa asset vào thư mục runtime khi tích hợp. Có thể dùng bản xem thử cục bộ với các sprite nguồn để duyệt bố cục.

- Cho NPC đứng cạnh quầy trên cùng nền. Lời mời xuất hiện như hội thoại của NPC, với quả, giá và nút hành động đặt gần nhau. Trên mobile, cảnh cửa hàng nằm trên hội thoại và giữ mặt NPC trong khung.
- Mâm quả 2/3 hiện ngay lúc B cân nhắc mua. Khi nhận quả, cho người chơi thấy mâm đủ 3/3 cùng huy hiệu hiện có. Đưa mã đơn, ví và link giao dịch vào chi tiết. Đặt PnL riêng trong góc nhìn NPC, ưu tiên dòng giá vốn → doanh thu → lãi gộp, gas ở dòng phụ.
- Sửa [BUG-49–BUG-54](../../BUGS.md). Kiểm tra một response đến sau reset, 401/409/503 kèm orderId, reload khi chờ duyệt, B bỏ qua, thông báo chứa HTML và phí 1 yoctoNEAR. Trong các ca này dùng DOM và transport mô phỏng để thực sự chạy module mount, thao tác và quan sát kết quả.
- Gửi ảnh desktop và mobile cho ba mốc: A đổi quả, B mua với mâm 2/3, B nhận mâm 3/3. Đo viewport thật 390×844 khi chụp mobile để tránh ảnh bị cắt phải. Giữ phạm vi commit trong `web/src/trade-demo/`.

## Nghiệm thu

- Desktop 1280×800 và mobile 390×844 dễ đọc, không tràn ngang, dùng được bằng bàn phím.
- Thử fixture A/B, ví đang chuẩn bị, thiếu USDC, hủy/hết hạn/lỗi, pending, confirmed chờ áp dụng và thành công.
- Hai lần bấm nhanh dùng một request. Retry cùng ID. Reset giữa fetch/poll loại bỏ dữ liệu phiên cũ.
- Poll khi tab hiện và màn demo hoạt động. Dừng khi ẩn/reset hoặc lệnh kết thúc. Trở lại tab đọc trạng thái server.
- Badge/PnL cập nhật theo snapshot. `pnpm --dir web build` đạt.
- Bàn giao commit/diff, ảnh hai kích thước và các kiểm tra đã chạy. Codex nghiệm thu với backend thật.
