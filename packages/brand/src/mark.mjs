// Geometry for the ورد (Wird) mark: an open muṣḥaf inside an eight-point mihrab medallion.
// This file is the single source of truth — the React <WirdMark /> in @wird/ui-web and the
// PNG icon generators in apps/*/icon-src both render these exact paths, so the favicon, the
// installed-app icon and the in-app logo can never drift apart.
//
// Paths are authored in a 0..100 square; VIEW_BOX bleeds 5 units on every side so a stroked
// frame (STROKE_WIDTH) is not clipped at the four points.

export const VIEW_BOX = '-5 -5 110 110';
export const STROKE_WIDTH = 7;

/**
 * The medallion: a rounded square whose four mid-edges rise into ogee (onion) points.
 * Drawn clockwise from the top edge.
 */
export const FRAME_PATH =
  'M 32 18 L 36 18 C 38 13 47 4 50 0 C 53 4 62 13 64 18 L 68 18 ' +
  'A 14 14 0 0 1 82 32 L 82 36 C 87 38 96 47 100 50 C 96 53 87 62 82 64 L 82 68 ' +
  'A 14 14 0 0 1 68 82 L 64 82 C 62 87 53 96 50 100 C 47 96 38 87 36 82 L 32 82 ' +
  'A 14 14 0 0 1 18 68 L 18 64 C 13 62 4 53 0 50 C 4 47 13 38 18 36 L 18 32 ' +
  'A 14 14 0 0 1 32 18 Z';

/** Right-hand page of the open muṣḥaf — a tapered sweep whose tail crosses the spine. */
export const PAGE_RIGHT_PATH =
  'M 50 55 C 57 47 65 42 75 40 L 75 50 C 66 52 59 57 53 64 L 44 77 L 38 69 Z';

/** Left-hand page: the right page mirrored about x = 50. */
export const PAGE_LEFT_PATH =
  'M 50 55 C 43 47 35 42 25 40 L 25 50 C 34 52 41 57 47 64 L 56 77 L 62 69 Z';

/**
 * Full mark as SVG child markup.
 * @param {{ frame?: string, book?: string, filled?: boolean, strokeWidth?: number }} opts
 *   frame/book are CSS colors; `filled` renders the medallion solid with knocked-out pages
 *   (higher contrast — used for favicons and other small sizes).
 */
export function markMarkup({
  frame = 'currentColor',
  book = frame,
  filled = false,
  strokeWidth = STROKE_WIDTH,
} = {}) {
  const medallion = filled
    ? `<path d="${FRAME_PATH}" fill="${frame}" />`
    : `<path d="${FRAME_PATH}" fill="none" stroke="${frame}" stroke-width="${strokeWidth}" stroke-linejoin="round" />`;
  return `${medallion}<path d="${PAGE_LEFT_PATH}" fill="${book}" /><path d="${PAGE_RIGHT_PATH}" fill="${book}" />`;
}

/** Standalone SVG document string, for the icon generators. */
export function markSvg({ size = 512, ...opts } = {}) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="${VIEW_BOX}">${markMarkup(opts)}</svg>`;
}
