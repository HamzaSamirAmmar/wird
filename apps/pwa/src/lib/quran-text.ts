import { ayahsOnPage, type AyahRef } from '@wird/quran-data';

/**
 * The Uthmani text ships as a static asset rather than part of the JS bundle: it is ~1.3 MB,
 * and only an employee who opens the reader needs it. The service worker precaches it (see
 * vite.config.ts globPatterns), so the first load warms it and every later read works offline.
 */
const ASSET_URL = '/quran-uthmani.json';

interface QuranTextFile {
  source: string;
  licence: string;
  /** surahs[surahNumber - 1][ayahNumber - 1] */
  surahs: string[][];
}

let cache: QuranTextFile | null = null;
let inFlight: Promise<QuranTextFile> | null = null;

/** Loads (once) and memoises the muṣḥaf text. Concurrent callers share one request. */
export function loadQuranText(): Promise<QuranTextFile> {
  if (cache) return Promise.resolve(cache);
  inFlight ??= fetch(ASSET_URL)
    .then((res) => {
      if (!res.ok) throw new Error(`Quran text unavailable (${res.status})`);
      return res.json() as Promise<QuranTextFile>;
    })
    .then((file) => {
      cache = file;
      return file;
    })
    .catch((err) => {
      inFlight = null; // let a later attempt retry rather than latching the failure
      throw err;
    });
  return inFlight;
}

export interface RenderedAyah extends AyahRef {
  text: string;
  /** False for ayahs printed on the page but outside the duty's range. */
  inScope: boolean;
}

/** Every ayah printed on `page`, flagged by whether it falls inside [from, to]. */
export function renderPage(
  file: QuranTextFile,
  page: number,
  scope: { fromIndex: number; toIndex: number },
  indexOf: (surah: number, ayah: number) => number,
): RenderedAyah[] {
  return ayahsOnPage(page).map((ref) => {
    const index = indexOf(ref.surah, ref.ayah);
    return {
      ...ref,
      text: file.surahs[ref.surah - 1]?.[ref.ayah - 1] ?? '',
      inScope: index >= scope.fromIndex && index <= scope.toIndex,
    };
  });
}
