'use strict';
/* Admin API — every route requires role = admin. */
const express = require('express');
const db = require('../db');
const { parse, v, z, optional, bad, notFound, conflict } = require('../lib/http');
const { requireAdmin } = require('../lib/auth');
const { bookingRef, payToken, publicDestination } = require('../lib/util');
const config = require('../config');

const r = express.Router();
r.use(requireAdmin);

const page = (q) => parse(z.object({
  q: optional(z.string().trim().max(100)),
  status: optional(z.string().trim().max(40)),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
}), q);
const like = (s) => `%${String(s).replace(/[\\%_]/g, (c) => '\\' + c)}%`;
const sar = (h) => (h == null ? null : h / 100);
const payLink = (token) => `${config.appUrl}/pay.html?t=${encodeURIComponent(token)}`;

/* ---------- Overview ---------- */
r.get('/stats', async (_req, res) => {
  const s = await db.one(`SELECT
      (SELECT count(*) FROM users WHERE role = 'customer')                                   AS customers,
      (SELECT count(*) FROM bookings)                                                        AS bookings,
      (SELECT count(*) FROM bookings WHERE status = 'pending_payment')                       AS pending_payment,
      (SELECT count(*) FROM bookings WHERE status IN ('paid','confirmed'))                   AS paid_bookings,
      (SELECT COALESCE(sum(amount_halalas),0) FROM payments WHERE status = 'paid')           AS revenue,
      (SELECT COALESCE(sum(amount_halalas),0) FROM payments WHERE status = 'paid'
          AND created_at > now() - interval '30 days')                                       AS revenue_30d,
      (SELECT count(*) FROM quotes WHERE status = 'new')                                     AS new_quotes,
      (SELECT count(*) FROM messages WHERE status = 'new')                                   AS new_messages`);
  res.json({ stats: { ...s, revenue: sar(Number(s.revenue)), revenue_30d: sar(Number(s.revenue_30d)) } });
});

/* ---------- Bookings ---------- */
const BOOKING_STATUSES = ['pending_payment', 'paid', 'confirmed', 'cancelled', 'refunded'];
const adminBooking = (b) => ({
  id: b.id, ref: b.ref, title: b.title, status: b.status, customer_name: b.customer_name, customer_phone: b.customer_phone,
  customer_email: b.customer_email, user_id: b.user_id, travel_date: b.travel_date, travelers: b.travelers,
  unit_price: sar(b.unit_price_halalas), total: sar(b.total_halalas), currency: b.currency, notes: b.notes,
  admin_note: b.admin_note, quote_id: b.quote_id, destination_slug: b.destination_slug, paid_at: b.paid_at,
  created_at: b.created_at, pay_link: payLink(b.pay_token),
});

r.get('/bookings', async (req, res) => {
  const p = page(req.query);
  const rows = await db.many(
    `SELECT b.*, d.slug AS destination_slug, count(*) OVER() AS _total
       FROM bookings b LEFT JOIN destinations d ON d.id = b.destination_id
      WHERE ($1::text IS NULL OR b.status = $1)
        AND ($2::text IS NULL OR b.ref ILIKE $2 OR b.customer_name ILIKE $2 OR b.customer_phone ILIKE $2
             OR b.customer_email::text ILIKE $2 OR b.title ILIKE $2)
      ORDER BY b.created_at DESC LIMIT $3 OFFSET $4`,
    [p.status || null, p.q ? like(p.q) : null, p.limit, p.offset]);
  res.json({ total: rows[0] ? rows[0]._total : 0, bookings: rows.map(adminBooking) });
});

r.get('/bookings/:id', async (req, res) => {
  const b = await db.one(`SELECT b.*, d.slug AS destination_slug FROM bookings b LEFT JOIN destinations d ON d.id = b.destination_id
                           WHERE b.id = $1`, [parse(v.id, req.params.id)]);
  if (!b) throw notFound('الحجز غير موجود.');
  const pays = await db.many(`SELECT id, provider, provider_ref, amount_halalas, status, failure_reason, created_at
                                FROM payments WHERE booking_id = $1 ORDER BY created_at DESC`, [b.id]);
  res.json({ booking: adminBooking(b), payments: pays.map((x) => ({ ...x, amount: sar(x.amount_halalas) })) });
});

// Custom booking (e.g. answering a quote): the admin sets the price; the customer pays via the link.
r.post('/bookings', async (req, res) => {
  const b = parse(z.object({
    title: z.string().trim().min(3, 'اكتب عنوان الحجز.').max(200),
    customer_name: v.name, customer_phone: v.phone, customer_email: optional(v.email),
    travel_date: optional(v.futureDate), travelers: v.travelers,
    total: z.coerce.number({ error: 'اكتب المبلغ.' }).positive('اكتب المبلغ.').max(10_000_000),
    notes: optional(v.text(1000)), quote_id: optional(v.id),
  }), req.body);
  const total = Math.round(b.total * 100);
  if (total < 100) throw bad('أقل مبلغ 1 ريال.', { total: 'أقل مبلغ 1 ريال.' });

  const row = await db.tx(async (c) => {
    let userId = null;
    if (b.quote_id) {
      const q = (await c.query('SELECT user_id FROM quotes WHERE id = $1 FOR UPDATE', [b.quote_id])).rows[0];
      if (!q) throw bad('طلب عرض السعر غير موجود.');
      userId = q.user_id;
      await c.query(`UPDATE quotes SET status = 'quoted' WHERE id = $1`, [b.quote_id]);
    }
    if (!userId && b.customer_email) {
      const u = (await c.query('SELECT id FROM users WHERE email = $1', [b.customer_email])).rows[0];
      if (u) userId = u.id;
    }
    return (await c.query(
      `INSERT INTO bookings (ref, pay_token, user_id, quote_id, title, customer_name, customer_phone, customer_email,
                             travel_date, travelers, total_halalas, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [bookingRef(), payToken(), userId, b.quote_id || null, b.title, b.customer_name, b.customer_phone,
        b.customer_email || null, b.travel_date || null, b.travelers, total, b.notes || null])).rows[0];
  });
  res.status(201).json({ booking: adminBooking(row) });
});

// Status changes the admin may make by hand. "paid" only comes from a verified gateway payment.
const TRANSITIONS = {
  pending_payment: ['cancelled'],
  paid: ['confirmed', 'refunded', 'cancelled'],
  confirmed: ['refunded', 'cancelled'],
  cancelled: [],
  refunded: [],
};
r.patch('/bookings/:id', async (req, res) => {
  const id = parse(v.id, req.params.id);
  const b = parse(z.object({ status: optional(z.enum(BOOKING_STATUSES)), admin_note: optional(v.text(2000)) }), req.body);
  const row = await db.tx(async (c) => {
    const cur = (await c.query('SELECT * FROM bookings WHERE id = $1 FOR UPDATE', [id])).rows[0];
    if (!cur) throw notFound('الحجز غير موجود.');
    if (b.status && b.status !== cur.status && !TRANSITIONS[cur.status].includes(b.status)) {
      throw conflict('لا يمكن تغيير حالة الحجز بهذا الشكل.');
    }
    return (await c.query(
      `UPDATE bookings SET status = COALESCE($2, status), admin_note = COALESCE($3, admin_note), updated_at = now()
        WHERE id = $1 RETURNING *`, [id, b.status || null, b.admin_note ?? null])).rows[0];
  });
  res.json({ booking: adminBooking(row) });
});

/* ---------- Customers ---------- */
r.get('/customers', async (req, res) => {
  const p = page(req.query);
  const rows = await db.many(
    `SELECT u.id, u.name, u.email, u.phone, u.role, u.created_at, u.last_login_at,
            count(b.id) AS bookings,
            COALESCE(sum(b.total_halalas) FILTER (WHERE b.status IN ('paid','confirmed')), 0) AS paid_total,
            count(*) OVER() AS _total
       FROM users u LEFT JOIN bookings b ON b.user_id = u.id
      WHERE ($1::text IS NULL OR u.name ILIKE $1 OR u.email::text ILIKE $1 OR u.phone ILIKE $1)
      GROUP BY u.id ORDER BY u.created_at DESC LIMIT $2 OFFSET $3`,
    [p.q ? like(p.q) : null, p.limit, p.offset]);
  res.json({
    total: rows[0] ? Number(rows[0]._total) : 0,
    customers: rows.map(({ _total, paid_total, ...u }) => ({ ...u, paid_total: sar(Number(paid_total)) })),
  });
});

r.patch('/customers/:id', async (req, res) => {
  const id = parse(v.id, req.params.id);
  const b = parse(z.object({ role: z.enum(['customer', 'admin']) }), req.body);
  if (id === req.user.id) throw bad('لا يمكنك تغيير صلاحية حسابك.');
  const u = await db.one('UPDATE users SET role = $2 WHERE id = $1 RETURNING id, name, email, role', [id, b.role]);
  if (!u) throw notFound('العميل غير موجود.');
  if (b.role === 'customer') await db.query('DELETE FROM sessions WHERE user_id = $1', [id]);
  res.json({ customer: u });
});

/* ---------- Payments ---------- */
r.get('/payments', async (req, res) => {
  const p = page(req.query);
  const rows = await db.many(
    `SELECT p.id, p.provider, p.provider_ref, p.amount_halalas, p.currency, p.status, p.failure_reason, p.created_at,
            b.id AS booking_id, b.ref, b.customer_name, count(*) OVER() AS _total
       FROM payments p JOIN bookings b ON b.id = p.booking_id
      WHERE ($1::text IS NULL OR p.status = $1)
        AND ($2::text IS NULL OR b.ref ILIKE $2 OR b.customer_name ILIKE $2 OR p.provider_ref ILIKE $2)
      ORDER BY p.created_at DESC LIMIT $3 OFFSET $4`,
    [p.status || null, p.q ? like(p.q) : null, p.limit, p.offset]);
  res.json({ total: rows[0] ? rows[0]._total : 0, payments: rows.map(({ _total, ...x }) => ({ ...x, amount: sar(x.amount_halalas) })) });
});

/* ---------- Quotes & messages ---------- */
r.get('/quotes', async (req, res) => {
  const p = page(req.query);
  const rows = await db.many(
    `SELECT q.*, count(*) OVER() AS _total FROM quotes q
      WHERE ($1::text IS NULL OR q.status = $1)
        AND ($2::text IS NULL OR q.name ILIKE $2 OR q.phone ILIKE $2 OR q.service ILIKE $2)
      ORDER BY q.created_at DESC LIMIT $3 OFFSET $4`, [p.status || null, p.q ? like(p.q) : null, p.limit, p.offset]);
  res.json({ total: rows[0] ? rows[0]._total : 0, quotes: rows.map(({ _total, ...x }) => x) });
});
r.patch('/quotes/:id', async (req, res) => {
  const b = parse(z.object({ status: optional(z.enum(['new', 'contacted', 'quoted', 'closed'])), admin_note: optional(v.text(2000)) }), req.body);
  const q = await db.one(`UPDATE quotes SET status = COALESCE($2, status), admin_note = COALESCE($3, admin_note) WHERE id = $1 RETURNING *`,
    [parse(v.id, req.params.id), b.status || null, b.admin_note ?? null]);
  if (!q) throw notFound('الطلب غير موجود.');
  res.json({ quote: q });
});

r.get('/messages', async (req, res) => {
  const p = page(req.query);
  const rows = await db.many(
    `SELECT m.*, count(*) OVER() AS _total FROM messages m
      WHERE ($1::text IS NULL OR m.status = $1)
        AND ($2::text IS NULL OR m.name ILIKE $2 OR m.email::text ILIKE $2 OR m.message ILIKE $2)
      ORDER BY m.created_at DESC LIMIT $3 OFFSET $4`, [p.status || null, p.q ? like(p.q) : null, p.limit, p.offset]);
  res.json({ total: rows[0] ? rows[0]._total : 0, messages: rows.map(({ _total, ...x }) => x) });
});
r.patch('/messages/:id', async (req, res) => {
  const b = parse(z.object({ status: z.enum(['new', 'read', 'archived']) }), req.body);
  const m = await db.one('UPDATE messages SET status = $2 WHERE id = $1 RETURNING *', [parse(v.id, req.params.id), b.status]);
  if (!m) throw notFound('الرسالة غير موجودة.');
  res.json({ message: m });
});

/* ---------- Destinations ---------- */
const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'لون بصيغة #RRGGBB.');
const destSchema = z.object({
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'حروف إنجليزية صغيرة وأرقام وشرطات فقط.').max(60),
  city: z.string().trim().min(2, 'اكتب اسم المدينة.').max(80),
  country: z.string().trim().min(2, 'اكتب اسم الدولة.').max(80),
  region: z.enum(['europe', 'asia', 'caucasus', 'islands', 'middle-east', 'africa', 'americas'], { message: 'اختر المنطقة.' }),
  price: z.coerce.number({ error: 'اكتب السعر.' }).min(1, 'اكتب السعر.').max(1_000_000),
  nights: z.coerce.number().int().min(1, 'ليلة واحدة على الأقل.').max(60),
  c1: hex.default('#04B2CD'), c2: hex.default('#0B2A3A'),
  best: v.text(200).default(''), summary: v.text(1000).default(''),
  highlights: z.array(z.string().trim().min(1).max(200)).max(12).default([]),
  includes: z.array(z.string().trim().min(1).max(60)).max(12).default([]),
  image_url: optional(z.string().trim().max(500).refine((s) => /^(https:\/\/|assets\/images\/)/.test(s), 'رابط https:// أو مسار assets/images/.')),
  active: z.boolean().default(true),
  sort: z.coerce.number().int().min(0).max(10000).default(0),
});
const destParams = (d) => [d.slug, d.city, d.country, d.region, Math.round(d.price * 100), d.nights, d.c1, d.c2, d.best, d.summary,
  JSON.stringify(d.highlights), JSON.stringify(d.includes), d.image_url || null, d.active, d.sort];

r.get('/destinations', async (_req, res) => {
  const rows = await db.many('SELECT * FROM destinations ORDER BY sort, id');
  res.json({ destinations: rows.map(publicDestination) });
});
r.post('/destinations', async (req, res) => {
  const d = parse(destSchema, req.body);
  const row = await db.one(
    `INSERT INTO destinations (slug, city, country, region, price_halalas, nights, c1, c2, best, summary, highlights, includes, image_url, active, sort)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) ON CONFLICT (slug) DO NOTHING RETURNING *`, destParams(d));
  if (!row) throw bad('هذا المعرّف مستخدم لوجهة أخرى.', { slug: 'مستخدم مسبقاً.' });
  res.status(201).json({ destination: publicDestination(row) });
});
r.put('/destinations/:id', async (req, res) => {
  const d = parse(destSchema, req.body);
  try {
    const row = await db.one(
      `UPDATE destinations SET slug=$1, city=$2, country=$3, region=$4, price_halalas=$5, nights=$6, c1=$7, c2=$8, best=$9, summary=$10,
              highlights=$11, includes=$12, image_url=$13, active=$14, sort=$15, updated_at=now()
        WHERE id = $16 RETURNING *`, [...destParams(d), parse(v.id, req.params.id)]);
    if (!row) throw notFound('الوجهة غير موجودة.');
    res.json({ destination: publicDestination(row) });
  } catch (e) {
    if (e.code === '23505') throw bad('هذا المعرّف مستخدم لوجهة أخرى.', { slug: 'مستخدم مسبقاً.' });
    throw e;
  }
});
r.delete('/destinations/:id', async (req, res) => {
  const id = parse(v.id, req.params.id);
  const used = await db.one('SELECT 1 FROM bookings WHERE destination_id = $1 LIMIT 1', [id]);
  if (used) throw conflict('عليها حجوزات، لذلك لا يمكن حذفها. أوقف عرضها بدلاً من ذلك.');
  const row = await db.one('DELETE FROM destinations WHERE id = $1 RETURNING id', [id]);
  if (!row) throw notFound('الوجهة غير موجودة.');
  res.json({ ok: true });
});

module.exports = r;
