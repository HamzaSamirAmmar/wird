// Builds التفسير الميسر (Tafsir al-Muyassar) as one compact offline asset:
//
//   node --experimental-strip-types packages/quran-data/scripts/generate-tafseer.mjs
//
// Writes apps/pwa/public/tafseer/muyassar.v2.json:
//
//   {
//     "v": 2,
//     "intros":   [114 strings],                      // surah introduction, "" when none
//     "passages": [[surah, ayahFrom, ayahTo, text]…]  // in muṣḥaf order, covering all 6236
//   }
//
// Why passages and not one string per ayah: al-Muyassar explains about 600 stretches of
// several ayat as ONE passage (e.g. 2:219–220, at-Takwīr 1–14). Every per-ayah export —
// QUL, Tanzil/alquran.cloud — repeats that passage on each ayah it covers, which in the
// app read as "many ayat have the same tafseer". Grouping consecutive identical rows back
// into their passage (with its ayah range) is the book's own mapping.
//
// The QUL edition also prepends the King Fahd Complex's surah introduction («تسمية
// السورة / من مقاصد السورة») to the first passage of each surah; it is split out into
// `intros` so the sheet can show it once, under its own heading, instead of it being
// glued to the first passage (and repeated across every ayah that passage covers).
//
// Source: the spa5k/tafsir_api dataset (QUL export, edition `ar-tafsir-muyassar`) served
// from jsDelivr — fetched once here, never at runtime.

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SURAHS } from '../src/surahs.ts';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../..');
const outFile = resolve(root, 'apps/pwa/public/tafseer/muyassar.v2.json');

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

const MARKER = '[التفسير]';

/**
 * Splits a row into its surah introduction (if any) and the tafseer proper. The
 * introduction is the leading run of paragraphs that are its headings or `•` bullets; one
 * row (5:1) lacks the `[التفسير]` divider, so the paragraphs decide, not the marker.
 */
function splitIntro(text) {
  const paras = text.split(/\n{2,}/).map((p) => p.trim());
  if (paras[0] !== 'تسمية السورة') return { intro: '', body: clean(text) };
  let i = 0;
  while (
    i < paras.length &&
    (paras[i] === 'تسمية السورة' || paras[i] === 'من مقاصد السورة' || paras[i].startsWith('•'))
  ) {
    i++;
  }
  if (paras[i] === MARKER) i++;
  return {
    intro: paras
      .slice(0, i)
      .filter((p) => p !== MARKER)
      .join('\n\n'),
    body: clean(paras.slice(i).join('\n\n')),
  };
}

/** A stray `[التفسير]` divider mid-passage (5:60) is an export artefact — drop it. */
function clean(text) {
  return text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p && p !== MARKER)
    .join('\n\n');
}

async function main() {
  const rowsBySurah = new Map();
  const queue = Array.from({ length: 114 }, (_, i) => i + 1);
  let done = 0;
  const failures = [];

  await Promise.all(
    Array.from({ length: 6 }, async () => {
      for (let surah = queue.shift(); surah !== undefined; surah = queue.shift()) {
        const rows = await fetchSurah(surah);
        const expected = SURAHS[surah - 1].ayahCount;
        if (rows.length !== expected)
          failures.push(`surah ${surah}: ${rows.length} rows, expected ${expected}`);
        const texts = new Array(expected);
        for (const row of rows) {
          if (row.surah !== surah || row.ayah < 1 || row.ayah > expected) {
            failures.push(`surah ${surah}: bad row ${row.surah}:${row.ayah}`);
            continue;
          }
          const text = (row.text ?? '').trim();
          if (!text) failures.push(`${surah}:${row.ayah}: empty text`);
          texts[row.ayah - 1] = text;
        }
        rowsBySurah.set(surah, texts);
        if (++done % 20 === 0) console.log(`fetched ${done}/114 surahs`);
      }
    }),
  );

  const intros = [];
  const passages = [];
  for (const s of SURAHS) {
    const texts = rowsBySurah.get(s.number) ?? [];
    let intro = '';
    for (let a = 1; a <= s.ayahCount;) {
      const raw = texts[a - 1];
      if (typeof raw !== 'string') {
        failures.push(`${s.number}:${a}: missing`);
        a++;
        continue;
      }
      // A passage is the run of consecutive ayat carrying the identical text.
      let to = a;
      while (to < s.ayahCount && texts[to] === raw) to++;
      const { intro: i, body } = splitIntro(raw);
      if (i) {
        if (intro && intro !== i) failures.push(`${s.number}:${a}: second introduction`);
        intro = i;
      }
      passages.push([s.number, a, to, body]);
      a = to + 1;
    }
    intros.push(intro);
  }

  const covered = passages.reduce((n, [, f, t]) => n + (t - f + 1), 0);
  if (covered !== 6236) failures.push(`passages cover ${covered} ayat, expected 6236`);
  if (failures.length > 0) {
    console.error(failures.slice(0, 20).join('\n'));
    throw new Error(`${failures.length} problems`);
  }

  const json = JSON.stringify({ v: 2, intros, passages });
  await mkdir(dirname(outFile), { recursive: true });
  await writeFile(outFile, json);
  const multi = passages.filter(([, f, t]) => t > f).length;
  console.log(
    `ok: ${passages.length} passages (${multi} span several ayat), ` +
      `${intros.filter(Boolean).length} introductions → ${outFile} (${(json.length / 1e6).toFixed(2)} MB)`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
