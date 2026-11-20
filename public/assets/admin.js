/* =========================================================
   Skyin — admin dashboard (admin.html). Uses window.Skyin from app.js.
   ========================================================= */
(() => {
  'use strict';
  const root = document.querySelector('[data-admin]');
  if (!root) return;
  const S = window.Skyin;
  const { api, esc, money, date, pill } = S;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const panel = $('[data-panel]');
  const dt = (v) => (v ? new Date(v).toLocaleString('ar-u-ca-gregory-nu-latn', { dateStyle: 'medium', timeStyle: 'short' }) : '—');
  const wa = (phone, text) => 'https://wa.me/' + String(phone || '').replace(/\D/g, '').replace(/^0/, '966') + '?text=' + encodeURIComponent(text);
  const REGIONS = { europe: 'أوروبا', asia: 'آسيا', caucasus: 'القوقاز', islands: 'الجزر', 'middle-east': 'الشرق الأوسط', africa: 'أفريقيا', americas: 'الأمريكتان' };

  /* ---------- Modal ---------- */
  const modal = $('#admin-modal');
  let lastFocus;
  const openModal = (title, html) => {
    lastFocus = document.activeElement;
    $('[data-modal-title]', modal).textContent = title;
    $('[data-modal-body]', modal).innerHTML = html;
    modal.hidden = false;
    document.body.style.overflow = 'hidden';
    requestAnimationFrame(() => requestAnimationFrame(() => modal.classList.add('is-open')));
    $('.modal-close', modal).focus();
    return $('[data-modal-body]', modal);
  };
  const closeModal = () => {
    modal.classList.remove('is-open');
    document.body.style.overflow = '';
    setTimeout(() => { modal.hidden = true; }, 250);
    if (lastFocus) lastFocus.focus();
  };
  modal.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) closeModal(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !modal.hidden) closeModal(); });

  /* ---------- Small builders ---------- */
  const field = (name, label, { type = 'text', value = '', attrs = '', span = '', options } = {}) => `
    <div data-field class="${span}">
      <label class="label" for="f-${name}">${label}</label>
      ${options ? `<select id="f-${name}" name="${name}" class="field" ${attrs}>${options.map(([v, t]) =>
        `<option value="${esc(v)}" ${String(v) === String(value) ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select>`
      : type === 'textarea' ? `<textarea id="f-${name}" name="${name}" rows="3" class="field resize-none" ${attrs}>${esc(value)}</textarea>`
      : `<input id="f-${name}" name="${name}" type="${type}" class="field" value="${esc(value)}" ${attrs} />`}
      <p class="err" data-error></p>
    </div>`;
  const submitRow = (label) => `<div class="sm:col-span-2"><p class="err" data-form-error hidden></p>
    <button type="submit" class="btn-primary mt-2"><span class="spinner" data-spinner hidden></span><span data-label>${label}</span></button></div>`;
  const toolbar = (statuses, q) => `
    <form class="flex flex-wrap gap-3" data-filter-form>
      <input name="q" type="search" class="field max-w-xs" placeholder="بحث…" value="${esc(q.q || '')}" />
      ${statuses ? `<select name="status" class="field max-w-[200px]"><option value="">كل الحالات</option>${statuses.map((s) =>
        `<option value="${s}" ${q.status === s ? 'selected' : ''}>${esc((S.STATUS[s] || [s])[0])}</option>`).join('')}</select>` : ''}
      <button class="btn-secondary" type="submit">تصفية</button>
    </form>`;
  const table = (cols, rows, empty = 'لا توجد بيانات.') => rows.length ? `
    <div class="mt-6 overflow-x-auto rounded-2xl border border-fg/10">
      <table class="w-full min-w-[720px] text-start text-[14px]">
        <thead class="bg-fg/5 text-fg/60"><tr>${cols.map((c) => `<th class="px-4 py-3 text-start font-medium">${c}</th>`).join('')}</tr></thead>
        <tbody class="divide-y divide-fg/5">${rows.join('')}</tbody>
      </table>
    </div>` : `<p class="mt-6 text-fg/60">${empty}</p>`;
  const td = (h, cls = '') => `<td class="px-4 py-3 align-top ${cls}">${h}</td>`;
  const more = (total, shown, offset) => total > offset + shown
    ? `<button type="button" class="btn-secondary mt-6" data-more="${offset + shown}">عرض المزيد (${total - offset - shown})</button>` : '';
  const copyBtn = (text, label = 'نسخ') => `<button type="button" class="btn-secondary px-3 py-1 text-[13px]" data-copy="${esc(text)}">${label}</button>`;

  panel.addEventListener('click', (e) => {
    const c = e.target.closest('[data-copy]');
    if (c) { navigator.clipboard.writeText(c.dataset.copy).then(() => { const t = c.textContent; c.textContent = 'تم النسخ ✓'; setTimeout(() => { c.textContent = t; }, 1500); }); }
  });
  modal.addEventListener('click', (e) => {
    const c = e.target.closest('[data-copy]');
    if (c) { navigator.clipboard.writeText(c.dataset.copy).then(() => { c.textContent = 'تم النسخ ✓'; }); }
  });

  /* ---------- Tabs ---------- */
  let current = 'overview';
  const state = {};
  const tabs = {};
  const show = async (tab, q = state[tab] || {}) => {
    current = tab;
    state[tab] = q;
    $$('[data-tab]').forEach((b) => { const on = b.dataset.tab === tab; b.classList.toggle('is-active', on); b.setAttribute('aria-pressed', String(on)); });
    if (location.hash !== '#' + tab) history.replaceState(null, '', '#' + tab);
    panel.innerHTML = '<p class="text-fg/60">جارٍ التحميل…</p>';
    try { await tabs[tab](q); } catch (e) { panel.innerHTML = `<p class="err">${esc(e.message)}</p>`; }
  };
  const refresh = () => show(current);
  $('[data-tabs]').addEventListener('click', (e) => { const b = e.target.closest('[data-tab]'); if (b) show(b.dataset.tab, {}); });
  panel.addEventListener('submit', (e) => {
    const f = e.target.closest('[data-filter-form]');
    if (!f) return;
    e.preventDefault();
    show(current, { q: f.elements.q.value.trim(), status: f.elements.status ? f.elements.status.value : '' });
  });
  panel.addEventListener('click', (e) => {
    const m = e.target.closest('[data-more]');
    if (m) tabs[current]({ ...state[current], offset: Number(m.dataset.more), append: true });
  });
  const qs = (q) => '?' + new URLSearchParams(Object.entries({ q: q.q, status: q.status, offset: q.offset }).filter(([, v]) => v)).toString();

  const badges = async () => {
    try {
      const { stats } = await api('GET', '/admin/stats');
      $$('[data-badge]').forEach((b) => {
        const n = stats[b.dataset.badge];
        b.className = n ? 'ms-1 rounded-full bg-skyin-orange px-1.5 text-[11px] text-fg' : '';
        b.textContent = n ? String(n) : '';
      });
      return stats;
    } catch (_) { return null; }
  };

  /* ---------- Overview ---------- */
  tabs.overview = async () => {
    const s = await badges();
    const { bookings } = await api('GET', '/admin/bookings?limit=8');
    const tile = (label, value, sub = '') => `<div class="panel p-5"><p class="text-[13px] text-fg/60">${label}</p>
      <p class="mt-2 text-[26px] font-medium" dir="ltr">${value}</p>${sub ? `<p class="mt-1 text-[12px] text-fg/50">${sub}</p>` : ''}</div>`;
    panel.innerHTML = `
      <div class="grid grid-cols-2 gap-4 lg:grid-cols-4">
        ${tile('الإيرادات (آخر 30 يوماً)', money(s.revenue_30d), `الإجمالي ${money(s.revenue)}`)}
        ${tile('حجوزات مدفوعة', s.paid_bookings, `${s.bookings} حجز إجمالاً`)}
        ${tile('بانتظار الدفع', s.pending_payment)}
        ${tile('العملاء', s.customers)}
        ${tile('طلبات أسعار جديدة', s.new_quotes)}
        ${tile('رسائل جديدة', s.new_messages)}
      </div>
      <h2 class="mt-10 text-[18px] font-medium">آخر الحجوزات</h2>
      ${bookingTable(bookings)}`;
  };

  /* ---------- Bookings ---------- */
  const bookingRow = (b) => `<tr class="cursor-pointer hover:bg-fg/[0.03]" data-booking="${b.id}">
      ${td(`<span dir="ltr" class="text-fg/70">${esc(b.ref)}</span>`)}
      ${td(`<p>${esc(b.title)}</p><p class="text-[12px] text-fg/50">${date(b.travel_date)} · ${b.travelers} مسافر</p>`)}
      ${td(`<p>${esc(b.customer_name)}</p><p class="text-[12px] text-fg/50" dir="ltr">${esc(b.customer_phone || '')}</p>`)}
      ${td(`<span dir="ltr">${money(b.total)}</span>`)}
      ${td(pill(b.status))}
      ${td(`<span class="text-[12px] text-fg/50">${dt(b.created_at)}</span>`)}
    </tr>`;
  const bookingTable = (rows) => table(['المرجع', 'الحجز', 'العميل', 'المبلغ', 'الحالة', 'التاريخ'], rows.map(bookingRow), 'لا توجد حجوزات.');
  panel.addEventListener('click', (e) => { const r = e.target.closest('[data-booking]'); if (r) bookingDetails(Number(r.dataset.booking)); });

  tabs.bookings = async (q = {}) => {
    const { bookings, total } = await api('GET', '/admin/bookings' + qs(q));
    if (q.append) { $('tbody', panel).insertAdjacentHTML('beforeend', bookings.map(bookingRow).join('')); const m = $('[data-more]', panel); if (m) m.outerHTML = more(total, bookings.length, q.offset); return; }
    panel.innerHTML = `<div class="flex flex-wrap items-center justify-between gap-3">
        ${toolbar(['pending_payment', 'paid', 'confirmed', 'cancelled', 'refunded'], q)}
        <button type="button" class="btn-primary" data-new-booking>حجز مخصص + رابط دفع</button>
      </div>
      <p class="mt-4 text-[13px] text-fg/50">${total} حجز</p>
      ${bookingTable(bookings)}${more(total, bookings.length, 0)}`;
    $('[data-new-booking]', panel).addEventListener('click', () => customBooking());
  };

  const NEXT = { pending_payment: ['cancelled'], paid: ['confirmed', 'refunded', 'cancelled'], confirmed: ['refunded', 'cancelled'], cancelled: [], refunded: [] };
  async function bookingDetails(id) {
    const { booking: b, payments } = await api('GET', `/admin/bookings/${id}`);
    const body = openModal(`حجز ${b.ref}`, `
      <div class="flex flex-wrap items-center gap-2">${pill(b.status)}${b.quote_id ? '<span class="pill bg-fg/10 text-fg/70">من طلب عرض سعر</span>' : ''}</div>
      <dl class="mt-6 grid grid-cols-2 gap-4 text-[14px]">
        <div class="col-span-2"><dt class="text-fg/50">الحجز</dt><dd class="mt-1">${esc(b.title)}</dd></div>
        <div><dt class="text-fg/50">العميل</dt><dd class="mt-1">${esc(b.customer_name)}</dd></div>
        <div><dt class="text-fg/50">الجوال</dt><dd class="mt-1" dir="ltr">${esc(b.customer_phone || '—')}</dd></div>
        <div><dt class="text-fg/50">البريد</dt><dd class="mt-1" dir="ltr">${esc(b.customer_email || '—')}</dd></div>
        <div><dt class="text-fg/50">تاريخ السفر</dt><dd class="mt-1">${date(b.travel_date)}</dd></div>
        <div><dt class="text-fg/50">المسافرون</dt><dd class="mt-1">${b.travelers}</dd></div>
        <div><dt class="text-fg/50">المبلغ</dt><dd class="mt-1" dir="ltr">${money(b.total)}</dd></div>
        <div><dt class="text-fg/50">أُنشئ</dt><dd class="mt-1">${dt(b.created_at)}</dd></div>
        <div><dt class="text-fg/50">دُفع</dt><dd class="mt-1">${dt(b.paid_at)}</dd></div>
        ${b.notes ? `<div class="col-span-2"><dt class="text-fg/50">ملاحظات العميل</dt><dd class="mt-1 whitespace-pre-line">${esc(b.notes)}</dd></div>` : ''}
      </dl>
      ${b.status === 'pending_payment' ? `<div class="mt-6 rounded-2xl border border-fg/10 p-4">
        <p class="text-[13px] text-fg/60">رابط الدفع للعميل</p>
        <p class="mt-2 break-all text-[13px]" dir="ltr">${esc(b.pay_link)}</p>
        <div class="mt-3 flex flex-wrap gap-2">${copyBtn(b.pay_link, 'نسخ الرابط')}
          ${b.customer_phone ? `<a class="btn-secondary px-3 py-1 text-[13px]" target="_blank" rel="noopener" href="${esc(wa(b.customer_phone,
            `مرحباً ${b.customer_name}، هذا رابط دفع حجزك (${b.title}) بمبلغ ${money(b.total)} مع سكاي إن:\n${b.pay_link}`))}">إرسال عبر واتساب</a>` : ''}</div>
      </div>` : ''}
      <h3 class="mt-8 text-[15px] font-medium">عمليات الدفع</h3>
      ${payments.length ? `<ul class="mt-3 grid gap-2 text-[13px]">${payments.map((p) => `<li class="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-fg/10 px-4 py-2">
        <span>${pill(p.status)} <span class="text-fg/60">${esc(p.provider)}</span></span><span dir="ltr">${money(p.amount)}</span>
        <span class="text-fg/50">${dt(p.created_at)}</span>${p.failure_reason ? `<span class="w-full text-warn">${esc(p.failure_reason)}</span>` : ''}</li>`).join('')}</ul>`
        : '<p class="mt-3 text-[13px] text-fg/50">لا توجد عمليات دفع.</p>'}
      <form class="mt-8 grid gap-4 sm:grid-cols-2" data-app-form novalidate>
        ${field('status', 'تغيير الحالة', { value: b.status, options: [[b.status, (S.STATUS[b.status] || [b.status])[0] + ' (الحالية)'], ...NEXT[b.status].map((s) => [s, S.STATUS[s][0]])] })}
        ${field('admin_note', 'ملاحظة داخلية', { type: 'textarea', value: b.admin_note || '', span: 'sm:col-span-2' })}
        ${submitRow('حفظ')}
      </form>
      ${b.status === 'paid' || b.status === 'confirmed' ? '<p class="mt-4 text-[12px] text-fg/50">الاسترداد الفعلي للمبلغ يتم من لوحة ميسّر، ثم غيّر الحالة هنا إلى «مسترد».</p>' : ''}`);
    S.onSubmit($('form', body), async (d) => {
      await api('PATCH', `/admin/bookings/${id}`, { status: d.status, admin_note: d.admin_note });
      closeModal(); refresh(); badges();
    });
  }

  function customBooking(prefill = {}) {
    const body = openModal(prefill.quote_id ? 'إصدار عرض سعر ورابط دفع' : 'حجز مخصص + رابط دفع', `
      <form class="grid gap-4 sm:grid-cols-2" data-app-form novalidate>
        ${field('title', 'عنوان الحجز', { value: prefill.title || '', span: 'sm:col-span-2', attrs: 'placeholder="مثلاً: باقة إسطنبول 5 ليالٍ — فندق 5 نجوم"' })}
        ${field('customer_name', 'اسم العميل', { value: prefill.customer_name || '' })}
        ${field('customer_phone', 'جوال العميل', { value: prefill.customer_phone || '', attrs: 'dir="ltr"' })}
        ${field('customer_email', 'بريد العميل (اختياري)', { type: 'email', value: prefill.customer_email || '', attrs: 'dir="ltr"' })}
        ${field('travel_date', 'تاريخ السفر', { type: 'date', value: prefill.travel_date || '' })}
        ${field('travelers', 'عدد المسافرين', { type: 'number', value: prefill.travelers || 1, attrs: 'min="1" max="50"' })}
        ${field('total', 'المبلغ الإجمالي (ريال)', { type: 'number', attrs: 'min="1" step="0.01" dir="ltr"' })}
        ${field('notes', 'تفاصيل يراها العميل (اختياري)', { type: 'textarea', span: 'sm:col-span-2' })}
        ${submitRow('إنشاء رابط الدفع')}
      </form>`);
    S.onSubmit($('form', body), async (d) => {
      const { booking } = await api('POST', '/admin/bookings', { ...d, quote_id: prefill.quote_id });
      refresh(); badges();
      bookingDetails(booking.id);
    });
  }

  /* ---------- Quotes ---------- */
  const quoteRow = (q) => `<tr>
      ${td(`<p>${esc(q.name)}</p><p class="text-[12px] text-fg/50" dir="ltr">${esc(q.phone)}</p>`)}
      ${td(`<p>${esc(q.service)}</p>${q.message ? `<p class="mt-1 max-w-xs text-[12px] text-fg/50">${esc(q.message)}</p>` : ''}`)}
      ${td(`${date(q.travel_date)}<p class="text-[12px] text-fg/50">${q.travelers || '—'} مسافر</p>`)}
      ${td(pill(q.status))}
      ${td(`<span class="text-[12px] text-fg/50">${dt(q.created_at)}</span>`)}
      ${td(`<div class="flex flex-wrap gap-2">
          <button type="button" class="btn-primary px-3 py-1 text-[13px]" data-quote-offer='${esc(JSON.stringify(q))}'>إصدار عرض</button>
          <a class="btn-secondary px-3 py-1 text-[13px]" target="_blank" rel="noopener" href="${esc(wa(q.phone, `مرحباً ${q.name}، معك سكاي إن بخصوص طلبك (${q.service}).`))}">واتساب</a>
          <select class="field w-auto py-1 text-[13px]" data-quote-status="${q.id}" aria-label="حالة الطلب">
            ${['new', 'contacted', 'quoted', 'closed'].map((s) => `<option value="${s}" ${q.status === s ? 'selected' : ''}>${S.STATUS[s][0]}</option>`).join('')}
          </select></div>`)}
    </tr>`;
  tabs.quotes = async (q = {}) => {
    const { quotes, total } = await api('GET', '/admin/quotes' + qs(q));
    const cols = ['العميل', 'الخدمة', 'السفر', 'الحالة', 'وصل', ''];
    if (q.append) { $('tbody', panel).insertAdjacentHTML('beforeend', quotes.map(quoteRow).join('')); const m = $('[data-more]', panel); if (m) m.outerHTML = more(total, quotes.length, q.offset); return; }
    panel.innerHTML = `${toolbar(['new', 'contacted', 'quoted', 'closed'], q)}<p class="mt-4 text-[13px] text-fg/50">${total} طلب</p>
      ${table(cols, quotes.map(quoteRow), 'لا توجد طلبات.')}${more(total, quotes.length, 0)}`;
  };
  panel.addEventListener('click', (e) => {
    const b = e.target.closest('[data-quote-offer]');
    if (!b) return;
    const q = JSON.parse(b.dataset.quoteOffer);
    customBooking({ quote_id: q.id, title: q.service, customer_name: q.name, customer_phone: q.phone, customer_email: q.email || '',
      travel_date: q.travel_date && q.travel_date >= S.todayISO() ? q.travel_date : '', travelers: q.travelers || 1 });
  });
  panel.addEventListener('change', async (e) => {
    const s = e.target.closest('[data-quote-status]');
    const m = e.target.closest('[data-message-status]');
    try {
      if (s) await api('PATCH', `/admin/quotes/${s.dataset.quoteStatus}`, { status: s.value });
      if (m) await api('PATCH', `/admin/messages/${m.dataset.messageStatus}`, { status: m.value });
      if (s || m) badges();
    } catch (err) { alert(err.message); }
  });

  /* ---------- Messages ---------- */
  const messageRow = (m) => `<tr>
      ${td(`<p>${esc(m.name)}</p><p class="text-[12px] text-fg/50" dir="ltr">${esc(m.email || '')}</p><p class="text-[12px] text-fg/50" dir="ltr">${esc(m.phone || '')}</p>`)}
      ${td(`<p class="font-medium">${esc(m.topic)}</p><p class="mt-1 max-w-md whitespace-pre-line text-fg/70">${esc(m.message)}</p>`)}
      ${td(`<span class="text-[12px] text-fg/50">${dt(m.created_at)}</span>`)}
      ${td(`<select class="field w-auto py-1 text-[13px]" data-message-status="${m.id}" aria-label="حالة الرسالة">
          ${['new', 'read', 'archived'].map((s) => `<option value="${s}" ${m.status === s ? 'selected' : ''}>${S.STATUS[s][0]}</option>`).join('')}</select>
          <div class="mt-2 flex gap-2">${m.email ? `<a class="text-[13px] text-accent hover:underline" href="mailto:${esc(m.email)}">رد بالبريد</a>` : ''}
          ${m.phone ? `<a class="text-[13px] text-accent hover:underline" target="_blank" rel="noopener" href="${esc(wa(m.phone, `مرحباً ${m.name}، معك سكاي إن بخصوص رسالتك.`))}">واتساب</a>` : ''}</div>`)}
    </tr>`;
  tabs.messages = async (q = {}) => {
    const { messages, total } = await api('GET', '/admin/messages' + qs(q));
    if (q.append) { $('tbody', panel).insertAdjacentHTML('beforeend', messages.map(messageRow).join('')); const m = $('[data-more]', panel); if (m) m.outerHTML = more(total, messages.length, q.offset); return; }
    panel.innerHTML = `${toolbar(['new', 'read', 'archived'], q)}<p class="mt-4 text-[13px] text-fg/50">${total} رسالة</p>
      ${table(['المرسل', 'الرسالة', 'وصلت', 'الحالة'], messages.map(messageRow), 'لا توجد رسائل.')}${more(total, messages.length, 0)}`;
  };

  /* ---------- Customers ---------- */
  let myId = null;
  const customerRow = (c) => `<tr>
      ${td(`<p>${esc(c.name)}</p>${c.role === 'admin' ? '<span class="pill mt-1 bg-skyin-cyan/15 text-accent">مدير</span>' : ''}`)}
      ${td(`<p dir="ltr" class="text-end">${esc(c.email)}</p><p dir="ltr" class="text-end text-[12px] text-fg/50">${esc(c.phone || '')}</p>`)}
      ${td(c.bookings)}
      ${td(`<span dir="ltr">${money(c.paid_total)}</span>`)}
      ${td(`<span class="text-[12px] text-fg/50">${dt(c.created_at)}</span>`)}
      ${td(c.id === myId ? '<span class="text-[12px] text-fg/40">حسابك</span>'
        : `<button type="button" class="btn-secondary px-3 py-1 text-[12px]" data-role="${c.id}" data-to="${c.role === 'admin' ? 'customer' : 'admin'}">${c.role === 'admin' ? 'إزالة صلاحية المدير' : 'جعله مديراً'}</button>`)}
    </tr>`;
  tabs.customers = async (q = {}) => {
    const { customers, total } = await api('GET', '/admin/customers' + qs(q));
    if (q.append) { $('tbody', panel).insertAdjacentHTML('beforeend', customers.map(customerRow).join('')); const m = $('[data-more]', panel); if (m) m.outerHTML = more(total, customers.length, q.offset); return; }
    panel.innerHTML = `${toolbar(null, q)}<p class="mt-4 text-[13px] text-fg/50">${total} حساب</p>
      ${table(['الاسم', 'التواصل', 'الحجوزات', 'المدفوع', 'التسجيل', ''], customers.map(customerRow), 'لا يوجد عملاء.')}${more(total, customers.length, 0)}`;
  };
  panel.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-role]');
    if (!b) return;
    const toAdmin = b.dataset.to === 'admin';
    if (!confirm(toAdmin ? 'منح هذا الحساب صلاحية الوصول الكامل للوحة التحكم؟' : 'إزالة صلاحية المدير من هذا الحساب؟')) return;
    try { await api('PATCH', `/admin/customers/${b.dataset.role}`, { role: b.dataset.to }); refresh(); } catch (err) { alert(err.message); }
  });

  /* ---------- Payments ---------- */
  const paymentRow = (p) => `<tr class="cursor-pointer hover:bg-fg/[0.03]" data-booking="${p.booking_id}">
      ${td(`<span dir="ltr" class="text-fg/70">${esc(p.ref)}</span>`)}
      ${td(esc(p.customer_name))}
      ${td(`<span dir="ltr">${money(p.amount)}</span>`)}
      ${td(`${esc(p.provider)}<p class="text-[11px] text-fg/40" dir="ltr">${esc(p.provider_ref || '')}</p>`)}
      ${td(pill(p.status) + (p.failure_reason ? `<p class="mt-1 text-[11px] text-warn">${esc(p.failure_reason)}</p>` : ''))}
      ${td(`<span class="text-[12px] text-fg/50">${dt(p.created_at)}</span>`)}
    </tr>`;
  tabs.payments = async (q = {}) => {
    const { payments, total } = await api('GET', '/admin/payments' + qs(q));
    if (q.append) { $('tbody', panel).insertAdjacentHTML('beforeend', payments.map(paymentRow).join('')); const m = $('[data-more]', panel); if (m) m.outerHTML = more(total, payments.length, q.offset); return; }
    panel.innerHTML = `${toolbar(['initiated', 'paid', 'failed', 'cancelled', 'refunded'], q)}<p class="mt-4 text-[13px] text-fg/50">${total} عملية</p>
      ${table(['الحجز', 'العميل', 'المبلغ', 'البوابة', 'الحالة', 'التاريخ'], payments.map(paymentRow), 'لا توجد مدفوعات.')}${more(total, payments.length, 0)}`;
  };

  /* ---------- Destinations ---------- */
  let dests = [];
  tabs.destinations = async () => {
    ({ destinations: dests } = await api('GET', '/admin/destinations'));
    panel.innerHTML = `<div class="flex justify-end"><button type="button" class="btn-primary" data-dest-edit="">إضافة وجهة</button></div>
      ${table(['الوجهة', 'المنطقة', 'السعر للشخص', 'الليالي', 'الظهور', ''], dests.map((d) => `<tr>
        ${td(`<div class="flex items-center gap-3"><span class="ph h-10 w-10 shrink-0 rounded-lg" style="--c1:${esc(d.c1)};--c2:${esc(d.c2)}"></span>
          <div><p>${esc(d.city)}</p><p class="text-[12px] text-fg/50">${esc(d.country)} · <span dir="ltr">${esc(d.slug)}</span></p></div></div>`)}
        ${td(esc(REGIONS[d.region] || d.region))}
        ${td(`<span dir="ltr">${money(d.price)}</span>`)}
        ${td(d.nights)}
        ${td(d.active ? '<span class="pill bg-skyin-cyan/15 text-accent">ظاهرة</span>' : '<span class="pill bg-fg/10 text-fg/60">مخفية</span>')}
        ${td(`<button type="button" class="btn-secondary px-3 py-1 text-[13px]" data-dest-edit="${d.id}">تعديل</button>`)}
      </tr>`), 'لا توجد وجهات.')}`;
  };
  panel.addEventListener('click', (e) => {
    const b = e.target.closest('[data-dest-edit]');
    if (!b) return;
    const d = dests.find((x) => String(x.id) === b.dataset.destEdit) || { c1: '#04B2CD', c2: '#0B2A3A', active: true, sort: dests.length, highlights: [], includes: ['الطيران', 'الفندق', 'التنقلات', 'الجولات'] };
    const body = openModal(d.id ? `تعديل ${d.city}` : 'إضافة وجهة', `
      <form class="grid gap-4 sm:grid-cols-2" data-app-form novalidate>
        ${field('city', 'المدينة', { value: d.city || '' })}
        ${field('country', 'الدولة', { value: d.country || '' })}
        ${field('slug', 'المعرّف (بالإنجليزي، يظهر في الرابط)', { value: d.slug || '', attrs: 'dir="ltr" placeholder="istanbul"' })}
        ${field('region', 'المنطقة', { value: d.region || 'europe', options: Object.entries(REGIONS) })}
        ${field('price', 'السعر للشخص (ريال)', { type: 'number', value: d.price || '', attrs: 'min="1" dir="ltr"' })}
        ${field('nights', 'عدد الليالي', { type: 'number', value: d.nights || 5, attrs: 'min="1" max="60"' })}
        ${field('best', 'أفضل وقت للزيارة', { value: d.best || '', span: 'sm:col-span-2' })}
        ${field('summary', 'وصف قصير', { type: 'textarea', value: d.summary || '', span: 'sm:col-span-2' })}
        ${field('highlights', 'أبرز المعالم (سطر لكل بند)', { type: 'textarea', value: (d.highlights || []).join('\n'), span: 'sm:col-span-2' })}
        ${field('includes', 'الباقة تشمل (افصل بفاصلة)', { value: (d.includes || []).join('، '), span: 'sm:col-span-2' })}
        ${field('image_url', 'رابط الصورة (اختياري)', { value: d.id && d.image !== `assets/images/${d.slug}.jpg` ? d.image : '', span: 'sm:col-span-2', attrs: 'dir="ltr" placeholder="https://… أو assets/images/name.jpg"' })}
        ${field('c1', 'لون الخلفية 1', { type: 'color', value: d.c1, attrs: 'class="h-12 w-full rounded-xl border border-fg/10 bg-fg/5 p-1"' })}
        ${field('c2', 'لون الخلفية 2', { type: 'color', value: d.c2, attrs: 'class="h-12 w-full rounded-xl border border-fg/10 bg-fg/5 p-1"' })}
        ${field('sort', 'الترتيب', { type: 'number', value: d.sort || 0, attrs: 'min="0"' })}
        <label class="flex items-center gap-3 self-end pb-3 text-[14px]"><input type="checkbox" name="active" ${d.active ? 'checked' : ''} class="h-5 w-5 accent-[#04B2CD]" /> تظهر في الموقع</label>
        ${submitRow('حفظ')}
      </form>
      ${d.id ? '<button type="button" class="mt-6 text-[13px] text-warn hover:underline" data-dest-delete>حذف الوجهة</button>' : ''}`);
    S.onSubmit($('form', body), async (v) => {
      const payload = { ...v, active: !!v.active,
        highlights: String(v.highlights).split('\n').map((s) => s.trim()).filter(Boolean),
        includes: String(v.includes).split(/[,،]/).map((s) => s.trim()).filter(Boolean) };
      await api(d.id ? 'PUT' : 'POST', d.id ? `/admin/destinations/${d.id}` : '/admin/destinations', payload);
      closeModal(); refresh();
    });
    const del = $('[data-dest-delete]', body);
    if (del) del.addEventListener('click', async () => {
      if (!confirm(`حذف ${d.city} نهائياً؟`)) return;
      try { await api('DELETE', `/admin/destinations/${d.id}`); closeModal(); refresh(); } catch (err) { alert(err.message); }
    });
  });

  /* ---------- Boot ---------- */
  S.me().then((u) => {
    if (u === undefined) return; // static preview: app.js shows the notice
    $('[data-admin-loading]').hidden = true;
    if (!u || u.role !== 'admin') { $('[data-admin-denied]').hidden = false; return; }
    myId = u.id;
    $('[data-admin-who]').textContent = `${u.name} · ${u.email}`;
    $('[data-admin-app]').hidden = false;
    const start = location.hash.slice(1);
    show(tabs[start] ? start : 'overview');
    badges();
  });
})();
