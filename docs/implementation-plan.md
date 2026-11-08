# Kế hoạch hoàn thiện UniBorrow

Phạm vi: yêu cầu triển khai ngày 08/11/2026. Thực hiện trên nhánh codex/complete-uniborrow trong F:\Uniborrow, theo chỉ định người dùng; không push/merge.

## Thiết kế
- Giữ Express/CommonJS, MySQL/InnoDB và giao diện thuần. Phiên opaque lưu MySQL, cookie HttpOnly/SameSite, CSRF token; scrypt cho mật khẩu. Tài khoản cũ chỉ nâng cấp hash sau khi xác minh mật khẩu cũ thành công.
- Mỗi API lịch sử trả một yêu cầu với mảng details. Sinh viên chỉ thao tác dữ liệu sở hữu; quản trị kiểm tra role tại backend.
- approved không giữ kho. Khóa yêu cầu trước khi chuyển trạng thái, khóa thiết bị theo ID; rollback toàn bộ khi thất bại. Vô hiệu hóa thiết bị có lịch sử thay vì xóa.
- Ngày nghiệp vụ Asia/Ho_Chi_Minh; note bỏ qua trở thành chuỗi rỗng. Kho chỉnh sửa là số lượng hiện còn, không phải tổng tài sản.
- Giữ phong cách xanh hiện có, bổ sung form có label và xác nhận ngay trong trang, responsive.

## Thực hiện và kiểm chứng
1. Backend: auth/session/CSRF, validation, ownership, inventory, CRUD/stats.
2. Frontend: auth, tìm/lọc/chi tiết, mượn/lịch sử/hủy, admin đầy đủ.
3. Database: schema/seed, migration lặp an toàn, CLI admin; sao lưu và phục hồi thử trước migration database phát triển.
4. Tích hợp: node:test với MySQL thật và Chromium desktop/mobile, kiểm tra auth/quyền/ngày/đa chi tiết/cạnh tranh/rollback. Cập nhật README/API và audit dependency.
5. Review toàn bộ nhánh, sửa lỗi và chạy lại kiểm tra liên quan; không tự commit/push.

## Trọng tâm review
- CSRF khi chưa đăng nhập và sau rotate phiên.
- Hủy/duyệt đồng thời và giao/trả lặp.
- Rollback nhiều dòng và khóa kho khi quản lý thiết bị.
- Tài khoản cũ không mất mật khẩu; dữ liệu phát triển không bị reset.
- Các nút admin và hiển thị đầy đủ chi tiết trên điện thoại.
