'use strict';
/* Apply SQL migrations in server/migrations (in file-name order), once each. */
const fs = require('fs');
const path = require('path');
const db = require('./db');

async function migrate({ log = console.log } = {}) {
  await db.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`);
  const done = new Set((await db.many('SELECT name FROM schema_migrations')).map((r) => r.name));
  const dir = path.join(__dirname, 'migrations');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  for (const f of files) {
    if (done.has(f)) continue;
    const sql = fs.readFileSync(path.join(dir, f), 'utf8');
    await db.tx(async (c) => {
      await c.query(sql);
      await c.query('INSERT INTO schema_migrations(name) VALUES ($1)', [f]);
    });
    log(`migrated ${f}`);
  }
}

module.exports = { migrate };

if (require.main === module) {
  migrate().then(() => db.pool.end()).catch((e) => { console.error(e); process.exit(1); });
}
