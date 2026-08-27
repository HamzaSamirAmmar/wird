// Shared PNG icon renderer for both apps. Each app's icon-src/generate-icons.mjs calls
// writeIcons() with its own output directory; the geometry comes from ./mark.mjs so the
// dashboard and the PWA can never end up with different-looking icons.
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { markMarkup, VIEW_BOX } from './mark.mjs';

export const BRAND = {
  teal700: '#02636C',
  teal900: '#0A3A40',
  cream: '#FFFFFF',
};

/**
 * @param {{ size: number, rounded: boolean, bleed: boolean, filled: boolean }} t
 * `bleed` shrinks the mark into the maskable-icon safe zone; `filled` swaps the stroked
 * medallion for a solid one, which survives being scaled down to a 32px favicon.
 */
function iconSvg({ size, rounded, bleed, filled }) {
  const r = rounded ? size * 0.22 : 0;
  // A solid medallion has no interior gap, so it can afford to sit closer to the tile edge.
  const scale = bleed ? 0.56 : filled ? 0.86 : 0.68;
  const box = size * scale;
  const offset = (size - box) / 2;

  return `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="${size}" y2="${size}" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="${BRAND.teal700}" />
      <stop offset="1" stop-color="${BRAND.teal900}" />
    </linearGradient>
  </defs>
  <rect width="${size}" height="${size}" rx="${r}" fill="url(#bg)" />
  <svg x="${offset}" y="${offset}" width="${box}" height="${box}" viewBox="${VIEW_BOX}">
    ${markMarkup({ frame: BRAND.cream, book: filled ? BRAND.teal900 : BRAND.cream, filled })}
  </svg>
</svg>`;
}

export const ICON_TARGETS = [
  { name: 'icon-192.png', size: 192, rounded: true, bleed: false, filled: false },
  { name: 'icon-512.png', size: 512, rounded: true, bleed: false, filled: false },
  { name: 'maskable-icon-512.png', size: 512, rounded: false, bleed: true, filled: false },
  { name: 'apple-touch-icon.png', size: 180, rounded: true, bleed: false, filled: false },
  // Below ~48px the stroked medallion fills in; the solid one keeps a readable silhouette.
  { name: 'favicon-32.png', size: 32, rounded: true, bleed: false, filled: true },
];

/** @param {URL} outDir directory URL (must end in a slash) */
export async function writeIcons(sharp, outDir) {
  mkdirSync(outDir, { recursive: true });
  for (const t of ICON_TARGETS) {
    const outPath = fileURLToPath(new URL(t.name, outDir));
    await sharp(Buffer.from(iconSvg(t)))
      .png()
      .toFile(outPath);
    console.log('wrote', t.name);
  }
}

export { iconSvg };
