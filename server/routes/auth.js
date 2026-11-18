'use strict';
const express = require('express');
const db = require('../db');
const { parse, v, z, optional, bad, HttpError } = require('../lib/http');
const auth = require('../lib/auth');

const r = express.Router();
const me = (u) => u && ({ id: u.id, name: u.name, email: u.email, phone: u.phone, role: u.role });

r.post('/register', async (req, res) => {
  const b = parse(z.object({ name: v.name, email: v.email, phone: optional(v.phone), password: v.password }), req.body);
  const hash = await auth.hashPassword(b.password);
  const u = await db.one(
    `INSERT INTO users (name, email, phone, password_hash) VALUES ($1, $2, $3, $4)
     ON CONFLICT (email) DO NOTHING RETURNING id, name, email, phone, role`,
    [b.name, b.email, b.phone || null, hash]);
  if (!u) throw bad('هذا البريد مسجّل مسبقاً. سجّل دخولك بدلاً من ذلك.', { email: 'هذا البريد مسجّل مسبقاً.' });
  await auth.startSession(req, res, u.id);
  res.status(201).json({ user: me(u) });
});

r.post('/login', async (req, res) => {
  const b = parse(z.object({ email: v.email, password: z.string().min(1, 'اكتب كلمة المرور.').max(200) }), req.body);
  const u = await db.one('SELECT id, name, email, phone, role, password_hash FROM users WHERE email = $1', [b.email]);
  const ok = await auth.checkPassword(b.password, u && u.password_hash);
  if (!u || !ok) throw new HttpError(401, 'البريد أو كلمة المرور غير صحيحة.');
  await auth.startSession(req, res, u.id);
  res.json({ user: me(u) });
});

r.post('/logout', async (req, res) => {
  await auth.endSession(req, res);
  res.json({ ok: true });
});

r.get('/me', (req, res) => res.json({ user: me(req.user) }));

r.patch('/me', auth.requireUser, async (req, res) => {
  const b = parse(z.object({ name: v.name, phone: optional(v.phone) }), req.body);
  const u = await db.one('UPDATE users SET name = $2, phone = $3 WHERE id = $1 RETURNING id, name, email, phone, role',
    [req.user.id, b.name, b.phone || null]);
  res.json({ user: me(u) });
});

r.post('/password', auth.requireUser, async (req, res) => {
  const b = parse(z.object({ current: z.string().min(1, 'اكتب كلمة المرور الحالية.'), password: v.password }), req.body);
  const row = await db.one('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
  if (!(await auth.checkPassword(b.current, row.password_hash))) throw bad('كلمة المرور الحالية غير صحيحة.', { current: 'غير صحيحة.' });
  await db.query('UPDATE users SET password_hash = $2 WHERE id = $1', [req.user.id, await auth.hashPassword(b.password)]);
  // Sign out every other device.
  await db.query('DELETE FROM sessions WHERE user_id = $1', [req.user.id]);
  await auth.startSession(req, res, req.user.id);
  res.json({ ok: true });
});

module.exports = r;
