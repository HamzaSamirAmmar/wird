import { PAGE_STARTS } from './pageStarts';
import { SURAHS } from './surahs';
import type { QuranRange } from './index';

export const TOTAL_PAGES = PAGE_STARTS.length;

/** Running ayah count before each surah, so (surah, ayah) can collapse to a single ordinal. */
const SURAH_OFFSETS: number[] = (() => {
  const offsets: number[] = [];
  let running = 0;
  for (const s of SURAHS) {
    offsets.push(running);
    running += s.ayahCount;
  }
  return offsets;
})();

/** 1-based position of an ayah within the whole muṣḥaf (1 … 6236). */
export function globalAyahIndex(surah: number, ayah: number): number {
  const offset = SURAH_OFFSETS[surah - 1];
  if (offset === undefined) throw new Error(`Invalid surah number: ${surah}`);
  return offset + ayah;
}

const PAGE_START_INDEXES = PAGE_STARTS.map(([surah, ayah]) => globalAyahIndex(surah, ayah));

/** Page (1 … 604) of the Mushaf al-Madinah that a given ayah sits on. */
export function pageOfAyah(surah: number, ayah: number): number {
  const target = globalAyahIndex(surah, ayah);
  // Rightmost page whose first ayah is still <= target.
  let lo = 0;
  let hi = PAGE_START_INDEXES.length - 1;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (PAGE_START_INDEXES[mid]! <= target) lo = mid;
    else hi = mid - 1;
  }
  return lo + 1;
}

/**
 * Every page the range touches, in order. A page is included when the range covers any part
 * of it — a duty ending on the first ayah of a page still shows that whole page, which is how
 * a reader actually uses a muṣḥaf.
 */
export function pagesForRange(range: QuranRange): number[] {
  const first = pageOfAyah(range.surahFrom, range.ayahFrom);
  const last = pageOfAyah(range.surahTo, range.ayahTo);
  const pages: number[] = [];
  for (let p = Math.min(first, last); p <= Math.max(first, last); p++) pages.push(p);
  return pages;
}

export interface AyahRef {
  surah: number;
  ayah: number;
}

/** Every ayah printed on a page, in order. */
export function ayahsOnPage(page: number): AyahRef[] {
  const startIndex = PAGE_START_INDEXES[page - 1];
  if (startIndex === undefined) throw new Error(`Invalid page number: ${page}`);
  const endIndex = (PAGE_START_INDEXES[page] ?? SURAH_OFFSETS[113]! + SURAHS[113]!.ayahCount + 1) - 1;

  const refs: AyahRef[] = [];
  // Walk surah by surah rather than converting each ordinal back, which would be O(n log n).
  let surah = PAGE_STARTS[page - 1]![0];
  let ayah = PAGE_STARTS[page - 1]![1];
  for (let i = startIndex; i <= endIndex; i++) {
    refs.push({ surah, ayah });
    if (ayah >= SURAHS[surah - 1]!.ayahCount) {
      surah++;
      ayah = 1;
    } else {
      ayah++;
    }
  }
  return refs;
}

/** Arabic label for a page, e.g. "صفحة ٢٢". */
export function formatPage(page: number): string {
  return `صفحة ${page.toLocaleString('ar-EG')}`;
}

export { PAGE_STARTS };
