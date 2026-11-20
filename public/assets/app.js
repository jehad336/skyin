/* =========================================================
   Skyin — accounts, bookings and payments (talks to /api)
   No dependencies. Exposes window.Skyin for admin.js and skyin.js.
   ========================================================= */
(() => {
  'use strict';

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const params = new URLSearchParams(location.search);

  /* ---------- API client ---------- */
  async function api(method, url, body) {
    let res;
    try {
      res = await fetch('/api' + url, {
        method,
        credentials: 'same-origin',
        headers: { 'X-Skyin': '1', Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch (_) {
      const e = new Error('تعذّر الاتصال بالخادم. تحقق من الإنترنت وحاول مرة أخرى.');
      e.network = true;
      throw e;
    }
    let data = {};
    try { data = await res.json(); } catch (_) { /* not JSON (e.g. static hosting) */ }
    if (!res.ok) {
      const e = new Error(data.error || 'حدث خطأ غير متوقع. حاول مرة أخرى.');
      e.status = res.status;
      e.fields = data.fields;
      e.noApi = !data.error; // no JSON error body → no backend behind this site
      throw e;
    }
    return data;
  }

  let mePromise;
  const me = (fresh) => {
    if (!mePromise || fresh) mePromise = api('GET', '/auth/me').then((d) => d.user).catch((e) => { if (e.noApi || e.network) return undefined; return null; });
    return mePromise;
  };

  /* ---------- Formatting ---------- */
  const latin = (s) => String(s).replace(/[٠-٩۰-۹]/g, (c) => String(c.charCodeAt(0) & 0xF));
  const money = (n) => Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 }) + ' SAR';
  const date = (v) => {
    if (!v) return '—';
    const d = new Date(String(v).length === 10 ? v + 'T00:00:00' : v);
    return isNaN(d) ? v : d.toLocaleDateString('ar-u-ca-gregory-nu-latn', { day: 'numeric', month: 'long', year: 'numeric' });
  };
  const todayISO = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Riyadh' }).format(new Date());
  const STATUS = {
    pending_payment: ['بانتظار الدفع', 'bg-skyin-orange/15 text-warn'],
    paid: ['مدفوع', 'bg-skyin-cyan/15 text-accent'],
    confirmed: ['مؤكد', 'bg-emerald-500/15 text-emerald-700'],
    cancelled: ['ملغي', 'bg-fg/10 text-fg/60'],
    refunded: ['مسترد', 'bg-fg/10 text-fg/60'],
    initiated: ['قيد الدفع', 'bg-skyin-orange/15 text-warn'],
    failed: ['فشل', 'bg-red-500/15 text-red-700'],
    new: ['جديد', 'bg-skyin-orange/15 text-warn'],
    contacted: ['تم التواصل', 'bg-skyin-cyan/15 text-accent'],
    quoted: ['أُرسل العرض', 'bg-skyin-cyan/15 text-accent'],
    closed: ['مغلق', 'bg-fg/10 text-fg/60'],
    read: ['مقروءة', 'bg-fg/10 text-fg/60'],
    archived: ['مؤرشفة', 'bg-fg/10 text-fg/60'],
  };
  const pill = (s) => { const [t, c] = STATUS[s] || [s, 'bg-fg/10 text-fg/70']; return `<span class="pill ${c}">${esc(t)}</span>`; };

  /* ---------- Forms ---------- */
  const formData = (form) => {
    const o = {};
    $$('input, select, textarea', form).forEach((el) => {
      if (!el.name || el.disabled) return;
      o[el.name] = el.type === 'checkbox' ? el.checked : latin(el.value.trim());
    });
    return o;
  };
  const clearErrors = (form) => {
    $$('[data-field]', form).forEach((w) => w.classList.remove('has-error'));
    $$('[data-error]', form).forEach((e) => { e.textContent = ''; });
    const fe = $('[data-form-error]', form); if (fe) fe.hidden = true;
    const ok = $('[data-form-ok]', form); if (ok) ok.hidden = true;
  };
  const showErrors = (form, err) => {
    let first = null;
    Object.entries(err.fields || {}).forEach(([name, msg]) => {
      const input = form.elements[name];
      const wrap = input && (input.closest ? input.closest('[data-field]') : null);
      if (!wrap) return;
      wrap.classList.add('has-error');
      const e = $('[data-error]', wrap); if (e) e.textContent = msg;
      if (!first) first = input;
    });
    const fe = $('[data-form-error]', form);
    if (fe && (!first || !err.fields)) { fe.textContent = err.message; fe.hidden = false; }
    if (first) first.focus();
  };
  const busy = (btn, on, label) => {
    if (!btn) return;
    btn.disabled = on;
    const sp = $('[data-spinner]', btn); if (sp) sp.hidden = !on;
    const l = $('[data-label]', btn);
    if (l) { if (on) { l.dataset.idle = l.textContent; l.textContent = label || 'لحظة…'; } else if (l.dataset.idle) l.textContent = l.dataset.idle; }
  };
  /** Wire a form: collect → call(handler) → show field errors. */
  const onSubmit = (form, handler) => form && form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearErrors(form);
    const btn = $('button[type="submit"]', form);
    busy(btn, true);
    try { await handler(formData(form)); } catch (err) { showErrors(form, err); } finally { busy(btn, false); }
  });

  // Only allow same-site relative redirects after login.
  const safeNext = (fallback) => {
    const n = params.get('next');
    return n && /^[a-z0-9-]+\.html(\?[^#]*)?$/i.test(n) ? n : fallback;
  };
  const loginUrl = () => 'login.html?next=' + encodeURIComponent(location.pathname.replace(/^\//, '') + location.search);

  /* ---------- Nav: "Sign in" ↔ "My account" ---------- */
  me().then((u) => {
    $$('[data-account-link]').forEach((a) => {
      if (u === undefined) return; // no backend: keep hidden
      a.hidden = false;
      if (u) { a.textContent = 'حسابي'; a.href = 'account.html'; }
    });
  });
  $$('[data-keep-next]').forEach((a) => { if (params.get('next')) a.href += '?next=' + encodeURIComponent(params.get('next')); });

  /* ---------- Login / register ---------- */
  onSubmit($('#login-form'), async (d) => {
    const { user } = await api('POST', '/auth/login', d);
    location.href = safeNext(user.role === 'admin' ? 'admin.html' : 'account.html');
  });
  onSubmit($('#register-form'), async (d) => {
    await api('POST', '/auth/register', d);
    location.href = safeNext('account.html');
  });

  /* ---------- Account ---------- */
  const account = $('[data-account]');
  if (account) {
    me().then(async (u) => {
      if (!u) { location.replace(loginUrl()); return; }
      $('[data-page-title]').textContent = `أهلاً ${u.name.split(' ')[0]}`;
      const pf = $('#profile-form');
      pf.elements.name.value = u.name; pf.elements.email.value = u.email; pf.elements.phone.value = u.phone || '';
      if (u.role === 'admin') $$('[data-admin-only]').forEach((el) => { el.hidden = false; });

      const box = $('[data-bookings]');
      try {
        const { bookings } = await api('GET', '/bookings');
        box.innerHTML = bookings.length ? bookings.map((b) => `
          <article class="panel flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div class="flex flex-wrap items-center gap-2">${pill(b.status)}<span class="text-[13px] text-fg/50" dir="ltr">${esc(b.ref)}</span></div>
              <h3 class="mt-2 text-[17px] font-medium">${esc(b.title)}</h3>
              <p class="mt-1 text-[14px] text-fg/60">${date(b.travel_date)} · ${b.travelers} مسافر · <span dir="ltr">${money(b.total)}</span></p>
            </div>
            <div class="flex shrink-0 gap-2">
              ${b.status === 'pending_payment' ? `<a class="btn-primary" href="pay.html?t=${encodeURIComponent(b.pay_token)}">ادفع الآن</a>
                <button type="button" class="btn-secondary border-fg/30" data-cancel="${esc(b.ref)}">إلغاء</button>` : ''}
            </div>
          </article>`).join('')
          : `<div class="panel p-8 text-center text-fg/70">ما عندك حجوزات بعد. <a href="places.html" class="text-accent hover:underline">تصفح الوجهات</a></div>`;
      } catch (e) { box.innerHTML = `<p class="err">${esc(e.message)}</p>`; }

      box.addEventListener('click', async (e) => {
        const b = e.target.closest('[data-cancel]');
        if (!b || !confirm('تأكيد إلغاء هذا الحجز؟')) return;
        b.disabled = true;
        try { await api('POST', `/bookings/${encodeURIComponent(b.dataset.cancel)}/cancel`); location.reload(); }
        catch (err) { alert(err.message); b.disabled = false; }
      });

      try {
        const { quotes } = await api('GET', '/me/quotes');
        $('[data-quotes]').innerHTML = quotes.length ? quotes.map((q) => `
          <div class="flex items-center justify-between gap-4 rounded-2xl border border-fg/10 px-5 py-4">
            <div><p class="text-[15px]">${esc(q.service)}</p><p class="mt-1 text-[13px] text-fg/50">${date(q.travel_date)} · ${q.travelers || '—'} مسافر</p></div>
            ${pill(q.status)}
          </div>`).join('') : `<p class="text-[14px] text-fg/60">لا توجد طلبات. <a href="services.html#quote" class="text-accent hover:underline">اطلب عرض سعر</a></p>`;
      } catch (_) { /* optional section */ }
    });

    onSubmit($('#profile-form'), async (d) => {
      await api('PATCH', '/auth/me', { name: d.name, phone: d.phone });
      $('[data-form-ok]', $('#profile-form')).hidden = false;
    });
    onSubmit($('#password-form'), async (d) => {
      await api('POST', '/auth/password', d);
      $('#password-form').reset();
      $('[data-form-ok]', $('#password-form')).hidden = false;
    });
    $('[data-logout]').addEventListener('click', async () => {
      try { await api('POST', '/auth/logout'); } finally { location.href = 'index.html'; }
    });
  }

  /* ---------- Book a destination ---------- */
  const book = $('[data-book]');
  if (book) {
    const slug = params.get('d') || '';
    const form = $('#book-form');
    Promise.all([me(), api('GET', `/destinations/${encodeURIComponent(slug)}`).catch(() => null)]).then(([u, res]) => {
      $('[data-book-loading]').hidden = true;
      if (!res) { $('[data-book-missing]').hidden = false; return; }
      if (!u) { location.replace(loginUrl()); return; }
      const d = res.destination;
      const card = $('[data-book-card]');
      card.hidden = false;
      const media = $('[data-book-media]');
      media.style.setProperty('--c1', d.c1); media.style.setProperty('--c2', d.c2);
      const img = $('[data-book-img]'); img.alt = `${d.city}، ${d.country}`; img.src = d.image;
      $('[data-book-country]').textContent = d.country;
      $('[data-book-city]').textContent = d.city;
      $('[data-book-meta]').textContent = `${d.nights} ليالٍ · ${(d.includes || []).join('، ')}`;
      $('[data-book-unit]').textContent = `${money(d.price)} للشخص`;
      form.hidden = false;
      form.elements.travel_date.min = todayISO();
      if (u.phone) form.elements.phone.value = u.phone;
      const total = () => {
        const n = parseInt(latin(form.elements.travelers.value), 10);
        $('[data-book-total]').textContent = n >= 1 && n <= 20 ? money(d.price * n) : '—';
      };
      form.elements.travelers.addEventListener('input', total);
      total();
      onSubmit(form, async (v) => {
        const { booking } = await api('POST', '/bookings', { slug: d.slug, ...v });
        const { url } = await api('POST', `/pay/${encodeURIComponent(booking.pay_token)}/checkout`);
        location.href = url;
      });
    });
  }

  /* ---------- Payment page (pay.html?t=…) ---------- */
  const pay = $('[data-pay]');
  if (pay) {
    const token = params.get('t') || '';
    const alertBox = $('[data-pay-alert]');
    const say = (msg, kind) => {
      alertBox.className = 'rounded-2xl border px-4 py-3 text-[14px] ' + (kind === 'ok'
        ? 'border-skyin-cyan/30 bg-skyin-cyan/10 text-accent' : 'border-skyin-orange/30 bg-skyin-orange/10 text-warn');
      alertBox.textContent = msg; alertBox.hidden = false;
    };
    const render = (b, lastPayment) => {
      $('[data-pay-loading]').hidden = true;
      $('[data-pay-box]').hidden = false;
      $('[data-pay-ref]').textContent = b.ref;
      $('[data-pay-title]').textContent = b.title;
      $('[data-pay-name]').textContent = b.customer_name;
      $('[data-pay-date]').textContent = date(b.travel_date);
      $('[data-pay-travelers]').textContent = b.travelers;
      $('[data-pay-status]').innerHTML = pill(b.status);
      $('[data-pay-total]').textContent = money(b.total);
      const due = b.status === 'pending_payment';
      $('[data-pay-btn]').hidden = !due;
      $('[data-pay-methods]').hidden = !due;
      if (b.status === 'paid' || b.status === 'confirmed') say('تم الدفع بنجاح. شكراً لك! سيتواصل معك فريقنا لتأكيد تفاصيل رحلتك.', 'ok');
      else if (b.status === 'cancelled' || b.status === 'refunded') say('هذا الحجز ملغي. تواصل معنا إذا تحتاج مساعدة.');
      else if (lastPayment === 'failed') say('لم تكتمل عملية الدفع. تقدر تحاول مرة أخرى.');
      me().then((u) => { if (u) $('[data-pay-account]').hidden = false; });
    };
    const load = async () => {
      try {
        if (params.get('return')) {
          const r = await api('POST', `/pay/${encodeURIComponent(token)}/verify`);
          render(r.booking, r.last_payment_status);
          history.replaceState(null, '', `pay.html?t=${encodeURIComponent(token)}`);
        } else {
          render((await api('GET', `/pay/${encodeURIComponent(token)}`)).booking);
        }
      } catch (_) {
        $('[data-pay-loading]').hidden = true;
        $('[data-pay-missing]').hidden = false;
      }
    };
    load();
    $('[data-pay-btn]').addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      const err = $('[data-pay-error]'); err.hidden = true;
      busy(btn, true, 'جارٍ فتح صفحة الدفع…');
      try { location.href = (await api('POST', `/pay/${encodeURIComponent(token)}/checkout`)).url; }
      catch (x) { err.textContent = x.message; err.hidden = false; busy(btn, false); }
    });
  }

  window.Skyin = { api, me, esc, money, date, pill, STATUS, onSubmit, formData, clearErrors, showErrors, busy, latin, todayISO };
})();
