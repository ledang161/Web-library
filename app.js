const express = require('express');
const path = require('node:path');
const db = require('./database');
const { token, digest, equal, hashPassword, verifyPassword, todayVietnam, validDate } = require('./lib/security');
const app = express();
if (process.env.TRUST_PROXY === 'true') app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use((req, res, next) => {
    res.set({ 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin',
        'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; frame-ancestors 'none'; form-action 'self'; base-uri 'self'" });
    next();
});
app.use(express.json({ limit: '32kb' }));
app.use(express.static(path.join(__dirname, 'public')));

const fail = (status, message) => Object.assign(new Error(message), { status });
const positive = value => typeof value === 'number' && Number.isSafeInteger(value) && value > 0 && value <= 2147483647;
function id(value) {
    if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value) || !positive(Number(value))) throw fail(400, 'Mã không hợp lệ.');
    return Number(value);
}
function text(value, name, max, required = true) {
    if (value === undefined && !required) return '';
    if (typeof value !== 'string' || value.length > max || (required && !value.trim())) throw fail(400, `${name} không hợp lệ (tối đa ${max} ký tự).`);
    return value.trim();
}
function account(body, register) {
    const email = text(body.email, 'Email', 100).toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw fail(400, 'Email không hợp lệ.');
    if (typeof body.password !== 'string' || body.password.length > 128 || body.password.length < (register ? 8 : 1)) throw fail(400, 'Mật khẩu phải có 8–128 ký tự khi đăng ký.');
    return { email, password: body.password, ...(register ? { name: text(body.name, 'Họ tên', 100) } : {}) };
}
async function transaction(work) {
    const c = await db.getConnection();
    try { await c.beginTransaction(); const result = await work(c); await c.commit(); return result; }
    catch (error) { await c.rollback(); throw error; }
    finally { c.release(); }
}
const userInfo = row => row ? { id: row.id, name: row.name, email: row.email, role: row.role } : null;
function cookie(res, value, expired = false) {
    res.cookie('ub_session', value, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production',
        path: '/', maxAge: expired ? 0 : 8 * 60 * 60 * 1000 });
}
async function newSession(req, res, userId = null) {
    await db.query('DELETE FROM sessions WHERE expires_at<=UTC_TIMESTAMP()');
    const raw = token();
    const session = { sid: digest(raw), csrf: token(), user_id: userId };
    await db.query('INSERT INTO sessions(sid,user_id,csrf,expires_at) VALUES (?,?,?,DATE_ADD(UTC_TIMESTAMP(), INTERVAL 8 HOUR))', [session.sid, userId, session.csrf]);
    if (req.session) await db.query('DELETE FROM sessions WHERE sid=?', [req.session.sid]);
    req.session = session;
    cookie(res, raw);
}
app.use(['/api', '/admin'], async (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    const raw = (req.headers.cookie || '').split(';').map(x => x.trim()).find(x => x.startsWith('ub_session='))?.slice(11);
    if (raw && /^[a-f0-9]{64}$/.test(raw)) {
        const [rows] = await db.query(`SELECT s.sid,s.csrf,s.user_id,u.id,u.name,u.email,u.role FROM sessions s
            LEFT JOIN users u ON s.user_id=u.id WHERE s.sid=? AND s.expires_at>UTC_TIMESTAMP()`, [digest(raw)]);
        if (rows.length) { req.session = rows[0]; req.user = rows[0].id ? userInfo(rows[0]) : null; }
    }
    next();
});
const authenticated = (req, res, next) => { if (!req.user) throw fail(401, 'Vui lòng đăng nhập.'); next(); };
const role = name => (req, res, next) => { if (!req.user) throw fail(401, 'Vui lòng đăng nhập.'); if (req.user.role !== name) throw fail(403, 'Bạn không có quyền thực hiện thao tác này.'); next(); };
function csrf(req, res, next) {
    const origin = process.env.APP_ORIGIN || `${req.protocol}://${req.get('host')}`;
    if ((req.get('Origin') && req.get('Origin') !== origin) || !req.session || !equal(req.get('X-CSRF-Token'), req.session.csrf)) throw fail(403, 'Phiên xác nhận không hợp lệ. Vui lòng tải lại trang.');
    next();
}

// shortcut: per-process throttling; use a shared limiter before running several server processes.
const attempts = new Map();
function loginLimit(req, res, next) {
    const now = Date.now();
    for (const [key, value] of attempts) if (value.until < now) attempts.delete(key);
    if (attempts.size > 10000) throw fail(429, 'Vui lòng thử lại sau.');
    const key = req.ip;
    const entry = attempts.get(key) || { count: 0, until: now + 15 * 60 * 1000 };
    if (++entry.count > (process.env.NODE_ENV === 'test' ? 200 : 30)) throw fail(429, 'Quá nhiều lần đăng nhập/đăng ký. Vui lòng thử lại sau 15 phút.');
    attempts.set(key, entry); next();
}
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'views/index.html')));
app.get('/admin', role('admin'), (req, res) => res.sendFile(path.join(__dirname, 'views/admin.html')));
app.get('/api/auth/me', async (req, res) => {
    if (!req.session) await newSession(req, res);
    res.json({ user: req.user || null, csrfToken: req.session.csrf, today: todayVietnam() });
});
app.post('/api/auth/register', csrf, loginLimit, async (req, res) => {
    const body = req.body || {};
    if (body.role !== undefined && body.role !== 'student') throw fail(403, 'Đăng ký công khai chỉ dành cho sinh viên.');
    const data = account(body, true);
    const password = await hashPassword(data.password);
    let result;
    try { [result] = await db.query("INSERT INTO users(name,email,password,role) VALUES (?,?,?,'student')", [data.name, data.email, password]); }
    catch (error) { if (error.code === 'ER_DUP_ENTRY') throw fail(409, 'Email đã được đăng ký.'); throw error; }
    await newSession(req, res, result.insertId);
    res.status(201).json({ message: 'Đăng ký thành công.', user: { id: result.insertId, name: data.name, email: data.email, role: 'student' }, csrfToken: req.session.csrf });
});
app.post('/api/auth/login', csrf, loginLimit, async (req, res) => {
    const data = account(req.body || {}, false);
    const [rows] = await db.query('SELECT id,name,email,password,role FROM users WHERE email=?', [data.email]);
    const user = rows[0];
    if (!user || !await verifyPassword(data.password, user.password)) throw fail(401, 'Email hoặc mật khẩu không đúng.');
    if (!user.password.startsWith('scrypt$')) await db.query('UPDATE users SET password=? WHERE id=? AND password=?', [await hashPassword(data.password), user.id, user.password]);
    await newSession(req, res, user.id);
    res.json({ message: 'Đăng nhập thành công.', user: userInfo(user), csrfToken: req.session.csrf });
});
app.post('/api/auth/logout', authenticated, csrf, async (req, res) => {
    await db.query('DELETE FROM sessions WHERE sid=?', [req.session.sid]);
    cookie(res, '', true); res.json({ message: 'Đã đăng xuất.' });
});

app.get('/api/equipment', async (req, res) => {
    const q = text(req.query.q, 'Tìm kiếm', 100, false);
    const category = text(req.query.category, 'Loại thiết bị', 100, false);
    const status = text(req.query.status, 'Trạng thái', 20, false);
    if (status && !['available', 'unavailable'].includes(status)) throw fail(400, 'Trạng thái thiết bị không hợp lệ.');
    const clauses = [], args = [];
    if (q) { clauses.push('name LIKE ?'); args.push(`%${q}%`); }
    if (category) { clauses.push('category=?'); args.push(category); }
    if (status) { clauses.push('status=?'); args.push(status); }
    const [rows] = await db.query(`SELECT id,name,category,quantity,description,status FROM equipment ${clauses.length ? 'WHERE ' + clauses.join(' AND ') : ''} ORDER BY id`, args);
    res.json(rows);
});
app.get('/api/equipment/:id', async (req, res) => {
    const [rows] = await db.query('SELECT id,name,category,quantity,description,status FROM equipment WHERE id=?', [id(req.params.id)]);
    if (!rows.length) throw fail(404, 'Không tìm thấy thiết bị.'); res.json(rows[0]);
});
function equipmentData(body, partial = false) {
    const result = {};
    for (const [key, label, max, required] of [['name', 'Tên thiết bị', 100, true], ['category', 'Loại thiết bị', 100, true], ['description', 'Mô tả', 5000, false]]) {
        if (!partial || Object.hasOwn(body, key)) result[key] = text(body[key], label, max, required);
    }
    if (!partial || Object.hasOwn(body, 'quantity')) {
        if (typeof body.quantity !== 'number' || !Number.isSafeInteger(body.quantity) || body.quantity < 0 || body.quantity > 2147483647) throw fail(400, 'Số lượng tồn kho phải là số nguyên không âm.');
        result.quantity = body.quantity;
    }
    if (!partial || Object.hasOwn(body, 'status')) {
        if (!['available', 'unavailable'].includes(body.status)) throw fail(400, 'Trạng thái thiết bị không hợp lệ.');
        result.status = body.status;
    }
    if (!Object.keys(result).length) throw fail(400, 'Chưa có thông tin cập nhật.');
    return result;
}
app.post('/api/equipment', role('admin'), csrf, async (req, res) => {
    const data = equipmentData(req.body || {});
    const [result] = await db.query('INSERT INTO equipment SET ?', [data]);
    res.status(201).json({ message: 'Đã thêm thiết bị.', id: result.insertId });
});
app.patch('/api/equipment/:id', role('admin'), csrf, async (req, res) => {
    const equipmentId = id(req.params.id), data = equipmentData(req.body || {}, true);
    const expectedQuantity = req.body.expectedQuantity;
    if (Object.hasOwn(data, 'quantity') &&
        (typeof expectedQuantity !== 'number' || !Number.isInteger(expectedQuantity) || expectedQuantity < 0 || expectedQuantity > 2147483647)) {
        throw fail(400, 'Cần số lượng tồn kho đã tải khi mở form (expectedQuantity).');
    }
    await transaction(async c => {
        const [rows] = await c.query('SELECT id,quantity FROM equipment WHERE id=? FOR UPDATE', [equipmentId]);
        if (!rows.length) throw fail(404, 'Không tìm thấy thiết bị.');
        if (Object.hasOwn(data, 'quantity') && rows[0].quantity !== expectedQuantity) {
            throw fail(409, 'Tồn kho đã thay đổi từ khi mở form. Vui lòng tải lại thiết bị trước khi sửa.');
        }
        await c.query('UPDATE equipment SET ? WHERE id=?', [data, equipmentId]);
    });
    res.json({ message: 'Đã cập nhật thiết bị.' });
});
app.delete('/api/equipment/:id', role('admin'), csrf, async (req, res) => {
    const equipmentId = id(req.params.id);
    const archived = await transaction(async c => {
        const [rows] = await c.query('SELECT id FROM equipment WHERE id=? FOR UPDATE', [equipmentId]);
        if (!rows.length) throw fail(404, 'Không tìm thấy thiết bị.');
        const [references] = await c.query('SELECT id FROM borrow_details WHERE equipment_id=? LIMIT 1', [equipmentId]);
        if (references.length) { await c.query("UPDATE equipment SET status='unavailable' WHERE id=?", [equipmentId]); return true; }
        await c.query('DELETE FROM equipment WHERE id=?', [equipmentId]); return false;
    });
    res.json({ message: archived ? 'Thiết bị có lịch sử: đã ngừng cho mượn và giữ nguyên lịch sử.' : 'Đã xóa thiết bị.', archived });
});

app.post('/api/borrow', role('student'), csrf, async (req, res) => {
    const { equipmentId, quantity, borrowDate, returnDate, note } = req.body || {};
    if (!positive(equipmentId) || !positive(quantity)) throw fail(400, 'Mã thiết bị và số lượng phải là số nguyên dương.');
    if (!validDate(borrowDate) || !validDate(returnDate)) throw fail(400, 'Ngày mượn hoặc ngày trả không tồn tại.');
    if (borrowDate < todayVietnam()) throw fail(400, 'Ngày mượn không được trước ngày hiện tại tại Việt Nam.');
    if (returnDate < borrowDate) throw fail(400, 'Ngày trả không được trước ngày mượn.');
    const cleanNote = text(note, 'Ghi chú', 2000, false);
    const requestId = await transaction(async c => {
        const [equipment] = await c.query('SELECT id,quantity,status FROM equipment WHERE id=? FOR UPDATE', [equipmentId]);
        if (!equipment.length || equipment[0].status !== 'available' || equipment[0].quantity < quantity) throw fail(400, 'Thiết bị không khả dụng hoặc số lượng hiện có không đủ.');
        const [result] = await c.query("INSERT INTO borrow_requests(user_id,borrow_date,return_date,status,note) VALUES (?,?,?,'pending',?)", [req.user.id, borrowDate, returnDate, cleanNote]);
        await c.query('INSERT INTO borrow_details(request_id,equipment_id,quantity) VALUES (?,?,?)', [result.insertId, equipmentId, quantity]);
        return result.insertId;
    });
    res.status(201).json({ message: 'Gửi yêu cầu thành công. Đã duyệt chưa đồng nghĩa được giữ thiết bị.', requestId });
});

const statuses = ['pending', 'approved', 'rejected', 'borrowed', 'returned', 'cancelled'];
async function requests(req, own, requestId) {
    const conditions = [], args = [];
    if (own) { conditions.push('br.user_id=?'); args.push(req.user.id); }
    if (requestId) { conditions.push('br.id=?'); args.push(requestId); }
    if (req.query.status) {
        if (!statuses.includes(req.query.status)) throw fail(400, 'Trạng thái yêu cầu không hợp lệ.');
        conditions.push('br.status=?'); args.push(req.query.status);
    }
    const q = text(req.query.q, 'Tìm kiếm', 100, false);
    if (q) {
        conditions.push(`(u.name LIKE ? OR u.email LIKE ? OR CAST(br.id AS CHAR)=? OR EXISTS
            (SELECT 1 FROM borrow_details d JOIN equipment e2 ON e2.id=d.equipment_id WHERE d.request_id=br.id AND e2.name LIKE ?))`);
        args.push(`%${q}%`, `%${q}%`, q, `%${q}%`);
    }
    const [rows] = await db.query(`SELECT br.id,br.user_id,u.name AS student_name,u.email AS student_email,
        br.borrow_date,br.return_date,br.status,br.note,bd.equipment_id,bd.quantity,e.name AS equipment_name
        FROM borrow_requests br JOIN users u ON br.user_id=u.id
        LEFT JOIN borrow_details bd ON bd.request_id=br.id LEFT JOIN equipment e ON e.id=bd.equipment_id
        ${conditions.length ? 'WHERE ' + conditions.join(' AND ') : ''} ORDER BY br.id DESC,bd.id`, args);
    const grouped = new Map();
    for (const row of rows) {
        if (!grouped.has(row.id)) {
            const { equipment_id, quantity, equipment_name, ...request } = row;
            grouped.set(row.id, { ...request, details: [] });
        }
        if (row.equipment_id) grouped.get(row.id).details.push({ equipment_id: row.equipment_id, equipment_name: row.equipment_name, quantity: row.quantity });
    }
    return [...grouped.values()];
}
app.get('/api/my/borrow-requests', role('student'), async (req, res) => res.json(await requests(req, true)));
app.get('/api/my/borrow-requests/:id', role('student'), async (req, res) => {
    const rows = await requests(req, true, id(req.params.id));
    if (!rows.length) throw fail(404, 'Không tìm thấy yêu cầu.'); res.json(rows[0]);
});
app.get('/api/borrow-requests', role('admin'), async (req, res) => res.json(await requests(req, false)));
app.get('/api/borrow-requests/:id', role('admin'), async (req, res) => {
    const rows = await requests(req, false, id(req.params.id));
    if (!rows.length) throw fail(404, 'Không tìm thấy yêu cầu.'); res.json(rows[0]);
});
app.get('/api/stats', role('admin'), async (req, res) => {
    const [rows] = await db.query('SELECT status,COUNT(*) AS count FROM borrow_requests GROUP BY status');
    const result = Object.fromEntries(statuses.map(s => [s, 0])); result.total = 0;
    for (const row of rows) { result[row.status] = Number(row.count); result.total += Number(row.count); }
    res.json(result);
});
async function changeStatus(requestId, status, owner) {
    const previous = { approved: 'pending', rejected: 'pending', borrowed: 'approved', returned: 'borrowed', cancelled: 'pending' };
    if (!previous[status]) throw fail(400, 'Trạng thái xử lý không hợp lệ.');
    await transaction(async c => {
        const [rows] = await c.query('SELECT id,user_id,status FROM borrow_requests WHERE id=? FOR UPDATE', [requestId]);
        if (!rows.length || (owner && rows[0].user_id !== owner)) throw fail(404, 'Không tìm thấy yêu cầu.');
        if (rows[0].status !== previous[status]) throw fail(409, 'Trạng thái yêu cầu đã thay đổi hoặc thao tác không đúng quy trình.');
        if (status === 'borrowed' || status === 'returned') {
            const [details] = await c.query('SELECT equipment_id,SUM(quantity) AS quantity,MIN(quantity) AS min_quantity FROM borrow_details WHERE request_id=? GROUP BY equipment_id ORDER BY equipment_id', [requestId]);
            if (!details.length) throw fail(409, 'Yêu cầu không có chi tiết thiết bị.');
            for (const item of details) {
                const quantity = Number(item.quantity);
                if (!positive(quantity) || Number(item.min_quantity) <= 0) throw fail(409, 'Chi tiết số lượng thiết bị không hợp lệ.');
                const [equipment] = await c.query('SELECT id,quantity,status FROM equipment WHERE id=? FOR UPDATE', [item.equipment_id]);
                if (!equipment.length) throw fail(409, 'Thiết bị không tồn tại.');
                if (status === 'borrowed' && (equipment[0].status !== 'available' || equipment[0].quantity < quantity)) throw fail(409, `Không đủ thiết bị hiện có để bàn giao (mã ${item.equipment_id}). Toàn bộ lần bàn giao đã được hoàn tác.`);
                if (status === 'returned' && equipment[0].quantity + quantity > 2147483647) throw fail(409, 'Số lượng tồn kho vượt giới hạn.');
                await c.query('UPDATE equipment SET quantity=quantity+? WHERE id=?', [status === 'borrowed' ? -quantity : quantity, item.equipment_id]);
            }
        }
        await c.query('UPDATE borrow_requests SET status=? WHERE id=?', [status, requestId]);
    });
}
app.patch('/api/my/borrow-requests/:id/cancel', role('student'), csrf, async (req, res) => {
    const requestId = id(req.params.id);
    await changeStatus(requestId, 'cancelled', req.user.id);
    res.json({ message: 'Đã hủy yêu cầu.', requestId, status: 'cancelled' });
});
app.patch('/api/borrow-requests/:id/status', role('admin'), csrf, async (req, res) => {
    const requestId = id(req.params.id), status = req.body?.status;
    if (!['approved', 'rejected', 'borrowed', 'returned'].includes(status)) throw fail(400, 'Trạng thái xử lý không hợp lệ.');
    await changeStatus(requestId, status);
    res.json({ message: 'Đã cập nhật trạng thái yêu cầu.', requestId, status });
});
app.use('/api', (req, res) => res.status(404).json({ message: 'API không tồn tại.' }));
app.use((error, req, res, next) => {
    const status = error.status || (error.type === 'entity.parse.failed' ? 400 : 500);
    if (status >= 500) console.error('UniBorrow error:', error.code || error.name);
    res.status(status).json({ message: status >= 500 ? 'Không thể xử lý yêu cầu. Vui lòng thử lại.' : error.message });
});
if (require.main === module) {
    const port = Number(process.env.PORT || 3000);
    const server = app.listen(port);
    server.once('listening', () => console.log(`UniBorrow đang chạy tại http://localhost:${port}`));
    server.once('error', async error => {
        console.error('Không thể khởi động UniBorrow:', error.code || error.name);
        await db.end();
        process.exitCode = 1;
    });
}
module.exports = { app, db };
