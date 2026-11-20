'use strict';
const crypto = require('crypto');
const express = require('express');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const { rateLimit } = require('express-rate-limit');
const config = require('./config');
const db = require('./db');
const { HttpError } = require('./lib/http');
const { loadUser } = require('./lib/auth');

// The one inline script in every page (build.py head()). Allowed by hash, nothing else inline.
const INLINE_SCRIPT = "document.documentElement.classList.replace('no-js', 'js');";
const INLINE_HASH = "'sha256-" + crypto.createHash('sha256').update(INLINE_SCRIPT).digest('base64') + "'";

function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy);

  app.use(helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        'default-src': ["'self'"],
        'script-src': ["'self'", INLINE_HASH],
        'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        'font-src': ["'self'", 'https://fonts.gstatic.com'],
        'img-src': ["'self'", 'data:', 'https:'],
        'media-src': ["'self'", 'https://assets.mixkit.co'],
        'frame-src': ['https://www.google.com'],
        'connect-src': ["'self'"],
        'form-action': ["'self'"],
        'frame-ancestors': ["'none'"],
        'base-uri': ["'self'"],
        'object-src': ["'none'"],
        ...(config.secureCookies ? { 'upgrade-insecure-requests': [] } : {}),
      },
    },
    crossOriginEmbedderPolicy: false,
    hsts: config.secureCookies,
  }));

  app.get('/healthz', async (_req, res) => {
    await db.query('SELECT 1');
    res.json({ ok: true });
  });

  /* ---------------- API ---------------- */
  const api = express.Router();
  api.use(express.json({ limit: '100kb' }));
  api.use(cookieParser());
  api.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });

  // Gateway callbacks come from other servers: no cookies, no CSRF header.
  api.use('/webhooks', require('./routes/gateway').webhooks);

  // CSRF: browsers can't add a custom header cross-site without a CORS preflight, which we never allow.
  api.use((req, _res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    if (req.get('x-skyin') !== '1') return next(new HttpError(403, 'طلب غير مسموح.'));
    next();
  });
  api.use(loadUser);

  const limiter = (limit, minutes) => rateLimit({
    windowMs: minutes * 60_000, limit, standardHeaders: 'draft-7', legacyHeaders: false,
    skip: () => config.isTest,
    handler: (_req, res) => res.status(429).json({ error: 'محاولات كثيرة. حاول بعد قليل.' }),
  });
  api.use('/auth/login', limiter(10, 15));
  api.use('/auth/register', limiter(10, 60));
  api.use('/auth/password', limiter(10, 15));
  api.post('/quotes', limiter(10, 60));
  api.post('/messages', limiter(10, 60));
  api.use('/pay', limiter(60, 15));
  api.use(limiter(600, 15));

  api.use('/auth', require('./routes/auth'));
  api.use('/admin', require('./routes/admin'));
  api.use(require('./routes/public'));
  api.use(require('./routes/bookings'));
  api.use((_req, _res, next) => next(new HttpError(404, 'غير موجود.')));
  app.use('/api', api);

  app.use('/mock-pay', require('./routes/gateway').mock);

  /* ---------------- Website ---------------- */
  app.use(express.static(config.publicDir, {
    extensions: ['html'],
    setHeaders(res, file) {
      if (/\.html$/.test(file)) res.setHeader('Cache-Control', 'no-cache');
      else res.setHeader('Cache-Control', 'public, max-age=3600');
    },
  }));
  app.use((_req, res) => res.status(404).sendFile('404.html', { root: config.publicDir }, (e) => e && res.end()));

  /* ---------------- Errors ---------------- */
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, _next) => {
    let status = err.status || err.statusCode || 500;
    if (err.type === 'entity.parse.failed') status = 400;
    if (status >= 500) console.error(`[error] ${req.method} ${req.originalUrl}`, err);
    const message = err instanceof HttpError ? err.message
      : status < 500 ? 'طلب غير صالح.' : 'حدث خطأ غير متوقع. حاول مرة أخرى.';
    res.status(status).json({ error: message, ...(err.fields ? { fields: err.fields } : {}) });
  });

  return app;
}

module.exports = { createApp, INLINE_SCRIPT };
