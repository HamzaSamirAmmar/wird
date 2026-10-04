import type { AyahScope, MushafData } from './mushafPages';

export {
  CATEGORY_STYLE,
  HAFS_FAMILY,
  MUSHAF_CSS,
  PAGE_HEIGHT,
  PAGE_WIDTH,
  fitLines,
  pagesForScope,
  renderCategoryPage,
  renderPage,
  type AyahScope,
  type MushafData,
} from './mushafPages';

/**
 * Line-by-line layout of the Madinah muṣḥaf (packages/quran-data/scripts/
 * generate-mushaf-lines.mjs). A static asset rather than bundled JS — it is ~1.5 MB — and
 * precached by the service worker, so the reader and the PDF work offline.
 */
const ASSET_URL = '/mushaf/lines.json';

let inFlight: Promise<MushafData> | null = null;

/** Loads (once) and memoises the layout. Concurrent callers share one request. */
export function loadMushaf(): Promise<MushafData> {
  inFlight ??= fetch(ASSET_URL)
    .then((res) => {
      if (!res.ok) throw new Error(`Mushaf layout unavailable (${res.status})`);
      return res.json() as Promise<MushafData>;
    })
    .catch((err) => {
      inFlight = null; // let a later attempt retry rather than latching the failure
      throw err;
    });
  return inFlight;
}

/** Resolves once the Hafs font can paint (it is declared in index.css). */
export async function hafsReady(): Promise<void> {
  await document.fonts.load('31px WirdHafs', 'بسم');
  await document.fonts.ready;
}

export function scopeOf(range: {
  surahFrom: number;
  ayahFrom: number;
  surahTo: number;
  ayahTo: number;
}): AyahScope {
  return { from: [range.surahFrom, range.ayahFrom], to: [range.surahTo, range.ayahTo] };
}
