# HƯỚNG DẪN CHUYỂN UNIBORROW SANG LAPTOP

Ngày bàn giao: 09/11/2026 (Việt Nam). Chỉ sử dụng **một agent**, không tạo hoặc giao việc cho sub-agent.

## 1. Mốc mã nguồn và trạng thái Git

- Repository: https://github.com/ledang161/Web-library
- Nhánh tiếp tục: `codex/complete-uniborrow`.
- Commit mã nguồn ứng dụng đã triển khai và kiểm thử: `aa5950dd2461f56bb6619cae92fae5e4234dc72e`.
- Tài liệu này được bổ sung bằng commit bàn giao tiếp theo; lấy chính xác bằng `git log -1 --format="%H %s" -- HUONG_DAN_CHUYEN_MAY.md`. Mã commit cuối cùng cũng được ghi trong file `BAN_GIAO.txt` chuyển riêng và báo trong chat.
- Khi kiểm tra, GitHub main đã có merge `e0f96d9` của PR #1; đó là trạng thái có sẵn. Lần bàn giao này chỉ push nhánh làm việc, không merge vào main.
- Trước bàn giao không có thay đổi tracked chưa commit. Có 229 file chưa theo dõi trong `output/` và `report-work/`: báo cáo Word, script dựng báo cáo, PDF và ảnh trung gian. Giữ nguyên trên desktop và chuyển riêng bằng ZIP; không đưa vào commit mã nguồn do chưa kiểm tra nội dung nhạy cảm trong các báo cáo.

## 2. Những file cần chuyển riêng

Thư mục bàn giao trên desktop: `C:\Users\ledan\.uniborrow-handoff\2026-11-09-1794179194439`.

- `uniborrow-full.sql`: cấu trúc và toàn bộ dữ liệu MySQL hiện tại, gồm 5 bảng và các đối tượng routines/events/triggers nếu có. Không kèm tài khoản/quyền MySQL cấp máy chủ.
- `.env`: bản sao cấu hình desktop. Bản gốc vẫn ở `F:\Uniborrow\.env`.
- `bao-cao-va-file-dang-lam.zip`: hai thư mục chưa theo dõi kể trên.
- `untracked-manifest.json`: danh sách đầy đủ 229 file, kích thước và SHA-256.
- `database-verification.json`: kết quả phục hồi thử, số hàng và SHA-256 của SQL.
- `BAN_GIAO.txt`: mã commit cuối và các đường dẫn riêng.

Chuyển bằng USB cá nhân hoặc kênh riêng. SQL chứa dữ liệu tài khoản, mật khẩu đã băm và phiên đăng nhập; `.env` có bí mật cấu hình. Không upload những file này lên GitHub. Giữ nguyên thư mục desktop cho tới khi laptop hoạt động đầy đủ.

Nếu cần mật khẩu Admin đã tạo trên desktop, chuyển riêng file trong `C:\Users\ledan\.uniborrow-local\`. Không đưa mật khẩu vào chat hoặc Git. Tài khoản Admin ứng dụng khác tài khoản MySQL/Workbench/phpMyAdmin.

## 3. Môi trường đã kiểm chứng trên desktop

- Windows x64; Node.js **v24.21.0**, npm **11.19.0**.
- MySQL Community Server **8.0.46**; InnoDB, utf8mb4.
- package-lock.json khóa dependency; Express 5.3.0, mysql2 3.24.5, dotenv 18.0.7; Playwright cho kiểm thử trình duyệt.
- Nên dùng cùng phiên bản trên laptop. README cho phép Node 22+ và MySQL 8.0.16+, nhưng bản dump nên import vào MySQL 8.0.46 hoặc bản MySQL tương thích mới hơn. Không giả định MariaDB tương đương.
- phpMyAdmin là công cụ riêng, không phải dependency của UniBorrow. Desktop đã cài PHP 8.4.27 và phpMyAdmin 5.2.3 tại `%LOCALAPPDATA%\UniBorrowTools`, chỉ nghe `127.0.0.1:8081`; cài lại trên laptop nếu muốn dùng. Workbench đủ để import SQL, không cần phpMyAdmin.

## 4. Lấy mã nguồn và cài dependency trên laptop

Cài Git, Node.js, MySQL Server và Workbench trước. Trong PowerShell (có thể đổi ổ/thư mục nếu laptop không có F:):

```powershell
git clone --branch codex/complete-uniborrow --single-branch https://github.com/ledang161/Web-library.git C:\Projects\UniBorrow
cd C:\Projects\UniBorrow
git status --short --branch
git log -1 --oneline
npm ci
```

Nếu đã clone: bảo vệ thay đổi cục bộ trước rồi `git fetch origin`, `git switch codex/complete-uniborrow`, `git pull --ff-only`. Không copy node_modules/venv từ desktop.

## 5. Import SQL an toàn vào database mới

Không import vào database đang có dữ liệu. Trên Workbench kết nối MySQL laptop, chạy:

```sql
CREATE DATABASE uniborrow_laptop CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
```

Nếu tên đã tồn tại, dùng tên mới khác; không DROP/TRUNCATE hoặc ghi đè.

Vào **Server → Data Import → Import from Self-Contained File**, chọn `uniborrow-full.sql`. Đặt **Default Target Schema** là `uniborrow_laptop`, chọn import cấu trúc và dữ liệu, rồi **Start Import**. Bản xuất không có CREATE DATABASE/USE, không có DROP TABLE; phải chọn đúng database đích mới. Refresh Schemas sau khi import.

Hoặc dùng MySQL command-line client (dấu nhắc `mysql>`), đăng nhập tương tác bằng tài khoản MySQL laptop; không đặt mật khẩu trong câu lệnh:

```sql
USE uniborrow_laptop;
SOURCE C:/DuongDanChuyenFile/uniborrow-full.sql;
```

Bản xuất đã được phục hồi và so sánh toàn bộ DDL/hàng dữ liệu trên database kiểm chứng riêng. Tại thời điểm xuất: users=4, equipment=3, borrow_requests=16, borrow_details=16, sessions=3. Không thay đổi database gốc; không export lại bằng seed. Sau khi sử dụng ứng dụng, các số này có thể tăng/đổi hợp lệ.

## 6. Cấu hình .env trên laptop

Copy file `.env` chuyển riêng vào thư mục gốc `C:\Projects\UniBorrow\.env`. File ẩn có thể cần bật **Hidden items** trong Explorer. Không ghi đè một `.env` laptop đang dùng mà chưa sao lưu.

Chỉnh theo MySQL laptop:

```dotenv
DB_HOST=localhost
DB_PORT=3306
DB_USER=your_local_mysql_user
DB_PASSWORD=your_local_mysql_password
DB_NAME=uniborrow_laptop
PORT=3000
NODE_ENV=development
APP_ORIGIN=http://localhost:3000
TRUST_PROXY=false
```

Đây là giá trị mẫu, không phải thông tin đăng nhập thật. Mật khẩu MySQL desktop có thể không dùng được trên laptop; dùng tài khoản đã thiết lập tại MySQL laptop. Nếu đổi cổng, đổi cả PORT và APP_ORIGIN. Truy cập đúng http://localhost:3000, không dùng lẫn 127.0.0.1 khi APP_ORIGIN đã cố định.

## 7. Chạy và kiểm tra

Sau khi import bản xuất đầy đủ, **không cần seed hoặc tạo lại Admin**. Migration đã có trong bản xuất; có thể chạy kiểm tra lặp an toàn:

```powershell
npm run migrate
npm start
```

Mở http://localhost:3000; đăng nhập bằng tài khoản ứng dụng đã có. Admin vào `/admin`. Giữ terminal mở; Ctrl+C để dừng. `npm run dev` tự tải lại backend khi sửa mã. Nếu lỗi EADDRINUSE thì cổng đã có server: xác định đúng tiến trình trước khi dừng, không dùng lại PID cũ từ desktop.

Nếu không còn mật khẩu Admin, tạo **Admin mới** với email khác bằng `npm run create-admin`; CLI yêu cầu nhập mật khẩu riêng và từ chối ghi đè tài khoản đã có. Không xóa hoặc đổi mật khẩu tài khoản cũ âm thầm.

```powershell
npx playwright install chromium
npm test
npm audit
```

Test dùng MySQL thật và Chromium desktop/375px, tự tạo database tên `uniborrow_test_*` với dữ liệu giả; chỉ dọn database do test tạo. Tài khoản chạy test cần quyền CREATE/DROP DATABASE. Có thể chạy riêng `npm run test:api` và `npm run test:browser`. Không dùng database phát triển làm dữ liệu kiểm thử. Ảnh nằm trong test-results/ (Git ignore).

## 8. Trạng thái công việc để Codex laptop tiếp tục

Đã hoàn thiện: auth/session/CSRF/scrypt và phân quyền backend; thiết bị/tìm/lọc/chi tiết; mượn/lịch sử cá nhân/hủy; admin duyệt/từ chối/giao/trả/CRUD/thống kê; ràng buộc ngày Việt Nam và tồn kho; rollback nhiều dòng, xử lý đồng thời, chống form cũ ghi đè kho; migration/seed/CLI/README/API/test.

Nghiệp vụ giữ nguyên: approved không giữ kho, chỉ borrowed mới trừ; returned cộng lại; pending chỉ chủ yêu cầu được hủy. Giao diện tạo một loại thiết bị mỗi yêu cầu nhưng lịch sử/API hỗ trợ nhiều dòng.

Chưa có phần sửa mã đang làm dở trước lần bàn giao này. Các file dựng báo cáo vẫn ngoài Git, đã chuyển riêng. Không có dữ liệu MySQL/.env/mật khẩu trong repository. Chưa triển khai production, chưa kiểm thử tải lớn/HTTPS; chưa kiểm chứng trên laptop thực tế.

Bước tiếp theo cho Codex laptop:
1. Đọc tài liệu này, README.md, docs/api.md, kiểm tra Git và thay đổi cục bộ.
2. Xác minh Node/MySQL, import SQL vào database mới và thiết lập .env riêng.
3. Chạy npm ci, npm test, npm start; xác nhận đăng nhập và đầy đủ luồng Admin.
4. Nếu tiếp tục báo cáo: giải nén ZIP ngoài Git hoặc vào output/report-work có kiểm tra; không tự commit ảnh/dữ liệu nhạy cảm.
5. Tiếp tục theo yêu cầu mới của chủ dự án. Chỉ dùng một agent, không sub-agent. Không tự merge/main hoặc công khai dữ liệu.
