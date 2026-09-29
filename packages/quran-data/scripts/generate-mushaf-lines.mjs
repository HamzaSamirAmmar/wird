// Builds the exact line layout of the 604-page Madinah muṣḥaf (15 lines a page) and fetches
// the KFGQPC Uthmanic Hafs font it is typeset for.
//
//   node packages/quran-data/scripts/generate-mushaf-lines.mjs
//
// Writes:
//   apps/pwa/public/mushaf/lines.json        — the layout (read by the app and by the
//                                              telegram-webhook function, from the app's URL)
//   apps/pwa/public/fonts/UthmanicHafs.woff2 — the King Fahd Complex Hafs font
//
// Source: api.quran.com (word-by-word `line_number` + `text_qpc_hafs`). In that text the
// ayah-end word is a plain Arabic-Indic number that the Hafs font draws as the ornamented
// medallion, so ayah numbers are centred by the font itself.
//
// lines.json shape: { source, pages: Page[] } where Page = { j: juz, l: Line[] } and a Line is
//   ["h", surah]   surah header        ["b"]   basmala        [] blank
//   [[surah, ayah, "word word …", endGlyph | 0], …]   text, in segments of one ayah each

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PAGE_STARTS } from '../src/pageStarts.ts';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../..');
const outLines = resolve(root, 'apps/pwa/public/mushaf/lines.json');
const outFont = resolve(root, 'apps/pwa/public/fonts/UthmanicHafs.woff2');
const FONT_URL =
  'https://verses.quran.foundation/fonts/quran/hafs/uthmanic_hafs/UthmanicHafs1Ver18.woff2';

async function fetchPage(page, attempt = 1) {
  const url =
    `https://api.quran.com/api/v4/verses/by_page/${page}` +
    '?words=true&word_fields=line_number,text_qpc_hafs&fields=juz_number&per_page=50';
  const res = await fetch(url);
  if (!res.ok) {
    if (attempt < 4) {
      await new Promise((r) => setTimeout(r, 1000 * attempt));
      return fetchPage(page, attempt + 1);
    }
    throw new Error(`page ${page}: HTTP ${res.status}`);
  }
  const { verses } = await res.json();
  return verses;
}

/** Surahs with no basmala line of their own: al-Fātiḥa (it is ayah 1) and at-Tawba. */
const needsBasmala = (surah) => surah !== 1 && surah !== 9;

/** A page's text lines by line number; `null` where the line holds no words. */
function textLines(verses) {
  const text = new Map();
  let juz = 0;
  for (const v of verses) {
    const [surah, ayah] = v.verse_key.split(':').map(Number);
    juz ||= v.juz_number;
    for (const w of v.words) {
      const segs = text.get(w.line_number) ?? [];
      let seg = segs[segs.length - 1];
      if (!seg || seg[0] !== surah || seg[1] !== ayah) {
        seg = [surah, ayah, '', 0];
        segs.push(seg);
      }
      if (w.char_type_name === 'end') seg[3] = w.text_qpc_hafs;
      else seg[2] = seg[2] ? `${seg[2]} ${w.text_qpc_hafs}` : w.text_qpc_hafs;
      text.set(w.line_number, segs);
    }
  }
  return { j: juz, l: Array.from({ length: 15 }, (_, i) => text.get(i + 1) ?? null) };
}

/**
 * Empty lines are surah headers and basmalas. Runs of them are resolved across the whole
 * muṣḥaf, not per page: a header can close one page with its basmala opening the next. The
 * header and basmala sit directly above the surah's first line; anything left over in the run
 * (the short pages 1 and 2) stays blank.
 */
function fillHeaders(pages) {
  const flat = pages.flatMap((p) => p.l.map((_, i) => [p, i]));
  let i = 0;
  while (i < flat.length) {
    const [page, line] = flat[i];
    if (page.l[line] !== null) {
      i++;
      continue;
    }
    let j = i;
    while (j < flat.length && flat[j][0].l[flat[j][1]] === null) j++;
    const next = j < flat.length ? flat[j][0].l[flat[j][1]][0] : null;
    const surah = next && next[1] === 1 ? next[0] : null;
    const fill = [];
    if (surah !== null) {
      fill.push(['h', surah]);
      if (needsBasmala(surah)) fill.push(['b']);
    }
    const run = j - i;
    if (fill.length > run) throw new Error(`no room for surah ${surah} header`);
    for (let k = 0; k < run; k++) {
      const [pg, ln] = flat[i + k];
      pg.l[ln] = fill[k - (run - fill.length)] ?? [];
    }
    i = j;
  }
}

async function main() {
  const pages = new Array(604);
  const raw = new Array(604);
  const queue = Array.from({ length: 604 }, (_, i) => i + 1);
  let done = 0;
  await Promise.all(
    Array.from({ length: 6 }, async () => {
      for (let p = queue.shift(); p !== undefined; p = queue.shift()) {
        raw[p - 1] = await fetchPage(p);
        if (++done % 50 === 0) console.log(`fetched ${done}/604`);
      }
    }),
  );

  for (let p = 1; p <= 604; p++) pages[p - 1] = textLines(raw[p - 1]);
  fillHeaders(pages);

  // Cross-check against the page index the rest of the app already uses (tanzil-derived).
  let ayahs = 0;
  for (let p = 1; p <= 604; p++) {
    const first = pages[p - 1].l.find((l) => Array.isArray(l[0]))?.[0];
    const [s, a] = PAGE_STARTS[p - 1];
    if (!first || first[0] !== s || first[1] !== a) {
      throw new Error(`page ${p} starts at ${first?.[0]}:${first?.[1]}, expected ${s}:${a}`);
    }
    for (const line of pages[p - 1].l)
      if (Array.isArray(line[0])) for (const seg of line) if (seg[3]) ayahs++;
  }
  if (ayahs !== 6236) throw new Error(`expected 6236 ayah ends, found ${ayahs}`);
  const headers = pages.flatMap((p) => p.l).filter((l) => l[0] === 'h').length;
  const basmalas = pages.flatMap((p) => p.l).filter((l) => l[0] === 'b').length;
  if (headers !== 114 || basmalas !== 112) {
    throw new Error(`expected 114 headers / 112 basmalas, found ${headers} / ${basmalas}`);
  }

  await mkdir(dirname(outLines), { recursive: true });
  await writeFile(
    outLines,
    JSON.stringify({
      source: 'Madinah muṣḥaf layout and KFGQPC Hafs text via api.quran.com',
      pages,
    }),
  );

  const font = await fetch(FONT_URL);
  if (!font.ok) throw new Error(`font: HTTP ${font.status}`);
  await mkdir(dirname(outFont), { recursive: true });
  await writeFile(outFont, Buffer.from(await font.arrayBuffer()));
  console.log(`ok: 604 pages, ${ayahs} ayahs → ${outLines}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
