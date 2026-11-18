'use strict';
/* Moyasar hosted invoices (https://docs.moyasar.com/api/invoices/01-create-invoice).
   The customer pays on Moyasar's checkout page (mada, Visa/Mastercard, Apple Pay, STC Pay…),
   then is redirected to success_url. Moyasar also POSTs the invoice to callback_url.
   We never trust either: the status is always re-read from GET /invoices/:id with the secret key. */
const config = require('../config');

const STATUS = {
  paid: 'paid',
  refunded: 'refunded',
  failed: 'failed', canceled: 'cancelled', expired: 'cancelled', voided: 'cancelled',
  // initiated, on_hold → still waiting
};

async function call(method, path, body) {
  const key = config.payments.moyasarSecretKey;
  if (!key) throw new Error('MOYASAR_SECRET_KEY is not set');
  const res = await fetch(config.payments.moyasarApiUrl + path, {
    method,
    headers: {
      Authorization: 'Basic ' + Buffer.from(key + ':').toString('base64'),
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(`Moyasar ${method} ${path} → ${res.status}: ${data.message || ''}`);
    err.details = data;
    throw err;
  }
  return data;
}

module.exports = {
  name: 'moyasar',

  async createCheckout({ payment, booking, successUrl, backUrl, callbackUrl }) {
    const inv = await call('POST', '/invoices', {
      amount: payment.amount_halalas,
      currency: payment.currency,
      description: `${booking.title} — ${booking.ref}`.slice(0, 250),
      success_url: successUrl,
      back_url: backUrl,
      callback_url: callbackUrl,
      expired_at: new Date(Date.now() + config.payments.checkoutTtlMinutes * 60000).toISOString(),
      metadata: { booking_ref: booking.ref, payment_id: String(payment.id) },
    });
    return { providerRef: inv.id, url: inv.url, raw: inv };
  },

  async fetchStatus(providerRef) {
    const inv = await call('GET', `/invoices/${encodeURIComponent(providerRef)}`);
    return { status: STATUS[inv.status] || 'initiated', amount: inv.amount, currency: inv.currency, raw: inv };
  },
};
