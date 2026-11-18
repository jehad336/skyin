'use strict';
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const db = require('../db');
const config = require('../config');
const { HttpError } = require('./http');

const COOKIE = 'skyin_sid';
const hashToken = (t) => crypto.createHash('sha256').update(t).digest('hex');
const BCRYPT_COST = config.isTest ? 4 : 12;
// Compared against when the email doesn't exist, so login timing doesn't reveal registered emails.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', BCRYPT_COST);

const hashPassword = (p) => bcrypt.hash(p, BCRYPT_COST);
const checkPassword = (p, hash) => bcrypt.compare(p, hash || DUMMY_HASH);

const cookieOpts = () => ({
  httpOnly: true, sameSite: 'lax', secure: config.secureCookies, path: '/',
  maxAge: config.sessionDays * 24 * 3600 * 1000,
});

async function startSession(req, res, userId) {
  const token = crypto.randomBytes(32).toString('base64url');
  await db.query(
    `INSERT INTO sessions (token_hash, user_id, expires_at, ip, user_agent)
     VALUES ($1, $2, now() + make_interval(days => $3), $4, $5)`,
    [hashToken(token), userId, config.sessionDays, req.ip, String(req.get('user-agent') || '').slice(0, 300)]);
  await db.query('UPDATE users SET last_login_at = now() WHERE id = $1', [userId]);
  res.cookie(COOKIE, token, cookieOpts());
}

async function endSession(req, res) {
  const token = req.cookies && req.cookies[COOKIE];
  if (token) await db.query('DELETE FROM sessions WHERE token_hash = $1', [hashToken(token)]);
  res.clearCookie(COOKIE, { ...cookieOpts(), maxAge: undefined });
}

/** Attach req.user (or null) from the session cookie. */
async function loadUser(req, _res, next) {
  req.user = null;
  const token = req.cookies && req.cookies[COOKIE];
  if (token && token.length < 100) {
    req.user = await db.one(
      `SELECT u.id, u.name, u.email, u.phone, u.role, u.created_at
         FROM sessions s JOIN users u ON u.id = s.user_id
        WHERE s.token_hash = $1 AND s.expires_at > now()`, [hashToken(token)]);
  }
  next();
}

function requireUser(req, _res, next) {
  if (!req.user) return next(new HttpError(401, 'سجّل دخولك أولاً.'));
  next();
}
function requireAdmin(req, _res, next) {
  if (!req.user) return next(new HttpError(401, 'سجّل دخولك أولاً.'));
  if (req.user.role !== 'admin') return next(new HttpError(403, 'هذه الصفحة للإدارة فقط.'));
  next();
}

/** Remove expired sessions (called on an interval by the server). */
const pruneSessions = () => db.query('DELETE FROM sessions WHERE expires_at < now()');

module.exports = { COOKIE, hashPassword, checkPassword, startSession, endSession, loadUser, requireUser, requireAdmin, pruneSessions };
