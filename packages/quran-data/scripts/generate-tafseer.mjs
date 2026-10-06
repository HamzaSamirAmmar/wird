// Builds التفسير الميسر (Tafsir al-Muyassar) as one compact offline asset:
//
//   node --experimental-strip-types packages/quran-data/scripts/generate-tafseer.mjs
//
// Writes apps/pwa/public/tafseer/muyassar.json — a plain array of 6236 strings indexed by
// global ayah number − 1 (the ordinal @wird/quran-data's globalAyahIndex computes), so a
// tafseer lookup is `arr[globalAyahIndex(surah, ayah) - 1]` with no keys in the file.
//
// Source: the spa5k/tafsir_api dataset (QUL export, edition `ar-tafsir-muyassar`) served
// from jsDelivr — fetched once here, never at runtime. The edition carries the King Fahd
// Complex's surah introductions («تسمية السورة / من مقاصد السورة») prepended to each
// surah's first ayah; they are kept, as the printed book includes them.

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SURAHS } from '../src/surahs.ts';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../..');
const outFile = resolve(root, 'apps/pwa/public/tafseer/muyassar.json');

const BASE = 'https://cdn.jsdelivr.net/gh/spa5k/tafsir_api@main/tafsir/ar-tafsir-muyassar';

async function fetchSurah(n, attempt = 1) {
  const res = await fetch(`${BASE}/${n}.json`);
  if (!res.ok) {
    if (attempt < 4) {
      await new Promise((r) => setTimeout(r, 1000 * attempt));
      return fetchSurah(n, attempt + 1);
    }
    throw new Error(`surah ${n}: HTTP ${res.status}`);
  }
  return res.json();
}

async function main() {
  const texts = new Array(6236);
  let offset = 0;
  const queue = Array.from({ length: 114 }, (_, i) => i + 1);
  let done = 0;
  const failures = [];

  // Surah offsets up front: rows arrive in parallel, each needs its surah's base ordinal.
  const offsets = new Map();
  for (const s of SURAHS) {
    offsets.set(s.number, offset);
    offset += s.ayahCount;
  }

  await Promise.all(
    Array.from({ length: 6 }, async () => {
      for (let surah = queue.shift(); surah !== undefined; surah = queue.shift()) {
        const rows = await fetchSurah(surah);
        const expected = SURAHS[surah - 1].ayahCount;
        if (rows.length !== expected)
          failures.push(`surah ${surah}: ${rows.length} rows, expected ${expected}`);
        for (const row of rows) {
          if (row.surah !== surah || row.ayah < 1 || row.ayah > expected) {
            failures.push(`surah ${surah}: bad row ${row.surah}:${row.ayah}`);
            continue;
          }
          const text = (row.text ?? '').trim();
          if (!text) failures.push(`${surah}:${row.ayah}: empty text`);
          texts[offsets.get(surah) + row.ayah - 1] = text;
        }
        if (++done % 20 === 0) console.log(`fetched ${done}/114 surahs`);
      }
    }),
  );

  for (let i = 0; i < texts.length; i++) {
    if (typeof texts[i] !== 'string') failures.push(`global ayah ${i + 1}: missing`);
  }
  if (failures.length > 0) {
    console.error(failures.slice(0, 20).join('\n'));
    throw new Error(`${failures.length} problems`);
  }

  const json = JSON.stringify(texts);
  await mkdir(dirname(outFile), { recursive: true });
  await writeFile(outFile, json);
  console.log(`ok: 6236 ayahs → ${outFile} (${(json.length / 1e6).toFixed(2)} MB)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
