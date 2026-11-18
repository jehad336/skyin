'use strict';
/* Payment orchestration: start a checkout for a booking, and sync a payment's status from the gateway. */
const db = require('../db');
const config = require('../config');
const { conflict, HttpError } = require('../lib/http');

const PROVIDERS = { moyasar: require('./moyasar'), mock: require('./mock') };
const provider = (name = config.payments.provider) => {
  const p = PROVIDERS[name];
  if (!p) throw new Error(`Unknown payment provider: ${name}`);
  return p;
};

/** Create (or reuse a fresh) checkout for a booking. Returns { url }. */
async function startCheckout(booking) {
  if (booking.status !== 'pending_payment') throw conflict('هذا الحجز لا يحتاج دفعاً.');
  const gw = provider();

  // Reuse a recent open checkout for the same amount instead of creating duplicates.
  const open = await db.one(
    `SELECT * FROM payments WHERE booking_id = $1 AND provider = $2 AND status = 'initiated'
        AND amount_halalas = $3 AND checkout_url IS NOT NULL
        AND created_at > now() - make_interval(mins => $4)
      ORDER BY created_at DESC LIMIT 1`,
    [booking.id, gw.name, booking.total_halalas, config.payments.checkoutTtlMinutes - 10]);
  if (open) return { url: open.checkout_url, paymentId: open.id };

  const payment = await db.one(
    `INSERT INTO payments (booking_id, provider, amount_halalas, currency) VALUES ($1, $2, $3, $4) RETURNING *`,
    [booking.id, gw.name, booking.total_halalas, booking.currency]);
  const base = config.appUrl;
  const t = encodeURIComponent(booking.pay_token);
  const key = config.payments.webhookKey ? `?key=${encodeURIComponent(config.payments.webhookKey)}` : '';
  try {
    const r = await gw.createCheckout({
      payment, booking,
      successUrl: `${base}/pay.html?t=${t}&return=1`,
      backUrl: `${base}/pay.html?t=${t}`,
      callbackUrl: `${base}/api/webhooks/${gw.name}${key}`,
    });
    await db.query(`UPDATE payments SET provider_ref = $2, checkout_url = $3, raw = COALESCE($4, raw), updated_at = now() WHERE id = $1`,
      [payment.id, r.providerRef, r.url, r.raw ? JSON.stringify(r.raw) : null]);
    return { url: r.url, paymentId: payment.id };
  } catch (e) {
    await db.query(`UPDATE payments SET status = 'failed', failure_reason = $2, updated_at = now() WHERE id = $1`,
      [payment.id, String(e.message).slice(0, 500)]);
    console.error('[payments] checkout failed:', e.message);
    throw new HttpError(502, 'تعذّر فتح صفحة الدفع الآن. حاول بعد قليل أو تواصل معنا.');
  }
}

/** Re-read one payment from its gateway and apply the result. Safe to call repeatedly. */
async function syncPayment(paymentId) {
  const p = await db.one('SELECT * FROM payments WHERE id = $1', [paymentId]);
  if (!p || !p.provider_ref || p.status !== 'initiated') return p;
  const remote = await provider(p.provider).fetchStatus(p.provider_ref);

  return db.tx(async (c) => {
    const cur = (await c.query('SELECT * FROM payments WHERE id = $1 FOR UPDATE', [paymentId])).rows[0];
    if (cur.status !== 'initiated') return cur; // another request already applied it
    const raw = remote.raw ? JSON.stringify(remote.raw) : null;

    if (remote.status === 'paid') {
      if (remote.amount !== cur.amount_halalas || String(remote.currency).toUpperCase() !== cur.currency) {
        console.error(`[payments] amount mismatch on payment ${cur.id}: got ${remote.amount} ${remote.currency}`);
        return (await c.query(`UPDATE payments SET status = 'failed', failure_reason = 'amount mismatch', raw = COALESCE($2, raw), updated_at = now()
                               WHERE id = $1 RETURNING *`, [cur.id, raw])).rows[0];
      }
      const upd = (await c.query(`UPDATE payments SET status = 'paid', raw = COALESCE($2, raw), updated_at = now() WHERE id = $1 RETURNING *`,
        [cur.id, raw])).rows[0];
      const b = (await c.query(
        `UPDATE bookings SET status = 'paid', paid_at = now(), updated_at = now()
          WHERE id = $1 AND status = 'pending_payment' RETURNING id`, [cur.booking_id])).rows[0];
      if (!b) console.error(`[payments] payment ${cur.id} paid but booking ${cur.booking_id} was not pending — review/refund needed`);
      return upd;
    }
    if (remote.status === 'failed' || remote.status === 'cancelled' || remote.status === 'refunded') {
      return (await c.query(`UPDATE payments SET status = $2, raw = COALESCE($3, raw), updated_at = now() WHERE id = $1 RETURNING *`,
        [cur.id, remote.status, raw])).rows[0];
    }
    return cur;
  });
}

/** Sync every open payment of a booking (used when the customer returns from checkout). */
async function syncBooking(bookingId) {
  const open = await db.many(`SELECT id FROM payments WHERE booking_id = $1 AND status = 'initiated' AND provider_ref IS NOT NULL`, [bookingId]);
  for (const { id } of open) {
    try { await syncPayment(id); } catch (e) { console.error('[payments] sync failed:', e.message); }
  }
}

module.exports = { startCheckout, syncPayment, syncBooking, provider };
