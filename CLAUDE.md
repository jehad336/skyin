# Skyin Travel & Tourism — website (سكاي إن للسفر والسياحة)

Static marketing site for a Saudi travel agency. Six pages, **Arabic, right-to-left**
(`<html lang="ar" dir="rtl">`). No backend: forms hand off to WhatsApp.
Owner: Jehad — reply to him in Arabic, short and direct.

## Pages
`index.html` (home) · `about.html` · `services.html` · `locations.html` · `places.html` (destinations) · `support.html`

## How the site is built — read before editing
- **The root `*.html` files are GENERATED. Don't edit them directly** — changes are lost on the next build.
  - Page bodies: `_build/tpl/<page>.html`
  - Shared parts (head, nav, footer, floating WhatsApp, hero, CTA band) and the
    destinations data (cards + modal JSON): `_build/build.py`
  - Icons: `_build/icons.py`, used in templates as `{{icon:name|tailwind classes}}`
  - Other template tokens: `{{hero|eyebrow|title|text|video-start-seconds}}`,
    `{{cta|title|text|button|href|video-start}}`, `{{bgvideo|start}}`, `{{dest_cards}}`, `{{dest_json}}`
- CSS: Tailwind CSS **v3**, compiled to `assets/skyin.css` (no CDN — the CDN warning was removed on purpose).
  Design tokens/components live in `src/input.css`; config in `src/tailwind.config.js`.
- JS: `assets/skyin.js` (no dependencies). Contact details only in `assets/config.js`.

```bash
npm install          # once (Tailwind CLI)
npm run build        # = python3 _build/build.py  +  Tailwind compile/minify
```
Always run `npm run build` after changing templates, build.py, input.css or class names in JS.

## Design rules
- Brand: cyan `#04B2CD`, orange `#EE790E`, background ink `#0B0B0C`. Dark, cinematic, white text.
- Fonts: IBM Plex Sans Arabic (Arabic) + Inter (Latin letters & numbers), from Google Fonts.
- Arabic typography: **no letter-spacing or uppercase on Arabic text** (breaks joined letters);
  headings line-height ≥ 1.3.
- RTL: use logical utilities (`ms/me`, `ps/pe`, `start/end`, `border-s`, `text-start`);
  flip directional icons with `rtl:-scale-x-100`. Phone numbers/emails/`24/7` get `dir="ltr"`.
- Put entrance/scroll-reveal animations (`.fade-in-up`, `.reveal`) on a **wrapper**, never on an
  element that has a hover transform (the animation would cancel `hover:scale`/`hover:-translate-y`).
- Buttons: `.btn-primary` (white pill, 15px medium, `px-[26px] py-[12px]`, hover scale-105),
  `.btn-secondary` (outline pill, 14px). Cards: `.card`. Section titles: `.section-title`.
- Homepage hero is a fixed spec: 100vh muted looping video, overlay black/10 → black/40,
  headline 38px mobile / 56px desktop, subtext 15/18px white/80, nav links 14px white/90,
  scrollbars hidden globally.
- Respect `prefers-reduced-motion` (already handled in `src/input.css`).

## Open items
- **GitHub Pages is not enabled yet**: repo Settings → Pages → Deploy from a branch → `main` / `(root)`.
  Site URL will be https://jehad336.github.io/skyin
- **Sample content to replace with real data** (ask Jehad):
  - contact numbers, email, licence number → `assets/config.js`
  - stats on the About page (10+, 25,000+, 60+, 98%) → `_build/tpl/about.html` (`data-count` + text)
  - destination prices / nights → `DESTS` in `_build/build.py`
  - offices (Riyadh / Jeddah / Makkah), addresses, `data-map` queries, opening hours → `_build/tpl/locations.html`
  - FAQ answers (esp. payment methods) → `_build/tpl/support.html`
- **Photos**: none yet; gradient placeholders show until files exist in `assets/images/`
  (names listed in `assets/images/README.txt`).

## Checking work
Render every page at 1440px and 390px wide: no console errors, no horizontal overflow,
mobile menu, destination filters + modal, both forms (validation + WhatsApp message), FAQ accordion.
