'use strict';
const config = require('./config');
const db = require('./db');
const { migrate } = require('./migrate');
const { seedDestinations } = require('./seed');
const { pruneSessions } = require('./lib/auth');
const { createApp } = require('./app');

async function main() {
  await migrate();
  await seedDestinations();
  const app = createApp();
  const server = app.listen(config.port, () => {
    console.log(`Skyin running on ${config.appUrl}  (payments: ${config.payments.provider}, env: ${config.env})`);
  });
  const prune = setInterval(() => pruneSessions().catch(() => {}), 6 * 3600 * 1000);
  const stop = () => { clearInterval(prune); server.close(() => db.pool.end().then(() => process.exit(0))); };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

main().catch((e) => { console.error(e); process.exit(1); });
