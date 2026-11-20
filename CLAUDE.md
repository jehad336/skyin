# Skyin Travel & Tourism — website (سكاي إن للسفر والسياحة)

Website + booking platform for a Saudi travel agency. **Arabic, right-to-left** (`<html lang="ar" dir="rtl">`).
Node.js/Express backend, PostgreSQL, customer accounts, online booking & payment (Moyasar), admin dashboard.
Owner: Jehad — reply to him in Arabic, short and direct.

## Layout
- `public/` — web root served by the backend (generated HTML + `assets/`). Nothing else is served.
- `server/` — Express app (`app.js`), config from env (`config.js`), SQL migrations (`migrations/*.sql`, run on start),
  routes: `auth` · `public` (destinations, quotes, messages) · `bookings` (customer bookings + `/api/pay/:token`) ·
  `admin` (role=admin only) · `gateway` (Moyasar webhook + `/mock-pay` dev checkout). Payments in `server/payments/`.
- `data/destinations.json` — seed for the `destinations` table (insert-only on start) and the static fallback cards.
- `test/` — `node:test` + supertest against the `skyin_test` database.

Marketing pages: `index` · `about` · `services` · `locations` · `places` · `support`.
App pages (noindex): `login` · `register` · `account` · `book` (`?d=slug`) · `pay` (`?t=token`) · `admin` · `404`.

## Run
```bash
npm run db:local      # embedded PostgreSQL on :5433 (no Docker). Or: npm run db:up (docker compose)
npm run dev           # http://localhost:3000 — migrates + seeds on start
npm test              # needs the DB running
npm run create-admin -- you@example.com "Name"
```
Local dev admin credentials are in `.env` (`DEV_ADMIN_EMAIL` / `DEV_ADMIN_PASSWORD`).

## Backend rules
- Money is integer **halalas** everywhere in the DB/API internals; API JSON exposes SAR numbers.
- Prices/totals are computed on the server only. A booking becomes `paid` **only** via `payments.syncPayment()`,
  which re-reads the gateway (never trusts the redirect or the webhook body) and checks amount + currency.
- CSRF: every non-GET `/api` call must send `X-Skyin: 1` (app.js `api()` does). Webhooks are exempt.
- CSP allows one inline script by hash (`INLINE_SCRIPT` in `server/app.js` must match `head()` in build.py).
  No inline event handlers — images use `data-fallback` (handled in skyin.js).
- User-facing API errors are Arabic (`HttpError`; zod messages are translated in `lib/http.js`).
- `PAYMENT_PROVIDER=mock` is refused in production.

## How the site is built — read before editing
- **`public/*.html` files are GENERATED. Don't edit them directly** — changes are lost on the next build.
  - Page bodies: `_build/tpl/<page>.html`
  - Shared parts (head, nav, footer, floating WhatsApp, hero, CTA band) and the
    destinations data (cards + modal JSON): `_build/build.py`
  - Icons: `_build/icons.py`, used in templates as `{{icon:name|tailwind classes}}`
  - Other template tokens: `{{hero|eyebrow|title|text|video-start-seconds}}`,
    `{{cta|title|text|button|href|video-start}}`, `{{bgvideo|start}}`, `{{apphead|eyebrow|title|text}}`, `{{dest_cards}}`, `{{dest_json}}`
- CSS: Tailwind CSS **v3**, compiled to `public/assets/skyin.css` (no CDN — the CDN warning was removed on purpose).
  Design tokens/components live in `src/input.css`; config in `src/tailwind.config.js`.
- JS (no dependencies), in `public/assets/`: `skyin.js` (site UI; forms POST to the API with WhatsApp fallback),
  `app.js` (API client `window.Skyin`, accounts, booking, payment page), `admin.js` (dashboard). Contact details only in `config.js`.

```bash
npm install          # once
npm run build        # = python _build/build.py  +  Tailwind compile/minify
```
Always run `npm run build` after changing templates, build.py, input.css or class names in JS.

## Design rules
- **Light theme** (owner asked: no black backgrounds; then preferred white over beige). White page `paper`, white `surface`
  cards with a border + soft shadow, warm dark text `fg` #1F1A17, light warm-grey `sand` footer #F5F4F1. Brand cyan `#04B2CD` / orange `#EE790E` for fills; text uses `text-accent` / `text-warn` (darker, readable).
- Use the theme tokens, never `text-white`/`bg-ink` for page content: `text-fg`, `text-fg/70`, `border-fg/10`, `bg-surface`,
  `bg-paper`, `btn-primary` = `bg-fg text-inv`. They are CSS variables in `src/input.css`.
- Anything on a video or photo (heroes, CTA band, destination cards, nav over a video hero) gets **`.on-media`**,
  which flips the tokens to white text. `nav(page, on_media=…)` in build.py: marketing pages yes, app pages no.
- Home hero video: Mixkit #4204 "pink sunset from a plane window" (free licence, 29s), hot-linked from assets.mixkit.co
  (720p desktop / 360p phones, chosen in skyin.js). Plays **once at normal speed** and holds the last frame with a slow zoom
  — owner found a fast loop annoying and 0.4x too slow. CSP `media-src` allows assets.mixkit.co.
- Sub-page heroes use their own photo (`{{hero|…|hero-<page>}}`); all page photos are in `PHOTOS` in build.py
  (Unsplash IDs, used as `{{photo:key|w|h}}`).
- CSS/JS links carry `?v=<build time>` (build.py `V`) so browsers pick up changes after each build.
- Fonts: IBM Plex Sans Arabic (Arabic) + Inter (Latin letters & numbers), from Google Fonts.
- Arabic typography: **no letter-spacing or uppercase on Arabic text** (breaks joined letters);
  headings line-height ≥ 1.3.
- RTL: use logical utilities (`ms/me`, `ps/pe`, `start/end`, `border-s`, `text-start`);
  flip directional icons with `rtl:-scale-x-100`. Phone numbers/emails/`24/7` get `dir="ltr"`.
- Put entrance/scroll-reveal animations (`.fade-in-up`, `.reveal`) on a **wrapper**, never on an
  element that has a hover transform (the animation would cancel `hover:scale`/`hover:-translate-y`).
- Buttons: `.btn-primary` (white pill, 15px medium, `px-[26px] py-[12px]`, hover scale-105),
  `.btn-secondary` (outline pill, 14px). Cards: `.card`. Section titles: `.section-title`.
- Homepage hero is a fixed spec: 100vh muted video (plays once, slow), overlay black/10 → black/40,
  headline 38px mobile / 56px desktop, subtext 15/18px white/80, nav links 14px white/90,
  scrollbars hidden globally.
- Respect `prefers-reduced-motion` (already handled in `src/input.css`).

## Open items
- **Hosting not chosen yet** (needs Node + PostgreSQL; GitHub Pages can't run it).
- **Moyasar merchant account + keys** needed for real payments (`PAYMENT_PROVIDER=moyasar`, `MOYASAR_SECRET_KEY`,
  `PAYMENT_WEBHOOK_KEY`). Webhook payload/signature docs weren't confirmed — the code only uses the callback as a
  hint and re-fetches the invoice, so it is safe either way. Test with Moyasar test cards before going live.
- No email notifications yet (booking confirmation / password reset).
- **Sample content to replace with real data** (ask Jehad):
  - contact numbers, email, licence number → `public/assets/config.js`
  - stats on the About page (10+, 25,000+, 60+, 98%) → `_build/tpl/about.html` (`data-count` + text)
  - destination prices / nights → admin dashboard (or `data/destinations.json` before first run)
  - offices (Riyadh / Jeddah / Makkah), addresses, `data-map` queries, opening hours → `_build/tpl/locations.html`
  - FAQ answers (esp. payment methods) → `_build/tpl/support.html`
- **Photos**: destinations use free Unsplash photos (Unsplash License — commercial use, no attribution required),
  hot-linked from images.unsplash.com; URLs + credit links in `data/destinations.json` (`image`, `image_credit`),
  copied into `destinations.image_url` on seed (only where empty). Replace from the dashboard (image URL field).
  Page photos (heroes, about, holiday/honeymoon/family, login/register) are also Unsplash — see `PHOTOS` in build.py.

## Checking work
`npm test` must pass. Render every page at 1440px and 390px wide: no console errors (missing photos 404 is expected),
no horizontal overflow, mobile menu, destination filters + modal, both forms, FAQ accordion,
register → book → pay (mock) → account, and the admin dashboard tabs.
