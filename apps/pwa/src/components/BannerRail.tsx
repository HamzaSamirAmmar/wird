import * as React from 'react';
import { cn } from '@wird/ui-web';
import { getCachedBanners, refreshBannersFromServer } from '../lib/banners';
import type { CachedBanner } from '../lib/offline';

/** How long a fully-visible card sits before the rail moves on. */
const DWELL_MS = 5000;
/** Extra pause after auto-scrolling a long card to its end, so the last lines can be read. */
const SETTLE_MS = 2400;
/** Idle time after a touch before the rail resumes moving on its own. */
const RESUME_MS = 8000;
/** Horizontal travel that counts as a swipe rather than a tap or a vertical scroll. */
const SWIPE_PX = 40;

/**
 * The supervisor's reminder, folded into the teal header under the greeting.
 *
 * The rail advances by itself: a card dwells, and if its text overflows the card scrolls that
 * text to the end before handing over to the next one — so a long ayah is read in full without
 * anyone touching it. A single long reminder cycles top → bottom → top instead of advancing.
 *
 * Autoplay yields to the reader rather than fighting them. Touching the card pauses it, and it
 * only resumes after RESUME_MS of quiet; it also stops while the tab is hidden (otherwise you
 * return to a card mid-rotation with no idea what you missed) and never runs at all under
 * prefers-reduced-motion, where a self-moving panel is exactly what the setting rules out.
 */
export function BannerRail() {
  const [banners, setBanners] = React.useState<CachedBanner[]>([]);
  const [index, setIndex] = React.useState(0);
  const [paused, setPaused] = React.useState(false);
  const bodyRef = React.useRef<HTMLDivElement>(null);
  const resumeTimer = React.useRef<number | undefined>(undefined);

  React.useEffect(() => {
    let cancelled = false;

    // Cache first so the reminder is on screen before the network answers — and still there
    // when it never does.
    getCachedBanners().then((cached) => {
      if (!cancelled) setBanners(cached);
    });

    refreshBannersFromServer()
      .then(getCachedBanners)
      .then((fresh) => {
        if (!cancelled) setBanners(fresh);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // A supervisor deleting the banner you were on must not leave the panel blank.
  const safeIndex = banners.length ? index % banners.length : 0;
  const banner = banners[safeIndex];
  const many = banners.length > 1;

  const pauseForAWhile = React.useCallback(() => {
    setPaused(true);
    window.clearTimeout(resumeTimer.current);
    resumeTimer.current = window.setTimeout(() => setPaused(false), RESUME_MS);
  }, []);

  React.useEffect(() => () => window.clearTimeout(resumeTimer.current), []);

  // Swipe between cards. In RTL the next card sits to the left, so dragging rightwards
  // (positive dx) brings it in — the same direction as turning a page of the muṣḥaf.
  const [direction, setDirection] = React.useState<1 | -1>(1);
  const swipeStart = React.useRef<{ x: number; y: number } | null>(null);
  const step = React.useCallback(
    (delta: 1 | -1) => {
      setDirection(delta);
      setIndex((i) => (i + delta + banners.length) % Math.max(banners.length, 1));
    },
    [banners.length],
  );

  function onPointerDown(e: React.PointerEvent) {
    swipeStart.current = { x: e.clientX, y: e.clientY };
    pauseForAWhile();
  }

  function onPointerUp(e: React.PointerEvent) {
    const start = swipeStart.current;
    swipeStart.current = null;
    if (!start || !many) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    if (Math.abs(dx) < SWIPE_PX || Math.abs(dx) < Math.abs(dy)) return;
    step(dx > 0 ? 1 : -1);
  }

  // Autoplay must not keep running against a backgrounded tab.
  const [visible, setVisible] = React.useState(true);
  React.useEffect(() => {
    function onChange() {
      setVisible(document.visibilityState === 'visible');
    }
    onChange();
    document.addEventListener('visibilitychange', onChange);
    return () => document.removeEventListener('visibilitychange', onChange);
  }, []);

  React.useEffect(() => {
    const body = bodyRef.current;
    if (!body) return;

    // Every card starts at its first line, however the previous one ended.
    body.scrollTo({ top: 0 });

    const reduceMotion =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (paused || !visible || reduceMotion || banners.length === 0) return;

    // Measured after the reset above, so it reflects this card, not the last one.
    const overflowing = body.scrollHeight > body.clientHeight + 1;
    if (!overflowing && !many) return;

    let cancelled = false;
    const timers: number[] = [];
    const later = (fn: () => void, ms: number) => {
      timers.push(window.setTimeout(() => !cancelled && fn(), ms));
    };

    const advance = () => {
      setDirection(1);
      setIndex((i) => i + 1);
    };

    later(() => {
      if (!overflowing) {
        advance();
        return;
      }
      body.scrollTo({ top: body.scrollHeight, behavior: 'smooth' });
      later(() => {
        if (many) {
          advance();
        } else {
          // Nothing to hand over to — rewind and read it again.
          body.scrollTo({ top: 0, behavior: 'smooth' });
          later(advance, DWELL_MS);
        }
      }, SETTLE_MS);
    }, DWELL_MS);

    return () => {
      cancelled = true;
      timers.forEach(window.clearTimeout);
    };
    // `index` (not safeIndex) so a single-banner rewind still re-arms the cycle.
  }, [index, safeIndex, banners.length, many, paused, visible]);

  if (!banner) return null;

  return (
    <div
      // pan-y: the browser keeps vertical scrolling, horizontal drags come to us as a swipe.
      className="relative mt-3 flex touch-pan-y select-none gap-3.5 overflow-hidden rounded-2xl bg-white/8 px-4 py-3.5 ring-1 ring-white/15"
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerCancel={() => {
        swipeStart.current = null;
      }}
      onWheel={pauseForAWhile}
      aria-roledescription={many ? 'carousel' : undefined}
    >
      {/* A blockquote rule rather than a giant quote glyph: it marks the text as quoted
          without stealing the corner of a card this small, and it reads the same in RTL. */}
      <span aria-hidden className="w-0.5 shrink-0 self-stretch rounded-full bg-accent-300/70" />

      <div
        // Remounts per card so each one slides in from the side it came from.
        key={banner.id}
        className={cn(
          'min-w-0 flex-1 motion-reduce:animate-none',
          direction === 1 ? 'animate-slide-in-left' : 'animate-slide-in-right',
        )}
      >
        <div
          ref={bodyRef}
          className={cn(
            'max-h-28 overflow-y-auto overscroll-contain',
            // Scrollbar hidden, like the day rail. A persistent desktop track renders as a
            // second full-height rule opposite the quote rule and reads as decoration rather
            // than as a control; the affordance is the line clipped mid-height, plus the
            // transient overlay indicator every touch browser draws while scrolling.
            '[scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
          )}
        >
          <p className="whitespace-pre-line text-sm leading-[2] text-primary-50">{banner.body}</p>
        </div>

        <div className="mt-2 flex items-center justify-between gap-3">
          <span className="truncate text-[11px] font-medium text-accent-200/85">
            {banner.source ? `— ${banner.source}` : ''}
          </span>

          {many && (
            <div className="flex shrink-0 items-center gap-1.5">
              {banners.map((b, i) => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => {
                    setIndex(i);
                    pauseForAWhile();
                  }}
                  aria-label={`التذكير ${i + 1} من ${banners.length}`}
                  aria-current={i === safeIndex}
                  // Tap target is the padded box; the visible dot stays small.
                  className="-my-1.5 flex h-6 items-center px-0.5"
                >
                  <span
                    className={cn(
                      'h-1.5 rounded-full transition-all duration-200',
                      i === safeIndex ? 'w-4 bg-white/85' : 'w-1.5 bg-white/30',
                    )}
                  />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
