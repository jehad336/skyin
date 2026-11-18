'use strict';
/* Customer bookings + payment links. */
const express = require('express');
const db = require('../db');
const { parse, v, z, optional, bad, notFound, conflict, todayRiyadh } = require('../lib/http');
const { requireUser } = require('../lib/auth');
const { bookingRef, payToken, publicBooking } = require('../lib/util');
const payments = require('../payments');

const r = express.Router();

const BOOKING_SELECT = `SELECT b.*, d.slug AS destination_slug FROM bookings b LEFT JOIN destinations d ON d.id = b.destination_id`;

/* ---- Customer: create & list own bookings ---- */
r.post('/bookings', requireUser, async (req, res) => {
  const b = parse(z.object({
    slug: z.string().trim().min(1, 'اختر الوجهة.').max(80),
    travel_date: v.futureDate, travelers: v.travelers.refine((n) => n <= 20, 'للمجموعات فوق 20 مسافراً اطلب عرض سعر.'),
    phone: optional(v.phone), notes: optional(v.text(1000)),
  }), req.body);
  const d = await db.one('SELECT * FROM destinations WHERE slug = $1 AND active', [b.slug]);
  if (!d) throw bad('الوجهة غير متاحة للحجز حالياً.', { slug: 'الوجهة غير متاحة.' });
  const phone = b.phone || req.user.phone;
  if (!phone) throw bad('أضف رقم جوال للتواصل.', { phone: 'أضف رقم جوال للتواصل.' });

  // Price is always computed on the server from the current destination price.
  const total = d.price_halalas * b.travelers;
  const row = await db.one(
    `INSERT INTO bookings (ref, pay_token, user_id, destination_id, title, customer_name, customer_phone, customer_email,
                           travel_date, travelers, unit_price_halalas, total_halalas, notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
    [bookingRef(), payToken(), req.user.id, d.id, `باقة ${d.city} — ${d.nights} ليالٍ`, req.user.name, phone, req.user.email,
      b.travel_date, b.travelers, d.price_halalas, total, b.notes || null]);
  if (!req.user.phone && b.phone) await db.query('UPDATE users SET phone = $2 WHERE id = $1', [req.user.id, b.phone]);
  res.status(201).json({ booking: publicBooking({ ...row, destination_slug: d.slug }) });
});

r.get('/bookings', requireUser, async (req, res) => {
  const rows = await db.many(`${BOOKING_SELECT} WHERE b.user_id = $1 ORDER BY b.created_at DESC LIMIT 100`, [req.user.id]);
  res.json({ bookings: rows.map(publicBooking) });
});

r.get('/bookings/:ref', requireUser, async (req, res) => {
  const row = await db.one(`${BOOKING_SELECT} WHERE b.ref = $1 AND b.user_id = $2`, [String(req.params.ref), req.user.id]);
  if (!row) throw notFound('الحجز غير موجود.');
  res.json({ booking: publicBooking(row) });
});

r.post('/bookings/:ref/cancel', requireUser, async (req, res) => {
  const row = await db.one(
    `UPDATE bookings SET status = 'cancelled', updated_at = now()
      WHERE ref = $1 AND user_id = $2 AND status = 'pending_payment' RETURNING *`, [String(req.params.ref), req.user.id]);
  if (!row) throw conflict('لا يمكن إلغاء هذا الحجز من هنا. تواصل معنا للمساعدة.');
  res.json({ booking: publicBooking(row) });
});

r.get('/me/quotes', requireUser, async (req, res) => {
  const rows = await db.many(
    `SELECT id, service, travel_date, travelers, status, created_at FROM quotes WHERE user_id = $1 ORDER BY created_at DESC LIMIT 100`,
    [req.user.id]);
  res.json({ quotes: rows });
});

/* ---- Payment link: anyone holding the token (customer from their account, or a link the agency sent) ---- */
const byToken = async (token) => {
  const t = String(token || '');
  if (t.length < 20 || t.length > 64) return null;
  return db.one(`${BOOKING_SELECT} WHERE b.pay_token = $1`, [t]);
};
const linkView = (b) => {
  const p = publicBooking(b);
  delete p.notes; // payment page shows only what is needed to pay
  return p;
};

r.get('/pay/:token', async (req, res) => {
  const b = await byToken(req.params.token);
  if (!b) throw notFound('رابط الدفع غير صحيح أو منتهي.');
  res.json({ booking: linkView(b) });
});

r.post('/pay/:token/checkout', async (req, res) => {
  const b = await byToken(req.params.token);
  if (!b) throw notFound('رابط الدفع غير صحيح أو منتهي.');
  if (b.status === 'pending_payment' && b.travel_date && b.travel_date < todayRiyadh()) {
    throw conflict('تاريخ هذه الرحلة مضى. تواصل معنا لتحديث الحجز.');
  }
  const { url } = await payments.startCheckout(b);
  res.json({ url });
});

r.post('/pay/:token/verify', async (req, res) => {
  const b = await byToken(req.params.token);
  if (!b) throw notFound('رابط الدفع غير صحيح أو منتهي.');
  if (b.status === 'pending_payment') await payments.syncBooking(b.id);
  const fresh = await byToken(req.params.token);
  const last = await db.one(`SELECT status FROM payments WHERE booking_id = $1 ORDER BY created_at DESC LIMIT 1`, [b.id]);
  res.json({ booking: linkView(fresh), last_payment_status: last ? last.status : null });
});

module.exports = r;
