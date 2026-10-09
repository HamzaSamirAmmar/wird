import { ayahOfGlobal } from '@wird/quran-data';

// ─── Reciters (قرّاء) — free per-ayah audio, keyable purely by URL ────────────
//
// Two sources, both verse-by-verse MP3s with no key and no quota:
//
//   cdn.islamic.network (alquran.cloud)  …/quran/audio/{bitrate}/{edition}/{globalAyah}.mp3
//   everyayah.com                         …/data/{folder}/{SSS}{AAA}.mp3
//
// The list below is curated in code (names as the app shows them, Ḥafṣ only); every
// edition/folder was checked to exist, through the last ayah of the muṣḥaf. Audio streams
// online; the service worker caches what was played or explicitly downloaded, for both
// origins (see src/sw.ts).

type Source =
  | { kind: 'islamic'; edition: string }
  /** everyayah publishes each reciter at fixed bitrates — one folder per quality. */
  | { kind: 'everyayah'; high: string; low?: string };

export interface Reciter {
  /** Stable id, saved as the user's choice (CDN edition id, or `ea.<name>`). */
  id: string;
  /** Name as shown in the app. */
  name: string;
  /** Style qualifier when the reciter has more than one recording. */
  note?: string;
  source: Source;
}

const islamic = (id: string, name: string, note?: string): Reciter => ({
  id,
  name,
  note,
  source: { kind: 'islamic', edition: id },
});
const everyayah = (
  id: string,
  name: string,
  high: string,
  low?: string,
  note?: string,
): Reciter => ({
  id: `ea.${id}`,
  name,
  note,
  source: { kind: 'everyayah', high, low },
});

export const RECITERS: Reciter[] = [
  islamic('ar.alafasy', 'مشاري راشد العفاسي'),
  islamic('ar.husary', 'محمود خليل الحصري'),
  everyayah(
    'husary_muallim',
    'محمود خليل الحصري',
    'Husary_Muallim_128kbps',
    undefined,
    'المعلّم — للحفظ',
  ),
  islamic('ar.husarymujawwad', 'محمود خليل الحصري', 'مجوَّد'),
  islamic('ar.minshawi', 'محمد صديق المنشاوي'),
  islamic('ar.minshawimujawwad', 'محمد صديق المنشاوي', 'مجوَّد'),
  islamic('ar.abdulbasitmurattal', 'عبد الباسط عبد الصمد'),
  everyayah(
    'abdulbasit_mujawwad',
    'عبد الباسط عبد الصمد',
    'Abdul_Basit_Mujawwad_128kbps',
    undefined,
    'مجوَّد',
  ),
  islamic('ar.mahermuaiqly', 'ماهر المعيقلي'),
  islamic('ar.abdurrahmaansudais', 'عبدالرحمن السديس'),
  islamic('ar.saoodshuraym', 'سعود الشريم'),
  everyayah('dussary', 'ياسر الدوسري', 'Yasser_Ad-Dussary_128kbps'),
  everyayah('qatami', 'ناصر القطامي', 'Nasser_Alqatami_128kbps'),
  everyayah('ghamadi', 'سعد الغامدي', 'Ghamadi_40kbps'),
  everyayah('budair', 'صلاح البدير', 'Salah_Al_Budair_128kbps'),
  everyayah('juhany', 'عبدالله عواد الجهني', 'Abdullaah_3awwaad_Al-Juhaynee_128kbps'),
  everyayah('basfar', 'عبدالله بصفر', 'Abdullah_Basfar_192kbps', 'Abdullah_Basfar_64kbps'),
  everyayah('fares_abbad', 'فارس عباد', 'Fares_Abbad_64kbps'),
  everyayah('ali_jaber', 'علي جابر', 'Ali_Jaber_64kbps'),
  everyayah('qahtani', 'خالد القحطاني', 'Khaalid_Abdullaah_al-Qahtaanee_192kbps'),
  everyayah('muhsin_qasim', 'محسن القاسم', 'Muhsin_Al_Qasim_192kbps'),
  everyayah('matroud', 'عبدالله المطرود', 'Abdullah_Matroud_128kbps'),
  everyayah('bukhatir', 'صلاح بو خاطر', 'Salaah_AbdulRahman_Bukhatir_128kbps'),
  everyayah(
    'tablaway',
    'محمد محمود الطبلاوي',
    'Mohammad_al_Tablaway_128kbps',
    'Mohammad_al_Tablaway_64kbps',
  ),
  everyayah('alaqimy', 'أكرم العلاقمي', 'Akram_AlAlaqimy_128kbps'),
  everyayah('yaser_salamah', 'ياسر سلامة', 'Yaser_Salamah_128kbps'),
  everyayah('sahl_yassin', 'سهل ياسين', 'Sahl_Yassin_128kbps'),
  islamic('ar.hudhaify', 'علي بن عبدالرحمن الحذيفي'),
  islamic('ar.shaatree', 'أبو بكر الشاطري'),
  islamic('ar.ahmedajamy', 'أحمد بن علي العجمي'),
  islamic('ar.hanirifai', 'هاني الرفاعي'),
  islamic('ar.muhammadayyoub', 'محمد أيوب'),
  islamic('ar.muhammadjibreel', 'محمد جبريل'),
  islamic('ar.aymanswoaid', 'أيمن سويد', 'مرتل تعليمي'),
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

/** The audio hosts — the service worker serves both from the offline audio cache. */
export const AUDIO_ORIGINS = ['https://cdn.islamic.network', 'https://everyayah.com'] as const;

/** Direct URL of one ayah's MP3. `globalAyah` is @wird/quran-data's 1…6236 ordinal. */
export function audioUrl(reciterId: string, bitrate: AudioBitrate, globalAyah: number): string {
  const { source } = reciterById(reciterId);
  if (source.kind === 'islamic') {
    return `https://cdn.islamic.network/quran/audio/${bitrate}/${source.edition}/${globalAyah}.mp3`;
  }
  const { surah, ayah } = ayahOfGlobal(globalAyah);
  const folder = bitrate === 64 && source.low ? source.low : source.high;
  return `https://everyayah.com/data/${folder}/${pad3(surah)}${pad3(ayah)}.mp3`;
}

const pad3 = (n: number) => String(n).padStart(3, '0');
