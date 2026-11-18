'use strict';
/* Gateway callbacks (server-to-server) and the local mock checkout page. */
const express = require('express');
const crypto = require('crypto');
const db = require('../db');
const config = require('../config');
const payments = require('../payments');

const webhooks = express.Router();

const keyOk = (k) => {
  const want = config.payments.webhookKey;
  if (!want) return true;
  const a = Buffer.from(String(k || '')), b = Buffer.from(want);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

// Moyasar POSTs the invoice (or payment) object here. We only use it as a hint of *which* payment
// changed, then re-read the status from Moyasar's API with our secret key.
webhooks.post('/moyasar', async (req, res) => {
  if (!keyOk(req.query.key)) return res.status(401).json({ error: 'unauthorized' });
  const body = req.body || {};
  const ids = [body.id, body.invoice_id, body.data && body.data.id, body.data && body.data.invoice_id]
    .filter((x) => typeof x === 'string' && x.length < 100);
  const p = ids.length
    ? await db.one(`SELECT id FROM payments WHERE provider = 'moyasar' AND provider_ref = ANY($1::text[]) LIMIT 1`, [ids])
    : null;
  if (p) {
    try { await payments.syncPayment(p.id); } catch (e) {
      console.error('[webhook] sync failed:', e.message);
      return res.status(502).json({ error: 'retry' }); // non-2xx so the gateway retries
    }
  }
  res.json({ ok: true });
});

/* ---- Mock checkout (development only) ---- */
const mock = express.Router();
mock.use((req, res, next) => (config.isProd || config.payments.provider !== 'mock' ? res.status(404).end() : next()));
mock.use(express.urlencoded({ extended: false, limit: '2kb' }));

const page = (title, inner) => `<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<link rel="stylesheet" href="/assets/skyin.css"></head>
<body class="flex min-h-screen items-center justify-center p-6"><main class="panel w-full max-w-md p-8">${inner}</main></body></html>`;
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

mock.get('/:id', async (req, res) => {
  const p = await db.one(`SELECT p.*, b.title, b.ref FROM payments p JOIN bookings b ON b.id = p.booking_id
                           WHERE p.id = $1 AND p.provider = 'mock'`, [Number(req.params.id) || 0]);
  if (!p) return res.status(404).send(page('غير موجود', '<p>عملية الدفع غير موجودة.</p>'));
  res.send(page('بوابة دفع تجريبية', `
    <p class="pill bg-skyin-orange/15 text-skyin-orange">وضع الاختبار — لا تُخصم أي مبالغ</p>
    <h1 class="mt-4 text-[24px] font-medium">بوابة دفع تجريبية</h1>
    <p class="mt-2 text-white/70">${esc(p.title)} · <span dir="ltr">${esc(p.ref)}</span></p>
    <p class="mt-6 text-[32px] font-medium" dir="ltr">${(p.amount_halalas / 100).toLocaleString('en-US')} SAR</p>
    ${p.status !== 'initiated' ? `<p class="mt-6 text-white/70">حالة العملية: ${esc(p.status)}</p>` : `
    <form method="post" class="mt-8 flex flex-col gap-3">
      <button name="result" value="paid" class="btn-primary">محاكاة دفع ناجح</button>
      <button name="result" value="failed" class="btn-secondary">محاكاة دفع مرفوض</button>
    </form>`}`));
});

mock.post('/:id', async (req, res) => {
  const result = req.body.result === 'paid' ? 'paid' : 'failed';
  const p = await db.one(
    `UPDATE payments SET raw = COALESCE(raw, '{}'::jsonb) || jsonb_build_object('mock_status', $2::text)
      WHERE id = $1 AND provider = 'mock' AND status = 'initiated' RETURNING id, raw`, [Number(req.params.id) || 0, result]);
  if (!p) return res.redirect(303, `/mock-pay/${Number(req.params.id) || 0}`);
  await payments.syncPayment(p.id);
  res.redirect(303, (p.raw && p.raw.success_url) || '/account.html');
});

module.exports = { webhooks, mock };
