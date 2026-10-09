// ─── التفسير الميسر — offline tafseer lookup ─────────────────────────────────
//
// The whole tafseer ships as one static asset (public/tafseer/muyassar.v2.json, built by
// packages/quran-data/scripts/generate-tafseer.mjs), precached by the service worker, so
// the ayah sheet works offline from the first install.
//
// The book explains some stretches of ayat as ONE passage (2:219–220, at-Takwīr 1–14…), so
// the asset is a list of passages with their ayah ranges rather than a string per ayah —
// the sheet shows «تفسير الآيات ١–١٤» once instead of the same text under every ayah.

import { SURAHS, globalAyahIndex } from '@wird/quran-data';
import type { MushafData } from './mushafPages';

const ASSET_URL = '/tafseer/muyassar.v2.json';

/** One tafseer passage: the ayat it explains (one, or a run) and its text. */
export interface TafseerPassage {
  surah: number;
  ayahFrom: number;
  ayahTo: number;
  text: string;
}

export interface Tafseer {
  /** The passage covering an ayah. */
  passageOf(surah: number, ayah: number): TafseerPassage;
  /** The surah's introduction (تسمية السورة / من مقاصد السورة), "" when it has none. */
  introOf(surah: number): string;
}

interface Asset {
  v: 2;
  intros: string[];
  passages: [number, number, number, string][];
}

function build(asset: Asset): Tafseer {
  const passages: TafseerPassage[] = asset.passages.map(([surah, ayahFrom, ayahTo, text]) => ({
    surah,
    ayahFrom,
    ayahTo,
    text,
  }));
  // Global ayah ordinal − 1 → passage, so a lookup is one array read.
  const byAyah = new Array<TafseerPassage>(6236);
  for (const p of passages) {
    for (let a = p.ayahFrom; a <= p.ayahTo; a++) byAyah[globalAyahIndex(p.surah, a) - 1] = p;
  }
  return {
    passageOf: (surah, ayah) =>
      byAyah[globalAyahIndex(surah, ayah) - 1] ?? { surah, ayahFrom: ayah, ayahTo: ayah, text: '' },
    introOf: (surah) =>
      surah >= 1 && surah <= SURAHS.length ? (asset.intros[surah - 1] ?? '') : '',
  };
}

let inFlight: Promise<Tafseer> | null = null;

/** Loads (once) and memoises the tafseer. Concurrent callers share one request. */
export function loadTafseer(): Promise<Tafseer> {
  inFlight ??= fetch(ASSET_URL)
    .then((res) => {
      if (!res.ok) throw new Error(`Tafseer unavailable (${res.status})`);
      return res.json() as Promise<Asset>;
    })
    .then(build)
    .catch((err) => {
      inFlight = null; // let a later attempt retry rather than latching the failure
      throw err;
    });
  return inFlight;
}

// ─── Ayah text from the muṣḥaf layout ────────────────────────────────────────

/** Global-ayah-indexed plain text of the whole muṣḥaf, built once per MushafData. */
const textIndex = new WeakMap<MushafData, string[]>();

function buildTextIndex(data: MushafData): string[] {
  const idx: string[] = new Array(6236).fill('');
  for (const page of data.pages) {
    for (const line of page.l) {
      if (!Array.isArray(line[0])) continue;
      for (const [surah, ayah, words] of line as [number, number, string, string | 0][]) {
        const i = globalAyahIndex(surah, ayah) - 1;
        idx[i] = idx[i] ? `${idx[i]} ${words}` : words;
      }
    }
  }
  return idx;
}

/** The ayah's continuous Hafs text (words joined, ayah-number glyphs left out). */
export function ayahText(data: MushafData, surah: number, ayah: number): string {
  let idx = textIndex.get(data);
  if (!idx) {
    idx = buildTextIndex(data);
    textIndex.set(data, idx);
  }
  return idx[globalAyahIndex(surah, ayah) - 1] ?? '';
}
