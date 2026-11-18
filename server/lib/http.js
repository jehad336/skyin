'use strict';
const { z } = require('zod');

/** An error with an HTTP status and an Arabic message safe to show to the user. */
class HttpError extends Error {
  constructor(status, message, fields) {
    super(message);
    this.status = status;
    this.fields = fields;
  }
}
const bad = (msg, fields) => new HttpError(400, msg, fields);
const notFound = (msg = 'غير موجود.') => new HttpError(404, msg);
const conflict = (msg) => new HttpError(409, msg);

/** Parse req.body / req.query with a zod schema; throws a 400 with per-field Arabic messages. */
function parse(schema, data) {
  const r = schema.safeParse(data ?? {});
  if (r.success) return r.data;
  const fields = {};
  for (const issue of r.error.issues) {
    const k = issue.path.join('.') || '_';
    // zod's built-in messages are English; keep ours (Arabic) and translate the rest.
    const msg = /[؀-ۿ]/.test(issue.message) ? issue.message
      : issue.input === undefined ? 'هذا الحقل مطلوب.' : 'قيمة غير صالحة.';
    if (!fields[k]) fields[k] = msg;
  }
  throw bad('تحقق من البيانات المدخلة.', fields);
}

// Accept Arabic-Indic digits typed on Arabic keyboards.
const latinDigits = (s) => String(s).replace(/[٠-٩۰-۹]/g, (c) => String(c.charCodeAt(0) & 0xF));

const v = {
  name: z.string().trim().min(2, 'اكتب اسمك (حرفان على الأقل).').max(100, 'الاسم طويل جداً.'),
  email: z.string().trim().toLowerCase().max(200).email('اكتب بريداً إلكترونياً صحيحاً.'),
  phone: z.string().transform((s) => latinDigits(s).replace(/[\s()-]/g, ''))
    .pipe(z.string().regex(/^\+?\d{8,15}$/, 'اكتب رقم جوال صحيح.')),
  password: z.string().min(8, 'كلمة المرور 8 أحرف على الأقل.').max(200),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'اختر تاريخاً صحيحاً.')
    .refine((s) => !isNaN(Date.parse(s + 'T00:00:00Z')), 'اختر تاريخاً صحيحاً.'),
  futureDate: null, // set below
  travelers: z.preprocess((x) => (typeof x === 'string' ? latinDigits(x).trim() : x),
    z.coerce.number({ error: 'اكتب عدداً.' }).int('اكتب عدداً صحيحاً.')
      .min(1, 'عدد المسافرين 1 على الأقل.').max(50, 'الحد الأقصى 50 مسافراً.')),
  text: (max, msg = 'النص طويل جداً.') => z.string().trim().max(max, msg),
  id: z.coerce.number().int().positive(),
};
// Riyadh "today" so a Saudi customer can book for today's date at 1am.
const todayRiyadh = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Riyadh' }).format(new Date());
v.futureDate = v.date.refine((s) => s >= todayRiyadh(), 'تاريخ السفر لا يمكن أن يكون في الماضي.');

const optional = (schema) => z.preprocess((x) => (x === '' || x === null ? undefined : x), schema.optional());

module.exports = { HttpError, bad, notFound, conflict, parse, v, optional, z, latinDigits, todayRiyadh };
