# Kết quả kiểm chứng — 08/11/2026

Nhánh: codex/complete-uniborrow. Baseline: 9186e39. Chưa commit/push/merge.

- npm ci --ignore-scripts --no-fund: thành công.
- npm test lần cuối: 12/12 đạt; không skip, không mock MySQL/API. Chromium thật desktop/375px, tạo tài khoản/đăng nhập sai-đúng/logout, mượn, lịch sử nhiều dòng, hủy, toàn bộ nút duyệt/từ chối/giao/trả, CRUD và vô hiệu hóa thiết bị có lịch sử. Không tràn ngang ở375px, không pageerror.
- Kiểm thử API MySQL: CSRF/401/403/ownership, hash và nâng cấp legacy đúng mật khẩu; ngày không tồn tại/quá khứ/thứ tự ngày, note bỏ qua/rỗng/sai kiểu, số lượng sai/vượt kho, trạng thái sai/lặp, hủy-duyệt đồng thời, cạnh tranh kho, trả đồng thời, rollback nhiều dòng, thống kê không trùng, chỉnh kho từ form cũ trả409.
- npm audit: 0 vulnerabilities. Cập nhật qs và body-parser trong phạm vi tương thích; không dùng npm audit fix --force.
- Kiểm tra cú pháp app và JS frontend: đạt.
- Rà soát độc lập và rà soát lại bản sửa: không còn phát hiện chặn bàn giao.

## Dữ liệu phát triển

Đã sao lưu ngoài repository trong thư mục .uniborrow-backups của tài khoản Windows. Đã phục hồi kiểm chứng vào database riêng, so sánh SHA-256 từng bảng rồi dọn database phục hồi thử. Chạy migration hai lần thành công. Đối chiếu dữ liệu bốn bảng cũ trước/sau bằng nội dung từng hàng: users1, equipment3, borrow_requests5, borrow_details5; không thay đổi dữ liệu.

Bổ sung sessions và ba CHECK ràng buộc kho không âm, chi tiết dương, thứ tự ngày. Không tạo Admin, không sửa mật khẩu/tài khoản hiện có. Tài khoản legacy chỉ băm sau khi người dùng đăng nhập đúng.

## Giới hạn

Không kiểm thử tải lớn hoặc triển khai HTTPS công khai. Phiên cũ cổng3000 được giữ nguyên; cần dừng và chạy npm start lại để dùng mã mới. Khởi động trên cổng bị chiếm đã được kiểm chứng thoát1 với EADDRINUSE, không báo thành công giả. Lệnh chạy npm start riêng bị môi trường công cụ chặn; server mới đã được chạy thực tế trên cổng riêng qua bộ kiểm thử Chromium/MySQL.
