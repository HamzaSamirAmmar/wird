import { SURAHS, type Surah } from './surahs';

export type { Surah };
export { SURAHS };

const TOTAL_SURAHS = 114;
const TOTAL_AYAHS = 6236;

// Fail fast in dev if the static table above was ever mis-edited.
if (SURAHS.length !== TOTAL_SURAHS) {
  throw new Error(`Expected ${TOTAL_SURAHS} surahs, got ${SURAHS.length}`);
}
const ayahSum = SURAHS.reduce((sum, s) => sum + s.ayahCount, 0);
if (ayahSum !== TOTAL_AYAHS) {
  throw new Error(`Expected ${TOTAL_AYAHS} total ayahs, got ${ayahSum}`);
}

export function getSurah(number: number): Surah {
  const surah = SURAHS[number - 1];
  if (!surah) throw new Error(`Invalid surah number: ${number}`);
  return surah;
}

export interface QuranRange {
  surahFrom: number;
  ayahFrom: number;
  surahTo: number;
  ayahTo: number;
}

/** Validates a range's surah numbers, ayah bounds (per-surah ayah count), and ordering. */
export function validateRange(range: QuranRange): string | null {
  const { surahFrom, ayahFrom, surahTo, ayahTo } = range;
  if (surahFrom < 1 || surahFrom > 114 || surahTo < 1 || surahTo > 114) {
    return 'رقم السورة يجب أن يكون بين 1 و114';
  }
  const from = getSurah(surahFrom);
  const to = getSurah(surahTo);
  if (ayahFrom < 1 || ayahFrom > from.ayahCount) {
    return `رقم الآية غير صحيح لسورة ${from.nameAr} (الحد الأقصى ${from.ayahCount})`;
  }
  if (ayahTo < 1 || ayahTo > to.ayahCount) {
    return `رقم الآية غير صحيح لسورة ${to.nameAr} (الحد الأقصى ${to.ayahCount})`;
  }
  const orderOk = surahFrom < surahTo || (surahFrom === surahTo && ayahFrom <= ayahTo);
  if (!orderOk) {
    return 'نهاية النطاق يجب أن تكون بعد بدايته';
  }
  return null;
}

/** Human-readable Arabic label for a range, e.g. "البقرة (1-20)" or "البقرة (1) - آل عمران (10)". */
export function formatRange(range: QuranRange): string {
  const { surahFrom, ayahFrom, surahTo, ayahTo } = range;
  const from = getSurah(surahFrom);
  if (surahFrom === surahTo) {
    return `${from.nameAr} (${ayahFrom}-${ayahTo})`;
  }
  const to = getSurah(surahTo);
  return `${from.nameAr} (${ayahFrom}) - ${to.nameAr} (${ayahTo})`;
}
