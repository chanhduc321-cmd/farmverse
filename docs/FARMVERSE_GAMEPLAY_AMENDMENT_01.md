# FV-GAME-01 — Vòng chơi theo giống cây

**Trạng thái** — Chủ dự án duyệt vòng trồng bán ngày 10/11/2026. Các luật dưới đây thay phần gameplay C01 tương ứng. T-25 NPC tạm giữ. Quyết định về quyền thăm và danh sách người chơi được ghi ở phần T-36.

Vòng chơi đích là mua hạt → chọn giống trong túi → gieo → đợi cây qua từng giai đoạn → thu hoạch → bán trong kho → dọn đất để gieo lại. Giống khác nhau về giá hạt, giá bán và thời gian chín. Tiến độ dài hạn đến từ XP, cấp và việc phát triển nhiều giống trên sáu ô.

## Luật vòng trồng bán

| Phần | Hành vi đích | Tác động đến hợp đồng |
|---|---|---|
| Bắt đầu | 200 GOLD, cấp 1, 0 XP, 6 ô trống, túi hạt và kho trống. Luồng Guest dùng cùng luật với tài khoản. | Thay cấu hình C01 0 GOLD, 2 ô mở và 4 ô khóa. Mốc mở ô 3 không còn là mục tiêu nghiệm thu. |
| Shop hạt | Hiển thị đủ 15 giống, giá hạt và cấp ghi trên thẻ. Mua 1–99 hạt/lần, trừ đúng số GOLD và thêm đúng số hạt vào túi. Cấp trên thẻ là thông tin tham khảo. | Thay gieo miễn phí bằng chi phí hạt và thay C01-AC-05 bằng kiểm tra giao dịch đủ số dư. |
| Túi và gieo | Chọn giống đang có trong túi. Bấm ô trống trừ 1 hạt, ghi thời điểm gieo và cộng 5 XP. | API giữ quyền quyết định hạt và trạng thái ô. |
| Sinh trưởng | Mỗi giống có từ 4 đến 6 frame sau lúc gieo. Mốc vào frame thứ k là `unitTime × k × (k + 1) / 2` giây. Frame cuối đánh dấu chín. Dùng mốc thời gian máy chủ cho cả lúc đang chơi và sau tải lại. | Thay thời gian chín 10 giây bằng cấu hình từng giống. |
| Thu hoạch và dọn | Từ mốc chín, mỗi vụ có sản lượng cố định 10–29 quả của giống đó. Hái chuyển số quả của vụ vào kho, cộng 1 XP và đưa ô sang trạng thái cần dọn. Dùng Xẻng để dọn, cộng 3 XP rồi ô mới trống. | Kho Farm lưu số lượng theo từng giống. NPC C02 dùng trực tiếp Dâu tây và Ngô trong kho theo T-25. |
| Kho và bán | Chọn nông sản trong kho, nhập số lượng tối đa 999 và trong giới hạn đang sở hữu. Cộng GOLD bằng số lượng nhân đơn giá. Số lượng 0 giữ nguyên trạng thái. | Thay nút bán từng lúa của Farm bằng bán theo lô trong Kho. NPC C02 là luồng giao dịch riêng. |
| XP và cấp | Ngưỡng lên cấp bằng cấp hiện tại nhân 200 XP. Lấy phần XP vượt ngưỡng sang cấp kế tiếp. | Thêm tiến trình theo XP. |
| Thăm ruộng | Tài khoản đăng nhập có thể thăm ruộng của mọi tài khoản có tên người chơi. Chọn người từ danh sách Bạn bè hoặc Cư dân. | T-36 triển khai quyền thăm, kết bạn và Steal theo luật bên dưới. |
| Lưu tiến độ | Lưu hồ sơ, số dư, XP, túi, kho, ô và thời điểm gieo. Nghiệm thu trên PostgreSQL sau tải lại và khởi động lại backend ở T-29. | Bản thử dùng RAM. T-24 phụ trách hồ sơ và phiên người chơi. |

## Chăm cây (T-46)

Chủ dự án duyệt ngày 11/11/2026. Tưới nước miễn phí giảm 10% thời gian sinh trưởng gốc. Bón phân giảm 20% thời gian gốc và trừ 5 Gold khi dùng thành công. Mỗi loại dùng một lần trên mỗi vụ và chỉ dùng trên cây đang lớn.

Dùng cả hai cộng dồn giảm 30%. Nếu thời gian đã qua đủ để chín theo mốc mới, cây chín ngay. Ví dụ Dâu tây cần 30 giây, còn 27 giây khi tưới, 24 giây khi bón hoặc 21 giây khi dùng cả hai, tính từ lúc gieo. Lưu lượt chăm theo vụ để giai đoạn, thời gian chín và khả năng thu hoạch hoặc lấy quả đồng nhất ở ruộng mình và ruộng khách.

## Danh mục và mốc chín

Giá mua tính theo GOLD mỗi hạt. Giá bán tính theo GOLD mỗi quả. Thời gian chín là tổng số giây kể từ lúc gieo theo công thức trên.

| ID | Tên | Số frame sau gieo | Đơn vị (giây) | Chín (giây) | Mua | Bán | Cấp hiển thị |
|---:|---|---:|---:|---:|---:|---:|---:|
| 1 | Dâu tây | 5 | 2 | 30 | 10 | 20 | 1 |
| 2 | Ngô | 5 | 12 | 180 | 15 | 30 | 1 |
| 3 | Củ cải trắng | 4 | 15 | 150 | 18 | 35 | 1 |
| 4 | Cà rốt | 4 | 16 | 160 | 19 | 37 | 1 |
| 5 | Khoai lang | 5 | 18 | 270 | 20 | 40 | 2 |
| 6 | Cà tím | 5 | 19 | 285 | 22 | 42 | 2 |
| 7 | Cà chua | 5 | 20 | 300 | 24 | 44 | 2 |
| 8 | Đậu xanh | 5 | 22 | 330 | 26 | 46 | 3 |
| 9 | Ớt | 5 | 24 | 360 | 28 | 48 | 3 |
| 10 | Bí đỏ | 5 | 26 | 390 | 30 | 50 | 4 |
| 11 | Táo | 6 | 28 | 588 | 33 | 55 | 4 |
| 12 | Dưa hấu | 5 | 30 | 450 | 35 | 57 | 5 |
| 13 | Chuối | 6 | 32 | 672 | 37 | 60 | 5 |
| 14 | Đào | 5 | 34 | 510 | 38 | 62 | 6 |
| 15 | Dứa | 6 | 36 | 756 | 39 | 64 | 6 |

ID 3 và 4 chín ở mốc thứ tư. Loader dùng ảnh `5.png` đã có của hai giống này làm sprite chín. ID 5 dùng tên Khoai lang. T-28 đối chiếu ảnh thực tế để giữ đúng giống và vai trò của ảnh hạt, từng frame, quả trong kho và cây cần dọn.

## Giao dịch với NPC

Chủ dự án duyệt Dâu tây (ID 1) cho loại thường và Ngô (ID 2) cho loại vàng trong C02. Mỗi giao dịch chuyển một đơn vị của đúng giống giữa Kho và NPC. Giá cơ sở là 10 và 30 Gold. Giá NPC bán tối thiểu là 30 và 90 Gold, cao hơn cả báo giá NPC mua tối đa và giá bán trong Kho của cùng giống.

Giới hạn nhận hàng từ NPC của C02 tính tổng Dâu tây và Ngô trong Kho. Người chơi mua thêm một đơn vị từ NPC khi tổng đang dưới 10. Thu hoạch tiếp tục cộng sản lượng của vụ vào Kho theo luật ở trên. [API giao dịch](API.md#merchant-interface-for-t-25)

## Thăm ruộng và Steal (T-36)

Chốt ngày 11/11/2026. Người chơi đăng nhập có thể thăm ruộng của mọi tài khoản có tên người chơi. Có hai danh sách **Bạn bè** và **Cư dân**. Nút **Tìm kiếm** nằm ở đầu danh sách đang mở và tìm theo tên người chơi trong danh sách đó. Chọn một người để mở trực tiếp cảnh Farm của họ, dùng nền và các ô cây của chủ ruộng. Khách bấm ngay ô cây có thể lấy quả. Nút **Về ruộng mình** đưa người chơi trở lại ruộng của mình.

Hai người xuất hiện trong danh sách **Bạn bè** của nhau sau khi người nhận xác nhận lời mời.

Mỗi khách được lấy đúng **1 quả** một lần trên mỗi ô trong mỗi vụ. Chỉ lấy được khi cây đã chín và còn ít nhất **2 quả**, để chủ ruộng luôn còn tối thiểu **1 quả**. Quả vào Kho của khách và được trừ khỏi phần chủ ruộng sẽ thu hoạch. Hai lượt đến đồng thời khi cây còn 2 quả chỉ có một lượt thành công.

Chủ dự án duyệt demo offline ngày 11/11/2026. Trong `?demo=offline`, người chơi thấy năm bạn mẫu, mỗi ruộng có sáu ô cây đã chín. Có thể thăm ruộng và lấy một quả mỗi ô. Demo dùng RAM trong tab, tải lại để bắt đầu lượt thử mới. Phiên Guest qua API dùng URL mặc định.

## Nghiệm thu

- Với hồ sơ mới, mua hạt dâu bằng 200 GOLD ban đầu, chọn hạt, gieo, thấy từng frame ở 2, 6, 12, 20 và 30 giây, hái, bán và dọn đất để gieo lại.
- Với đồng hồ và số ngẫu nhiên kiểm soát được, kiểm tra mốc frame của cả 15 giống, biên 10 và 29 quả, XP, dọn trước thu hoạch, thao tác lặp và chặn bán quá kho. Kiểm tra số dư và tồn kho sau mỗi lần mua, gieo, hái và bán.
- Sau khi mở lại phiên, đối chiếu số dư, XP, túi, kho và mọi ô đang lớn hoặc cần dọn. Kiểm tra lưu qua khởi động lại backend sau khi T-29 tích hợp.
- Chạy vòng đầy đủ trên bản tích hợp desktop và điện thoại, xác nhận người chơi thấy được công cụ đang chọn, mốc chín, giá và phản hồi khi thao tác.
