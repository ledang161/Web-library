// Backups contain private data. Keep them outside the repository; never log rows.
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const mysql = require('mysql2/promise');
const { config } = require('./migrate');
const tableOrder = ['users', 'equipment', 'borrow_requests', 'borrow_details', 'sessions'];
const digest = rows => crypto.createHash('sha256').update(JSON.stringify(rows)).digest('hex');
async function backupAndVerify() {
    const source = await mysql.createConnection(config());
    const snapshot = { database: process.env.DB_NAME, createdAt: new Date().toISOString(), tables: [] };
    try {
        const [all] = await source.query('SHOW TABLES');
        const names = all.map(row => Object.values(row)[0]);
        if (names.some(name => !tableOrder.includes(name))) throw Error('Database chứa bảng ngoài UniBorrow; dừng để tránh tạo bản sao lưu thiếu.');
        await source.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
        await source.query('START TRANSACTION WITH CONSISTENT SNAPSHOT');
        for (const name of tableOrder.filter(name => names.includes(name))) {
            const [[ddl]] = await source.query('SHOW CREATE TABLE ??', [name]);
            const [rows] = await source.query('SELECT * FROM ?? ORDER BY 1', [name]);
            snapshot.tables.push({ name, ddl: ddl['Create Table'], rows });
        }
        await source.commit();
    } finally { await source.end(); }
    const directory = path.join(os.homedir(), '.uniborrow-backups');
    await fs.mkdir(directory, { recursive: true, mode: 0o700 });
    const file = path.join(directory, `${snapshot.database}-${Date.now()}.json`);
    await fs.writeFile(file, JSON.stringify(snapshot), { flag: 'wx', mode: 0o600 });
    const verifyName = `uniborrow_test_restore_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
    const target = await mysql.createConnection(config(null));
    let created = false;
    try {
        await target.query('CREATE DATABASE ??', [verifyName]); created = true;
        await target.changeUser({ database: verifyName });
        const saved = JSON.parse(await fs.readFile(file, 'utf8'));
        for (const table of saved.tables) {
            await target.query(table.ddl);
            for (const row of table.rows) await target.query('INSERT INTO ?? SET ?', [table.name, row]);
            const [restored] = await target.query('SELECT * FROM ?? ORDER BY 1', [table.name]);
            if (digest(restored) !== digest(table.rows)) throw Error(`Kiểm tra phục hồi thất bại tại ${table.name}`);
        }
        console.log('Sao lưu và phục hồi kiểm chứng thành công:', file);
        return file;
    } finally {
        if (created) await target.query('DROP DATABASE ??', [verifyName]);
        await target.end();
    }
}
if (require.main === module) backupAndVerify().catch(e => { console.error(e.code || e.message); process.exitCode = 1; });
module.exports = { backupAndVerify };
