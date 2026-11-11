# FarmVerse Web

Bản web dùng Phaser, Vite và Hono. Xem [luật và cách nghiệm thu gameplay](../docs/FARMVERSE_GAMEPLAY.md).

Chạy hai terminal từ thư mục gốc.

**Backend**

```powershell
pnpm --dir backend install --frozen-lockfile
pnpm --dir backend start
```

**Web**

```powershell
pnpm --dir web install --frozen-lockfile
pnpm --dir web dev
```

Mở http://127.0.0.1:5174/. Mua hạt dâu trong Tiệm hạt, chọn gieo trong Túi hạt và bấm ô trống. Hái khi cây chín sau 30 giây, bán dâu trong Kho rồi dùng Xẻng dọn ô. Mặc định backend dùng RAM. [Cách bật lưu PostgreSQL](../backend/README.md)

Mở http://127.0.0.1:5174/?demo=offline để thử gameplay mà không cần bật backend. Trên bản web tĩnh, thêm `?demo=offline` vào URL. Demo dùng RAM riêng trong mỗi tab. Tải lại trang bắt đầu một lượt thử mới.

Nút Bạn bè mở năm ruộng mẫu, mỗi ruộng có sáu ô cây chín. Có thể thăm ruộng và lấy một quả từ mỗi ô vào Kho offline. URL mặc định mở phiên Guest qua API.
