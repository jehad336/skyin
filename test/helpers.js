'use strict';
/* Test setup: a clean skyin_test database for every test file. */
process.env.NODE_ENV = 'test';
process.env.ENV_FILE = '.env.test-none'; // don't load the developer .env
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgres://skyin:skyin@localhost:5433/skyin_test';
process.env.APP_URL = 'http://localhost:3999';
process.env.PAYMENT_PROVIDER = 'mock';

const request = require('supertest');
const db = require('../server/db');
const { migrate } = require('../server/migrate');
const { seedDestinations } = require('../server/seed');
const { hashPassword } = require('../server/lib/auth');
const { createApp } = require('../server/app');

async function resetDb() {
  await db.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await migrate({ log: () => {} });
  await seedDestinations({ log: () => {} });
}

const app = createApp();

/** A supertest agent that keeps cookies and sends the CSRF header. */
function client() {
  const agent = request.agent(app);
  const wrap = (m) => (url) => agent[m](url).set('X-Skyin', '1');
  return { get: wrap('get'), post: wrap('post'), patch: wrap('patch'), put: wrap('put'), delete: wrap('delete'), raw: agent };
}

let n = 0;
async function customer(extra = {}) {
  const c = client();
  const email = `user${++n}_${Date.now()}@example.com`;
  const r = await c.post('/api/auth/register').send({ name: 'عميل تجريبي', email, phone: '+966500000001', password: 'secret-pass-1', ...extra });
  if (r.status !== 201) throw new Error('register failed: ' + JSON.stringify(r.body));
  return Object.assign(c, { user: r.body.user, email });
}

async function admin() {
  const email = `admin${++n}@example.com`;
  await db.query(`INSERT INTO users (name, email, password_hash, role) VALUES ('مدير', $1, $2, 'admin')`, [email, await hashPassword('admin-pass-1')]);
  const c = client();
  const r = await c.post('/api/auth/login').send({ email, password: 'admin-pass-1' });
  if (r.status !== 200) throw new Error('admin login failed');
  return c;
}

const tomorrow = () => new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);

module.exports = { app, db, request, resetDb, client, customer, admin, tomorrow };
