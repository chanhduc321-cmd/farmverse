# T-16 · Hợp đồng API demo USDC

Chốt ngày 14/11/2026 theo FV-NEAR-01. Schema ở `shared/trade-demo.mts` và `shared/payments.mts`. Fixture ở `shared/fixtures/trade-demo.mts`. Các route T-57/T-58 dùng migration 013 và adapter T-17. API lịch sử `/api/account/transactions` đã chạy từ T-63.

## Phiên và đơn vị

Gọi cùng origin với prefix `/api` và cookie FarmVerse. Backend lấy farm/vai trò/ví từ phiên đã xác minh. `seller` là A, `buyer` là B. Backend gắn farm vào `runId` đang hoạt động trong T-60/T-57.

### Tạo vòng demo local

Trong `backend/`, bật adapter NEAR USDC testnet và đặt `TRADE_DEMO_SELLER_FARM_ID` cùng `TRADE_DEMO_BUYER_FARM_ID` bằng hai Farm ID Google đã xác minh trong `.env`. Chạy `pnpm migrate`, rồi `pnpm trade-demo:setup`. Lệnh trả lại cùng run ID khi chạy lại với cùng hai vai trò. Dùng `pnpm trade-demo:setup --new-run` để mở lượt khác sau khi đã xử lý xong lệnh đang giữ quả. Kiểm tra vốn bằng `pnpm near:setup`. [Cấu hình adapter](NEAR_USDC_ADAPTER.md)

`PaymentAmount` gồm `asset: { id, symbol, decimals }` và `amountAtomic` dạng chuỗi. USDC có 6 chữ số thập phân, NEAR có 24. Giá A là `1000000`, giá B là `1500000`, lãi gộp là `500000` đơn vị USDC nhỏ nhất. Tính bằng BigInt hoặc xử lý chuỗi. `serverTime` là Unix milliseconds, thời gian lệnh/badge là ISO 8601.

`asset.id` trỏ tới cấu hình tài sản theo provider/network. Adapter NEAR ánh xạ mã này sang contract USDC đã xác minh.

## HTTP

| Request | Input | Response |
|---|---|---|
| `GET /api/trade-demo` | Cookie phiên | `TradeDemoSnapshot`. |
| `POST /api/trade-demo/visit` | Cookie phiên, body rỗng | `TradeDemoVisitResponse` với lịch NPC của farm. |
| `POST /api/trade-demo/accept` | `TradeDemoActionRequest` | 202 khi lệnh đang xử lý, 200 khi cùng lệnh đã đạt trạng thái cuối. Body `TradeDemoActionResponse`. |
| `POST /api/trade-demo/skip` | `TradeDemoActionRequest` | 200, `TradeDemoActionResponse`, `order: null`, `offerDismissed: true`. |
| `GET /api/trade-demo/orders/:orderId` | ID lệnh | `TradeDemoOrderResponse`, gồm lệnh được hỏi và snapshot hiện tại. |
| `GET /api/trade-demo/pnl` | Cookie phiên | `TradeDemoPnlResponse`. |

Path trong `TRADE_DEMO_API` chưa gồm `/api`. Thay `:orderId` bằng ID đã qua `encodeURIComponent`. Gửi JSON với `Content-Type: application/json`.

```json
{
  "runId": "20000000-0000-4000-8000-000000000001",
  "offerId": "20000000-0000-4000-8000-000000000003",
  "requestId": "30000000-0000-4000-8000-000000000001",
  "expectedRevision": 0
}
```

Tạo UUID v4 `requestId` một lần khi bấm Accept/Skip. Retry mạng dùng cùng ID/body. Server ràng buộc request với farm/run/offer/loại hành động. Cùng ID và cùng nội dung trả kết quả đã lưu trước khi kiểm tra revision. Cùng ID nhưng nội dung khác trả `REQUEST_CONFLICT`. `expectedRevision` thuộc snapshot demo.

Server kiểm tra quyền, vai trò, giá, ví, số dư và trạng thái quả trước khi tạo lệnh. Lệnh của farm khác trả 404. Khi kết quả chưa rõ, đọc cùng lệnh hoặc snapshot để khôi phục. Sau khi lệnh đã hủy/thất bại và lời mời mở lại, hành động mới dùng requestId mới.

## NPC ghé ruộng

Web hỏi lịch trong tab hiện tại khi người chơi ở ruộng của mình. Khi ví, số dư và lượt quả đều hợp lệ, backend lưu một thời điểm đến cách 6–12 giây theo run/vai trò (migration 014). Reload và các tab cùng phiên nhận cùng `offerId` và `arrivesAt`. Lượt B chỉ có lịch sau khi NPC đã nhận quả. Web đọc lại lịch lúc đến trước khi hiện NPC. Bấm NPC mở màn Quầy nông sản ở `#quay-nong-san`.

Đã bỏ qua hoặc hoàn thành thì không có lời mời mới trong cùng vòng. Sau khi người chơi có lệnh hoặc đã bỏ qua, họ có thể ghé lại quầy để xem trạng thái. Thao tác tại quầy dùng chung cơ chế kiểm tra giá, phiên, revision và giữ quả.

## Snapshot

Snapshot gồm run/revision/serverTime, role/stage, wallet/balance, một item, offer, offerDismissed, activeOrder, basket và pnl. `activeOrder` là lệnh hiện tại hoặc gần nhất của vai trò này, gồm trạng thái cuối để hiển thị sau reload. `offer: null` khi chưa đến lượt, đã bỏ qua, đang xử lý hoặc hoàn tất. `stage` giải thích tiến độ của cả vòng.

Sau lượt A, item thuộc `npc`, tồn NPC 1, giá vốn 1 USDC, doanh thu 0, `grossProfit: null`. Sau lượt B, item thuộc `basket`, mâm 3/3, badge có giá trị, tồn NPC 0, doanh thu 1,5 và lãi gộp 0,5 USDC. `balance: null` khi chưa lấy được số dư. `canAccept` và `unavailableReason` quyết định trạng thái nút.

PnL lấy từ các lượt đã áp dụng trong run. Phí sponsor cộng gas của các giao dịch và chữ ký gắn với lệnh của run. Các khoản nạp vốn, kích hoạt ví và kiểm tra adapter trước đó nằm ngoài PnL của run.

## Lệnh và khôi phục

| Trạng thái lệnh | Hiển thị |
|---|---|
| `awaiting_approval` | Chờ người dùng xác nhận. |
| `processing` | Backend đang xử lý. |
| `verifying` | Đang xác minh thanh toán, tiếp tục đọc cùng lệnh. |
| `succeeded` | Thanh toán đã xác minh và vật phẩm/badge/PnL đã áp dụng. |
| `failed` | Thất bại, hiển thị lỗi server và snapshot mới. |
| `cancelled` | Đã hủy xác nhận. |
| `expired` | Yêu cầu hết hạn. |

`order.payment` là kết quả provider chuẩn hóa. Với `requiredAction.type='redirect'`, web chuyển tới URL backend trả về sau thao tác nhận lời mời. Callback quay về FarmVerse và mở lại quầy cho cùng phiên. Reload quầy đọc snapshot để khôi phục cùng lệnh. `payment.status='confirmed'` cùng `order.status='processing'` tiếp tục hiện đang xử lý. Badge/thành công lấy từ snapshot sau khi lệnh `succeeded`.

Callback xác nhận đọc lại kết quả qua adapter rồi lưu lệnh, quả và huy hiệu trong cùng transaction PostgreSQL. Khi callback gián đoạn, đọc snapshot hoặc cùng order sẽ tiếp tục đối chiếu lệnh đã lưu.

Đọc lại lệnh mỗi 4 giây khi đang xử lý. Kiểm tra lịch NPC mỗi 8 giây khi vào ruộng của mình và còn lượt có thể thực hiện. Tab ẩn, đóng quầy hoặc đổi phiên dừng lượt đọc tương ứng. Khi trở lại tab, đọc lại trạng thái server.

## Lỗi

`TradeDemoErrorResponse` có dạng `{ error: { code, message, orderId? } }`. Dùng `TRADE_DEMO_ERROR_STATUS`. 401 xóa dữ liệu phiên và yêu cầu đăng nhập. 409 đọc lại snapshot trước hành động mới. 503 `PAYMENT_UNCONFIRMED` có thể kèm orderId, tiếp tục đọc cùng lệnh. Hiển thị message server trả về.

## Provider và lịch sử

Auth hiện tại xác minh Google và liên kết Farm. Gameplay nhận ví bằng `PaymentWallet`. `PaymentProvider` có `id`, `prepare(intent)`, `submit(intent, authorization)`, `getStatus(reference)`. Intent do server tạo, gồm order/idempotency, sender/receiver/sponsor và số tiền. Authorization là dữ liệu callback nội bộ backend. Adapter sở hữu SDK/contract/nonce/gas/chữ ký/receipt và trả `PaymentResult`. Gameplay giữ vật phẩm/mâm/badge/PnL.

Lịch sử T-64 bổ sung các field tùy chọn `assetDecimals`, `tokenContractId`, `feeAsset`, `feeDecimals`. Response native hiện tại trả 24, null, NEAR, 24. Response NEAR cũ thiếu metadata dùng 24 chữ số cho số tiền/phí. Adapter T-17 đã lưu và trả metadata USDC qua migration 012. Fixture ở `shared/fixtures/blockchain.mts` có 1,5 USDC và phí 0,0001 NEAR. [Thiết lập và bằng chứng adapter](NEAR_USDC_ADAPTER.md).
