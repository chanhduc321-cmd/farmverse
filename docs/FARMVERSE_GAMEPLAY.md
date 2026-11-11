# FarmVerse — Gameplay

Vòng chơi hiện tại theo [FV-GAME-01](FARMVERSE_GAMEPLAY_AMENDMENT_01.md). Người chơi vào bằng Guest với 200 GOLD, 6 ô trống, cấp 1 và túi, kho trống.

1. Mở Tiệm hạt, chọn một trong 15 giống và mua 1–99 hạt. Số GOLD cần trả bằng số lượng nhân giá mỗi hạt.
2. Mở Túi hạt, chọn **Chọn gieo** rồi bấm ô trống. Mỗi lần gieo dùng 1 hạt và nhận 5 XP.
3. Theo dõi giai đoạn và thời gian còn lại. Dâu tây chín sau 30 giây. Các giống khác có mốc chín riêng trong bảng danh mục.
4. Bấm cây chín để thu hoạch 10–29 quả vào Kho và nhận 1 XP. Ô hiện **Cần dọn đất**.
5. Mở Kho, chọn nông sản và bán theo số lượng. Sau đó chọn **Xẻng** và bấm ô đã hái để dọn. Dọn thành công nhận 3 XP và mở lại ô cho vụ tiếp theo.

Lên cấp khi đạt `cấp hiện tại × 200 XP`. XP dư chuyển sang cấp tiếp theo. Bản thử RAM giữ tiến độ khi tải lại cùng phiên. Chế độ PostgreSQL lưu tiến độ qua khởi động lại backend. Khi Guest tạo tài khoản, tài khoản tiếp tục trên đúng ruộng đang chơi. [Cách bật lưu PostgreSQL](../backend/README.md) · [Luồng tài khoản](API.md#accounts-t-24)

Mở nút **Bạn bè** dạng icon ở góc trên bên phải Farm, cùng hàng với HUD tài khoản, Gold và XP. Danh sách kéo lên từ dưới, hiển thị avatar và tên người chơi. Nếu đang chơi Guest, nút này mở đăng nhập hoặc tạo tài khoản. Sau khi đăng nhập, mở lại danh sách, chọn **Bạn bè** hoặc **Cư dân**, rồi tìm và chọn người chơi để vào thẳng ruộng của họ. Bấm ô có chữ **Lấy 1 quả** để lấy. Chọn nút **Về nhà** ở góc dưới bên trái để quay lại. Kết bạn cần người nhận xác nhận. Mỗi lượt Steal lấy đúng 1 quả và để lại ít nhất 1 quả cho chủ ruộng. T-25 NPC tạm giữ. [Quyết định T-36](FARMVERSE_GAMEPLAY_AMENDMENT_01.md#thăm-ruộng-và-steal-t-36) · [Bảng công việc](../TASKS.md)

Chạy `pnpm --dir backend exec tsx --test test/farm.test.ts` để kiểm tra mốc của 15 giống, giá và tồn kho, XP, hành động lặp và vòng dọn ô.

Chọn **Tưới nước** hoặc **Bón phân** trên thanh công cụ rồi bấm cây đang lớn. Mỗi vụ dùng mỗi loại một lần. Nước miễn phí giảm 10% thời gian gốc, bón phân tốn 5 Gold và giảm 20%. Dùng cả hai giảm 30%. [Luật chăm cây T-46](FARMVERSE_GAMEPLAY_AMENDMENT_01.md#chăm-cây-t-46)

## Phạm vi MVP đã chốt

Chủ dự án chốt ngày 11/11/2026. Hoàn tất các task Farm, tài khoản, thăm ruộng/Steal, nhật ký/thông báo, hướng dẫn, phản hồi thao tác, art và Pet đang có trên dashboard. Bổ sung T-44 onboarding, streak và mission với ưu tiên cao để thu hút và giữ chân người chơi. Luật mission, streak và phần thưởng sẽ được duyệt trước khi triển khai. T-45 chia sẻ social là task cuối của MVP.

NEAR T-16–T-19 chỉ xử lý sau khi hoàn tất các task MVP đã chốt. T-25 NPC và phần Store của T-27 vẫn tạm giữ theo quyết định trước, chờ mở lại. [Thứ tự công việc](../TASKS.md#thứ-tự-xử-lý-hiện-tại)

## Nhiệm vụ và chuỗi ngày (T-44)

Chủ dự án duyệt ngày 11/11/2026. Mục tiêu vụ đầu hướng dẫn mua hạt, gieo, hái cây chín rồi bán ít nhất một quả trong Kho. Người chơi nhận **20 Gold** một lần sau khi hoàn thành. Nút **Nhiệm vụ** mở mục tiêu và báo khi có thưởng. Nút **Điểm danh** mở chuỗi ngày và tình trạng hôm nay. Cụm icon xếp ngang trên desktop, xếp dọc và thu gọn được trên mobile. Tour T-39 vẫn chỉ hiện một lần.

Mỗi ngày, hái ít nhất một ô và bán tổng cộng **3 quả** trong Kho để hoàn thành nhiệm vụ ngày và nhận **10 Gold**. Phần thưởng đã kiếm được vẫn chờ nhận khi sang ngày mới.

Người chơi bấm **Điểm danh hôm nay** để ghi một lượt mỗi ngày. Chuỗi điểm danh độc lập với nhiệm vụ ngày, hiển thị theo từng nhóm 7 ô với hình coin ở ô cuối. Ngày đổi lúc **00:00 giờ Việt Nam**. Bỏ qua một ngày làm đứt chuỗi, lần điểm danh kế tiếp bắt đầu lại từ một ngày. Chuỗi điểm danh bắt đầu từ lượt bấm đầu tiên.

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

Khi khách thực hiện một lượt Steal hợp lệ, Pet đủ năng lượng sẽ chạy ra chặn và quả vẫn thuộc vụ của chủ ruộng. Pet thiếu năng lượng sẽ đứng nhìn và khách lấy đúng 1 quả theo luật T-36.

Đề xuất cho Pet đi quanh nhà, vẫy đuôi khi được vuốt ve và phản ứng khi được cho ăn. Cần chốt cách nhận Pet, cách hồi năng lượng, ngưỡng đủ năng lượng và chi phí năng lượng cho mỗi lần chặn.
