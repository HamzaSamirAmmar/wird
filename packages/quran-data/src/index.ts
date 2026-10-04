import { SURAHS, type Surah } from './surahs';
import { globalAyahIndex } from './pages';
import { wholeJuzOfRange } from './juz';

export type { Surah };
export { SURAHS };
export * from './pages';
export * from './juz';

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

/** True when the range starts at a surah's first ayah and ends at a surah's last ayah. */
export function isWholeSurahRange(range: QuranRange): boolean {
  return range.ayahFrom === 1 && range.ayahTo === getSurah(range.surahTo).ayahCount;
}

/**
 * Human-readable Arabic label for a range: "البقرة (1-20)", "البقرة (1) - آل عمران (10)",
 * or, for whole surahs, "سورة النبأ كاملة" / "من سورة الملك إلى نهاية سورة المرسلات", or, for
 * whole juz', "الجزء 5" / "من الجزء 5 إلى الجزء 7" (checked first: juz 30 is also whole surahs).
 * Mirrored in supabase/functions/push-notifications (formatSnapshotRange) — keep in sync.
 */
export function formatRange(range: QuranRange): string {
  const { surahFrom, ayahFrom, surahTo, ayahTo } = range;
  const from = getSurah(surahFrom);
  const to = getSurah(surahTo);
  const juz = wholeJuzOfRange(range);
  if (juz) {
    return juz.from === juz.to ? `الجزء ${juz.from}` : `من الجزء ${juz.from} إلى الجزء ${juz.to}`;
  }
  if (isWholeSurahRange(range)) {
    return surahFrom === surahTo
      ? `سورة ${from.nameAr} كاملة`
      : `من سورة ${from.nameAr} إلى نهاية سورة ${to.nameAr}`;
  }
  if (surahFrom === surahTo) {
    return `${from.nameAr} (${ayahFrom}-${ayahTo})`;
  }
  return `${from.nameAr} (${ayahFrom}) - ${to.nameAr} (${ayahTo})`;
}

/** Number of ayahs a range covers, both ends included. */
export function countAyahs(range: QuranRange): number {
  return (
    globalAyahIndex(range.surahTo, range.ayahTo) -
    globalAyahIndex(range.surahFrom, range.ayahFrom) +
    1
  );
}

/** Range covering a whole surah, or every surah from `from` to `to`. */
export function wholeSurahs(from: number, to: number = from): QuranRange {
  return { surahFrom: from, ayahFrom: 1, surahTo: to, ayahTo: getSurah(to).ayahCount };
}

/** Surahs whose Arabic name or number contains `query` (Arabic diacritics/alef variants ignored). */
export function searchSurahs(query: string): Surah[] {
  const norm = (s: string) =>
    s
      .replace(/[ً-ٰٟ]/g, '')
      .replace(/[أإآٱ]/g, 'ا')
      .replace(/ة/g, 'ه')
      .replace(/ى/g, 'ي')
      .replace(/^ال/, '')
      .trim()
      .toLowerCase();
  const q = norm(query);
  if (!q) return SURAHS;
  return SURAHS.filter(
    (s) =>
      String(s.number) === q ||
      norm(s.nameAr).includes(q) ||
      s.nameTransliterated.toLowerCase().includes(q),
  );
}
