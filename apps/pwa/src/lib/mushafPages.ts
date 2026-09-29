// ─── Madinah muṣḥaf page renderer ────────────────────────────────────────────
//
// Turns the line layout in apps/pwa/public/mushaf/lines.json (built by
// packages/quran-data/scripts/generate-mushaf-lines.mjs) into HTML pages that reproduce the
// 15-line Madinah muṣḥaf: same words on the same lines, typeset in the KFGQPC Hafs font, whose
// ayah-end glyph is the numbered medallion itself.
//
// Pure string rendering, used by the full-page reader (routes/ReadWird.tsx) and the offline
// «تحميل الورد» PDF (lib/wirdPdf.ts) — one design for both.

/** A line: surah header, basmala, blank, or text segments [surah, ayah, words, endGlyph|0]. */
export type MushafLine =
  | ['h', number]
  | ['b']
  | []
  | [number, number, string, string | 0][];

export interface MushafData {
  pages: { j: number; l: MushafLine[] }[];
}

/** Inclusive ayah range, [surah, ayah] at each end. */
export interface AyahScope {
  from: [number, number];
  to: [number, number];
}

export type WirdCategory = 'new_memorization' | 'minor_review' | 'major_review';

export const CATEGORY_STYLE: Record<WirdCategory, { label: string; color: string }> = {
  new_memorization: { label: 'حفظ جديد', color: '#02636c' },
  minor_review: { label: 'مراجعة صغرى', color: '#9c7025' },
  major_review: { label: 'مراجعة كبرى', color: '#1e7454' },
};

// Plain names for the page headers (quran-data's SURAHS carries more than needed here).
export const SURAH_NAMES = [
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

const JUZ_NAMES = [
  'الأول', 'الثاني', 'الثالث', 'الرابع', 'الخامس', 'السادس', 'السابع', 'الثامن', 'التاسع',
  'العاشر', 'الحادي عشر', 'الثاني عشر', 'الثالث عشر', 'الرابع عشر', 'الخامس عشر',
  'السادس عشر', 'السابع عشر', 'الثامن عشر', 'التاسع عشر', 'العشرون', 'الحادي والعشرون',
  'الثاني والعشرون', 'الثالث والعشرون', 'الرابع والعشرون', 'الخامس والعشرون',
  'السادس والعشرون', 'السابع والعشرون', 'الثامن والعشرون', 'التاسع والعشرون', 'الثلاثون',
];

const BASMALA = 'بِسۡمِ ٱللَّهِ ٱلرَّحۡمَٰنِ ٱلرَّحِيمِ';

/** Font family name the CSS uses for the Hafs font; the host page declares its @font-face. */
export const HAFS_FAMILY = 'WirdHafs';

// ─── Geometry (CSS px; 794 × 1123 is A4 at 96 dpi) ──────────────────────────
export const PAGE_WIDTH = 794;
export const PAGE_HEIGHT = 1123;
const FRAME_HEIGHT = 1035;

const GOLD = '#b08a3e';
const TEAL = '#0b4f55';
const PAPER = '#fdfaf1';

export const MUSHAF_CSS = `
.mp-page{position:relative;box-sizing:border-box;width:${PAGE_WIDTH}px;background:${PAPER};direction:rtl;color:#161616;padding:0 34px 34px;font-family:'IBM Plex Sans Arabic',system-ui,sans-serif;overflow:hidden}
.mp-page.mp-print{height:${PAGE_HEIGHT}px;break-after:page;page-break-after:always}
.mp-page.mp-bare{padding:12px}
.mp-chrome{display:flex;align-items:center;justify-content:space-between;height:54px;color:#5e6b6c;font-size:14px}
.mp-brand{display:flex;align-items:center;gap:9px;white-space:nowrap}
.mp-brand img{width:26px;height:26px;border-radius:7px}
.mp-brand b{font-family:'Reem Kufi',sans-serif;font-weight:500;font-size:19px;color:${TEAL}}
.mp-chip{display:block;white-space:nowrap;height:28px;line-height:28px;border-radius:999px;padding:0 15px;font-size:14px;font-weight:600;color:#fff}
.mp-frame{position:relative;box-sizing:border-box;height:${FRAME_HEIGHT}px;border:3px solid ${TEAL};border-radius:5px;padding:9px;background:${PAPER}}
.mp-frame-in{position:relative;box-sizing:border-box;height:100%;border:1.5px solid ${GOLD};border-radius:2px;padding:10px 30px 0;display:flex;flex-direction:column;background:linear-gradient(${PAPER},#fbf5e6)}
.mp-corner{position:absolute;width:30px;height:30px}
.mp-corner.tr{top:-6px;right:-6px}.mp-corner.tl{top:-6px;left:-6px}.mp-corner.br{bottom:-6px;right:-6px}.mp-corner.bl{bottom:-6px;left:-6px}
.mp-head{display:flex;justify-content:space-between;align-items:center;height:38px;flex:none;border-bottom:1px solid ${GOLD}66;font-family:'Reem Kufi',sans-serif;font-size:17px;color:${TEAL}}
.mp-lines{flex:1;display:flex;flex-direction:column;justify-content:space-between;padding:14px 0 10px}
.mp-line{height:58px;display:flex;align-items:center;justify-content:space-between;white-space:nowrap;font-family:${HAFS_FAMILY},serif;font-size:31px;line-height:1}
.mp-line.mp-center{justify-content:center;gap:.32em}
.mp-lines.mp-opening{justify-content:center;gap:10px}
.mp-line>span{flex:none}
.mp-out{color:#c2bba9}
.mp-e{color:#8a6a1f}
.mp-out .mp-e,.mp-out.mp-e{color:#d6cdb4}
.mp-bism{justify-content:center;font-size:30px}
.mp-sh{justify-content:center;position:relative}
.mp-sh svg{position:absolute;inset:3px 0;width:100%;height:52px}
.mp-sh span{position:relative;font-family:${HAFS_FAMILY},serif;font-size:30px;color:${TEAL};padding-bottom:4px}
.mp-foot{flex:none;height:46px;display:flex;align-items:center;justify-content:center}
.mp-num{position:relative;width:46px;height:34px;display:flex;align-items:center;justify-content:center;font-size:15px;font-weight:600;color:${TEAL}}
.mp-num svg{position:absolute;inset:0}
.mp-num span{position:relative;display:block;height:34px;line-height:34px}
`;

// ─── Ornaments ───────────────────────────────────────────────────────────────

const CORNER = `<svg viewBox="0 0 30 30"><rect x="6" y="6" width="18" height="18" transform="rotate(45 15 15)" fill="${TEAL}"/><rect x="7" y="7" width="16" height="16" fill="${GOLD}"/><circle cx="15" cy="15" r="4.2" fill="${PAPER}"/><circle cx="15" cy="15" r="2" fill="${TEAL}"/></svg>`;

/** Surah title cartouche: pointed ends, double gold rule, teal knots at each end. */
const SURAH_FRAME = `<svg viewBox="0 0 660 52" preserveAspectRatio="none" aria-hidden="true">
<path d="M36 3H624L657 26L624 49H36L3 26Z" fill="#f4ead0" stroke="${GOLD}" stroke-width="2"/>
<path d="M42 8H618L646 26L618 44H42L14 26Z" fill="none" stroke="${GOLD}" stroke-width="1"/>
<path d="M170 8V44M490 8V44" stroke="${GOLD}" stroke-width="1"/>
<g fill="${TEAL}"><path d="M92 26l9-9 9 9-9 9z"/><path d="M550 26l9-9 9 9-9 9z"/><circle cx="130" cy="26" r="3"/><circle cx="530" cy="26" r="3"/><circle cx="72" cy="26" r="2.2"/><circle cx="588" cy="26" r="2.2"/></g>
<g fill="${GOLD}"><path d="M101 21l5 5-5 5-5-5z" fill="#f4ead0"/><path d="M559 21l5 5-5 5-5-5z" fill="#f4ead0"/></g>
</svg>`;

const PAGE_NUMBER = `<svg viewBox="0 0 46 34"><path d="M23 1L45 17L23 33L1 17Z" fill="#f4ead0" stroke="${GOLD}" stroke-width="1.5"/><path d="M23 5L39 17L23 29L7 17Z" fill="none" stroke="${TEAL}" stroke-width=".8"/></svg>`;

// ─── Rendering ───────────────────────────────────────────────────────────────

const ar = (n: number) => n.toLocaleString('ar-EG');

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function cmp(a: [number, number], b: [number, number]): number {
  return a[0] - b[0] || a[1] - b[1];
}

function inScope(scope: AyahScope | undefined, surah: number, ayah: number): boolean {
  if (!scope) return true;
  const k: [number, number] = [surah, ayah];
  return cmp(k, scope.from) >= 0 && cmp(k, scope.to) <= 0;
}

/** Every page (1…604) holding at least one ayah of the scope. */
export function pagesForScope(data: MushafData, scope: AyahScope): number[] {
  const out: number[] = [];
  data.pages.forEach((page, i) => {
    const hit = page.l.some(
      (line) =>
        Array.isArray(line[0]) &&
        (line as [number, number, string, string | 0][]).some((s) => inScope(scope, s[0], s[1])),
    );
    if (hit) out.push(i + 1);
  });
  return out;
}

/** The surah the page's first text line belongs to — the name printed in its header. */
function surahOfPage(page: { l: MushafLine[] }): number {
  for (const line of page.l) {
    if (line[0] === 'h') return line[1] as number;
    if (Array.isArray(line[0])) return (line[0] as [number, number, string, string | 0])[0];
  }
  return 1;
}

export interface PageChrome {
  /** e.g. "الثلاثاء ٢٩ سبتمبر ٢٠٢٦" */
  date: string;
  category: WirdCategory;
  iconUrl: string;
}

export interface RenderPageOptions {
  data: MushafData;
  page: number;
  scope?: AyahScope;
  /** The slim wird strip above the frame (PDFs); omit for the in-app reader. */
  chrome?: PageChrome;
  /** Fixed A4 height with a page break after it. */
  print?: boolean;
}

function renderLine(line: MushafLine, scope: AyahScope | undefined, centered: boolean): string {
  if (line.length === 0) return '<div class="mp-line"></div>';
  if (line[0] === 'h') {
    const name = SURAH_NAMES[(line[1] as number) - 1] ?? '';
    return `<div class="mp-line mp-sh">${SURAH_FRAME}<span>سُورَةُ ${esc(name)}</span></div>`;
  }
  if (line[0] === 'b') return `<div class="mp-line mp-bism"><span>${BASMALA}</span></div>`;

  const parts: string[] = [];
  for (const [surah, ayah, words, end] of line as [number, number, string, string | 0][]) {
    const out = inScope(scope, surah, ayah) ? '' : ' mp-out';
    for (const w of words ? words.split(' ') : []) {
      parts.push(`<span class="${out.trim()}">${esc(w)}</span>`);
    }
    if (end) parts.push(`<span class="mp-e${out}">${esc(end)}</span>`);
  }
  return `<div class="mp-line${centered ? ' mp-center' : ''}">${parts.join('')}</div>`;
}

export function renderPage(opts: RenderPageOptions): string {
  const page = opts.data.pages[opts.page - 1];
  if (!page) throw new Error(`Invalid page ${opts.page}`);
  // The opening two pages are set as centred, shorter lines in the printed muṣḥaf.
  const centered = opts.page <= 2;
  const surah = surahOfPage(page);

  const chrome = opts.chrome
    ? (() => {
        const c = CATEGORY_STYLE[opts.chrome.category];
        return `<div class="mp-chrome"><div class="mp-brand"><img src="${esc(opts.chrome.iconUrl)}" alt=""/><b>ورد</b><span>${esc(opts.chrome.date)}</span></div><div class="mp-chip" style="background:${c.color}">${esc(c.label)}</div></div>`;
      })()
    : '';

  // Blank lines only pad the short opening pages; there the text is centred instead.
  const lines = page.l
    .filter((l) => !centered || l.length > 0)
    .map((l) => renderLine(l, opts.scope, centered))
    .join('');
  const cls = `mp-page${opts.print ? ' mp-print' : ''}${opts.chrome ? '' : ' mp-bare'}`;
  return `<section class="${cls}" data-page="${opts.page}">${chrome}<div class="mp-frame"><div class="mp-frame-in">${['tr', 'tl', 'br', 'bl'].map((k) => `<div class="mp-corner ${k}">${CORNER}</div>`).join('')}<div class="mp-head"><span>سورة ${esc(SURAH_NAMES[surah - 1] ?? '')}</span><span>الجزء ${JUZ_NAMES[page.j - 1] ?? ar(page.j)}</span></div><div class="mp-lines${centered ? ' mp-opening' : ''}">${lines}</div><div class="mp-foot"><div class="mp-num">${PAGE_NUMBER}<span>${ar(opts.page)}</span></div></div></div></div></section>`;
}

/** Minimal DOM surface fitLines needs, so this file type-checks without the DOM lib. */
interface FitNode {
  style: { fontSize: string };
  scrollWidth: number;
  clientWidth: number;
}
interface FitRoot {
  querySelectorAll(selector: string): ArrayLike<unknown>;
}

/**
 * Shrinks any line whose words do not fit the frame (font metrics differ slightly between
 * machines). Call after the Hafs font has loaded.
 */
export function fitLines(root: FitRoot): void {
  const lines = root.querySelectorAll('.mp-line');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] as FitNode;
    line.style.fontSize = '';
    let size = 0;
    while (line.scrollWidth > line.clientWidth + 1) {
      size = (size || parseFloat(getComputed(line))) - 0.5;
      if (size < 16) break;
      line.style.fontSize = `${size}px`;
    }
  }
}

function getComputed(node: FitNode): string {
  // Resolved against the CSS default when no inline size is set.
  return node.style.fontSize || '31px';
}
