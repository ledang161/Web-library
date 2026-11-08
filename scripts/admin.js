require('dotenv').config({ quiet: true });
const readline = require('node:readline/promises');
const { Writable } = require('node:stream');
const mysql = require('mysql2/promise');
const { config } = require('./migrate');
const { hashPassword } = require('../lib/security');

async function main() {
    let muted = false;
    const output = new Writable({ write(chunk, encoding, done) { if (!muted) process.stdout.write(chunk); done(); } });
    const rl = readline.createInterface({ input: process.stdin, output, terminal: Boolean(process.stdin.isTTY) });
    let email, name, password;
    try {
        email = (process.env.ADMIN_EMAIL || await rl.question('Email Admin mới: ')).trim().toLowerCase();
        name = (process.env.ADMIN_NAME || await rl.question('Tên Admin: ')).trim();
        if (process.env.ADMIN_PASSWORD) password = process.env.ADMIN_PASSWORD;
        else { process.stdout.write('Mật khẩu (không hiển thị): '); muted = true; password = await rl.question(''); muted = false; process.stdout.write('\n'); }
    } finally { rl.close(); }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 100 || !name || name.length > 100 || !password || password.length < 10 || password.length > 128) throw Error('Tên/email hợp lệ; mật khẩu phải có 10–128 ký tự.');
    const hash = await hashPassword(password);
    const pool = mysql.createPool(config());
    try {
        await pool.query('INSERT INTO users(name,email,password,role) VALUES (?,?,?,\'admin\')', [name, email, hash]);
        console.log('Đã tạo Admin. Tài khoản có sẵn không bị thay đổi.');
    } finally { await pool.end(); }
}
if (require.main === module) main().catch(e => { console.error(e.code === 'ER_DUP_ENTRY' ? 'Email đã tồn tại; không thay đổi mật khẩu hoặc quyền.' : e.code || e.message); process.exitCode = 1; });
