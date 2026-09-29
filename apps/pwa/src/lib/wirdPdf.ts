import type { QuranRange } from '@wird/quran-data';
import { DUTY_CATEGORIES, type DutyCategory } from '@wird/domain';
import { inlineFontCss, inlineImages, rasterize } from './rasterize';
import {
  HAFS_FAMILY,
  MUSHAF_CSS,
  PAGE_HEIGHT,
  PAGE_WIDTH,
  fitLines,
  hafsReady,
  loadMushaf,
  pagesForScope,
  renderPage,
  scopeOf,
} from './mushaf';

/**
 * The day's wird as an A4 PDF of Madinah muṣḥaf pages — the same pages as the reader (both
 * come from lib/mushafPages.ts). Built on the phone, so it also works offline.
 *
 * Each page is rasterised by the browser's own renderer (lib/rasterize.ts), so the PDF is
 * identical to the layout. html2canvas re-drew the text itself and placed it ~8px low,
 * pushing surah names out of their cartouches and page numbers out of their diamonds.
 */

export interface PdfDuty {
  category: DutyCategory;
  range: QuranRange;
}

export interface WirdPdfInput {
  /** `YYYY-MM-DD` */
  date: string;
  duties: PdfDuty[];
}

export type PdfProgress = (done: number, total: number) => void;

function dateLabel(iso: string): string {
  return new Intl.DateTimeFormat('ar-EG', {
    timeZone: 'UTC',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(`${iso}T12:00:00Z`));
}

export async function buildWirdPdf(input: WirdPdfInput, onProgress?: PdfProgress): Promise<Blob> {
  if (input.duties.length === 0) throw new Error('No duties to print');

  const [{ jsPDF }, data] = await Promise.all([
    import('jspdf'),
    loadMushaf(),
    hafsReady(),
  ]);

  const ordered = DUTY_CATEGORIES.flatMap((c) => input.duties.filter((d) => d.category === c));
  const label = dateLabel(input.date);
  const html = ordered
    .flatMap((d) => {
      const scope = scopeOf(d.range);
      return pagesForScope(data, scope).map((page) =>
        renderPage({
          data,
          page,
          scope,
          print: true,
          chrome: { date: label, category: d.category, iconUrl: '/icon-192.png' },
        }),
      );
    })
    .join('');

  const host = document.createElement('div');
  host.style.cssText = `position:fixed;left:-10000px;top:0;width:${PAGE_WIDTH}px;pointer-events:none`;
  host.innerHTML = `<style>${MUSHAF_CSS}</style>${html}`;
  document.body.append(host);

  try {
    fitLines(host);
    await inlineImages(host);
    const pages = [...host.querySelectorAll<HTMLElement>('.mp-page')];
    const css =
      (await inlineFontCss([HAFS_FAMILY, 'Reem Kufi', 'IBM Plex Sans Arabic'])) + MUSHAF_CSS;
    const draw = (page: HTMLElement) =>
      rasterize(page, {
        width: PAGE_WIDTH,
        height: PAGE_HEIGHT,
        css,
        scale: 2,
        background: '#fdfaf1',
      });
    // WebKit can paint an SVG image before its inlined fonts have decoded, so the first draw
    // may come out in a fallback font. A throwaway draw warms them up.
    await draw(pages[0]!);

    const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
    pdf.setProperties({ title: `ورد ${input.date}`, subject: 'الورد اليومي' });

    for (let i = 0; i < pages.length; i++) {
      onProgress?.(i, pages.length);
      const canvas = await draw(pages[i]!);
      if (i > 0) pdf.addPage();
      pdf.addImage(canvas.toDataURL('image/jpeg', 0.9), 'JPEG', 0, 0, 210, 297, undefined, 'FAST');
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
