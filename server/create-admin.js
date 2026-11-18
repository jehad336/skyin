'use strict';
/* Create an admin account, or promote an existing one.
   Usage:  npm run create-admin -- you@example.com "Your Name"
   The password is read from the ADMIN_PASSWORD environment variable, or asked for interactively. */
const readline = require('readline');
const db = require('./db');
const { migrate } = require('./migrate');
const { hashPassword } = require('./lib/auth');

async function ask(q) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((res) => rl.question(q, (a) => { rl.close(); res(a); }));
}

(async () => {
  const [email, name = 'مدير سكاي إن'] = process.argv.slice(2);
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    console.error('Usage: npm run create-admin -- you@example.com "Your Name"');
    process.exit(1);
  }
  await migrate({ log: () => {} });
  const existing = await db.one('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
  if (existing) {
    await db.query(`UPDATE users SET role = 'admin' WHERE id = $1`, [existing.id]);
    console.log(`${email} is now an admin (password unchanged).`);
  } else {
    const pw = process.env.ADMIN_PASSWORD || (await ask('Password (min 8 chars): '));
    if (!pw || pw.length < 8) { console.error('Password must be at least 8 characters.'); process.exit(1); }
    await db.query(`INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, 'admin')`,
      [name, email.toLowerCase(), await hashPassword(pw)]);
    console.log(`Admin ${email} created.`);
  }
  await db.pool.end();
})().catch((e) => { console.error(e); process.exit(1); });
