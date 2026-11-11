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

Mở http://127.0.0.1:5174/?demo=offline để chơi bản demo có tiến độ riêng trong trình duyệt. Trên bản web tĩnh, thêm `?demo=offline` vào URL. Chế độ mặc định yêu cầu API và báo lỗi khi máy chủ gặp sự cố.
