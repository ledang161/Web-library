const { randomBytes, scrypt: rawScrypt, timingSafeEqual, createHash } = require('node:crypto');
const scrypt = require('node:util').promisify(rawScrypt);
const token = () => randomBytes(32).toString('hex');
const digest = value => createHash('sha256').update(value).digest('hex');
const equal = (a, b) => typeof a === 'string' && typeof b === 'string' &&
    Buffer.byteLength(a) === Buffer.byteLength(b) && timingSafeEqual(Buffer.from(a), Buffer.from(b));

async function hashPassword(password) {
    const salt = randomBytes(16).toString('hex');
    return `scrypt$${salt}$${(await scrypt(password, salt, 64)).toString('hex')}`;
}

async function verifyPassword(password, stored) {
    if (stored.startsWith('scrypt$')) {
        const [, salt, hash] = stored.split('$');
        if (!/^[a-f0-9]{32}$/.test(salt || '') || !/^[a-f0-9]{128}$/.test(hash || '')) return false;
        return equal((await scrypt(password, salt, 64)).toString('hex'), hash);
    }
    // Upgrade legacy plaintext only on successful login; unknown hash formats are not plaintext.
    if (/^\$|^[a-f0-9]{32,128}$/i.test(stored)) return false;
    return equal(digest(password), digest(stored));
}

function todayVietnam() {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(new Date());
    const get = type => parts.find(part => part.type === type).value;
    return `${get('year')}-${get('month')}-${get('day')}`;
}

function validDate(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value < '1000-01-01') return false;
    const date = new Date(`${value}T00:00:00Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

module.exports = { token, digest, equal, hashPassword, verifyPassword, todayVietnam, validDate };
