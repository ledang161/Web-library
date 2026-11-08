const { test } = require('node:test');
const assert = require('node:assert/strict');
const mysql = require('mysql2/promise');
const { once } = require('node:events');
const { randomBytes } = require('node:crypto');
const { migrate, config } = require('../scripts/migrate');

test('MySQL integration: authentication, permissions, inventory and migrations', { timeout: 120000 }, async t => {
    const schema = `uniborrow_test_${Date.now()}_${randomBytes(3).toString('hex')}`;
    const setup = await mysql.createConnection(config(null));
    let server, db;
    try {
        await setup.query('CREATE DATABASE ??', [schema]);
        await setup.changeUser({ database: schema });
        await migrate(setup);
        await setup.query("INSERT INTO equipment(name,category,quantity,description,status) VALUES ('Laptop','Computer',3,'Synthetic description','available'),('Projector','Display',1,'Synthetic','available'),('Unavailable','Other',5,'Synthetic','unavailable')");
        await migrate(setup);
        assert.equal((await setup.query('SELECT COUNT(*) n FROM equipment'))[0][0].n, 3);
        await assert.rejects(setup.query('UPDATE equipment SET quantity=-1 WHERE id=1'), { code: 'ER_CHECK_CONSTRAINT_VIOLATED' });
        process.env.DB_NAME = schema;
        process.env.APP_ORIGIN = '';
        process.env.NODE_ENV = 'test';
        const appModule = require('../app');
        db = appModule.db;
        assert.ok(appModule.app, 'app.js must export app for isolated integration tests');
        server = appModule.app.listen(0, '127.0.0.1');
        await once(server, 'listening');
        const base = `http://127.0.0.1:${server.address().port}`;
        function client() {
            let cookie = '', csrf = '';
            return {
                async request(url, method = 'GET', body, overrides = {}) {
                    const headers = { Cookie: cookie, Origin: base, 'Content-Type': 'application/json', ...overrides };
                    if (!Object.hasOwn(overrides, 'X-CSRF-Token')) headers['X-CSRF-Token'] = csrf;
                    const response = await fetch(base + url, { method, headers, redirect: 'manual', body: body === undefined ? undefined : JSON.stringify(body) });
                    for (const value of response.headers.getSetCookie()) if (value.startsWith('ub_session=')) cookie = value.split(';')[0];
                    let data; try { data = await response.json(); } catch { data = {}; }
                    if (data.csrfToken) csrf = data.csrfToken;
                    return { status: response.status, data, headers: response.headers };
                }
            };
        }
        const anonymous = client(), student = client(), other = client(), admin = client();
        const register = (who, email, extra = {}) => who.request('/api/auth/register', 'POST', { name: 'Synthetic Student', email, password: 'Test-password-123', ...extra });
        const me = await student.request('/api/auth/me');
        assert.equal(me.status, 200);
        const today = me.data.today;
        const future = new Date(`${today}T00:00:00Z`); future.setUTCDate(future.getUTCDate() + 2);
        const tomorrow = future.toISOString().slice(0, 10);
        const validBorrow = extra => ({ equipmentId: 1, quantity: 1, borrowDate: today, returnDate: tomorrow, ...extra });
        const borrow = (who = student, extra = {}) => who.request('/api/borrow', 'POST', validBorrow(extra));
        const status = (id, next, who = admin) => who.request(`/api/borrow-requests/${id}/status`, 'PATCH', { status: next });
        const qty = async id => (await setup.query('SELECT quantity FROM equipment WHERE id=?', [id]))[0][0].quantity;
        const requestStatus = async id => (await setup.query('SELECT status FROM borrow_requests WHERE id=?', [id]))[0][0].status;

        await t.test('anonymous access, CSRF, registration role and password hashing', async () => {
            assert.equal((await anonymous.request('/api/my/borrow-requests')).status, 401);
            assert.equal((await anonymous.request('/api/borrow-requests')).status, 401);
            await anonymous.request('/api/auth/me');
            assert.equal((await register(anonymous, 'evil@example.test', { role: 'admin' })).status, 403);
            assert.equal((await student.request('/api/auth/register', 'POST', { name: 'Test', email: 'csrf@example.test', password: 'Test-password-123' }, { 'X-CSRF-Token': '' })).status, 403);
            assert.equal((await register(student, 'student@example.test')).status, 201);
            const [[stored]] = await setup.query('SELECT password,role FROM users WHERE email=?', ['student@example.test']);
            assert.ok(stored.password.startsWith('scrypt$'));
            assert.equal(stored.role, 'student');
            assert.equal((await register(student, 'student@example.test')).status, 409);
            assert.equal((await student.request('/api/auth/logout', 'POST', {}, { Origin: 'http://evil.example' })).status, 403);
        });
        await other.request('/api/auth/me'); await admin.request('/api/auth/me');
        assert.equal((await register(other, 'other@example.test')).status, 201);
        assert.equal((await register(admin, 'admin@example.test')).status, 201);
        await setup.query("UPDATE users SET role='admin' WHERE email='admin@example.test'");
        await admin.request('/api/auth/logout', 'POST', {});
        await admin.request('/api/auth/me');
        assert.equal((await admin.request('/api/auth/login', 'POST', { email: 'admin@example.test', password: 'Test-password-123' })).status, 200);

        await t.test('login errors, logout invalidation and legacy account upgrade', async () => {
            const user = client(); await user.request('/api/auth/me');
            assert.equal((await user.request('/api/auth/login', 'POST', { email: 'student@example.test', password: 'wrong-password' })).status, 401);
            assert.equal((await user.request('/api/auth/login', 'POST', { email: 'student@example.test', password: 'Test-password-123' })).status, 200);
            assert.equal((await user.request('/api/auth/logout', 'POST', {})).status, 200);
            assert.equal((await user.request('/api/my/borrow-requests')).status, 401);
            await setup.query("INSERT INTO users(name,email,password,role) VALUES ('Legacy','legacy@example.test','Legacy-password-123','student')");
            await user.request('/api/auth/me');
            assert.equal((await user.request('/api/auth/login', 'POST', { email: 'legacy@example.test', password: 'Legacy-password-123' })).status, 200);
            assert.ok((await setup.query("SELECT password FROM users WHERE email='legacy@example.test'"))[0][0].password.startsWith('scrypt$'));
        });
        await t.test('student denied all admin APIs', async () => {
            for (const [url, method, body] of [ ['/api/borrow-requests','GET'], ['/api/stats','GET'], ['/api/equipment','POST',{}], ['/api/equipment/1','PATCH',{}], ['/api/equipment/1','DELETE'], ['/api/borrow-requests/1/status','PATCH',{status:'approved'}] ]) assert.equal((await student.request(url, method, body)).status, 403, `${method} ${url}`);
            assert.ok([302, 403].includes((await student.request('/admin')).status));
        });
        await t.test('real dates, Vietnam today, quantities, stock and note validation', async () => {
            for (const extra of [{quantity:-1},{quantity:0},{quantity:1.5},{quantity:4},{equipmentId:3},{equipmentId:9999},{borrowDate:'2026-02-30'},{borrowDate:'2020-01-01'},{returnDate:'2020-01-01'},{note:123},{note:'x'.repeat(2001)}]) assert.equal((await borrow(student, extra)).status, 400, JSON.stringify(extra).slice(0,100));
            assert.equal((await borrow()).status, 201, 'omitted note');
            assert.equal((await borrow(student, {note:''})).status, 201, 'empty note');
        });
        await t.test('full workflow, request ownership and duplicate state protection', async () => {
            const created = await borrow(); assert.equal(created.status, 201); const id = created.data.requestId;
            assert.equal((await other.request(`/api/my/borrow-requests/${id}`)).status, 404);
            assert.equal((await other.request(`/api/my/borrow-requests/${id}/cancel`, 'PATCH', {})).status, 404);
            assert.equal((await status(id, 'returned')).status, 409);
            assert.equal((await status(id, 'approved')).status, 200); assert.equal(await qty(1), 3);
            assert.equal((await student.request(`/api/my/borrow-requests/${id}/cancel`, 'PATCH', {})).status, 409);
            assert.equal((await status(id, 'borrowed')).status, 200); assert.equal(await qty(1), 2);
            assert.equal((await status(id, 'borrowed')).status, 409); assert.equal(await qty(1), 2);
            assert.equal((await status(id, 'returned')).status, 200); assert.equal(await qty(1), 3);
            assert.equal((await status(id, 'returned')).status, 409); assert.equal(await qty(1), 3);
            assert.equal(await requestStatus(id), 'returned');
        });
        await t.test('stale admin equipment form cannot overwrite stock changed by checkout', async () => {
            const before = await qty(1);
            const id = (await borrow()).data.requestId;
            assert.equal((await status(id, 'approved')).status, 200);
            assert.equal((await status(id, 'borrowed')).status, 200);
            assert.equal(await qty(1), before - 1);
            assert.equal((await admin.request('/api/equipment/1', 'PATCH', {quantity: before, expectedQuantity: before})).status, 409);
            assert.equal(await qty(1), before - 1);
            assert.equal((await admin.request('/api/equipment/1', 'PATCH', {quantity: before - 1})).status, 400);
            assert.equal((await admin.request('/api/equipment/1', 'PATCH', {quantity: before - 1, expectedQuantity: before - 1})).status, 200);
            assert.equal((await status(id, 'returned')).status, 200);
            assert.equal(await qty(1), before);
        });
        await t.test('rejection and cancellation retain history, approval/cancel race has one winner', async () => {
            const rejected = (await borrow()).data.requestId;
            assert.equal((await status(rejected,'rejected')).status, 200);
            assert.equal((await status(rejected,'approved')).status, 409);
            const cancelled = (await borrow()).data.requestId;
            assert.equal((await student.request(`/api/my/borrow-requests/${cancelled}/cancel`,'PATCH',{})).status, 200);
            assert.equal(await requestStatus(cancelled), 'cancelled');
            const racing = (await borrow()).data.requestId;
            const results = await Promise.all([status(racing,'approved'),student.request(`/api/my/borrow-requests/${racing}/cancel`,'PATCH',{})]);
            assert.deepEqual(results.map(r=>r.status).sort(), [200,409]);
            const history = (await student.request('/api/my/borrow-requests')).data;
            assert.ok(history.some(r=>r.id===rejected)); assert.ok(history.some(r=>r.id===cancelled));
        });
        await t.test('concurrent stock competition and repeated return credit only once', async () => {
            const ids = [];
            for(let i=0;i<2;i++){const id=(await borrow(student,{quantity:2})).data.requestId;ids.push(id);assert.equal((await status(id,'approved')).status,200);}
            const results=await Promise.all(ids.map(id=>status(id,'borrowed')));
            assert.deepEqual(results.map(r=>r.status).sort(),[200,409]); assert.equal(await qty(1),1);
            const winner=ids[results.findIndex(r=>r.status===200)];
            const returns=await Promise.all([status(winner,'returned'),status(winner,'returned')]);
            assert.deepEqual(returns.map(r=>r.status).sort(),[200,409]); assert.equal(await qty(1),3);
        });
        await t.test('multi-item rollback, unique request statistics and complete details', async () => {
            const id=(await borrow()).data.requestId;
            await setup.query('INSERT INTO borrow_details(request_id,equipment_id,quantity) VALUES (?,2,2)',[id]);
            assert.equal((await status(id,'approved')).status,200);
            assert.equal((await status(id,'borrowed')).status,409); assert.equal(await qty(1),3); assert.equal(await requestStatus(id),'approved');
            const list=(await admin.request('/api/borrow-requests')).data;
            assert.equal(list.filter(r=>r.id===id).length,1); assert.equal(list.find(r=>r.id===id).details.length,2);
            const details=(await student.request(`/api/my/borrow-requests/${id}`)).data; assert.equal(details.details.length,2);
            const stats=(await admin.request('/api/stats')).data;
            const [[count]]=await setup.query('SELECT COUNT(*) n FROM borrow_requests'); assert.equal(stats.total,count.n);
        });
        await t.test('equipment CRUD, search, validation and history-safe deletion', async () => {
            const body={name:'New test camera',category:'Camera',quantity:2,description:'Details',status:'available'};
            assert.equal((await admin.request('/api/equipment','POST',{...body,quantity:-1})).status,400);
            const created=await admin.request('/api/equipment','POST',body); assert.equal(created.status,201);
            const id=created.data.id || created.data.equipmentId;
            assert.ok(id);
            assert.equal((await admin.request(`/api/equipment/${id}`,'PATCH',{...body,quantity:4,expectedQuantity:2})).status,200);
            assert.equal((await anonymous.request(`/api/equipment/${id}`)).data.quantity,4);
            assert.ok((await anonymous.request('/api/equipment?q=camera&category=Camera&status=available')).data.some(e=>e.id===id));
            assert.equal((await admin.request(`/api/equipment/${id}`,'DELETE')).status,200);
            assert.equal((await admin.request('/api/equipment/1','DELETE')).status,200);
            const [[equipment]]=await setup.query('SELECT status FROM equipment WHERE id=1'); assert.equal(equipment.status,'unavailable');
            assert.ok((await student.request('/api/my/borrow-requests')).data.some(r=>r.details.some(d=>d.equipment_id===1)));
        });
    } finally {
        if (server) await new Promise(resolve=>server.close(resolve));
        if (db) await db.end();
        await setup.query('DROP DATABASE ??',[schema]);
        await setup.end();
    }
});
