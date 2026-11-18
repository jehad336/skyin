'use strict';
/* Local test gateway — lets you run the whole booking → payment flow without any gateway keys.
   Checkout opens /mock-pay/:id, where you choose "paid" or "failed". Disabled in production. */
const db = require('../db');
const config = require('../config');

module.exports = {
  name: 'mock',

  async createCheckout({ payment, successUrl }) {
    const ref = `mock_${payment.id}`;
    await db.query(`UPDATE payments SET raw = jsonb_build_object('mock_status', 'initiated', 'success_url', $2::text) WHERE id = $1`,
      [payment.id, successUrl]);
    return { providerRef: ref, url: `${config.appUrl}/mock-pay/${payment.id}`, raw: null };
  },

  async fetchStatus(providerRef) {
    const id = Number(String(providerRef).replace('mock_', ''));
    const p = await db.one('SELECT amount_halalas, currency, raw FROM payments WHERE id = $1', [id]);
    if (!p) throw new Error('mock payment not found');
    const s = (p.raw && p.raw.mock_status) || 'initiated';
    return { status: s, amount: p.amount_halalas, currency: p.currency, raw: p.raw };
  },
};
