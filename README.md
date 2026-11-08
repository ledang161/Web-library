# UniBorrow

Website mượn – trả thiết bị học tập, dùng Node.js/Express, MySQL 8 và HTML/CSS/JavaScript thuần.

## Cài đặt

Yêu cầu Node.js 22 trở lên, MySQL 8.0.16 trở lên và npm. Trên PowerShell, tại thư mục dự án:

```powershell
npm ci
Copy-Item .env.example .env
```

Sửa `.env` bằng thông tin MySQL trên máy. Không đưa `.env` lên Git. Tạo database UTF-8 trong Workbench nếu chưa có:

```sql
CREATE DATABASE uniborrow CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
```

Tài khoản ứng dụng cần quyền đọc/ghi; tài khoản chạy migration cần thêm quyền CREATE/ALTER. Với môi trường cục bộ có thể dùng tài khoản cấu hình sẵn. `PORT` mặc định 3000, `APP_ORIGIN` phải khớp địa chỉ truy cập (ví dụ http://localhost:3000). Khi production, dùng HTTPS, NODE_ENV=production; cookie Secure chỉ gửi qua HTTPS.

```powershell
npm run migrate
npm run seed
npm run create-admin
npm start
```

Mở http://localhost:3000. `npm run dev` tự khởi động lại khi sửa backend. Trang sinh viên ở `/`, trang quản trị `/admin`. Seed chỉ thêm thiết bị giả, không tạo mật khẩu Admin mặc định. CLI Admin yêu cầu tên, email và mật khẩu riêng; không đặt mật khẩu trong lệnh hoặc commit. Xem hướng dẫn cụ thể của CLI trước khi tạo tài khoản trên database đã có.

## Quy tắc

- Đăng ký công khai chỉ tạo sinh viên. Sinh viên chỉ xem và hủy yêu cầu của mình.
- pending → approved/rejected; chủ yêu cầu pending → cancelled; approved → borrowed; borrowed → returned.
- **Đã duyệt chưa giữ thiết bị.** Chỉ bàn giao mới trừ kho. Khi trả cộng lại kho. Mỗi lần xử lý là transaction; thiếu một dòng sẽ hoàn tác toàn bộ.
- Ngày hợp lệ theo lịch, ngày mượn không trước ngày hiện tại tại Việt Nam (Asia/Ho_Chi_Minh), ngày trả không trước ngày mượn.
- Ghi chú tùy chọn, tối đa 2.000 ký tự. Giao diện gửi một loại thiết bị mỗi yêu cầu; lịch sử hỗ trợ nhiều dòng có sẵn.
- Số lượng khi sửa thiết bị là **số hiện còn trong kho**. Thiết bị có lịch sử được vô hiệu hóa khi xóa để giữ quan hệ và lịch sử. Không đổi chính sách giữ chỗ theo ngày.
- Tài khoản cũ dùng mật khẩu rõ được xác minh rồi băm lại sau lần đăng nhập đúng đầu tiên; không reset mật khẩu. Không hiển thị hoặc xuất mật khẩu trong API.

## Kiểm thử

```powershell
npx playwright install chromium
npm run test:api
npm run test:browser
npm test
npm audit
```

Kiểm thử dùng MySQL thật với thông tin kết nối từ `.env`, tự tạo database tên bắt đầu `uniborrow_test_` và dữ liệu giả; cần quyền CREATE/DROP DATABASE cho tài khoản chạy test. Chỉ database do lần test đó tạo bị xóa khi kết thúc. Không chạy test với dữ liệu phát triển. Browser test dùng Chromium thật (desktop và điện thoại), không mock API. Ảnh kết quả nằm trong `test-results/` và không được đưa vào Git.

## Database và sao lưu

`db/schema.sql` là cấu trúc thiết lập mới. Migration có thể chạy lại, không DROP/TRUNCATE dữ liệu. Trước khi chạy migration trên database đang dùng, tạo backup và kiểm tra phục hồi vào database riêng. Backup chứa dữ liệu nhạy cảm: lưu ngoài Git, chỉ người có quyền mới được đọc. Không restore đè database phát triển.

Chi tiết API xem [docs/api.md](docs/api.md), thiết kế/kiểm chứng xem [docs/implementation-plan.md](docs/implementation-plan.md).

### Sao lưu và phục hồi có kiểm soát

```powershell
npm run backup
node scripts/restore.js "C:\Users\TEN_BAN\.uniborrow-backups\uniborrow-TIMESTAMP.json" uniborrow_restore_kiemtra
```

`backup` tự phục hồi thử, so sánh SHA-256 dữ liệu từng bảng, rồi chỉ dọn database kiểm chứng do nó vừa tạo. Bản sao lưu nằm trong thư mục `.uniborrow-backups` của tài khoản Windows, ngoài repository. Lệnh `restore` chỉ tạo database **mới** bắt đầu `uniborrow_restore_`, từ chối ghi đè database đã tồn tại. Sau phục hồi, kiểm tra nội dung bằng Workbench trước khi chủ động thay đổi DB_NAME. Không chạy các lệnh xóa database phát triển.

### Quyết định tương thích

Đăng ký dùng mật khẩu 8–128 ký tự; CLI Admin yêu cầu 10–128 ký tự. CLI từ chối email đã có để không tự đổi quyền hoặc mật khẩu. Chưa tạo Admin trên database đang dùng: chạy `npm run create-admin` và tự chọn thông tin đăng nhập. Migration bổ sung bảng `sessions`, CHECK kho không âm, số lượng chi tiết dương và thứ tự ngày; không đổi tài khoản, lịch sử hoặc lượng kho hiện có.

Sửa kho dùng kiểm tra `expectedQuantity`: nếu số lượng đã đổi sau lúc mở form, lưu sẽ bị từ chối (409). Đóng form, tải lại danh sách và mở lại thiết bị trước khi sửa. Thay đổi mô tả/tên không gửi lại số lượng cũ.

Phục hồi chỉ dùng bản sao lưu nội bộ đáng tin cậy: file JSON chứa câu lệnh tạo bảng. Khi production sau **một** reverse proxy HTTPS đáng tin cậy, có thể đặt TRUST_PROXY=true; không bật nếu cho phép truy cập trực tiếp từ bên ngoài.
