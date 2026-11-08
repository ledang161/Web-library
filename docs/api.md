# API UniBorrow

Tất cả response dữ liệu là JSON, lỗi `{message}`. HTTP 400: dữ liệu sai; 401: chưa đăng nhập; 403: thiếu quyền hoặc CSRF sai; 404: không tồn tại/không thuộc sở hữu; 409: xung đột trạng thái, tồn kho hoặc email.

## Phiên và CSRF

GET `/api/auth/me` trả `{user,csrfToken,today}`; user có thể null. Gọi trước khi gửi form. Cookie `ub_session` là HttpOnly, SameSite=Lax, Secure khi production. Không lưu token đăng nhập ở localStorage. Gửi `X-CSRF-Token` cho POST/PATCH/DELETE, kể cả đăng nhập/đăng ký/đăng xuất; Origin phải cùng origin. Sau đăng nhập/đăng ký lấy csrfToken mới từ response. Logout xóa phiên ở server.

| Method | Route | Quyền | Dữ liệu / kết quả |
|---|---|---|---|
| GET | /api/auth/me | Công khai | user, csrfToken, today Việt Nam |
| POST | /api/auth/register | Công khai + CSRF | name, email, password; chỉ student |
| POST | /api/auth/login | Công khai + CSRF | email, password |
| POST | /api/auth/logout | Phiên + CSRF | Kết thúc phiên |
| GET | /api/equipment | Công khai | Lọc q, category, status |
| GET | /api/equipment/:id | Công khai | Chi tiết thiết bị |
| POST | /api/borrow | Student + CSRF | equipmentId, quantity, borrowDate, returnDate, note tùy chọn |
| GET | /api/my/borrow-requests | Student | Lịch sử riêng |
| GET | /api/my/borrow-requests/:id | Student sở hữu | Một yêu cầu và toàn bộ details |
| PATCH | /api/my/borrow-requests/:id/cancel | Student sở hữu + CSRF | Chỉ pending → cancelled |
| GET | /api/borrow-requests | Admin | Danh sách đầy đủ |
| GET | /api/borrow-requests/:id | Admin | Chi tiết |
| GET | /api/stats | Admin | total và số yêu cầu theo mỗi trạng thái |
| PATCH | /api/borrow-requests/:id/status | Admin + CSRF | status: approved/rejected/borrowed/returned |
| POST | /api/equipment | Admin + CSRF | name, category, quantity, description, status |
| PATCH | /api/equipment/:id | Admin + CSRF | Sửa thiết bị |
| DELETE | /api/equipment/:id | Admin + CSRF | Có lịch sử: vô hiệu hóa; chưa có: xóa |

Danh sách yêu cầu trả mỗi mã đúng một lần, có `details` chứa equipment_id, equipment_name, quantity. Trạng thái: pending (chờ duyệt), approved (đã duyệt, chưa giữ kho), rejected (từ chối), borrowed (đang mượn), returned (đã trả), cancelled (đã hủy). Quy tắc chuyển trạng thái xem README.

Không nhận user_id từ trình duyệt khi tạo yêu cầu. Lấy chủ yêu cầu từ phiên. Số lượng mượn phải là số nguyên dương, không quá kho tại lúc tạo và lúc bàn giao. Ngày nhận dạng YYYY-MM-DD và tồn tại theo lịch. Mọi trường hợp trả/giao lặp trả 409 và không thay đổi kho. Bộ lọc giao diện quản trị có thể xử lý trên danh sách đã được kiểm tra quyền.

Khi PATCH có `quantity`, bắt buộc kèm `expectedQuantity` là tồn kho đã đọc trước khi sửa. Backend khóa hàng rồi so sánh; nếu kho đã thay đổi sẽ trả 409, yêu cầu tải lại thay vì ghi đè kết quả bàn giao/trả. PATCH chỉ đổi mô tả/tên/loại/trạng thái không cần gửi quantity. Giao diện tự gửi các trường đã thay đổi.
