'use strict';
/* Seed destinations from data/destinations.json (insert new slugs only — never overwrites admin edits).
   Usage: npm run db:seed */
const fs = require('fs');
const path = require('path');
const db = require('./db');

async function seedDestinations({ log = console.log } = {}) {
  const file = path.join(__dirname, '..', 'data', 'destinations.json');
  const list = JSON.parse(fs.readFileSync(file, 'utf8'));
  let added = 0;
  for (const d of list) {
    const r = await db.query(
      `INSERT INTO destinations (slug, city, country, region, price_halalas, nights, c1, c2, best, summary, highlights, includes, sort)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       ON CONFLICT (slug) DO NOTHING`,
      [d.slug, d.city, d.country, d.region, Math.round(d.price * 100), d.nights, d.c1, d.c2, d.best, d.summary,
        JSON.stringify(d.highlights || []), JSON.stringify(d.includes || []), d.sort || 0]);
    added += r.rowCount;
  }
  log(`destinations: ${added} added, ${list.length - added} already present`);
}

module.exports = { seedDestinations };

if (require.main === module) {
  seedDestinations().then(() => db.pool.end()).catch((e) => { console.error(e); process.exit(1); });
}
