/* =========================================================
   Skyin Travel & Tourism — site scripts (no dependencies)
   ========================================================= */
(() => {
  'use strict';

  const C = window.SKYIN_CONFIG || {};
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const body = document.body;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isMobile = () => window.matchMedia('(max-width: 767px)').matches;
  const hasIO = 'IntersectionObserver' in window;
  const telDigits = (s) => String(s || '').replace(/[^\d+]/g, '');
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const waLink = (text) =>
    'https://wa.me/' + String(C.whatsapp || '').replace(/\D/g, '') + (text ? '?text=' + encodeURIComponent(text) : '');
  const openWhatsApp = (text) => window.open(waLink(text), '_blank', 'noopener');
  const safePlay = (v) => { const p = v.play(); if (p && p.catch) p.catch(() => {}); };

  /* ---------- 1. Contact details from assets/config.js ---------- */
  $$('[data-config]').forEach((el) => { const v = C[el.dataset.config]; if (v) el.textContent = v; });
  $$('[data-href]').forEach((el) => {
    const k = el.dataset.href;
    if (k === 'whatsapp') el.href = waLink(el.dataset.text);
    else if (k === 'phone') el.href = 'tel:' + telDigits(C.phone);
    else if (k === 'emergency') el.href = 'tel:' + telDigits(C.emergencyPhone);
    else if (k === 'email') el.href = 'mailto:' + C.email;
  });
  $$('[data-social]').forEach((el) => { const u = (C.social || {})[el.dataset.social]; if (u) el.href = u; });
  $$('[data-year]').forEach((el) => { el.textContent = String(new Date().getFullYear()); });

  /* ---------- 2. Background videos: muted autoplay, fade in, pause off-screen ---------- */
  const videos = $$('video.bg-video');
  videos.forEach((v) => {
    v.muted = true;
    const ready = () => v.classList.add('is-ready');
    if (v.readyState >= 2) ready(); else v.addEventListener('loadeddata', ready, { once: true });
    safePlay(v);
  });
  if (hasIO && videos.length) {
    const vio = new IntersectionObserver((entries) => entries.forEach((e) => {
      if (e.isIntersecting) safePlay(e.target); else e.target.pause();
    }), { threshold: 0.01 });
    videos.forEach((v) => vio.observe(v));
  }

  /* ---------- 3. Mobile menu ---------- */
  const toggle = $('#menu-toggle');
  const menu = $('#mobile-menu');
  if (toggle && menu) {
    const setMenu = (open) => {
      body.classList.toggle('menu-open', open);
      body.style.overflow = open ? 'hidden' : '';
      toggle.setAttribute('aria-expanded', String(open));
      toggle.setAttribute('aria-label', open ? 'إغلاق القائمة' : 'فتح القائمة');
      menu.setAttribute('aria-hidden', String(!open));
      if (open) menu.removeAttribute('inert'); else menu.setAttribute('inert', '');
    };
    toggle.addEventListener('click', () => setMenu(!body.classList.contains('menu-open')));
    $$('a', menu).forEach((a) => a.addEventListener('click', () => setMenu(false)));
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && body.classList.contains('menu-open')) setMenu(false); });
    const desktop = window.matchMedia('(min-width: 768px)');
    const onChange = (e) => { if (e.matches) setMenu(false); };
    if (desktop.addEventListener) desktop.addEventListener('change', onChange); else desktop.addListener(onChange);
  }

  /* ---------- 4. Scroll reveal (staggered groups) ---------- */
  $$('[data-stagger]').forEach((g) => {
    const n = parseInt(g.dataset.stagger, 10) || Infinity;
    $$(':scope > .reveal, :scope > * > .reveal', g).forEach((el, i) => el.style.setProperty('--i', String(i % n)));
  });
  const reveals = $$('.reveal');
  if (reduceMotion || !hasIO) reveals.forEach((el) => el.classList.add('is-visible'));
  else {
    const rio = new IntersectionObserver((entries) => entries.forEach((e) => {
      if (e.isIntersecting) { e.target.classList.add('is-visible'); rio.unobserve(e.target); }
    }), { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
    reveals.forEach((el) => rio.observe(el));
  }

  /* ---------- 5. Count-up numbers ---------- */
  const counters = $$('[data-count]');
  const fmt = (n) => n.toLocaleString('en-US');
  if (counters.length) {
    if (reduceMotion || !hasIO) counters.forEach((el) => { el.textContent = fmt(+el.dataset.count) + (el.dataset.suffix || ''); });
    else {
      counters.forEach((el) => { el.textContent = '0' + (el.dataset.suffix || ''); });
      const cio = new IntersectionObserver((entries) => entries.forEach((e) => {
        if (!e.isIntersecting) return;
        cio.unobserve(e.target);
        const el = e.target, target = +el.dataset.count, suffix = el.dataset.suffix || '';
        const t0 = performance.now(), dur = 1600;
        const tick = (now) => {
          const p = Math.min((now - t0) / dur, 1);
          el.textContent = fmt(Math.round(target * (1 - Math.pow(1 - p, 3)))) + suffix;
          if (p < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }), { threshold: 0.4 });
      counters.forEach((el) => cio.observe(el));
    }
  }

  /* ---------- 6. Forms: validation + WhatsApp hand-off ---------- */
  const todayISO = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
  // Accept Arabic-Indic digits (٠-٩ / ۰-۹) typed on Arabic keyboards
  const toLatinDigits = (s) => String(s).replace(/[\u0660-\u0669\u06F0-\u06F9]/g, (c) => String(c.charCodeAt(0) & 0xF));
  const saMobile = (v) => { let d = toLatinDigits(v).replace(/\D/g, ''); if (d.startsWith('966')) d = d.slice(3); if (d.startsWith('0')) d = d.slice(1); return d; };
  const niceDate = (v) => { const d = new Date(v + 'T00:00:00'); return isNaN(d) ? v : d.toLocaleDateString('ar-u-ca-gregory-nu-latn', { day: 'numeric', month: 'long', year: 'numeric' }); };
  const RULES = {
    name: (v) => v.trim().length >= 2 || 'من فضلك اكتب اسمك.',
    phone: (v) => /^\+?\d{8,15}$/.test(toLatinDigits(v).replace(/[\s()-]/g, '')) || 'من فضلك اكتب رقم جوال صحيح.',
    choice: (v) => !!v || 'من فضلك اختر من القائمة.',
    date: (v) => (!v ? 'من فضلك اختر تاريخ السفر.' : v >= todayISO() || 'تاريخ السفر لا يمكن أن يكون في الماضي.'),
    travelers: (v) => (Number.isInteger(+toLatinDigits(v)) && +toLatinDigits(v) >= 1 && +toLatinDigits(v) <= 50) || 'اكتب عدداً من 1 إلى 50.',
    saMobile: (v) => /^5\d{8}$/.test(saMobile(v)) || 'اكتب رقم جوال سعودي صحيح، مثل 5X XXX XXXX.',
    email: (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim()) || 'من فضلك اكتب بريداً إلكترونياً صحيحاً.',
    message: (v) => v.trim().length >= 10 || 'اكتب 10 أحرف على الأقل.',
  };
  const validateField = (input) => {
    const rule = RULES[input.dataset.rule];
    if (!rule) return true;
    const res = rule(input.value || '');
    const ok = res === true;
    const wrap = input.closest('[data-field]');
    const err = wrap && $('[data-error]', wrap);
    if (wrap) wrap.classList.toggle('has-error', !ok);
    if (err) err.textContent = ok ? '' : res;
    input.setAttribute('aria-invalid', String(!ok));
    return ok;
  };
  const validateForm = (form) => {
    let first = null;
    $$('[data-rule]', form).forEach((i) => { if (!validateField(i) && !first) first = i; });
    if (first) first.focus();
    return !first;
  };
  const wireForm = (form) => {
    $$('[data-rule]', form).forEach((i) => {
      i.addEventListener('blur', () => { if (i.value) validateField(i); });
      ['input', 'change'].forEach((ev) => i.addEventListener(ev, () => { if (i.closest('.has-error')) validateField(i); }));
    });
    $$('select.field', form).forEach((s) => {
      const sync = () => s.classList.toggle('is-placeholder', !s.value);
      sync(); s.addEventListener('change', sync);
    });
  };
  const val = (form, name) => (form.elements[name] ? String(form.elements[name].value).trim() : '');

  // Services → quick quote
  const quote = $('#quote-form');
  if (quote) {
    wireForm(quote);
    if (quote.elements.date) quote.elements.date.min = todayISO();
    $$('[data-service]').forEach((a) => a.addEventListener('click', () => {
      const s = quote.elements.service;
      s.value = a.dataset.service;
      s.dispatchEvent(new Event('change'));
    }));
    quote.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!validateForm(quote)) return;
      openWhatsApp([
        'مرحباً سكاي إن، أرغب بعرض سعر:',
        '',
        `• الاسم: ${val(quote, 'name')}`,
        `• الجوال: ${toLatinDigits(val(quote, 'phone'))}`,
        `• الخدمة: ${val(quote, 'service')}`,
        `• تاريخ السفر: ${niceDate(val(quote, 'date'))}`,
        `• عدد المسافرين: ${toLatinDigits(val(quote, 'travelers'))}`,
      ].join('\n'));
      const note = $('[data-form-note]', quote);
      if (note) note.hidden = false;
    });
  }

  // Support → contact form
  const contact = $('#contact-form');
  const success = $('[data-success]');
  if (contact && success) {
    wireForm(contact);
    const btn = $('button[type="submit"]', contact);
    const setLoading = (on) => {
      btn.disabled = on;
      $('[data-label]', btn).textContent = on ? 'جارٍ الإرسال…' : 'أرسل الرسالة';
      $('[data-spinner]', btn).hidden = !on;
    };
    const done = () => {
      setLoading(false);
      contact.hidden = true;
      success.hidden = false;
      const h = $('[data-success-title]', success);
      if (h) h.focus();
    };
    contact.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fail = $('[data-form-error]', contact);
      if (fail) fail.hidden = true;
      if (!validateForm(contact)) return;
      const endpoint = contact.dataset.endpoint; // optional: Formspree or similar
      if (endpoint) {
        setLoading(true);
        try {
          const r = await fetch(endpoint, { method: 'POST', body: new FormData(contact), headers: { Accept: 'application/json' } });
          if (!r.ok) throw new Error(String(r.status));
          done();
        } catch (_) {
          setLoading(false);
          if (fail) fail.hidden = false;
        }
        return;
      }
      openWhatsApp([
        `مرحباً سكاي إن — ${val(contact, 'topic')}`,
        '',
        `الاسم: ${val(contact, 'name')}`,
        `الجوال: +966 ${saMobile(val(contact, 'phone')).replace(/^(\d{2})(\d{3})(\d{4})$/, '$1 $2 $3')}`,
        `البريد: ${val(contact, 'email')}`,
        '',
        val(contact, 'message'),
      ].join('\n'));
      setLoading(true);
      setTimeout(done, reduceMotion ? 0 : 700);
    });
    const again = $('[data-reset]', success);
    if (again) again.addEventListener('click', () => {
      contact.reset();
      $$('.has-error', contact).forEach((w) => w.classList.remove('has-error'));
      $$('[data-error]', contact).forEach((el) => { el.textContent = ''; });
      $$('select.field', contact).forEach((s) => s.classList.add('is-placeholder'));
      success.hidden = true;
      contact.hidden = false;
      contact.elements.name.focus();
    });
  }

  /* ---------- 7. FAQ accordion (one open at a time) ---------- */
  $$('[data-accordion]').forEach((acc) => {
    acc.addEventListener('click', (e) => {
      const trigger = e.target.closest('[data-acc-trigger]');
      if (!trigger) return;
      const item = trigger.closest('[data-acc-item]');
      const willOpen = !item.classList.contains('is-open');
      $$('[data-acc-item]', acc).forEach((it) => {
        const on = it === item && willOpen;
        it.classList.toggle('is-open', on);
        $('[data-acc-trigger]', it).setAttribute('aria-expanded', String(on));
      });
    });
  });

  /* ---------- 8. Locations: office cards ↔ map ---------- */
  const offices = $('[data-offices]');
  const frame = $('#office-map');
  if (offices && frame) {
    const cards = $$('[data-office]', offices);
    let unhide;
    frame.addEventListener('load', () => frame.classList.remove('is-swapping'));
    const select = (card) => {
      cards.forEach((c) => {
        const on = c === card;
        c.classList.toggle('is-selected', on);
        const pill = $('[data-selected-pill]', c); if (pill) pill.hidden = !on;
        const b = $('[data-select]', c); if (b) b.setAttribute('aria-pressed', String(on));
      });
      const q = card.dataset.map;
      if (frame.dataset.q !== q) {
        frame.dataset.q = q;
        frame.classList.add('is-swapping');
        setTimeout(() => { frame.src = 'https://www.google.com/maps?q=' + encodeURIComponent(q) + '&hl=ar&output=embed'; }, reduceMotion ? 0 : 220);
        clearTimeout(unhide);
        unhide = setTimeout(() => frame.classList.remove('is-swapping'), 2500); // never leave the map hidden
      }
      if (isMobile()) frame.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' });
    };
    offices.addEventListener('click', (e) => {
      if (e.target.closest('a')) return;
      const card = e.target.closest('[data-office]');
      if (card) select(card);
    });
  }

  // Opening hours: highlight today + open/closed badge (Riyadh time)
  const hours = $('[data-hours]');
  if (hours) {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Riyadh', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(new Date());
    const get = (t) => (parts.find((p) => p.type === t) || {}).value;
    const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday'));
    const now = (+get('hour') % 24) * 60 + (+get('minute'));
    const toMin = (s) => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };
    const row = $(`[data-day="${day}"]`, hours);
    let open = false;
    if (row) {
      row.classList.add('is-today');
      const tag = $('[data-today]', row); if (tag) tag.hidden = false;
      const o = row.dataset.open, c = row.dataset.close;
      if (o && c) open = now >= toMin(o) && now < toMin(c);
    }
    const badge = $('#open-badge');
    if (badge) {
      badge.classList.toggle('is-open', open);
      $('[data-badge-label]', badge).textContent = open ? 'مفتوح الآن' : 'مغلق الآن';
      badge.hidden = false;
    }
  }

  /* ---------- 9. Destinations: filters ---------- */
  const filterBar = $('[data-filters]');
  if (filterBar) {
    const items = $$('.dest-item');
    const status = $('[data-filter-status]');
    let token = 0;
    filterBar.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-filter]');
      if (!btn || btn.classList.contains('is-active')) return;
      $$('[data-filter]', filterBar).forEach((b) => {
        const on = b === btn;
        b.classList.toggle('is-active', on);
        b.setAttribute('aria-pressed', String(on));
      });
      const f = btn.dataset.filter;
      const match = (it) => f === 'all' || it.dataset.region === f;
      const my = ++token;
      items.forEach((it) => { if (!match(it) || it.hidden) it.classList.add('is-out'); });
      setTimeout(() => {
        if (my !== token) return;
        items.forEach((it) => { it.hidden = !match(it); });
        requestAnimationFrame(() => requestAnimationFrame(() => {
          items.forEach((it) => { if (match(it)) it.classList.remove('is-out'); });
        }));
        if (status) { const n = items.filter(match).length; status.textContent = n === 2 ? 'تظهر وجهتان' : n === 1 ? 'تظهر وجهة واحدة' : `تظهر ${n} وجهات`; }
      }, reduceMotion ? 0 : 280);
    });
  }

  /* ---------- 10. Destinations: detail modal ---------- */
  const modal = $('#dest-modal');
  const dataEl = $('#destinations-data');
  if (modal && dataEl) {
    const D = JSON.parse(dataEl.textContent);
    const panel = $('.modal-panel', modal);
    const m = (k) => $(`[data-m="${k}"]`, modal);
    const CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" class="h-3.5 w-3.5" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>';
    let lastFocus = null;
    let closeTimer;

    const openModal = (slug, trigger) => {
      const d = D[slug];
      if (!d) return;
      clearTimeout(closeTimer);
      lastFocus = trigger || document.activeElement;
      const media = m('media'), img = m('img');
      media.style.setProperty('--c1', d.c1);
      media.style.setProperty('--c2', d.c2);
      img.hidden = false;
      img.onerror = () => { img.hidden = true; };
      img.alt = `${d.city}، ${d.country}`;
      img.src = `assets/images/${slug}.jpg`;
      m('country').textContent = d.country;
      m('city').textContent = d.city;
      m('summary').textContent = d.summary;
      m('highlights').innerHTML = d.highlights.map((h) =>
        `<li class="flex items-start gap-3 text-[15px] text-white/80"><span class="check-dot">${CHECK}</span><span>${esc(h)}</span></li>`).join('');
      m('best').textContent = d.best;
      m('includes').innerHTML = d.includes.map((i) =>
        `<span class="rounded-full border border-white/15 px-3 py-1 text-[13px] text-white/80">${esc(i)}</span>`).join('');
      m('price').textContent = `${d.price} ريال`;
      m('nights').textContent = `· ${d.nights} ليالٍ`;
      m('book').href = waLink(`مرحباً سكاي إن، أرغب بمعرفة تفاصيل باقة ${d.city} (${d.nights} ليالٍ، تبدأ من ${d.price} ريال).`);
      modal.hidden = false;
      panel.scrollTop = 0;
      body.style.overflow = 'hidden';
      body.classList.add('modal-open');
      requestAnimationFrame(() => requestAnimationFrame(() => modal.classList.add('is-open')));
      $('.modal-close', modal).focus({ preventScroll: true });
    };
    const closeModal = () => {
      if (modal.hidden) return;
      modal.classList.remove('is-open');
      body.style.overflow = '';
      body.classList.remove('modal-open');
      closeTimer = setTimeout(() => { modal.hidden = true; }, reduceMotion ? 0 : 320);
      if (lastFocus) lastFocus.focus({ preventScroll: true });
    };

    $$('[data-dest]').forEach((b) => b.addEventListener('click', () => openModal(b.dataset.dest, b)));
    modal.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) closeModal(); });
    document.addEventListener('keydown', (e) => {
      if (modal.hidden) return;
      if (e.key === 'Escape') closeModal();
      if (e.key === 'Tab') {
        const f = $$('a[href], button:not([disabled])', modal).filter((el) => el.offsetParent !== null);
        if (!f.length) return;
        const first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    });
  }
})();
