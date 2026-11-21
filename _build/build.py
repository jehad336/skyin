"""Assemble the Skyin static site (Arabic, RTL) from templates + shared partials.

Run from the repo root:  python3 _build/build.py   (or: npm run build)
"""
import json
import re
import sys
import time
from pathlib import Path

ROOT = Path(__file__).parent
sys.path.insert(0, str(ROOT))
from icons import icon  # noqa: E402

TPL = ROOT / "tpl"
OUT = ROOT.parent / "public"  # web root served by the backend (server/)
DATA = ROOT.parent / "data" / "destinations.json"

# Hero video: "Pink sunset seen from a plane window" (Mixkit, free licence, 29s). 720p for desktop, 360p for phones.
VIDEO = "https://assets.mixkit.co/videos/4204/4204-720.mp4"
VIDEO_SM = "https://assets.mixkit.co/videos/4204/4204-360.mp4"

# Page photos — free Unsplash photos (Unsplash License: commercial use, no attribution required).
PHOTOS = {
    "hero-about": "1637139498630-9a580b24fa75",      # road towards the mountains
    "hero-services": "1628354215124-dd0ab72828ac",   # airliner at the gate, from above
    "hero-locations": "1694018359679-49465b4c0d61",  # Kingdom Centre, Riyadh, at sunset
    "hero-places": "1570077188670-e3a8d69ac5ff",     # Santorini
    "hero-support": "1511068797325-6083f0f872b1",    # hand pointing at a world map
    "about": "1527631615371-98cbbff5125a",           # traveller with a backpack by a lake
    "holiday": "1540541338287-41700207dee6",         # resort pool by the ocean
    "honeymoon": "1671547199419-60db7d9578bb",       # overwater villa at sunset
    "family": "1496275068113-fff8c90750d1",          # family silhouettes on the beach
    "auth": "1613474616705-e1c09211497d",            # plane wing over the clouds
}


def photo(key, w="1600", h="900"):
    return f"https://images.unsplash.com/photo-{PHOTOS[key]}?auto=format&fit=crop&w={w}&h={h}&q=70"
BRAND = "سكاي إن للسفر والسياحة"
V = str(int(time.time()))  # cache-busting version for CSS/JS links, changes every build

PAGES = [("من نحن", "about.html"), ("خدماتنا", "services.html"), ("فروعنا", "locations.html"),
         ("الوجهات", "places.html"), ("الدعم", "support.html")]


# ---------------------------------------------------------------- shared partials
def head(title, description, robots="index,follow", base="", extra_js=""):
    return f"""<!DOCTYPE html>
<html lang="ar" dir="rtl" class="no-js">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
  <title>{title}</title>
  <meta name="description" content="{description}" />
  <meta name="theme-color" content="#FFFFFF" />
  <meta name="robots" content="{robots}" />{base}
  <meta property="og:type" content="website" />
  <meta property="og:locale" content="ar_SA" />
  <meta property="og:title" content="{title}" />
  <meta property="og:description" content="{description}" />
  <link rel="icon" type="image/png" href="assets/favicon.png" />

  <!-- Fonts: Zain for Arabic text, Inter for Latin letters & numbers -->
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Zain:wght@300;400;700;800&amp;family=Inter:wght@400;500;600&amp;display=swap" rel="stylesheet" />

  <!-- Tailwind CSS v3, compiled & minified with the Tailwind CLI (see README) -->
  <link rel="stylesheet" href="assets/skyin.css?v={V}" />
  <script>document.documentElement.classList.replace('no-js', 'js');</script>
  <script src="assets/config.js?v={V}" defer></script>
  <script src="assets/skyin.js?v={V}" defer></script>
  <script src="assets/app.js?v={V}" defer></script>
{extra_js}</head>
<body>
  <a href="#main" class="sr-only focus:not-sr-only focus:fixed focus:start-4 focus:top-4 focus:z-[60] focus:rounded-full focus:bg-white focus:px-4 focus:py-2 focus:text-[14px] focus:text-black">انتقل إلى المحتوى</a>
"""


def nav(active, on_media=True):
    cur = lambda href: ' aria-current="page"' if href == active else ""
    links = "\n".join(f'          <li><a href="{h}" class="nav-link"{cur(h)}>{n}</a></li>' for n, h in PAGES)
    mlinks = "\n".join(
        f'      <a href="{h}" class="m-item text-[22px] font-normal text-fg/90 hover:text-fg" style="--i: {i}"{cur(h)}>{n}</a>'
        for i, (n, h) in enumerate(PAGES))
    return f"""
  <!-- Navigation -->
  <header class="site-header fade-in-up absolute inset-x-0 top-0 z-30{' on-media' if on_media else ''}" style="--d: 100ms">
    <nav class="relative mx-auto flex max-w-7xl items-center justify-between px-6 py-4 md:px-10 md:py-5" aria-label="القائمة الرئيسية">
      <a href="index.html" class="block shrink-0 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg/70" aria-label="{BRAND} — الصفحة الرئيسية">
        <img src="assets/skyin-logo.png" alt="{BRAND}" width="245" height="160"
             class="h-12 w-auto select-none drop-shadow-[0_1px_4px_rgba(0,0,0,0.15)] md:h-16" draggable="false" />
      </a>
      <ul class="absolute left-1/2 hidden -translate-x-1/2 items-center gap-9 md:flex">
{links}
      </ul>
      <div class="hidden items-center gap-6 md:flex">
        <a href="login.html" class="nav-link" data-account-link hidden>تسجيل الدخول</a>
        <a href="support.html#contact" class="btn-secondary">ابدأ رحلتك</a>
      </div>
      <button id="menu-toggle" type="button"
              class="relative -me-2 flex h-10 w-10 items-center justify-center rounded-full text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg/70 md:hidden"
              aria-label="فتح القائمة" aria-expanded="false" aria-controls="mobile-menu">
        <span class="burger" aria-hidden="true"><span></span><span></span><span></span></span>
      </button>
    </nav>
  </header>

  <!-- Mobile menu (outside the animated header so `fixed` stays viewport-relative) -->
  <div id="mobile-menu" class="fixed inset-0 z-20 bg-paper/95 backdrop-blur-2xl md:hidden" aria-hidden="true" inert>
    <nav class="flex h-full flex-col items-center justify-center gap-7 px-6" aria-label="قائمة الجوال">
{mlinks}
      <a href="login.html" class="m-item text-[22px] font-normal text-fg/90 hover:text-fg" style="--i: 5" data-account-link hidden>تسجيل الدخول</a>
      <a href="support.html#contact" class="m-item mt-4 rounded-full border border-fg bg-transparent px-7 py-3 text-[14px] font-normal text-fg hover:bg-fg hover:text-inv" style="--i: 6">ابدأ رحلتك</a>
    </nav>
  </div>
"""


def footer():
    pages = "\n".join(f'            <li><a href="{h}" class="transition-colors hover:text-fg">{n}</a></li>' for n, h in PAGES)
    social = "".join(
        f'<a href="#" data-social="{k}" target="_blank" rel="noopener" aria-label="{label}" '
        f'class="flex h-10 w-10 items-center justify-center rounded-full border border-fg/15 text-fg/70 transition-colors hover:border-fg/40 hover:text-fg">'
        f'{icon(ic, "h-[18px] w-[18px]")}</a>'
        for k, label, ic in [("instagram", "إنستغرام", "instagram"), ("x", "إكس", "x-logo"),
                             ("snapchat", "سناب شات", "snapchat"), ("tiktok", "تيك توك", "tiktok")])
    h2 = 'class="text-[14px] font-medium text-fg"'
    return f"""
  <!-- Footer -->
  <footer class="border-t border-fg/10 bg-sand text-[14px] text-fg/70">
    <div class="container-x py-16 md:py-20">
      <div class="grid gap-12 sm:grid-cols-2 md:grid-cols-12">
        <div class="sm:col-span-2 md:col-span-4">
          <a href="index.html" class="inline-block" aria-label="{BRAND} — الصفحة الرئيسية">
            <img src="assets/skyin-logo.png" alt="{BRAND}" width="245" height="160" class="h-16 w-auto" loading="lazy" />
          </a>
          <p class="mt-5 max-w-xs text-[15px] leading-relaxed text-fg/70">سافر حول العالم بدون أي توتر.</p>
        </div>
        <div class="md:col-span-2">
          <h2 {h2}>الصفحات</h2>
          <ul class="mt-5 space-y-3">
{pages}
          </ul>
        </div>
        <div class="md:col-span-3">
          <h2 {h2}>تواصل معنا</h2>
          <ul class="mt-5 space-y-3">
            <li><a data-href="phone" href="#" class="inline-flex items-center gap-3 transition-colors hover:text-fg">{icon("phone", "h-4 w-4 text-accent")}<span data-config="phone" dir="ltr">+966 50 000 0000</span></a></li>
            <li><a data-href="whatsapp" href="#" target="_blank" rel="noopener" class="inline-flex items-center gap-3 transition-colors hover:text-fg">{icon("message", "h-4 w-4 text-accent")}<span>واتساب</span></a></li>
            <li><a data-href="email" href="#" class="inline-flex items-center gap-3 transition-colors hover:text-fg">{icon("mail", "h-4 w-4 text-accent")}<span data-config="email" dir="ltr">info@yourdomain.com</span></a></li>
          </ul>
        </div>
        <div class="md:col-span-3">
          <h2 {h2}>تابعنا</h2>
          <div class="mt-5 flex flex-wrap gap-2">{social}</div>
        </div>
      </div>
      <div class="mt-14 flex flex-col gap-3 border-t border-fg/10 pt-8 md:flex-row md:items-center md:justify-between">
        <p>© <span data-year>2026</span> {BRAND}<span class="hidden text-fg/30 sm:inline"> · </span><br class="sm:hidden" /><span class="mt-1 inline-block whitespace-nowrap sm:mt-0" lang="en" dir="ltr">Skyin Travel &amp; Tourism</span></p>
        <p>رقم الترخيص: <span data-config="licenseNo" dir="ltr">0000000</span></p>
      </div>
    </div>
  </footer>

  <!-- Floating WhatsApp -->
  <div class="wa-float fixed bottom-5 end-5 z-40 md:bottom-8 md:end-8">
    <a data-href="whatsapp" href="#" target="_blank" rel="noopener" aria-label="تواصل مع سكاي إن عبر واتساب"
       class="flex h-14 w-14 items-center justify-center rounded-full bg-white shadow-[0_10px_30px_rgba(0,0,0,0.35)] transition-transform duration-300 hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg/70 focus-visible:ring-offset-2 focus-visible:ring-offset-paper">
      {icon("whatsapp", "h-7 w-7")}
    </a>
  </div>
</body>
</html>
"""


def bg_video(t, extra=""):
    return (f'<video class="bg-video absolute inset-0 -z-10 h-full w-full object-cover {extra}" autoplay muted playsinline '
            f'data-src="{VIDEO}" data-src-sm="{VIDEO_SM}" '
            f'preload="metadata" disablepictureinpicture disableremoteplayback aria-hidden="true">'
            f'</video>')


def hero(eyebrow, title, text, t="0"):
    media = (f'<img src="{photo(t, "1920", "1080")}" alt="" fetchpriority="high" decoding="async" '
             f'class="bg-photo absolute inset-0 -z-10 h-full w-full object-cover" />') if t in PHOTOS else bg_video(t)
    return f"""
  <!-- Hero -->
  <section class="on-media relative isolate flex h-[60vh] min-h-[420px] items-center justify-center overflow-hidden bg-[#0B0B0C]">
    {media}
    <div class="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-b from-black/35 via-black/35 to-black/50" aria-hidden="true"></div>
    <div class="mx-auto w-full max-w-3xl px-6 pt-16 text-center">
      <p class="fade-in-up eyebrow" style="--d: 350ms">{eyebrow}</p>
      <h1 class="fade-in-up page-title mt-4" style="--d: 450ms">{title}</h1>
      <p class="fade-in-up lead mx-auto mt-5 max-w-xl [text-wrap:balance] md:mt-6" style="--d: 600ms">{text}</p>
    </div>
  </section>
"""


def cta(title, text, button, href, t="12"):
    return f"""
  <!-- CTA band -->
  <section class="section pt-0">
    <div class="container-x">
      <div class="reveal">
        <div class="on-media clip-fix relative isolate overflow-hidden rounded-3xl bg-gradient-to-br from-[#0b3a46] via-[#10202a] to-[#0B0B0C] px-6 py-20 text-center md:py-28">
          {bg_video(t)}
          <div class="pointer-events-none absolute inset-0 -z-10 bg-black/50" aria-hidden="true"></div>
          <h2 class="section-title mx-auto max-w-2xl [text-wrap:balance]">{title}</h2>
          <p class="lead mx-auto mt-4 max-w-lg [text-wrap:balance]">{text}</p>
          <a href="{href}" class="btn-primary mt-8">{button}</a>
        </div>
      </div>
    </div>
  </section>
"""


def app_header(eyebrow, title, text=""):
    p = f'<p class="fade-in-up lead mt-4 max-w-xl" style="--d: 300ms">{text}</p>' if text else ""
    return f"""
  <!-- Page header (app pages: no video) -->
  <section class="relative isolate overflow-hidden bg-gradient-to-b from-[#E8F6F8] to-paper pb-10 pt-32 md:pb-14 md:pt-40">
    <div class="container-x">
      <p class="fade-in-up eyebrow" style="--d: 100ms">{eyebrow}</p>
      <h1 class="fade-in-up mt-3 text-[32px] font-medium leading-[1.3] md:text-[44px]" style="--d: 200ms" data-page-title>{title}</h1>
      {p}
    </div>
  </section>
"""


# ---------------------------------------------------------------- destinations (single source for cards + modal)
# Single source of truth: data/destinations.json (also seeded into the database).
# The static cards are a fallback; places.html refreshes them from /api/destinations at runtime.
DESTS = json.loads(DATA.read_text(encoding="utf-8"))
for _d in DESTS:
    _d["price_fmt"] = f"{_d['price']:,}"


def dest_cards():
    out = []
    for d in DESTS:
        out.append(f"""        <div class="dest-item" data-region="{d['region']}" data-card="{d['slug']}">
          <div class="reveal">
            <button type="button" data-dest="{d['slug']}" aria-label="{d['city']}، {d['country']} — عرض التفاصيل" data-card-btn
                    class="on-media group relative block aspect-[3/4] w-full overflow-hidden rounded-3xl text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg/70 focus-visible:ring-offset-2 focus-visible:ring-offset-paper">
              <div class="ph absolute inset-0 transition-transform duration-700 ease-out group-hover:scale-105" style="--c1: {d['c1']}; --c2: {d['c2']}">
                <img src="{d.get('image') or f"assets/images/{d['slug']}.jpg"}" alt="" class="h-full w-full object-cover" loading="lazy" decoding="async" data-fallback data-card-img />
              </div>
              <div class="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent"></div>
              <span class="absolute end-4 top-4 flex h-11 w-11 items-center justify-center rounded-full bg-white text-black shadow-lg transition-all duration-300 md:-translate-y-1 md:opacity-0 md:group-hover:translate-y-0 md:group-hover:opacity-100 md:group-focus-visible:opacity-100" aria-hidden="true">{icon('arrow-up-right', 'h-5 w-5 rtl:-scale-x-100')}</span>
              <div class="absolute inset-x-0 bottom-0 p-6">
                <p class="text-[13px] font-medium text-fg/70" data-card-country>{d['country']}</p>
                <h3 class="mt-1 text-[26px] font-medium leading-tight" data-card-city>{d['city']}</h3>
                <p class="mt-2 text-[14px] text-fg/80" data-card-price>من {d['price_fmt']} ريال · {d['nights']} ليالٍ</p>
              </div>
            </button>
          </div>
        </div>""")
    return "\n".join(out)


def dest_json():
    data = {d["slug"]: {k: d[k] for k in ("city", "country", "nights", "c1", "c2", "best", "summary", "highlights", "includes")}
            | {"price": d["price_fmt"], "image": d.get("image") or f"assets/images/{d['slug']}.jpg"} for d in DESTS}
    return json.dumps(data, ensure_ascii=False, indent=2)


# ---------------------------------------------------------------- assembly
META = {
    "index.html": (f"{BRAND} | Skyin Travel &amp; Tourism",
                   "اترك التخطيط علينا، واستمتع برحلات مميزة مصممة خصيصاً لك — سكاي إن للسفر والسياحة."),
    "about.html": (f"من نحن | {BRAND}",
                   "تعرّف على سكاي إن: نخطط لرحلات سهلة ومريحة على ذوقك، من أول فكرة حتى رجوعك."),
    "services.html": (f"خدماتنا | {BRAND}",
                      "حجز الطيران والفنادق، والباقات السياحية، والتأشيرات، والتأمين على السفر، وسفر الشركات — مع فريق واحد."),
    "locations.html": (f"فروعنا | {BRAND}",
                       "اعثر على أقرب فرع لسكاي إن، واعرف أوقات العمل، أو خطط لرحلتك معنا أونلاين."),
    "places.html": (f"الوجهات | {BRAND}",
                    "وجهات مختارة بعناية في أوروبا وآسيا والقوقاز والجزر، مع باقات جاهزة للحجز."),
    "support.html": (f"الدعم | {BRAND}",
                     "عندك سؤال عن رحلتك؟ تواصل مع سكاي إن عبر واتساب أو الهاتف أو البريد، أو اقرأ الأسئلة الشائعة."),
}

NOINDEX = "noindex,nofollow"
APP_META = {
    "login.html": (f"تسجيل الدخول | {BRAND}", "سجّل دخولك إلى حسابك في سكاي إن."),
    "register.html": (f"إنشاء حساب | {BRAND}", "أنشئ حسابك في سكاي إن لحجز رحلاتك ومتابعتها."),
    "account.html": (f"حسابي | {BRAND}", "حجوزاتك وطلباتك في سكاي إن."),
    "book.html": (f"احجز رحلتك | {BRAND}", "احجز باقتك وادفع أونلاين بأمان."),
    "pay.html": (f"الدفع | {BRAND}", "ادفع حجزك أونلاين بأمان."),
    "admin.html": (f"لوحة التحكم | {BRAND}", "لوحة تحكم سكاي إن."),
    "404.html": (f"الصفحة غير موجودة | {BRAND}", "الصفحة غير موجودة."),
}

TOKEN = re.compile(r"\{\{(\w[\w-]*)(?::([\w-]+))?(?:\|([^}]*))?\}\}")


def render(tpl):
    def sub(m):
        kind, name, args = m.group(1), m.group(2), m.group(3)
        a = args.split("|") if args else []
        if kind == "icon":
            return icon(name, a[0] if a else "h-6 w-6")
        if kind == "hero":
            return hero(*a)
        if kind == "cta":
            return cta(*a)
        if kind == "bgvideo":
            return bg_video(a[0] if a else "0", a[1] if len(a) > 1 else "")
        if kind == "photo":
            return photo(name, *a)
        if kind == "apphead":
            return app_header(*a)
        if kind == "dest_cards":
            return dest_cards()
        if kind == "dest_json":
            return dest_json()
        raise KeyError(m.group(0))
    return TOKEN.sub(sub, tpl)


OUT.mkdir(exist_ok=True)
for page, (title, desc) in (META | APP_META).items():
    body = render((TPL / page).read_text(encoding="utf-8"))
    app = page in APP_META
    html = head(title, desc,
                robots=NOINDEX if app else "index,follow",
                base='\n  <base href="/" />' if page == "404.html" else "",
                extra_js=f'  <script src="assets/admin.js?v={V}" defer></script>\n' if page == "admin.html" else "")
    html += nav(page, on_media=not app) + body + (footer() if page != "admin.html" else "</body>\n</html>\n")
    left = TOKEN.findall(html)
    assert not left, (page, left)
    (OUT / page).write_text(html, encoding="utf-8")
    print(f"built {page:16} {len(html) / 1024:6.1f} KB")
