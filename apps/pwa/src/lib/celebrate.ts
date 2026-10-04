/**
 * A gentle shower of eight-pointed stars (۞, the rub el hizb) in the brand's gold and teal —
 * the reward for finishing a day's wird, kept in the app's Islamic ornament rather than party
 * confetti. Plain DOM + the Web Animations API, no library; skipped entirely under
 * prefers-reduced-motion.
 */
const COLORS = ['#e0bc66', '#d2a343', '#02636c', '#35afba', '#72bf9d'];

function starSvg(color: string): string {
  return `<svg viewBox="0 0 40 40" width="100%" height="100%"><g fill="${color}"><rect x="8" y="8" width="24" height="24"/><rect x="8" y="8" width="24" height="24" transform="rotate(45 20 20)"/></g><circle cx="20" cy="20" r="5" fill="#fff" fill-opacity=".7"/></svg>`;
}

export function celebrate(pieces = 36): void {
  if (typeof window === 'undefined') return;
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;

  const layer = document.createElement('div');
  layer.setAttribute('aria-hidden', 'true');
  layer.style.cssText =
    'position:fixed;inset:0;pointer-events:none;overflow:hidden;z-index:60;contain:strict';
  document.body.append(layer);

  const w = window.innerWidth;
  const h = window.innerHeight;
  const animations: Animation[] = [];
  for (let i = 0; i < pieces; i++) {
    const el = document.createElement('i');
    const size = 10 + Math.random() * 12;
    el.style.cssText = `position:absolute;top:-30px;left:${Math.random() * w}px;width:${size}px;height:${size}px;opacity:.95`;
    el.innerHTML = starSvg(COLORS[i % COLORS.length]!);
    layer.append(el);
    const drift = (Math.random() - 0.5) * 140;
    const spin = (Math.random() - 0.5) * 360;
    animations.push(
      el.animate(
        [
          { transform: 'translate3d(0,0,0) rotate(0deg)', opacity: 1 },
          {
            transform: `translate3d(${drift}px,${h + 40}px,0) rotate(${spin}deg)`,
            opacity: 0.9,
          },
        ],
        {
          duration: 2600 + Math.random() * 1600,
          delay: Math.random() * 600,
          easing: 'cubic-bezier(.2,.6,.4,1)',
          fill: 'forwards',
        },
      ),
    );
  }
  Promise.all(animations.map((a) => a.finished))
    .catch(() => undefined)
    .finally(() => layer.remove());
}

/** A short haptic tick where the platform supports it (Android); silent elsewhere. */
export function haptic(pattern: number | number[] = 12): void {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* unsupported */
  }
}
