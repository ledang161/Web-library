const fs = require('node:fs/promises');
const path = require('node:path');
require('dotenv').config({ quiet: true });
const mysql = require('mysql2/promise');

function config(database = process.env.DB_NAME) {
    return { host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 3306), user: process.env.DB_USER,
        password: process.env.DB_PASSWORD, database, dateStrings: true };
}
async function runSql(pool, file) {
    const source = await fs.readFile(path.join(__dirname, '..', 'db', file), 'utf8');
    for (const statement of source.split(';').map(s => s.trim()).filter(Boolean)) await pool.query(statement);
}
async function migrate(pool) {
    await runSql(pool, 'schema.sql');
    const constraints = [
        ['equipment', 'equipment_quantity_nonnegative', 'quantity >= 0'],
        ['borrow_details', 'borrow_detail_quantity_positive', 'quantity > 0'],
        ['borrow_requests', 'borrow_request_date_order', 'return_date >= borrow_date']
    ];
    for (const [table, name, condition] of constraints) {
        const [[invalid]] = await pool.query(`SELECT COUNT(*) AS n FROM ${table} WHERE NOT (${condition})`);
        if (invalid.n) throw new Error(`Dữ liệu ${table} vi phạm ${name}; hãy sửa dữ liệu trước. Migration không tự xóa/sửa dữ liệu.`);
        const [existing] = await pool.query('SELECT CONSTRAINT_NAME FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=DATABASE() AND TABLE_NAME=? AND CONSTRAINT_NAME=?', [table, name]);
        if (!existing.length) await pool.query(`ALTER TABLE ${table} ADD CONSTRAINT ${name} CHECK (${condition})`);
    }
}
async function main() {
    if (!process.env.DB_NAME || !/^[A-Za-z0-9_]+$/.test(process.env.DB_NAME)) throw new Error('DB_NAME không hợp lệ');
    const server = await mysql.createConnection(config(null));
    try { await server.query('CREATE DATABASE IF NOT EXISTS ?? CHARACTER SET utf8mb4', [process.env.DB_NAME]); }
    finally { await server.end(); }
    const pool = mysql.createPool(config());
    try { await migrate(pool); if (process.argv.includes('--seed')) await runSql(pool, 'seed.sql'); console.log('Migration hoàn thành; dữ liệu hiện có được giữ nguyên.'); }
    finally { await pool.end(); }
}
if (require.main === module) main().catch(error => { console.error(error.code || error.message); process.exitCode = 1; });
module.exports = { migrate, config, runSql };
