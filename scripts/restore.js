// Restore into a NEW database only. Switching the development DB is a separate deliberate step.
const fs = require('node:fs/promises');
const crypto = require('node:crypto');
const mysql = require('mysql2/promise');
const { config } = require('./migrate');
async function restore(file, database = `uniborrow_restore_${Date.now()}`) {
    if (!/^uniborrow_restore_[A-Za-z0-9_]+$/.test(database)) throw Error('Tên database phục hồi phải bắt đầu bằng uniborrow_restore_.');
    const snapshot = JSON.parse(await fs.readFile(file, 'utf8'));
    if (!Array.isArray(snapshot.tables) || snapshot.tables.some(t => !['users','equipment','borrow_requests','borrow_details','sessions'].includes(t.name) || !Array.isArray(t.rows) || typeof t.ddl !== 'string')) throw Error('Định dạng bản sao lưu không hợp lệ.');
    const c = await mysql.createConnection(config(null));
    try {
        // CREATE without IF NOT EXISTS refuses overwriting any existing database.
        await c.query('CREATE DATABASE ??', [database]);
        await c.changeUser({ database });
        for (const table of snapshot.tables) {
            await c.query(table.ddl);
            for (const row of table.rows) await c.query('INSERT INTO ?? SET ?', [table.name,row]);
            const [rows] = await c.query('SELECT * FROM ?? ORDER BY 1',[table.name]);
            const digest = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
            if(digest(rows)!==digest(table.rows)) throw Error(`Dữ liệu phục hồi không khớp: ${table.name}`);
        }
        console.log('Đã phục hồi và đối chiếu dữ liệu trong database mới:', database);
        return database;
    } finally { await c.end(); }
}
if(require.main===module){
    if(!process.argv[2]){console.error('Cách dùng: node scripts/restore.js <backup.json> [uniborrow_restore_ten]');process.exitCode=1;}
    else restore(process.argv[2],process.argv[3]).catch(e=>{console.error(e.code||e.message);process.exitCode=1;});
}
module.exports={restore};
