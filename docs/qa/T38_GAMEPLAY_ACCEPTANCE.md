# Nghiệm thu gameplay Farm T-38 và T-26

Nghiệm thu ngày 11/11/2026 trên worktree tích hợp `develop`. Đối chiếu với FV-GAME-01 và các quyết định về tài khoản, thăm ruộng, nhật ký và nhiệm vụ đã duyệt. Chạy Chromium với API thật và PostgreSQL riêng.

| Hạng mục | Bằng chứng | Kết quả |
|---|---|---|
| Ruộng mới | Ba phiên Guest bắt đầu với 200 Gold, 0 XP, cấp 1, sáu ô trống và ba ô khóa hiển thị trên Farm. | Đạt |
| Danh mục và ảnh | Đối chiếu đủ 15 dòng API với bảng FV-GAME-01 về tên, giá, số frame, giờ chín và cấp tham khảo. 121 ảnh PNG được phục vụ đúng, gồm frame chín riêng của ID 3 và 4. | Đạt |
| Sinh trưởng và thu hoạch | Chạy 30 vụ kiểm soát đồng hồ và số ngẫu nhiên, kiểm tra sát từng mốc frame, biên 10 và 29 quả, hái trước giờ và hái lặp. Save cũ giữ sản lượng ổn định. | Đạt |
| Mua bán và XP | Đối chiếu giá từng giống, số hạt và quả, giới hạn mua 99/bán 999, chặn bán vượt kho và dọn trước khi hái. Kiểm tra cộng 5 XP khi gieo, 1 khi hái, 3 khi dọn và XP dư khi lên cấp. | Đạt |
| Vòng chơi trên UI | 1280×800, 390×844 và 844×390 mua hai hạt Dâu tây, gieo, đợi chín, hái, bán ba quả, dọn và gieo lại. Kết thúc với 240 Gold, 14 XP và ô đang lớn. | Đạt |
| Chạm lại sau khi đổi công cụ | Tái hiện mobile ngang gửi click có detail 2 sau khi dọn rồi chọn hạt. Sau sửa, gieo mới gửi đúng một yêu cầu. Click lặp khi chưa chọn công cụ lại bị chặn. Kiểm tra chạm thật ở 844×390. | Đạt |
| Lưu ruộng và tài khoản | Snapshot sau gieo lại khớp sau F5 và restart backend. Đăng ký từ Guest giữ nguyên ruộng, Gold, XP, tồn kho và tiến trình. Đăng nhập từ phiên khác mở đúng snapshot. | Đạt |
| Thăm ruộng, Steal và nhật ký | Dùng bằng chứng nghiệm thu T-36 và T-42 cùng kiểm thử hồi quy PostgreSQL. Lượt thành công chuyển đúng một quả, chặn lượt lặp và ghi đúng nhật ký. Chủ ruộng giữ tối thiểu một quả. | Đạt |
| Nhiệm vụ và streak | Chạy kiểm thử hồi quy T-44 về điều kiện, đổi ngày và nhận thưởng một lần. | Đạt |
| Báo giá NPC vòng đầu | Báo giá đầu hết hạn sau 20 giây. Dâu tây cần 30 giây từ lúc gieo. Theo dõi khi mở lại T-25. | Tạm giữ theo quyết định chủ dự án |

Backend typecheck, build web và 13 kiểm thử Farm, NPC, nhật ký và tiến trình đạt. Kết luận áp dụng cho vòng Farm theo phạm vi đang mở. [Sổ lỗi](../../BUGS.md) · [Dashboard](../../TASKS.md)
