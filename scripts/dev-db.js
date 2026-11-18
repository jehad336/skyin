'use strict';
/* Local PostgreSQL without Docker (development & tests only).
   Runs a real PostgreSQL server from the embedded-postgres npm package on port 5433,
   with data in .pgdata/. Leave it running in its own terminal:   npm run db:local
   (If you prefer Docker:  npm run db:up — same port and credentials.) */
const path = require('path');
const fs = require('fs');
const EmbeddedPostgres = require('embedded-postgres').default;

const dir = path.join(__dirname, '..', '.pgdata');
const pg = new EmbeddedPostgres({
  databaseDir: dir, user: 'skyin', password: 'skyin', port: 5433, persistent: true,
  onLog: () => {}, onError: (e) => console.error(String(e)),
});

(async () => {
  if (!fs.existsSync(path.join(dir, 'PG_VERSION'))) await pg.initialise();
  await pg.start();
  for (const name of ['skyin', 'skyin_test']) {
    try { await pg.createDatabase(name); } catch (_) { /* already exists */ }
  }
  console.log('PostgreSQL ready on localhost:5433 (databases: skyin, skyin_test). Ctrl+C to stop.');
  const stop = async () => { await pg.stop(); process.exit(0); };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
})().catch((e) => { console.error(e); process.exit(1); });
