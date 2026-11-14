# FarmVerse — Gameplay

**Tên tiếng Anh:** FarmVerse · **Tên tiếng Việt:** Nông Trại Mộng Mơ

Vòng chơi hiện tại theo [FV-GAME-01](FARMVERSE_GAMEPLAY_AMENDMENT_01.md). Người chơi vào bằng Guest với 200 GOLD, 6 ô trống, cấp 1 và túi, kho trống.

1. Mở Tiệm hạt, chọn một trong 15 giống và mua 1–99 hạt. Số GOLD cần trả bằng số lượng nhân giá mỗi hạt.
2. Mở Túi hạt, chọn **Chọn gieo** rồi bấm ô trống. Mỗi lần gieo dùng 1 hạt và nhận 5 XP.
3. Theo dõi giai đoạn và thời gian còn lại. Dâu tây chín sau 30 giây. Các giống khác có mốc chín riêng trong bảng danh mục.
4. Bấm cây chín để thu hoạch 10–29 quả vào Kho và nhận 1 XP. Ô hiện **Cần dọn đất**.
5. Mở Kho, chọn nông sản và bán theo số lượng. Sau đó chọn **Xẻng** và bấm ô đã hái để dọn. Dọn thành công nhận 3 XP và mở lại ô cho vụ tiếp theo.

Lên cấp khi đạt `cấp hiện tại × 200 XP`. XP dư chuyển sang cấp tiếp theo. Bản thử RAM giữ tiến độ khi tải lại cùng phiên. Chế độ PostgreSQL lưu tiến độ qua khởi động lại backend. Khi Guest tạo tài khoản, tài khoản tiếp tục trên đúng ruộng đang chơi. [Cách bật lưu PostgreSQL](../backend/README.md) · [Luồng tài khoản](API.md#accounts-t-24)

Mở nút **Bạn bè** dạng icon ở góc trên bên phải Farm, cùng hàng với HUD tài khoản, Gold và XP. Danh sách kéo lên từ dưới, hiển thị avatar và tên người chơi. Nếu đang chơi Guest, nút này mở đăng nhập hoặc tạo tài khoản. Sau khi đăng nhập, mở lại danh sách, chọn **Bạn bè** hoặc **Cư dân**, rồi tìm và chọn người chơi để vào thẳng ruộng của họ. Bấm ô có chữ **Lấy 1 quả** để lấy. Chọn nút **Về nhà** ở góc dưới bên trái để quay lại. Kết bạn cần người nhận xác nhận. Mỗi lượt Steal lấy đúng 1 quả và để lại ít nhất 1 quả cho chủ ruộng. T-25 NPC tạm giữ. [Quyết định T-36](FARMVERSE_GAMEPLAY_AMENDMENT_01.md#thăm-ruộng-và-steal-t-36) · [Bảng công việc](../TASKS.md)

Chạy `pnpm --dir backend exec tsx --test test/farm.test.ts` để kiểm tra mốc của 15 giống, giá và tồn kho, XP, hành động lặp và vòng dọn ô.

Chọn **Tưới nước** hoặc **Bón phân** trên thanh công cụ rồi bấm cây đang lớn. Mỗi vụ dùng mỗi loại một lần. Nước miễn phí giảm 10% thời gian gốc, một bịch phân giảm 20%. Dùng cả hai giảm 30%. Mua phân trong Tiệm hạt với giá 5 Gold mỗi bịch. [Luật chăm cây T-46](FARMVERSE_GAMEPLAY_AMENDMENT_01.md#chăm-cây-t-46) · [Thao tác theo ô đất T-47](FARMVERSE_GAMEPLAY_AMENDMENT_01.md#thao-tác-theo-ô-đất-t-47)

## Phạm vi MVP đã chốt

Chủ dự án chốt ngày 11/11/2026. Hoàn tất các task Farm, tài khoản, thăm ruộng/Steal, nhật ký/thông báo, hướng dẫn, phản hồi thao tác, art và Pet đang có trên dashboard. Bổ sung T-44 onboarding, streak và mission với ưu tiên cao để thu hút và giữ chân người chơi. Luật mission, streak và phần thưởng sẽ được duyệt trước khi triển khai. T-45 chia sẻ social là task cuối của MVP.

Ngày 13/11/2026, chủ dự án đưa NEAR testnet gasless lên ưu tiên cao nhất, trước T-40 và T-45. T-25 NPC và phần Store của T-27 chờ quyết định mở lại. [Thứ tự công việc](../TASKS.md#thứ-tự-xử-lý-hiện-tại)

## Nhiệm vụ và chuỗi ngày (T-44)

Chủ dự án duyệt ngày 11/11/2026. Mục tiêu vụ đầu hướng dẫn mua hạt, gieo, hái cây chín rồi bán ít nhất một quả trong Kho. Người chơi nhận **20 Gold** một lần sau khi hoàn thành. Nút **Nhiệm vụ** mở mục tiêu và báo khi có thưởng. Nút **Điểm danh** mở chuỗi ngày và tình trạng hôm nay. Cụm icon xếp ngang trên desktop, xếp dọc và thu gọn được trên mobile. Tour T-39 vẫn chỉ hiện một lần.

Mỗi ngày, hái ít nhất một ô và bán tổng cộng **3 quả** trong Kho để hoàn thành nhiệm vụ ngày và nhận **10 Gold**. Phần thưởng đã kiếm được vẫn chờ nhận khi sang ngày mới.

Người chơi bấm **Điểm danh hôm nay** để ghi một lượt và nhận quà tương ứng trong cùng lần lưu Farm. Chuỗi điểm danh độc lập với nhiệm vụ ngày. Ngày đổi lúc **00:00 giờ Việt Nam**. Điểm danh ngày thứ 8 mở vòng quà mới và tiếp tục cộng độ dài chuỗi. Bỏ một ngày làm đứt chuỗi, lần điểm danh kế tiếp bắt đầu lại ở ngày 1.

Chủ dự án duyệt lịch quà T-51 ngày 13/11/2026.

| Ngày | Quà |
|---|---|
| 1 | 5 Gold |
| 2 | 1 hạt dâu tây |
| 3 | 5 Gold |
| 4 | 1 bịch phân |
| 5 | 10 Gold |
| 6 | 2 hạt dâu tây |
| 7 | 20 Gold |

Ruộng đã có chuỗi tiếp tục nhận ở ô tương ứng vào lần điểm danh hợp lệ tiếp theo. Những ô trước khi áp dụng bảng quà hiện **Đã điểm danh**. Ô đã được cấp quà hiện **Đã nhận**.

Tiến độ ghi cùng ruộng và chuyển sang tài khoản khi đăng ký từ Guest. Dữ liệu ruộng cũ bắt đầu ghi nhiệm vụ từ thao tác tiếp theo. Backend dùng giờ máy chủ và chỉ chấp nhận thao tác thành công, mỗi phần thưởng nhận đúng một lần.

## Đánh giá sức hút sau khi hoàn tất MVP

Sau khi hoàn tất và nghiệm thu các task MVP đã chốt, chấm lại sản phẩm theo góc nhìn người chơi casual trên thang 10. Chủ dự án yêu cầu ưu tiên độ hút khách. Chơi thử toàn bộ luồng từ người mới vào Farm, vụ đầu, tiến trình, thăm ruộng, Pet đến chia sẻ.

| Tiêu chí | Điểm tối đa | Cần quan sát |
|---|---|---|
| Sức hút trong 5 phút đầu | 3 | Người mới hiểu mục tiêu, làm được vụ đầu và tò mò muốn làm tiếp. Onboarding ngắn, giao diện và phản hồi hấp dẫn. |
| Vòng chơi và cảm giác tiến bộ | 3 | Trồng, chờ, hái, bán và phát triển có nhịp hợp lý, lựa chọn có ý nghĩa và kết quả dễ nhận ra. |
| Lý do quay lại | 2 | Mission, streak và chăm Pet tạo mục tiêu tiếp theo rõ ràng, phần thưởng phù hợp công sức. |
| Tương tác và chia sẻ | 1 | Ghé thăm, Steal, nhật ký và Pet tạo tình huống đáng nhớ. Người chơi có thành tích hoặc khoảnh khắc muốn chia sẻ. |
| Độ hoàn thiện trải nghiệm | 1 | Tài khoản, lưu tiến độ, thao tác chạm, bố cục, animation và âm thanh chạy ổn định. |

Điểm dựa trên bản tích hợp và bằng chứng chơi thử. Ghi rõ phần nhận xét về khả năng giữ chân còn cần kiểm chứng bằng dữ liệu người chơi thật. Báo lại điểm tổng, điểm từng mục và ba vấn đề ảnh hưởng sức hút lớn nhất còn tồn tại.

## Hướng dẫn vụ đầu (T-39)

Tour chỉ tự mở một lần trên ruộng mới trong trình duyệt. Ghi nhận đã xem ngay khi tour xuất hiện, nên tải lại hoặc mở tab mới cũng không chạy lại. Lớp làm tối và vùng bấm được làm nổi chỉ dùng khi lần đầu giới thiệu Tiệm hạt, Túi và Kho. Mở khu vực được giới thiệu sẽ gỡ lớp làm tối ngay. Các bước gieo, chờ chín, hái và dọn đất trả quyền thao tác về người chơi, chỉ nhấp nháy mục tiêu tiếp theo.

Mua hạt thành công trong tour tự đóng Tiệm hạt và đưa người chơi về ruộng để mở Túi. Mua thất bại giữ cửa sổ và hiện lý do. Ngoài tour, mua hạt tiếp tục giữ Tiệm hạt mở.

Bỏ qua, Escape, đóng cửa sổ đang hướng dẫn hoặc rời trang giữa tour sẽ kết thúc tour và lưu lựa chọn qua F5. Kết thúc tour xóa lời hướng dẫn, nhãn GỢI Ý, tooltip đang mở và nhấp nháy, kể cả sau F5. Không có nút mở lại tour. Bán hết nông sản thu hoạch hoàn tất tour.

Khung hướng dẫn có đuôi thoại manga, dùng nền xanh đậm, viền vàng và màu chữ cùng kiểu tooltip ô đất. Bố cục hỗ trợ điện thoại dọc và ngang. Người dùng giảm chuyển động vẫn thấy mục tiêu được đánh dấu.

## Pet giữ nhà (T-41)

Mỗi người chơi có một Pet cá nhân trong Farm để chăm sóc. Pet có cử động và biểu cảm vui, kèm thông báo nhẹ khi có sự kiện. Khi khách thực hiện Steal, Pet xuất hiện ngay trên ruộng và phản ứng với hành động đó.

Pet giữ nhà miễn phí. Ngày 14/11/2026, chủ dự án chốt xác suất chặn 50% cho mỗi lượt lấy quả hợp lệ. Khi bị chặn, khách thấy Pet phản ứng và dòng “Pet chặn!” tại ô. Khi thành công, khách thấy hiệu ứng +1, nhận một quả vào Kho và cây của chủ ruộng giảm một quả. Mỗi khách chỉ thử một lần trên mỗi ô/vụ. Backend lưu lượt thử, thay đổi tài sản và nhật ký trong cùng transaction.

Cho ăn, hồi năng lượng và luật chặn dựa trên năng lượng thuộc hướng phát triển sau. T-54 tiếp tục làm mượt bước đi và điều chỉnh vị trí mặc định của Pet.

### Sprite chó

Các sheet gốc do chủ dự án gửi nằm trong [thư mục nguồn](../art/source/pets/dog). Bản dùng trong game là PNG nền trong suốt tại `image/pets/dog/`. Mỗi frame 176×176, xếp ngang theo thứ tự gốc, mốc đặt chân ở (88, 158).

| Trạng thái | Tệp | Số frame | Nơi xem |
|---|---|---|---|
| Đứng chớp mắt | `dog-idle.png` | 7 | Màn tải Farm và demo Phaser |
| Nằm ngủ | `dog-sleep.png` | 6 | Demo Phaser trong `.local/animation` |
| Đói | `dog-hungry.png` | 7 | Demo Phaser, chờ chốt luật đói và cho ăn |
| Chặn Steal | `dog-guard.png` | 7 | Farm khi API xác nhận Pet chặn; cắt từ sheet chủ dự án gửi, nền trong suốt, mốc chân (88, 158) |

### Sprite mèo

Các [sheet gốc](../art/source/pets/cat) do chủ dự án gửi. Các sprite có nền trong suốt, mỗi sheet 1024 × 128 px gồm 8 frame 128 × 128 px với mốc đặt chân (64, 116), tương ứng origin Phaser `(0.5, 0.90625)`. Xem chuyển động trong demo Phaser tại `.local/animation/index.html`.

| Trạng thái | Sprite | Phát trong demo |
|---|---|---|
| Ngủ | [cat-sleep.png](../image/pets/cat/cat-sleep.png) | Lặp ở 4 fps |
| Vui vẻ | [cat-happy.png](../image/pets/cat/cat-happy.png) | Một lần ở 8 fps, dừng ở tư thế đứng |
| Chống trộm | [cat-guard.png](../image/pets/cat/cat-guard.png) | Một lần ở 8 fps, giữ tư thế cảnh giác |
| Đói | [cat-hungry.png](../image/pets/cat/cat-hungry.png) | Một lần ở 8 fps, chờ chốt luật đói và cho ăn |
| Đi bộ | [cat-walk.png](../image/pets/cat/cat-walk.png) | Lặp ở 8 fps. Trong Farm, nhịp chân chậm lại khi mèo đổi hướng. |

### Sprite ngỗng

Các [sheet gốc](../art/source/pets/goose) do chủ dự án gửi. Ba dải PNG nền trong suốt tại `image/pets/goose/` có 8 frame 128 × 128 px mỗi dải, với mốc chân (64, 116).

| Trạng thái | Sprite | Nơi dùng |
|---|---|---|
| Đi bộ | [goose-walk.png](../image/pets/goose/goose-walk.png) | Farm và demo Phaser |
| Cúi mổ | [goose-peck.png](../image/pets/goose/goose-peck.png) | Farm khi chạm Pet và demo Phaser |
| Chặn Steal | [goose-guard.png](../image/pets/goose/goose-guard.png) | Farm khi API xác nhận Pet chặn và demo Phaser |

### Bản thử tương tác trong Farm

Chó xuất hiện mặc định khi vào ruộng. Nút dấu chân cho phép đổi sang mèo hoặc ngỗng. Pet đi qua lại liên tục quanh vị trí của nó. Chỗ mặc định là góc dưới bên trái, phía trên thanh công cụ. Khi góc dưới sát ô đất, Pet chuyển lên dưới bảng hồ sơ. Chạm hoặc vuốt nhanh để Pet phản ứng vui và hiện bong bóng thoại. Giữ khoảng ¼ giây rồi kéo để đặt Pet ở một chỗ trống. Pet tiếp tục đi lại sau khi được thả và về góc nếu thả lên ô đất, HUD hoặc thanh công cụ. Kích thước khung hình Pet là 90 px trên điện thoại, 100 px trên màn hình trung bình và 120 px trên desktop lớn. Pet đứng yên khi bật giảm chuyển động. Loài đã chọn lưu trong PostgreSQL; vị trí kéo chỉ áp dụng cho phiên hiện tại.

Loài được backend lưu cùng tiến độ Farm, giữ qua tải lại và đăng nhập. Vị trí kéo tiếp tục chỉ áp dụng cho phiên hiện tại. Chó dùng `dog-happy.png`, gồm 7 frame vui mừng. Mèo và ngỗng phát sprite đi bộ khi di chuyển. Khi được chạm, mèo phát clip vui mừng, ngỗng cúi mổ rồi quay lại đi bộ. Cả ba loài phát clip chặn và bong bóng thoại khi API xác nhận kết quả; giảm chuyển động chỉ hiện thông báo.
