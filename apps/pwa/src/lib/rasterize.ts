/**
 * Rasterises DOM with the browser's own renderer: the node is serialised into an SVG
 * <foreignObject> and drawn as an image. Unlike html2canvas (which re-implements text drawing
 * and placed every line ~8px low in the Hafs and Reem Kufi fonts), the result is exactly what
 * the page lays out.
 *
 * An SVG image may not load anything external, so the fonts and images it uses are inlined
 * as data URLs first.
 */

async function toDataUrl(url: string): Promise<string> {
  const blob = await (await fetch(url)).blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/**
 * @font-face rules of the given families, with their files inlined. Only the subsets whose
 * unicode-range touches Arabic (or that have no range) are kept — the pages are Arabic.
 */
export async function inlineFontCss(families: string[]): Promise<string> {
  const wanted = new Set(families.map((f) => f.toLowerCase()));
  const rules: CSSFontFaceRule[] = [];
  for (const sheet of Array.from(document.styleSheets)) {
    let list: CSSRuleList;
    try {
      list = sheet.cssRules;
    } catch {
      continue; // a cross-origin sheet we may not read
    }
    for (const rule of Array.from(list)) {
      if (!(rule instanceof CSSFontFaceRule)) continue;
      const family = rule.style.getPropertyValue('font-family').replace(/["']/g, '').trim();
      if (!wanted.has(family.toLowerCase())) continue;
      const range = rule.style.getPropertyValue('unicode-range');
      if (range && !/U\+0?6/i.test(range)) continue;
      rules.push(rule);
    }
  }

  const css = await Promise.all(
    rules.map(async (rule) => {
      const src = rule.style.getPropertyValue('src');
      const match = /url\(["']?([^"')]+)["']?\)/.exec(src);
      if (!match) return '';
      const href = new URL(match[1]!, rule.parentStyleSheet?.href ?? location.href).href;
      const data = await toDataUrl(href);
      const cssText = rule.cssText.replace(/src:[^;]+;/, `src: url("${data}") format("woff2");`);
      return cssText;
    }),
  );
  return css.join('\n');
}

/** Replaces every <img> src under `root` with a data URL, so the SVG image can paint it. */
export async function inlineImages(root: HTMLElement): Promise<void> {
  const cache = new Map<string, Promise<string>>();
  await Promise.all(
    Array.from(root.querySelectorAll('img')).map(async (img) => {
      if (img.src.startsWith('data:')) return;
      let p = cache.get(img.src);
      if (!p) cache.set(img.src, (p = toDataUrl(img.src)));
      img.src = await p;
    }),
  );
}

/** Draws `node` (already styled by `css`) into a canvas of width × height CSS px. */
export async function rasterize(
  node: HTMLElement,
  opts: { width: number; height: number; css: string; scale: number; background: string },
): Promise<HTMLCanvasElement> {
  const xhtml = new XMLSerializer().serializeToString(node);
  const style = new XMLSerializer().serializeToString(
    Object.assign(document.createElement('style'), { textContent: opts.css }),
  );
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${opts.width}" height="${opts.height}">` +
    `<foreignObject x="0" y="0" width="100%" height="100%">` +
    `<div xmlns="http://www.w3.org/1999/xhtml" dir="rtl">${style}${xhtml}</div>` +
    `</foreignObject></svg>`;

  const img = new Image();
  img.decoding = 'sync';
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  await img.decode();

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(opts.width * opts.scale);
  canvas.height = Math.round(opts.height * opts.scale);
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = opts.background;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.scale(opts.scale, opts.scale);
  ctx.drawImage(img, 0, 0, opts.width, opts.height);
  return canvas;
}
