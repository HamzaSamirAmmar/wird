// One-off icon generator: renders the ورد (Wird) mark (an abstract leaf/open-page shape —
// a visual pun on وِرْد "daily portion" / وَرْد "rose") to the PNG sizes a PWA manifest needs.
// Run with: node icon-src/generate-icons.mjs
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const TEAL_600 = '#12866B';
const TEAL_900 = '#0B4638';
const GOLD_400 = '#E5B84A';

function leafPath(cx, cy, h, w) {
  return `M ${cx} ${cy - h / 2} Q ${cx + w / 2} ${cy}, ${cx} ${cy + h / 2} Q ${cx - w / 2} ${cy}, ${cx} ${cy - h / 2} Z`;
}

function mark({ size, bleed }) {
  const cx = size / 2;
  const cy = size / 2;
  const scale = bleed ? 0.62 : 0.78; // maskable icons need extra safe-zone padding
  const h = size * scale;
  const w = h * 0.56;
  const stem = `M ${cx} ${cy - h / 2 + 6} L ${cx} ${cy + h / 2 - 6}`;

  return `
    <g transform="rotate(-18 ${cx} ${cy})">
      <path d="${leafPath(cx, cy, h, w)}" fill="${GOLD_400}" />
      <path d="${stem}" stroke="${TEAL_900}" stroke-width="${size * 0.012}" stroke-linecap="round" opacity="0.55" />
    </g>
  `;
}

function svg({ size, rounded, bleed }) {
  const r = rounded ? size * 0.22 : 0;
  return `
<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="${size}" y2="${size}" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="${TEAL_600}" />
      <stop offset="1" stop-color="${TEAL_900}" />
    </linearGradient>
  </defs>
  <rect width="${size}" height="${size}" rx="${r}" fill="url(#bg)" />
  ${mark({ size, bleed })}
</svg>`;
}

mkdirSync(new URL('../public', import.meta.url), { recursive: true });

const outDir = new URL('../public/', import.meta.url);

const targets = [
  { name: 'icon-192.png', size: 192, rounded: true, bleed: false },
  { name: 'icon-512.png', size: 512, rounded: true, bleed: false },
  { name: 'maskable-icon-512.png', size: 512, rounded: false, bleed: true },
  { name: 'apple-touch-icon.png', size: 180, rounded: true, bleed: false },
  { name: 'favicon-32.png', size: 32, rounded: true, bleed: false },
];

for (const t of targets) {
  const buf = Buffer.from(svg(t));
  const outPath = fileURLToPath(new URL(t.name, outDir));
  await sharp(buf).png().toFile(outPath);
  console.log('wrote', t.name);
}
