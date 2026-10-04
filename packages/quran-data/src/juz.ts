import { SURAHS } from './surahs';
import { globalAyahIndex } from './pages';

export const TOTAL_JUZ = 30;

/** [surah, ayah] where each of the 30 juz' begins (Madinah muṣḥaf). */
export const JUZ_STARTS: readonly (readonly [number, number])[] = [
  [1, 1],
  [2, 142],
  [2, 253],
  [3, 93],
  [4, 24],
  [4, 148],
  [5, 82],
  [6, 111],
  [7, 88],
  [8, 41],
  [9, 93],
  [11, 6],
  [12, 53],
  [15, 1],
  [17, 1],
  [18, 75],
  [21, 1],
  [23, 1],
  [25, 21],
  [27, 56],
  [29, 46],
  [33, 31],
  [36, 28],
  [39, 32],
  [41, 47],
  [46, 1],
  [51, 31],
  [58, 1],
  [67, 1],
  [78, 1],
];

interface QuranRange {
  surahFrom: number;
  ayahFrom: number;
  surahTo: number;
  ayahTo: number;
}

/** The last ayah of juz `n` — the ayah just before the next juz begins (juz 30 ends at 114:6). */
function juzEnd(n: number): [number, number] {
  if (n === TOTAL_JUZ) return [114, SURAHS[113]!.ayahCount];
  const [s, a] = JUZ_STARTS[n]!;
  return a > 1 ? [s, a - 1] : [s - 1, SURAHS[s - 2]!.ayahCount];
}

/** Range covering juz `from`, or every juz from `from` to `to`. */
export function juzRange(from: number, to: number = from): QuranRange {
  const [surahFrom, ayahFrom] = JUZ_STARTS[from - 1]!;
  const [surahTo, ayahTo] = juzEnd(to);
  return { surahFrom, ayahFrom, surahTo, ayahTo };
}

/** The juz (1–30) an ayah falls in. */
export function juzOfAyah(surah: number, ayah: number): number {
  const idx = globalAyahIndex(surah, ayah);
  let juz = 1;
  for (let n = 1; n <= TOTAL_JUZ; n++) {
    if (globalAyahIndex(...JUZ_STARTS[n - 1]!) <= idx) juz = n;
  }
  return juz;
}

/** { from, to } when the range is exactly whole juz' (starts where one starts, ends where one ends), else null. */
export function wholeJuzOfRange(range: QuranRange): { from: number; to: number } | null {
  const from = JUZ_STARTS.findIndex(([s, a]) => s === range.surahFrom && a === range.ayahFrom) + 1;
  if (from === 0) return null;
  const to = juzOfAyah(range.surahTo, range.ayahTo);
  const [s, a] = juzEnd(to);
  return to >= from && s === range.surahTo && a === range.ayahTo ? { from, to } : null;
}
