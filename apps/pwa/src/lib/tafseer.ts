// ─── التفسير الميسر — offline tafseer lookup ─────────────────────────────────
//
// The whole tafseer ships as one static asset (public/tafseer/muyassar.json, built by
// packages/quran-data/scripts/generate-tafseer.mjs): a plain array of 6236 strings
// indexed by global ayah number − 1. It is precached by the service worker, so the
// long-press sheet works offline from the first install.

import { globalAyahIndex } from '@wird/quran-data';
import type { MushafData } from './mushafPages';

const ASSET_URL = '/tafseer/muyassar.json';

let inFlight: Promise<string[]> | null = null;

/** Loads (once) and memoises the tafseer. Concurrent callers share one request. */
export function loadTafseer(): Promise<string[]> {
  inFlight ??= fetch(ASSET_URL)
    .then((res) => {
      if (!res.ok) throw new Error(`Tafseer unavailable (${res.status})`);
      return res.json() as Promise<string[]>;
    })
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
