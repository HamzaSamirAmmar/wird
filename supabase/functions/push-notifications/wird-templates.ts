// ─── Wird notification templates ─────────────────────────────────────────────
//
// The wording of the three automatic wird messages, for each channel. Edit freely and
// redeploy the function (`supabase functions deploy push-notifications`); nothing else needs
// to change. These messages are not in the dashboard on purpose — they are the app's core
// ritual, not something an admin composes.
//
//   morning  — 04:00 Damascus, to every employee with a wird today (finished or not).
//   evening  — 20:00 Damascus, to every employee whose wird today is not finished yet.
//   updated  — a supervisor added or changed today's wird after 04:00; to the affected
//              employees only, about a minute after the last change.
//
// Placeholders, filled in per employee:
//
//   {{name}}       the employee's first name                         عبد الرحمن
//   {{date}}       today, in Arabic                                  الثلاثاء 29 سبتمبر
//   {{wird}}       every duty today, one per line; finished ones marked ✅
//   {{remaining}}  only the duties not finished yet, one per line
//   {{link}}       the app, opened on today's checklist (Telegram also gets a button)
//
// Push text is plain text and should stay short — a phone shows a few lines. Telegram text is
// HTML (Telegram's subset: <b>, <i>, <u>, <a href="…">); placeholder values are escaped for
// it, so only write HTML in the template itself.

export type WirdKind = 'morning' | 'evening' | 'updated';

export interface WirdTemplate {
  push: { title: string; body: string };
  telegram: string;
}

/** The two buttons under every Telegram wird message. */
export const TELEGRAM_BUTTONS = {
  open: 'فتح ورد اليوم في التطبيق',
  // Opens the app on today's checklist with the PDF download offered (`?download=1`); the
  // app builds the file itself, offline-capable.
  download: 'تحميل الورد 📥',
};

export const WIRD_TEMPLATES: Record<WirdKind, WirdTemplate> = {
  morning: {
    push: {
      title: 'ورد اليوم',
      body: '{{wird}}',
    },
    telegram: [
      '<b>ورد اليوم — {{date}}</b>',
      '',
      'صباح الخير يا {{name}}، هذا وردك لليوم:',
      '{{wird}}',
      '',
      '📥 لتحميل وردك بصفحات المصحف (PDF) اضغط «تحميل الورد» بالأسفل.',
      '',
      'أعانك الله عليه وتقبّل منك 🤍',
    ].join('\n'),
  },

  evening: {
    push: {
      title: 'لم يكتمل ورد اليوم بعد',
      body: 'تبقّى عليك:\n{{remaining}}',
    },
    telegram: [
      '<b>تذكير: ورد اليوم لم يكتمل</b>',
      '',
      'يا {{name}}، تبقّى عليك من ورد اليوم:',
      '{{remaining}}',
      '',
      'بعد الانتهاء علّم وردك مكتملاً في التطبيق.',
      '📥 وإن أردت صفحات وردك من المصحف فاضغط «تحميل الورد».',
    ].join('\n'),
  },

  updated: {
    push: {
      title: 'تحديث على ورد اليوم',
      body: 'وردك لليوم الآن:\n{{wird}}',
    },
    telegram: [
      '<b>تحديث على ورد اليوم — {{date}}</b>',
      '',
      'يا {{name}}، عدّل المشرف ورد اليوم، وهذا وردك الآن:',
      '{{wird}}',
      '',
      '📥 «تحميل الورد» بالأسفل يعطيك صفحات وردك الجديد من المصحف (PDF).',
    ].join('\n'),
  },
};

// ─── Rendering ───────────────────────────────────────────────────────────────

/** One duty as the push snapshot carries it (see push_targets() in SQL). */
export interface TemplateDuty {
  /** duty category */
  c: string;
  /** [surahFrom, ayahFrom, surahTo, ayahTo] */
  s: number[];
  /** duty status */
  t: string;
}

export interface TemplateContext {
  name: string;
  duties: TemplateDuty[];
  date: Date;
  link: string;
}

export interface RenderedWird {
  push: { title: string; body: string };
  telegram: string;
}

const CATEGORY_LABELS: Record<string, string> = {
  new_memorization: 'حفظ جديد',
  minor_review: 'مراجعة صغرى',
  major_review: 'مراجعة كبرى',
};

// Fixed display order, so a message reads the same as the app's checklist.
const CATEGORY_ORDER = ['new_memorization', 'minor_review', 'major_review'];

// Surah names and ayah counts are duplicated from packages/quran-data (the function cannot
// import workspace packages). Keep in sync.
const SURAHS = [
  'الفاتحة', 'البقرة', 'آل عمران', 'النساء', 'المائدة', 'الأنعام', 'الأعراف', 'الأنفال',
  'التوبة', 'يونس', 'هود', 'يوسف', 'الرعد', 'إبراهيم', 'الحجر', 'النحل', 'الإسراء',
  'الكهف', 'مريم', 'طه', 'الأنبياء', 'الحج', 'المؤمنون', 'النور', 'الفرقان', 'الشعراء',
  'النمل', 'القصص', 'العنكبوت', 'الروم', 'لقمان', 'السجدة', 'الأحزاب', 'سبأ', 'فاطر',
  'يس', 'الصافات', 'ص', 'الزمر', 'غافر', 'فصلت', 'الشورى', 'الزخرف', 'الدخان',
  'الجاثية', 'الأحقاف', 'محمد', 'الفتح', 'الحجرات', 'ق', 'الذاريات', 'الطور', 'النجم',
  'القمر', 'الرحمن', 'الواقعة', 'الحديد', 'المجادلة', 'الحشر', 'الممتحنة', 'الصف',
  'الجمعة', 'المنافقون', 'التغابن', 'الطلاق', 'التحريم', 'الملك', 'القلم', 'الحاقة',
  'المعارج', 'نوح', 'الجن', 'المزمل', 'المدثر', 'القيامة', 'الإنسان', 'المرسلات',
  'النبأ', 'النازعات', 'عبس', 'التكوير', 'الانفطار', 'المطففين', 'الانشقاق', 'البروج',
  'الطارق', 'الأعلى', 'الغاشية', 'الفجر', 'البلد', 'الشمس', 'الليل', 'الضحى', 'الشرح',
  'التين', 'العلق', 'القدر', 'البينة', 'الزلزلة', 'العاديات', 'القارعة', 'التكاثر',
  'العصر', 'الهمزة', 'الفيل', 'قريش', 'الماعون', 'الكوثر', 'الكافرون', 'النصر',
  'المسد', 'الإخلاص', 'الفلق', 'الناس',
];

const AYAH_COUNTS = [
  7, 286, 200, 176, 120, 165, 206, 75, 129, 109, 123, 111, 43, 52, 99, 128, 111, 110, 98, 135,
  112, 78, 118, 64, 77, 227, 93, 88, 69, 60, 34, 30, 73, 54, 45, 83, 182, 88, 75, 85, 54, 53,
  89, 59, 37, 35, 38, 29, 18, 45, 60, 49, 62, 55, 78, 96, 29, 22, 24, 13, 14, 11, 11, 18, 12,
  12, 30, 52, 52, 44, 28, 28, 20, 56, 40, 31, 50, 40, 46, 42, 29, 19, 36, 25, 22, 17, 19, 26,
  30, 20, 15, 21, 11, 8, 8, 19, 5, 8, 8, 11, 11, 8, 3, 9, 5, 4, 7, 3, 6, 3, 5, 4, 5, 6,
];

/** Mirrors formatRange() in packages/quran-data. */
export function formatRange(s: number[]): string {
  const [surahFrom, ayahFrom, surahTo, ayahTo] = s;
  const from = SURAHS[surahFrom - 1];
  const to = SURAHS[surahTo - 1];
  if (ayahFrom === 1 && ayahTo === AYAH_COUNTS[surahTo - 1]) {
    return surahFrom === surahTo ? `سورة ${from} كاملة` : `من سورة ${from} إلى نهاية سورة ${to}`;
  }
  if (surahFrom === surahTo) return `${from} (${ayahFrom}-${ayahTo})`;
  return `${from} (${ayahFrom}) - ${to} (${ayahTo})`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function sorted(duties: TemplateDuty[]): TemplateDuty[] {
  return [...duties].sort((a, b) => CATEGORY_ORDER.indexOf(a.c) - CATEGORY_ORDER.indexOf(b.c));
}

function dutyLines(duties: TemplateDuty[], html: boolean, markDone: boolean): string {
  return sorted(duties)
    .map((d) => {
      const label = CATEGORY_LABELS[d.c] ?? d.c;
      const range = formatRange(d.s);
      const done = markDone && d.t === 'completed' ? ' ✅' : '';
      return html
        ? `▫️ <b>${escapeHtml(label)}:</b> ${escapeHtml(range)}${done}`
        : `${label}: ${range}${done}`;
    })
    .join('\n');
}

const dateFormat = new Intl.DateTimeFormat('ar', {
  timeZone: 'Asia/Damascus',
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});

function fill(template: string, values: Record<string, string>): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, key: string) => values[key] ?? match);
}

export function renderWird(kind: WirdKind, ctx: TemplateContext): RenderedWird {
  const template = WIRD_TEMPLATES[kind];
  const firstName = ctx.name.trim().split(/\s+/).slice(0, 2).join(' ');
  // "عبد الرحمن" is one name in two words; any other first name is a single word.
  const name = firstName.startsWith('عبد ') ? firstName : firstName.split(' ')[0] ?? '';
  const open = ctx.duties.filter((d) => d.t !== 'completed');
  const date = dateFormat.format(ctx.date);

  const plain = {
    name,
    date,
    wird: dutyLines(ctx.duties, false, true),
    remaining: dutyLines(open, false, false),
    link: ctx.link,
  };
  const html = {
    name: escapeHtml(name),
    date: escapeHtml(date),
    wird: dutyLines(ctx.duties, true, true),
    remaining: dutyLines(open, true, false),
    link: escapeHtml(ctx.link),
  };

  return {
    push: { title: fill(template.push.title, plain), body: fill(template.push.body, plain) },
    telegram: fill(template.telegram, html),
  };
}
