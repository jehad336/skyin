'use strict';
const crypto = require('crypto');

// No 0/O/1/I so references are easy to read out over the phone.
const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const bookingRef = () => 'SKY-' + Array.from(crypto.randomBytes(6), (b) => ALPHABET[b % ALPHABET.length]).join('');
const payToken = () => crypto.randomBytes(24).toString('base64url');

/** Destination row → public JSON. */
const publicDestination = (d) => ({
  id: d.id, slug: d.slug, city: d.city, country: d.country, region: d.region,
  price: d.price_halalas / 100, nights: d.nights, c1: d.c1, c2: d.c2, best: d.best, summary: d.summary,
  highlights: d.highlights, includes: d.includes, image: d.image_url || `assets/images/${d.slug}.jpg`,
  active: d.active, sort: d.sort,
});

/** Booking row → JSON for its owner (or a holder of the pay link). */
const publicBooking = (b) => ({
  ref: b.ref, title: b.title, status: b.status, travel_date: b.travel_date, travelers: b.travelers,
  unit_price: b.unit_price_halalas == null ? null : b.unit_price_halalas / 100,
  total: b.total_halalas / 100, currency: b.currency, notes: b.notes,
  customer_name: b.customer_name, pay_token: b.pay_token, paid_at: b.paid_at, created_at: b.created_at,
  destination_slug: b.destination_slug || null,
});

module.exports = { bookingRef, payToken, publicDestination, publicBooking };
