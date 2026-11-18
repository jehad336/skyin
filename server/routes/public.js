'use strict';
/* Public endpoints: destinations, quote requests, contact messages. */
const express = require('express');
const db = require('../db');
const { parse, v, z, optional, notFound } = require('../lib/http');
const { publicDestination } = require('../lib/util');

const r = express.Router();

r.get('/destinations', async (_req, res) => {
  const rows = await db.many('SELECT * FROM destinations WHERE active ORDER BY sort, id');
  res.set('Cache-Control', 'public, max-age=60');
  res.json({ destinations: rows.map(publicDestination) });
});

r.get('/destinations/:slug', async (req, res) => {
  const d = await db.one('SELECT * FROM destinations WHERE slug = $1 AND active', [String(req.params.slug)]);
  if (!d) throw notFound('الوجهة غير موجودة.');
  res.json({ destination: publicDestination(d) });
});

const SERVICES = ['حجز الطيران', 'حجز الفنادق', 'الباقات السياحية', 'خدمات التأشيرات', 'التأمين على السفر', 'سفر الشركات'];

r.post('/quotes', async (req, res) => {
  const b = parse(z.object({
    name: v.name, phone: v.phone, email: optional(v.email),
    service: z.string().trim().min(1, 'اختر الخدمة.').max(100),
    date: optional(v.futureDate), travelers: v.travelers,
    message: optional(v.text(2000)),
  }), req.body);
  const service = SERVICES.includes(b.service) ? b.service : b.service.slice(0, 100);
  const q = await db.one(
    `INSERT INTO quotes (user_id, name, phone, email, service, travel_date, travelers, message)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id, created_at`,
    [req.user ? req.user.id : null, b.name, b.phone, b.email || (req.user && req.user.email) || null, service,
      b.date || null, b.travelers, b.message || null]);
  res.status(201).json({ quote: { id: q.id } });
});

r.post('/messages', async (req, res) => {
  const b = parse(z.object({
    name: v.name, phone: v.phone, email: v.email,
    topic: z.string().trim().min(1, 'اختر الموضوع.').max(100),
    message: z.string().trim().min(10, 'اكتب 10 أحرف على الأقل.').max(5000, 'الرسالة طويلة جداً.'),
  }), req.body);
  const m = await db.one(
    `INSERT INTO messages (user_id, name, phone, email, topic, message) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
    [req.user ? req.user.id : null, b.name, b.phone, b.email, b.topic, b.message]);
  res.status(201).json({ message: { id: m.id } });
});

module.exports = r;
