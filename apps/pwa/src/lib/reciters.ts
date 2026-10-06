// ─── Reciters (قرّاء) — free per-ayah audio from the Islamic Network CDN ──────
//
// cdn.islamic.network (the alquran.cloud project) serves verse-by-verse MP3s for a set
// of Arabic reciters, keyable purely by URL:
//
//   https://cdn.islamic.network/quran/audio/{bitrate}/{edition}/{globalAyah}.mp3
//
// No key, no quota. The list below is curated in code (names as the app shows them);
// every edition was verified to exist on the CDN. Audio streams online; the service
// worker caches what was played or explicitly downloaded (see src/sw.ts).

export interface Reciter {
  /** CDN edition id, e.g. `ar.alafasy`. */
  id: string;
  /** Name as shown in the app. */
  name: string;
  /** Style qualifier when the reciter has more than one recording. */
  note?: string;
}

export const RECITERS: Reciter[] = [
  { id: 'ar.alafasy', name: 'مشاري راشد العفاسي' },
  { id: 'ar.husary', name: 'محمود خليل الحصري' },
  { id: 'ar.husarymujawwad', name: 'محمود خليل الحصري', note: 'مجوَّد' },
  { id: 'ar.minshawi', name: 'محمد صديق المنشاوي' },
  { id: 'ar.minshawimujawwad', name: 'محمد صديق المنشاوي', note: 'مجوَّد' },
  { id: 'ar.abdulbasitmurattal', name: 'عبد الباسط عبد الصمد' },
  { id: 'ar.mahermuaiqly', name: 'ماهر المعيقلي' },
  { id: 'ar.abdurrahmaansudais', name: 'عبدالرحمن السديس' },
  { id: 'ar.hudhaify', name: 'علي بن عبدالرحمن الحذيفي' },
  { id: 'ar.shaatree', name: 'أبو بكر الشاطري' },
  { id: 'ar.ahmedajamy', name: 'أحمد بن علي العجمي' },
  { id: 'ar.hanirifai', name: 'هاني الرفاعي' },
  { id: 'ar.saoodshuraym', name: 'سعود الشريم' },
  { id: 'ar.muhammadayyoub', name: 'محمد أيوب' },
  { id: 'ar.muhammadjibreel', name: 'محمد جبريل' },
  { id: 'ar.aymanswoaid', name: 'أيمن سويد', note: 'مرتل تعليمي' },
];

export const DEFAULT_RECITER_ID = 'ar.alafasy';

export function reciterById(id: string): Reciter {
  return RECITERS.find((r) => r.id === id) ?? RECITERS[0]!;
}

export function reciterLabel(r: Reciter): string {
  return r.note ? `${r.name} (${r.note})` : r.name;
}

export type AudioBitrate = 128 | 64;

const ID_KEY = 'wird.reciter.id';
const BITRATE_KEY = 'wird.reciter.bitrate';

export function loadReciterId(): string {
  try {
    const v = localStorage.getItem(ID_KEY);
    return v && RECITERS.some((r) => r.id === v) ? v : DEFAULT_RECITER_ID;
  } catch {
    return DEFAULT_RECITER_ID;
  }
}

export function saveReciterId(id: string): void {
  try {
    localStorage.setItem(ID_KEY, id);
  } catch {
    /* private mode — the choice lasts for this visit */
  }
}

export function loadBitrate(): AudioBitrate {
  try {
    return localStorage.getItem(BITRATE_KEY) === '64' ? 64 : 128;
  } catch {
    return 128;
  }
}

export function saveBitrate(b: AudioBitrate): void {
  try {
    localStorage.setItem(BITRATE_KEY, String(b));
  } catch {
    /* see saveReciterId */
  }
}

/** Direct URL of one ayah's MP3. `globalAyah` is @wird/quran-data's 1…6236 ordinal. */
export function audioUrl(reciterId: string, bitrate: AudioBitrate, globalAyah: number): string {
  return `https://cdn.islamic.network/quran/audio/${bitrate}/${reciterId}/${globalAyah}.mp3`;
}
