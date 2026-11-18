'use strict';
/* Runtime configuration — values come from environment variables (.env in development). */
const path = require('path');

const ROOT = path.join(__dirname, '..');
try { process.loadEnvFile(path.join(ROOT, process.env.ENV_FILE || '.env')); } catch (_) { /* no .env: use real env */ }

const env = process.env.NODE_ENV || 'development';
const isProd = env === 'production';
const appUrl = (process.env.APP_URL || `http://localhost:${process.env.PORT || 3000}`).replace(/\/$/, '');

const config = {
  env,
  isProd,
  isTest: env === 'test',
  port: Number(process.env.PORT || 3000),
  appUrl,
  databaseUrl: process.env.DATABASE_URL || 'postgres://skyin:skyin@localhost:5433/skyin',
  publicDir: path.join(ROOT, 'public'),
  secureCookies: appUrl.startsWith('https://'),
  trustProxy: process.env.TRUST_PROXY || (isProd ? 1 : 0),
  sessionDays: 30,
  payments: {
    provider: (process.env.PAYMENT_PROVIDER || 'mock').toLowerCase(), // 'mock' | 'moyasar'
    moyasarSecretKey: process.env.MOYASAR_SECRET_KEY || '',
    moyasarApiUrl: (process.env.MOYASAR_API_URL || 'https://api.moyasar.com/v1').replace(/\/$/, ''),
    // Random string appended to the callback URL so random POSTs are ignored early.
    // (Every callback is re-verified against Moyasar's API anyway.)
    webhookKey: process.env.PAYMENT_WEBHOOK_KEY || '',
    checkoutTtlMinutes: 120,
  },
};

if (isProd) {
  if (config.payments.provider === 'mock') throw new Error('PAYMENT_PROVIDER=mock is not allowed in production');
  if (config.payments.provider === 'moyasar' && !config.payments.moyasarSecretKey) throw new Error('MOYASAR_SECRET_KEY is required');
  if (!config.secureCookies) throw new Error('APP_URL must be https:// in production');
}

module.exports = config;
