// One-off icon generator: renders the ورد (Wird) mark to the PNG sizes a PWA manifest needs.
// The geometry lives in @wird/brand so both apps stay pixel-identical. Run with:
//   node icon-src/generate-icons.mjs
import sharp from 'sharp';
import { writeBadge, writeIcons } from '@wird/brand/icons.mjs';

await writeIcons(sharp, new URL('../public/', import.meta.url));
// The notification badge (src/sw.ts) — the PWA is the only app that shows notifications.
await writeBadge(sharp, new URL('../public/', import.meta.url));
