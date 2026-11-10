# HappyFarm Web

Bản HappyFarm chạy trên trình duyệt với Phaser 3, TypeScript, Vite và Hono. Web dùng ảnh trong thư mục `image/`. Backend đọc giá, cấp mở khóa và thời gian lớn từ 15 file `crop.txt` gốc. Mỗi trình duyệt có một vườn khách. Hono lưu vườn trong RAM và tạo vườn mới sau khi server khởi động lại.

Mở hai terminal từ thư mục gốc của bản clone.

**Terminal 1**

```powershell
pnpm --dir backend install --frozen-lockfile
pnpm --dir backend start
```

**Terminal 2**

```powershell
pnpm --dir web install --frozen-lockfile
pnpm --dir web build
pnpm --dir web preview
```

Mở [HappyFarm local](http://127.0.0.1:5195/). Mua dâu tây ở Tiệm hạt, chọn trong Túi hạt và bấm một ô để gieo. Dâu chín sau 30 giây. Chọn Thu hoạch để hái, bán trong Kho và dùng Xẻng để dọn ô.
