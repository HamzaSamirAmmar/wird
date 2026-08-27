// One-off icon generator: renders the ورد (Wird) mark to the PNG sizes a PWA manifest needs.
// The geometry lives in @wird/brand so both apps stay pixel-identical. Run with:
//   node icon-src/generate-icons.mjs
import sharp from 'sharp';
import { writeIcons } from '@wird/brand/icons.mjs';

await writeIcons(sharp, new URL('../public/', import.meta.url));
