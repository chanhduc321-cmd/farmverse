# T-17 · Adapter USDC testnet

`backend/src/payments/provider.ts` chọn provider qua `paymentProviderFor(farmId, providerId)`. Gameplay dùng `PaymentProvider` trong `shared/payments.mts`. Module NEAR giữ SDK, tài khoản, storage, NEP-366, NEAR Auth, MPC và receipt. [Route gameplay và cách tạo run](TRADE_DEMO_API.md).

## Cấu hình local

Node.js từ 22.22.2. Chạy migration 012 bằng `pnpm --dir backend migrate`. Trong tệp môi trường **backend** đặt:

```dotenv
NEAR_AUTH_CALLBACK_URL=http://localhost:3000/
NEAR_USDC_ENABLED=true
NEAR_TEST_SIGNING_SPONSOR_KEY=<server sponsor key>
NEAR_USDC_NPC_KEY=<server NPC key>
```

Callback phải thuộc allowlist của NEAR Auth client. Không chép khóa, provisioning JSON hoặc tệp môi trường vào frontend/Git. Adapter ghim RPC, token contract và mạng testnet. Sponsor là `farmverse-demo-payer.testnet`, NPC là `farmverse-demo-npc.testnet`.

Từ thư mục `backend/`:

```powershell
pnpm near:setup
pnpm near:setup --register
pnpm near:setup --fund-wallet <Google-wallet-B>
```

Lệnh đầu chỉ đọc. `--register` khởi tạo ví Google chưa tồn tại và đăng ký USDC cho NPC/các ví Google, sponsor trả phí. `--fund-wallet` chỉ nhận ví đã liên kết Google trong DB, nạp lên mức 1,5 USDC một lần và giữ tối thiểu 1 USDC ở NPC cho lượt A. Chạy lại dùng cùng mã cấp vốn, không nạp lặp sau khi người dùng đã tiêu tiền. Lượt demo mới có thể dùng `--seed-id <run-id>` do người vận hành chọn; mỗi mã cấp vốn áp dụng tối đa một lần. Trước khi giao dịch phải kiểm tra số dư on-chain.

Máy local đã có provisioning JSON được Git bỏ qua có thể thêm `--local-keys` để đọc hai khóa NPC/sponsor. CLI không in khóa hay token. Ví A/B lấy từ danh tính Google đã xác minh; các ví buyer/seller do server tạo trước đây chỉ là ví thử.

## Chu trình gọi

1. Backend gameplay giữ vật phẩm và tạo order bền trong DB, rồi tạo `PaymentIntent` với giá/ví do server quyết định. Mã chống lặp và order không đổi khi retry.
2. `prepare` kiểm tra asset, quyền ví, đăng ký token và số dư; lưu fingerprint cùng metadata USDC. Mỗi ví có tối đa một khoản chưa rõ kết quả. Cùng mã nhưng đổi nội dung bị từ chối.
3. NPC trả tiền: `submit(intent, null)` ký delegate bằng khóa NPC ở server rồi relay bằng sponsor. Người dùng trả tiền: `prepare` trả URL xác nhận trong `requiredAction`; trình duyệt chỉ điều hướng tới URL này.
4. `GET /api/account/payments/near/:paymentId/authorize` yêu cầu phiên đúng Farm, tạo state/nonce/PKCE và cookie HttpOnly 5 phút. Callback dùng cùng endpoint đăng nhập hiện có, phân biệt bằng state `pay-`.
5. Adapter xác minh issuer/audience, Google subject và từng byte delegate được duyệt. Khóa công khai và nonce/block height lưu trong DB để tái tạo đúng payload; token, code và PKCE verifier không lưu vào DB.
6. Chữ ký MPC được xác minh bằng khóa công khai của ví. Sponsor relay lệnh `ft_transfer` với deposit 1 yoctoNEAR. Backend lưu hash trước broadcast.
7. `getStatus(reference)` đọc lại cùng giao dịch. Nếu RPC gián đoạn ở bước MPC, dùng receipt chữ ký để tiếp tục cùng delegate. Nếu đã có hash khoản chuyển, chỉ đối chiếu hash đó. Chưa rõ kết quả vẫn `pending`.
8. Gameplay chỉ áp dụng quả/badge/PnL sau `confirmed`, bằng transaction và mốc áp dụng một lần ở T-57/T-58. Gas nằm ở log NEAR, không trừ vào giá USDC.

## Xác minh và log

Receipt phải đạt `FINAL`, đúng hash/sponsor, đúng một delegate gửi từ ví chi tiền tới contract Circle USDC, đúng một `ft_transfer`, người nhận và số tiền. Sự kiện `nep141/1.0.0/ft_transfer` phải thuộc receipt thành công của đúng contract và nằm trong cây receipt của giao dịch. Thành công của relayer riêng lẻ không xác nhận khoản USDC. Thiếu bằng chứng giữ pending; lỗi thực thi đã xác minh trả failed.

Migration 012 lưu `asset_decimals`, `token_contract_id` và bảng riêng `farm_near_usdc_payments` có RLS. API lịch sử trả USDC 6 chữ số, phí NEAR 24 chữ số. State OAuth chỉ lưu hash. Log không chứa access token, authorization code hay private key.

## Bằng chứng ngày 14/11/2026

- NPC đã nhận 20 USDC testnet từ faucet do chủ dự án thao tác.
- Đã đăng ký USDC cho ví Google đầu tiên bằng sponsor. Ví đó giữ nguyên 0 NEAR.
- Adapter trả 1 USDC thật từ NPC cho ví Google đầu tiên và xác minh `FINAL` cùng sự kiện FT. [Giao dịch NPC trả 1 USDC](https://testnet.nearblocks.io/txns/B1kVPohZhnhoj9oVQjPMNakDZtybs34XQuGH86dmWfN).
- Sau khoản thử, NPC có 19 USDC; ví Google có 1 USDC và 0 NEAR. Khoản thử adapter không gắn vật phẩm/PnL gameplay.
- B dùng danh tính Google thứ hai duyệt trả NPC 1,5 USDC. Adapter xác minh `FINAL` và sự kiện FT. [Giao dịch B trả 1,5 USDC](https://testnet.nearblocks.io/txns/5RwV1qMQH5uAddrBfDhi9iRCegX4GsKqcX9aszoqzwub). B vẫn có 0 NEAR. [Giao dịch chữ ký MPC](https://testnet.nearblocks.io/txns/6T3Xty22Voncv1BFpQZhSfW7q6RKL3GjZHKhR55yxNTm).
- Đã nạp lại B 1,5 USDC với seed `demo-first-round` để sẵn sàng cho gameplay. Sau các khoản thử và cấp vốn, NPC có 17,5 USDC, A có 1 USDC, B có 1,5 USDC; A/B đều 0 NEAR. Sponsor còn khoảng 9,954 NEAR.
- Còn vòng quả/badge/PnL gameplay sau tích hợp T-57/T-58. Hai khoản kiểm tra adapter và các khoản cấp vốn không tính vào PnL của vòng gameplay sau đó.
- 32 kiểm thử backend trên database QA, typecheck, build web/API và chạy lại migration 012 đều đạt. Kiểm tra qua HTTP local trả đúng lịch sử USDC/phí NEAR; route xác nhận từ chối phiên chưa đăng nhập.

Lệnh kiểm tra lại khoản trả NPC dùng cùng order/mã chống lặp:

```powershell
pnpm near:setup --smoke-payout <Google-farm-id>
```

Lần đầu gửi 1 USDC testnet; các lần sau đọc cùng giao dịch.

Để kiểm tra khoản người dùng trả 1,5 USDC, sau khi ví B đã có vốn:

```powershell
pnpm near:setup --smoke-purchase <Google-farm-id-B>
```

Mở URL xác nhận mà lệnh trả về trong phiên đang đăng nhập B. Chỉ sau khi B duyệt Google thì adapter mới gửi lệnh. Cùng attempt đọc lại cùng payment; nếu yêu cầu đã hết hạn/hủy, thêm `--attempt <new-id>` để tạo lượt thử mới. Khoản thử này cũng tách khỏi quả/PnL gameplay.

Tài liệu chuẩn: [Circle testnet contracts](https://developers.circle.com/stablecoins/usdc-contract-addresses#testnet), [NEP-141](https://github.com/near/NEPs/blob/master/neps/nep-0141.md), [NEP-366](https://github.com/near/NEPs/blob/master/neps/nep-0366.md).
