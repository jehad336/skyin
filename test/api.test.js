'use strict';
const { test, before, after, describe } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers');
const config = require('../server/config');
const payments = require('../server/payments');

before(h.resetDb);
after(() => h.db.pool.end());

/** Book `slug` for 2 travellers and return the booking JSON. */
async function bookFor(c, slug = 'istanbul', travelers = 2) {
  const r = await c.post('/api/bookings').send({ slug, travel_date: h.tomorrow(), travelers });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return r.body.booking;
}
/** Run the mock gateway to the given result; returns the final pay-page view. */
async function mockPay(c, booking, result = 'paid') {
  const co = await c.post(`/api/pay/${booking.pay_token}/checkout`);
  assert.equal(co.status, 200, JSON.stringify(co.body));
  const id = co.body.url.split('/mock-pay/')[1];
  const r = await h.request(h.app).post(`/mock-pay/${id}`).type('form').send({ result });
  assert.equal(r.status, 303);
  return (await c.post(`/api/pay/${booking.pay_token}/verify`)).body;
}

describe('security basics', () => {
  test('state-changing API calls without the CSRF header are refused', async () => {
    const r = await h.request(h.app).post('/api/auth/login').send({ email: 'a@b.co', password: 'x' });
    assert.equal(r.status, 403);
  });
  test('security headers and CSP are set', async () => {
    const r = await h.request(h.app).get('/index.html');
    assert.equal(r.status, 200);
    assert.match(r.headers['content-security-policy'], /script-src 'self' 'sha256-/);
    assert.equal(r.headers['x-content-type-options'], 'nosniff');
  });
  test('server source and env files are not served', async () => {
    for (const p of ['/server/config.js', '/.env', '/package.json', '/data/destinations.json']) {
      assert.equal((await h.request(h.app).get(p)).status, 404, p);
    }
  });
});

describe('accounts', () => {
  test('register → me → logout → login', async () => {
    const c = await h.customer();
    assert.equal((await c.get('/api/auth/me')).body.user.email, c.email);
    await c.post('/api/auth/logout');
    assert.equal((await c.get('/api/auth/me')).body.user, null);
    const bad = await c.post('/api/auth/login').send({ email: c.email, password: 'wrong-password' });
    assert.equal(bad.status, 401);
    const ok = await c.post('/api/auth/login').send({ email: c.email.toUpperCase(), password: 'secret-pass-1' });
    assert.equal(ok.status, 200);
  });
  test('duplicate email and weak password are rejected with Arabic field errors', async () => {
    const c = await h.customer();
    const dup = await h.client().post('/api/auth/register').send({ name: 'آخر', email: c.email, password: 'another-pass' });
    assert.equal(dup.status, 400);
    assert.ok(dup.body.fields.email);
    const weak = await h.client().post('/api/auth/register').send({ name: 'س', email: 'x@y.com', password: '123' });
    assert.equal(weak.status, 400);
    assert.match(weak.body.fields.password, /8/);
    assert.ok(weak.body.fields.name);
  });
  test('the session cookie is httpOnly', async () => {
    const r = await h.client().post('/api/auth/register').send({ name: 'كوكي', email: 'cookie@example.com', password: 'secret-pass-1' });
    assert.match(r.headers['set-cookie'][0], /HttpOnly/i);
    assert.match(r.headers['set-cookie'][0], /SameSite=Lax/i);
  });
  test('changing the password signs out other sessions', async () => {
    const a = await h.customer();
    const b = h.client();
    await b.post('/api/auth/login').send({ email: a.email, password: 'secret-pass-1' });
    const r = await a.post('/api/auth/password').send({ current: 'secret-pass-1', password: 'new-secret-pass' });
    assert.equal(r.status, 200);
    assert.equal((await b.get('/api/auth/me')).body.user, null);
    assert.equal((await a.get('/api/auth/me')).body.user.email, a.email);
  });
});

describe('bookings', () => {
  test('booking requires sign-in', async () => {
    const r = await h.client().post('/api/bookings').send({ slug: 'istanbul', travel_date: h.tomorrow(), travelers: 2 });
    assert.equal(r.status, 401);
  });
  test('the total is computed on the server from the destination price', async () => {
    const c = await h.customer();
    const r = await c.post('/api/bookings').send({ slug: 'paris', travel_date: h.tomorrow(), travelers: 3, total: 1, unit_price: 1 });
    assert.equal(r.status, 201);
    assert.equal(r.body.booking.total, 4900 * 3);
    assert.equal(r.body.booking.status, 'pending_payment');
  });
  test('past dates, unknown destinations and inactive destinations are rejected', async () => {
    const c = await h.customer();
    assert.equal((await c.post('/api/bookings').send({ slug: 'paris', travel_date: '2020-01-01', travelers: 1 })).status, 400);
    assert.equal((await c.post('/api/bookings').send({ slug: 'atlantis', travel_date: h.tomorrow(), travelers: 1 })).status, 400);
    await h.db.query(`UPDATE destinations SET active = false WHERE slug = 'baku'`);
    assert.equal((await c.post('/api/bookings').send({ slug: 'baku', travel_date: h.tomorrow(), travelers: 1 })).status, 400);
    await h.db.query(`UPDATE destinations SET active = true WHERE slug = 'baku'`);
  });
  test('customers only see their own bookings', async () => {
    const a = await h.customer();
    const b = await h.customer();
    const bk = await bookFor(a);
    assert.equal((await b.get(`/api/bookings/${bk.ref}`)).status, 404);
    assert.equal((await b.get('/api/bookings')).body.bookings.length, 0);
    assert.equal((await a.get('/api/bookings')).body.bookings.length, 1);
  });
  test('a pending booking can be cancelled; then it cannot be paid', async () => {
    const c = await h.customer();
    const bk = await bookFor(c);
    assert.equal((await c.post(`/api/bookings/${bk.ref}/cancel`)).body.booking.status, 'cancelled');
    assert.equal((await c.post(`/api/pay/${bk.pay_token}/checkout`)).status, 409);
  });
});

describe('payments (mock gateway)', () => {
  test('successful payment marks the booking paid; paying twice is refused', async () => {
    const c = await h.customer();
    const bk = await bookFor(c, 'tbilisi', 2);
    const v = await mockPay(c, bk, 'paid');
    assert.equal(v.booking.status, 'paid');
    assert.ok(v.booking.paid_at);
    assert.equal((await c.post(`/api/pay/${bk.pay_token}/checkout`)).status, 409);
    const p = await h.db.one(`SELECT p.* FROM payments p JOIN bookings b ON b.id = p.booking_id WHERE b.ref = $1`, [bk.ref]);
    assert.equal(p.status, 'paid');
    assert.equal(p.amount_halalas, 1850 * 2 * 100);
  });
  test('a declined payment leaves the booking payable', async () => {
    const c = await h.customer();
    const bk = await bookFor(c);
    const v = await mockPay(c, bk, 'failed');
    assert.equal(v.booking.status, 'pending_payment');
    assert.equal(v.last_payment_status, 'failed');
    assert.equal((await mockPay(c, bk, 'paid')).booking.status, 'paid');
  });
  test('opening checkout twice reuses the same open payment', async () => {
    const c = await h.customer();
    const bk = await bookFor(c);
    const a = await c.post(`/api/pay/${bk.pay_token}/checkout`);
    const b = await c.post(`/api/pay/${bk.pay_token}/checkout`);
    assert.equal(a.body.url, b.body.url);
  });
  test('a gateway amount that does not match is never accepted', async () => {
    const c = await h.customer();
    const bk = await bookFor(c);
    const co = await c.post(`/api/pay/${bk.pay_token}/checkout`);
    const id = Number(co.body.url.split('/mock-pay/')[1]);
    await h.db.query(`UPDATE payments SET raw = raw || '{"mock_status":"paid"}' WHERE id = $1`, [id]);
    const mock = payments.provider('mock');
    const orig = mock.fetchStatus;
    mock.fetchStatus = async (ref) => ({ ...(await orig(ref)), amount: 100 });
    try { await payments.syncPayment(id); } finally { mock.fetchStatus = orig; }
    const p = await h.db.one('SELECT status, failure_reason FROM payments WHERE id = $1', [id]);
    assert.equal(p.status, 'failed');
    assert.equal(p.failure_reason, 'amount mismatch');
    assert.equal((await c.get(`/api/bookings/${bk.ref}`)).body.booking.status, 'pending_payment');
  });
  test('an invalid payment link returns 404', async () => {
    assert.equal((await h.client().get('/api/pay/not-a-real-token-at-all-xxxx')).status, 404);
  });
});

describe('payments (Moyasar, with a fake API)', () => {
  let calls, invoiceStatus, realFetch;
  before(() => {
    config.payments.provider = 'moyasar';
    config.payments.moyasarSecretKey = 'sk_test_fake';
    config.payments.webhookKey = 'hook-secret';
    realFetch = global.fetch;
    calls = [];
    invoiceStatus = 'initiated';
    global.fetch = async (url, opts) => {
      if (!String(url).startsWith('https://api.moyasar.com')) return realFetch(url, opts);
      const body = opts.body ? JSON.parse(opts.body) : null;
      calls.push({ url: String(url), method: opts.method, auth: opts.headers.Authorization, body });
      const inv = { id: 'inv_123', status: invoiceStatus, amount: 245000 * 2, currency: 'SAR', url: 'https://checkout.moyasar.com/invoices/inv_123' };
      return new Response(JSON.stringify(inv), { status: opts.method === 'POST' ? 201 : 200, headers: { 'Content-Type': 'application/json' } });
    };
  });
  after(() => {
    global.fetch = realFetch;
    config.payments.provider = 'mock';
    config.payments.webhookKey = '';
  });

  test('creates an invoice with the right amount, auth and URLs; webhook confirms via the API', async () => {
    const c = await h.customer();
    const bk = await bookFor(c, 'istanbul', 2);
    const co = await c.post(`/api/pay/${bk.pay_token}/checkout`);
    assert.equal(co.status, 200, JSON.stringify(co.body));
    assert.equal(co.body.url, 'https://checkout.moyasar.com/invoices/inv_123');
    const create = calls.find((x) => x.method === 'POST');
    assert.equal(create.url, 'https://api.moyasar.com/v1/invoices');
    assert.equal(create.auth, 'Basic ' + Buffer.from('sk_test_fake:').toString('base64'));
    assert.equal(create.body.amount, 2450 * 2 * 100);
    assert.equal(create.body.currency, 'SAR');
    assert.match(create.body.success_url, /\/pay\.html\?t=.+&return=1$/);
    assert.match(create.body.callback_url, /\/api\/webhooks\/moyasar\?key=hook-secret$/);

    // Wrong key → ignored.
    assert.equal((await h.request(h.app).post('/api/webhooks/moyasar?key=nope').send({ id: 'inv_123', status: 'paid' })).status, 401);
    // Webhook body says "paid" but the API still says "initiated" → not paid.
    await h.request(h.app).post('/api/webhooks/moyasar?key=hook-secret').send({ id: 'inv_123', status: 'paid' });
    assert.equal((await c.get(`/api/bookings/${bk.ref}`)).body.booking.status, 'pending_payment');
    // API confirms paid → booking paid.
    invoiceStatus = 'paid';
    const w = await h.request(h.app).post('/api/webhooks/moyasar?key=hook-secret').send({ id: 'inv_123', status: 'paid' });
    assert.equal(w.status, 200);
    assert.equal((await c.get(`/api/bookings/${bk.ref}`)).body.booking.status, 'paid');
    assert.ok(calls.some((x) => x.method === 'GET' && x.url.endsWith('/invoices/inv_123')));
  });
});

describe('quotes, messages, destinations (public)', () => {
  test('quote and contact message are stored', async () => {
    const q = await h.client().post('/api/quotes').send({ name: 'سارة', phone: '+966 50 123 4567', service: 'حجز الطيران', date: h.tomorrow(), travelers: '٣' });
    assert.equal(q.status, 201, JSON.stringify(q.body));
    const row = await h.db.one('SELECT * FROM quotes WHERE id = $1', [q.body.quote.id]);
    assert.equal(row.travelers, 3);
    assert.equal(row.phone, '+966501234567');
    const m = await h.client().post('/api/messages').send({ name: 'سارة', phone: '+966501234567', email: 's@example.com', topic: 'تأشيرة', message: 'أحتاج مساعدة في التأشيرة' });
    assert.equal(m.status, 201);
    const bad = await h.client().post('/api/messages').send({ name: 'س', email: 'nope', topic: '', message: 'قصير' });
    assert.equal(bad.status, 400);
    assert.ok(bad.body.fields.email && bad.body.fields.message && bad.body.fields.phone);
  });
  test('destinations list is public and only shows active ones', async () => {
    const r = await h.client().get('/api/destinations');
    assert.equal(r.status, 200);
    assert.equal(r.body.destinations.length, 9);
    assert.equal(r.body.destinations[0].slug, 'istanbul');
    assert.equal(r.body.destinations[0].price, 2450);
  });
});

describe('admin', () => {
  test('customers cannot use the admin API', async () => {
    const c = await h.customer();
    assert.equal((await c.get('/api/admin/stats')).status, 403);
    assert.equal((await h.client().get('/api/admin/stats')).status, 401);
  });
  test('answer a quote with a custom booking + pay link; the customer pays it', async () => {
    const cust = await h.customer();
    const q = await cust.post('/api/quotes').send({ name: 'أحمد', phone: '+966500000002', service: 'سفر الشركات', travelers: 4 });
    const a = await h.admin();
    const r = await a.post('/api/admin/bookings').send({
      quote_id: q.body.quote.id, title: 'رحلة عمل إلى دبي', customer_name: 'أحمد', customer_phone: '+966500000002',
      travel_date: h.tomorrow(), travelers: 4, total: '12500.50',
    });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal(r.body.booking.total, 12500.5);
    assert.match(r.body.booking.pay_link, /\/pay\.html\?t=/);
    assert.equal((await h.db.one('SELECT status FROM quotes WHERE id = $1', [q.body.quote.id])).status, 'quoted');
    // Linked to the customer who sent the quote while signed in.
    const mine = (await cust.get('/api/bookings')).body.bookings;
    assert.equal(mine.length, 1);
    const token = new URL(r.body.booking.pay_link).searchParams.get('t');
    const guest = h.client(); // a pay link works without signing in
    assert.equal((await guest.get(`/api/pay/${token}`)).body.booking.total, 12500.5);
    assert.equal((await mockPay(guest, { pay_token: token })).booking.status, 'paid');
    const stats = (await a.get('/api/admin/stats')).body.stats;
    assert.ok(stats.revenue >= 12500.5);
  });
  test('admin cannot mark a booking paid by hand, but can confirm a paid one', async () => {
    const c = await h.customer();
    const bk = await bookFor(c);
    const a = await h.admin();
    const id = (await h.db.one('SELECT id FROM bookings WHERE ref = $1', [bk.ref])).id;
    assert.equal((await a.patch(`/api/admin/bookings/${id}`).send({ status: 'paid' })).status, 409);
    await mockPay(c, bk);
    const ok = await a.patch(`/api/admin/bookings/${id}`).send({ status: 'confirmed', admin_note: 'تم حجز الفندق' });
    assert.equal(ok.status, 200);
    assert.equal(ok.body.booking.status, 'confirmed');
  });
  test('destination CRUD updates the public list and new bookings use the new price', async () => {
    const a = await h.admin();
    const created = await a.post('/api/admin/destinations').send({
      slug: 'cairo', city: 'القاهرة', country: 'مصر', region: 'africa', price: 1500, nights: 4,
      highlights: ['الأهرامات'], includes: ['الفندق'],
    });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const dup = await a.post('/api/admin/destinations').send({ slug: 'cairo', city: 'x', country: 'y', region: 'africa', price: 1, nights: 1 });
    assert.equal(dup.status, 400);
    const id = created.body.destination.id;
    const upd = await a.put(`/api/admin/destinations/${id}`).send({ ...created.body.destination, price: 1750, image_url: undefined });
    assert.equal(upd.status, 200, JSON.stringify(upd.body));
    const pub = (await h.client().get('/api/destinations/cairo')).body.destination;
    assert.equal(pub.price, 1750);
    const c = await h.customer();
    assert.equal((await bookFor(c, 'cairo', 2)).total, 3500);
    assert.equal((await a.delete(`/api/admin/destinations/${id}`)).status, 409); // has bookings
  });
  test('an admin cannot change their own role', async () => {
    const a = await h.admin();
    const me = (await a.get('/api/auth/me')).body.user;
    assert.equal((await a.patch(`/api/admin/customers/${me.id}`).send({ role: 'customer' })).status, 400);
  });
});
