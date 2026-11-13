# Bàn giao FarmVerse T-50, T-52, T-53 và T-54

**Antigravity** mở worktree `D:/Project/pet-project/farmverse-antigravity`, nhánh `feat/farm-engagement-polish`, từ `origin/develop` tại `0885198`. Đọc [quy tắc Collaborator](collaborator.md), [quy trình](workflow.md) và [Art Bible](../art/ART_BIBLE.md) trước khi sửa. Mục tiêu là cải thiện luồng Farm đã có của T-41, T-42 và T-44.

## Phạm vi và giao diện

| Task | Phạm vi ghi | Nghiệm thu |
|---|---|---|
| T-54 · Pet | `web/src/pets.ts`, `web/src/pets.css`, `image/pets/`, `art/source/pets/` | Bắt đầu bằng chó. Bổ sung clip đi bộ 10–12 frame, giữ khung 176×176 và mốc chân (88, 158). Đặt Pet cạnh đường gần ruộng, có bóng chân, dễ thấy trên desktop và mobile. Cả ba loài giảm tốc trước khi đổi hướng và dừng khi bật giảm chuyển động. Kiểm tra vuốt, kéo, đổi loài và phản ứng chặn Steal. Gửi clip chó mẫu, nguồn và thông số để chủ dự án duyệt trước khi thay sprite sản xuất. |
| T-53 · Nhiệm vụ | `web/src/missions.ts`, `web/src/missions.css` | Hàng nhiệm vụ có dấu tick theo tiến độ thật, có thể điều hướng bằng chuột hoặc bàn phím. Khi hàng khả dụng được bấm, đóng bảng rồi gọi callback tùy chọn thứ năm của `createMissions`, kiểu `(step: 'buy' \| 'plant' \| 'harvest' \| 'sell') => void`. Codex nối Tiệm hạt, Túi, ô đất và Kho trong `main.ts`. Chấm đỏ báo còn việc hoặc thưởng chưa nhận. Chấm báo trên nút thu gọn mobile chỉ cần khi cụm đang thu gọn. Giữ tiến độ 0/1, 0/3 và quà ngày cũ. |
| T-50 · Nhật ký | Chỉ khối `<dialog id="activity">` trong `web/index.html` và CSS của Nhật ký trong `web/src/style.css` | Codex nối bộ nhớ đệm, phân trang và đánh dấu đã đọc. Giữ `#activity`, `#activity-list`, `#activity-empty`, `#activity-feedback`, `#activity-more`. Thêm nút `type="button"` có ID `activity-new`, mặc định `hidden`, nhãn **Có hoạt động mới**. Chuẩn bị giao diện cho trạng thái đang tải, trống, lỗi và danh sách có sự kiện ghé thăm hoặc Pet chặn. |
| T-52 · Điểm danh | `web/src/missions.ts`, `web/src/missions.css` | Sau khi chủ dự án duyệt bảng quà, dùng giao diện dữ liệu T-51 do Codex chốt. Mỗi ngày hiện icon, tên/số lượng quà, trạng thái đã nhận, có thể nhận hoặc sắp tới. Ngày 7 có nhấn mạnh. Quà và HUD cập nhật sau response của nút điểm danh. |

Codex giữ `main.ts`, module đồng bộ nhật ký, `backend/`, `shared/`, dashboard và cấu hình root. Có thể làm T-53 với callback mẫu và T-50 với HTML mẫu. Mở T-52 khi Codex bàn giao hợp đồng T-51. T-54 là nhánh việc độc lập với API. Giữ commit riêng theo từng task để review độc lập.

## Bàn giao để Codex nghiệm thu

- Xác nhận task bắt đầu. Khi hoàn thành, trả branch và commit, liệt kê file, lệnh đã chạy, kết quả và phần còn chờ tích hợp.
- Chạy `pnpm --dir web build`. Kiểm tra Chromium tại 1280×800, 390×844 và 844×390, bàn phím với nhiệm vụ và giảm chuyển động với Pet. Đính kèm ảnh hoặc clip cho các trạng thái đã kiểm tra. Ghi rõ khi dùng dữ liệu mẫu.
- Codex review từng commit, nối luồng thật trên `develop` và nghiệm thu với PostgreSQL. Chủ dự án duyệt bản tích hợp trước khi đưa lên `main`.
