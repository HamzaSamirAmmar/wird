import {
  countAyahs,
  formatPage,
  formatRange,
  getSurah,
  globalAyahIndex,
  pageOfAyah,
  pagesForRange,
  SURAHS,
  type QuranRange,
} from '@wird/quran-data';
import {
  DUTY_CATEGORIES,
  DUTY_CATEGORY_LABELS,
  DUTY_CATEGORY_STEPS,
  type DutyCategory,
} from '@wird/domain';
import { loadQuranText } from './quran-text';

/**
 * Renders a day's wird as an A4 PDF laid out like a muṣḥaf: framed pages, surah banners,
 * basmala, justified Uthmani text with numbered ayah medallions.
 *
 * Arabic shaping is the hard part of any PDF library, so the pages are built as HTML, drawn by
 * the browser (which shapes correctly and has Amiri from @fontsource) and rasterised into the
 * PDF. The text is therefore an image — the price of getting the script right offline.
 */

export interface PdfDuty {
  category: DutyCategory;
  range: QuranRange;
}

export interface WirdPdfInput {
  name: string;
  /** `YYYY-MM-DD` */
  date: string;
  duties: PdfDuty[];
}

const PAGE_W = 794; // A4 at 96 dpi
const PAGE_H = 1123;
const BASMALA = 'بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ';

// Palette mirrors packages/design-tokens (primary / accent / mint).
const THEME: Record<DutyCategory, { main: string; tint: string; glyph: string }> = {
  new_memorization: { main: '#02636c', tint: '#ecfafa', glyph: '✦' },
  minor_review: { main: '#9c7025', tint: '#fbf6ea', glyph: '↻' },
  major_review: { main: '#1e7454', tint: '#edf9f2', glyph: '❖' },
};
const GOLD = '#bc8b2e';
const INK = '#1c2b2d';

const CSS = `
.wp-page{position:relative;box-sizing:border-box;width:${PAGE_W}px;height:${PAGE_H}px;background:#fffdf8;direction:rtl;color:${INK};font-family:'IBM Plex Sans Arabic',sans-serif;overflow:hidden}
.wp-frame{position:absolute;inset:26px;border:3px solid #02636c;border-radius:6px}
.wp-frame2{position:absolute;inset:34px;border:1px solid ${GOLD};border-radius:3px}
.wp-inner{position:absolute;inset:52px 58px 52px 58px;display:flex;flex-direction:column}
.wp-head{display:flex;align-items:center;justify-content:space-between;height:34px;flex:none;border-bottom:1px solid #e6dcc3;padding-bottom:8px;margin-bottom:14px}
.wp-brand{display:flex;align-items:center;gap:8px;font-family:'Reem Kufi',sans-serif;font-size:19px;color:#02636c}
.wp-brand img{width:26px;height:26px;border-radius:7px}
.wp-run{font-size:13px;color:#6b7b7d}
.wp-body{flex:1;min-height:0;overflow:hidden}
.wp-foot{flex:none;display:flex;justify-content:space-between;align-items:center;height:26px;margin-top:10px;border-top:1px solid #e6dcc3;padding-top:8px;font-size:11px;color:#8a9799}
.wp-cover{text-align:center;padding:6px 0 18px}
.wp-cover img{display:block;margin:0 auto;width:86px;height:86px;border-radius:22px;box-shadow:0 4px 14px rgba(2,99,108,.28)}
.wp-cover h1{margin:10px 0 0;font-family:'Reem Kufi',sans-serif;font-weight:500;font-size:46px;color:#02636c;line-height:1.7}
.wp-cover .sub{font-size:15px;color:#6b7b7d}
.wp-orn{display:flex;align-items:center;justify-content:center;gap:10px;color:${GOLD};font-size:16px;margin:10px 0}
.wp-orn i{display:block;height:1px;width:110px;background:linear-gradient(to left,${GOLD},transparent)}
.wp-orn i:last-child{background:linear-gradient(to right,${GOLD},transparent)}
.wp-meta{display:flex;justify-content:center;gap:26px;font-size:15px;color:${INK}}
.wp-meta b{color:#02636c;font-weight:600}
.wp-sum{margin:16px 0 0;display:flex;flex-direction:column;gap:8px}
.wp-sumrow{display:flex;align-items:center;gap:12px;border-radius:12px;padding:10px 14px;text-align:right}
.wp-sumrow .lbl{font-weight:600;font-size:16px;min-width:110px}
.wp-sumrow .rng{flex:1;font-size:15px}
.wp-sumrow .cnt{font-size:12px;color:#6b7b7d}
.wp-cat{border-radius:14px;padding:14px 18px;margin:10px 0 12px;color:#fff}
.wp-cat .t{display:flex;align-items:center;justify-content:space-between}
.wp-cat .n{font-family:'Reem Kufi',sans-serif;font-size:27px;line-height:1.4}
.wp-cat .m{font-size:13px;opacity:.9}
.wp-cat .r{font-size:15px;margin-top:2px;opacity:.95}
.wp-steps{border-radius:12px;padding:10px 16px;margin:0 0 14px;font-size:13.5px;line-height:1.8}
.wp-step{display:flex;gap:10px;align-items:flex-start}
.wp-step u{flex:none;width:15px;height:15px;border:1.6px solid;border-radius:4px;margin-top:5px;display:block}
.wp-surah{margin:14px 0 6px;text-align:center;color:#02636c}
.wp-surah div{display:inline-block;min-width:330px;border:2px solid ${GOLD};outline:1px solid ${GOLD};outline-offset:3px;border-radius:40px;padding:5px 30px;background:linear-gradient(#fbf6ea,#f6ebce);font-family:'Reem Kufi',sans-serif;font-size:25px;line-height:1.6}
.wp-surah small{display:block;font-family:'IBM Plex Sans Arabic',sans-serif;font-size:11px;color:#7c5820;margin-top:-4px}
.wp-part{margin:12px 0 4px;text-align:center;font-family:'Reem Kufi',sans-serif;font-size:19px;color:#02636c}
.wp-bism{text-align:center;font-family:Amiri,serif;font-size:29px;line-height:2;margin:2px 0 4px;color:${INK}}
.wp-q{margin:0;text-align:justify;text-align-last:right;font-family:Amiri,'Scheherazade New',serif;font-size:27px;line-height:2.25;word-spacing:1px}
.wp-n{display:inline-flex;align-items:center;justify-content:center;box-sizing:border-box;width:32px;height:32px;line-height:1;padding-bottom:2px;margin:0 3px;border:1.6px solid ${GOLD};border-radius:50%;text-align:center;font-family:Amiri,serif;font-size:17px;color:#7c5820;vertical-align:middle;background:#fbf6ea}
.wp-pg{display:inline-block;margin:0 6px;padding:0 9px;border-radius:9px;background:#efe6cf;color:#7c5820;font-family:'IBM Plex Sans Arabic',sans-serif;font-size:11px;line-height:20px;vertical-align:middle}
`;

/**
 * Ayah text as the reader should see it: Tanzil glues the basmala onto ayah 1 of most surahs.
 * The basmala is exactly four words, so drop those rather than matching its code points.
 */
function cleanAyah(surah: number, ayah: number, raw: string): string {
  if (ayah !== 1 || surah === 1 || surah === 9) return raw;
  const words = raw.split(/\s+/);
  return words.length > 4 ? words.slice(4).join(' ') : raw;
}

const ar = (n: number) => n.toLocaleString('ar-EG');

function longDate(iso: string): string {
  return new Intl.DateTimeFormat('ar', {
    timeZone: 'UTC',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(`${iso}T12:00:00Z`));
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function pagesLabel(range: QuranRange): string {
  const pages = pagesForRange(range);
  return pages.length === 1
    ? formatPage(pages[0]!)
    : `الصفحات ${ar(pages[0]!)}–${ar(pages[pages.length - 1]!)}`;
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  html?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (html !== undefined) node.innerHTML = html;
  return node;
}

interface PageRef {
  root: HTMLElement;
  body: HTMLElement;
  run: HTMLElement;
  foot: HTMLElement;
}

/** Fills fixed-size pages block by block, moving to a fresh page whenever one overflows. */
class Paginator {
  pages: PageRef[] = [];
  private host: HTMLElement;
  private iconSrc: string;

  constructor(host: HTMLElement, iconSrc: string) {
    this.host = host;
    this.iconSrc = iconSrc;
    this.newPage();
  }

  get current(): PageRef {
    return this.pages[this.pages.length - 1]!;
  }

  newPage(): PageRef {
    const root = el('div', 'wp-page');
    root.append(el('div', 'wp-frame'), el('div', 'wp-frame2'));
    const inner = el('div', 'wp-inner');
    const head = el('div', 'wp-head');
    const brand = el('div', 'wp-brand', `<img src="${this.iconSrc}" alt=""/><span>ورد</span>`);
    const run = el('div', 'wp-run');
    head.append(brand, run);
    const body = el('div', 'wp-body');
    const foot = el('div', 'wp-foot');
    inner.append(head, body, foot);
    root.append(inner);
    this.host.append(root);
    const ref = { root, body, run, foot };
    this.pages.push(ref);
    return ref;
  }

  private overflows(page: PageRef): boolean {
    return page.body.scrollHeight > page.body.clientHeight + 1;
  }

  /**
   * Appends a block. If it overflows, it (together with the trailing headings that must not be
   * left stranded at the bottom of a page) moves onto a new page.
   */
  append(block: HTMLElement, keepWithNext = false) {
    if (keepWithNext) block.dataset.keep = '1';
    const page = this.current;
    page.body.append(block);
    if (this.overflows(page) && page.body.children.length > 1) this.breakBefore(block);
  }

  /** Moves `block` and any headings directly before it to a new page, carrying the running head. */
  breakBefore(block: HTMLElement) {
    const old = this.current;
    const moving: HTMLElement[] = [block];
    let prev = block.previousElementSibling as HTMLElement | null;
    while (prev && prev.dataset.keep && old.body.children.length > moving.length) {
      moving.unshift(prev);
      prev = prev.previousElementSibling as HTMLElement | null;
    }
    const page = this.newPage();
    page.run.textContent = old.run.textContent;
    page.body.append(...moving);
  }

  /** True when the page currently has room for one more inline fragment. */
  fits(): boolean {
    return !this.overflows(this.current);
  }
}

async function ensureFonts() {
  const specs = [
    '400 27px Amiri',
    '700 27px Amiri',
    "500 24px 'Reem Kufi'",
    "400 14px 'IBM Plex Sans Arabic'",
    "600 14px 'IBM Plex Sans Arabic'",
  ];
  await Promise.all(specs.map((s) => document.fonts.load(s, 'بسم الله')));
  await document.fonts.ready;
}

function buildCover(input: WirdPdfInput, iconSrc: string): HTMLElement {
  const cover = el('div', 'wp-cover');
  cover.innerHTML = `
    <img src="${iconSrc}" alt=""/>
    <h1>ورد اليوم</h1>
    <div class="sub">الورد اليومي — حفظ ومراجعة</div>
    <div class="wp-orn"><i></i><span>۞</span><i></i></div>
    <div class="wp-meta">
      <span>${esc(longDate(input.date))}</span>
      ${input.name ? `<span>الاسم: <b>${esc(input.name)}</b></span>` : ''}
    </div>`;
  const sum = el('div', 'wp-sum');
  for (const d of input.duties) {
    const t = THEME[d.category];
    const row = el('div', 'wp-sumrow');
    row.style.background = t.tint;
    row.style.border = `1px solid ${t.main}33`;
    row.innerHTML = `
      <span class="lbl" style="color:${t.main}">${t.glyph} ${DUTY_CATEGORY_LABELS[d.category]}</span>
      <span class="rng">${esc(formatRange(d.range))}</span>
      <span class="cnt">${ar(countAyahs(d.range))} آية · ${esc(pagesLabel(d.range))}</span>`;
    sum.append(row);
  }
  cover.append(sum);
  return cover;
}

function buildCategoryHeader(d: PdfDuty): HTMLElement[] {
  const t = THEME[d.category];
  const banner = el('div', 'wp-cat');
  banner.style.background = `linear-gradient(135deg, ${t.main}, ${t.main}dd)`;
  banner.innerHTML = `
    <div class="t"><span class="n">${t.glyph} ${DUTY_CATEGORY_LABELS[d.category]}</span>
    <span class="m">${ar(countAyahs(d.range))} آية · ${esc(pagesLabel(d.range))}</span></div>
    <div class="r">${esc(formatRange(d.range))}</div>`;

  const steps = el('div', 'wp-steps');
  steps.style.background = t.tint;
  steps.style.color = INK;
  steps.innerHTML = DUTY_CATEGORY_STEPS[d.category]
    .map((s) => `<div class="wp-step"><u style="border-color:${t.main}"></u><span>${esc(s.label)}</span></div>`)
    .join('');
  return [banner, steps];
}

function surahBanner(surah: number): HTMLElement {
  const s = getSurah(surah);
  const wrap = el('div', 'wp-surah');
  wrap.innerHTML = `<div>سورة ${esc(s.nameAr)}<small>${ar(s.ayahCount)} آية</small></div>`;
  return wrap;
}

export type PdfProgress = (done: number, total: number) => void;

/** Lays the duties out into pages inside `host`. Returns the pages for rasterising. */
async function layout(host: HTMLElement, input: WirdPdfInput, iconSrc: string): Promise<PageRef[]> {
  const quran = await loadQuranText();
  const pager = new Paginator(host, iconSrc);

  pager.append(buildCover(input, iconSrc));

  const ordered = DUTY_CATEGORIES.flatMap((c) => input.duties.filter((d) => d.category === c));

  for (const duty of ordered) {
    // The first category shares the cover page; every later one starts on its own page.
    if (duty !== ordered[0]) pager.newPage();
    pager.current.run.textContent = `${DUTY_CATEGORY_LABELS[duty.category]} · ${formatRange(duty.range)}`;

    const [banner, steps] = buildCategoryHeader(duty);
    pager.append(banner, true);
    pager.append(steps, true);

    const from = globalAyahIndex(duty.range.surahFrom, duty.range.ayahFrom);
    const to = globalAyahIndex(duty.range.surahTo, duty.range.ayahTo);

    let surah = duty.range.surahFrom;
    let ayah = duty.range.ayahFrom;
    let lastPage = -1;
    let p: HTMLParagraphElement | null = null;

    const openParagraph = () => {
      p = el('p', 'wp-q');
      pager.append(p);
    };

    for (let i = from; i <= to; i++) {
      // A new surah (or the very first ayah of a mid-surah start) gets its heading.
      if (p === null || ayah === 1) {
        if (ayah === 1) {
          pager.append(surahBanner(surah), true);
          if (surah !== 1 && surah !== 9) {
            const bism = el('div', 'wp-bism', BASMALA);
            pager.append(bism, true);
          }
        } else {
          pager.append(el('div', 'wp-part', `سورة ${esc(getSurah(surah).nameAr)}`), true);
        }
        openParagraph();
      }
      const para = p!;

      const text = cleanAyah(surah, ayah, quran.surahs[surah - 1]?.[ayah - 1] ?? '');
      const mushafPage = pageOfAyah(surah, ayah);
      const frag = document.createDocumentFragment();
      const marks: HTMLElement[] = [];
      if (mushafPage !== lastPage) {
        const pg = el('span', 'wp-pg', formatPage(mushafPage));
        marks.push(pg);
        frag.append(pg);
      }
      const words = el('span', undefined, `${esc(text)} `);
      const num = el('span', 'wp-n', ar(ayah));
      const tail = document.createTextNode(' ');
      frag.append(words, num, tail);
      para.append(frag);

      if (!pager.fits()) {
        // Doesn't fit: take it back out and put it on the next page.
        for (const n of [...marks, words, num, tail]) n.remove();
        let target: HTMLParagraphElement;
        if (para.childNodes.length === 0) {
          // Nothing but headings above it: move them along with the paragraph.
          pager.breakBefore(para);
          target = para;
        } else {
          const prev = pager.current;
          const page = pager.newPage();
          page.run.textContent = prev.run.textContent;
          target = el('p', 'wp-q');
          page.body.append(target);
          p = target;
        }
        target.append(...marks, words, num, tail);
      }

      lastPage = mushafPage;
      // Advance one ayah.
      if (ayah >= SURAHS[surah - 1]!.ayahCount) {
        surah++;
        ayah = 1;
        p = null;
      } else {
        ayah++;
      }
    }
  }

  // Footers are written last, when the total is known.
  const total = pager.pages.length;
  pager.pages.forEach((page, i) => {
    page.foot.innerHTML = `<span>نص المصحف: مشروع تنزيل — tanzil.net</span><span>صفحة ${ar(i + 1)} من ${ar(total)}</span><span>${esc(longDate(input.date))}</span>`;
  });
  return pager.pages;
}

export async function buildWirdPdf(input: WirdPdfInput, onProgress?: PdfProgress): Promise<Blob> {
  if (input.duties.length === 0) throw new Error('No duties to print');

  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import('html2canvas'),
    import('jspdf'),
  ]);
  await ensureFonts();

  const host = el('div');
  host.style.cssText = `position:fixed;left:-10000px;top:0;width:${PAGE_W}px;pointer-events:none`;
  host.append(el('style', undefined, CSS));
  document.body.append(host);

  try {
    // The icon is same-origin and precached; an <img> paints reliably where inline SVG does not.
    const iconSrc = '/icon-192.png';
    await new Promise<void>((resolve) => {
      const probe = new Image();
      probe.onload = probe.onerror = () => resolve();
      probe.src = iconSrc;
    });

    const pages = await layout(host, input, iconSrc);

    const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
    pdf.setProperties({ title: `ورد ${input.date}`, subject: 'الورد اليومي' });

    for (let i = 0; i < pages.length; i++) {
      onProgress?.(i, pages.length);
      const canvas = await html2canvas(pages[i]!.root, {
        scale: 2,
        backgroundColor: '#fffdf8',
        logging: false,
        width: PAGE_W,
        height: PAGE_H,
      });
      if (i > 0) pdf.addPage();
      pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, 210, 297, undefined, 'FAST');
      // Let the UI breathe between pages of a long wird.
      await new Promise((r) => setTimeout(r, 0));
    }
    onProgress?.(pages.length, pages.length);
    return pdf.output('blob');
  } finally {
    host.remove();
  }
}

/** Hands the PDF to the user: the share sheet on phones (downloads are awkward there), a file elsewhere. */
export async function deliverPdf(blob: Blob, date: string): Promise<void> {
  const fileName = `wird-${date}.pdf`;
  const file = new File([blob], fileName, { type: 'application/pdf' });
  const isMobile = /android|iphone|ipad|ipod/i.test(navigator.userAgent);
  if (isMobile && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'ورد اليوم' });
      return;
    } catch (err) {
      // Dismissing the sheet is not a failure; anything else falls through to a plain download.
      if (err instanceof DOMException && err.name === 'AbortError') return;
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
