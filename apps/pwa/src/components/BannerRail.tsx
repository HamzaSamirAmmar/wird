import * as React from 'react';
import { cn } from '@wird/ui-web';
import { getCachedBanners, refreshBannersFromServer } from '../lib/banners';
import type { CachedBanner } from '../lib/offline';

/**
 * The supervisor's reminder, folded into the teal header under the greeting.
 *
 * Long reminders scroll *inside* the card rather than growing it. The card previously clamped
 * to three lines inside a <button>, which both hid the rest of a long ayah and made it
 * unreachable — a button is not a scroll container, so the clipped text had no way out. The
 * body is now its own scroll region and switching banners moved to the dots, which are real
 * buttons; nothing is nested inside anything clickable.
 */
export function BannerRail() {
  const [banners, setBanners] = React.useState<CachedBanner[]>([]);
  const [index, setIndex] = React.useState(0);
  const bodyRef = React.useRef<HTMLDivElement>(null);

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

  // Switching to a banner while scrolled halfway down the previous one would drop you into
  // the middle of the new text.
  React.useEffect(() => {
    bodyRef.current?.scrollTo({ top: 0 });
  }, [safeIndex]);

  if (!banner) return null;
  const many = banners.length > 1;

  return (
    <div className="relative mt-3 flex gap-3.5 rounded-2xl bg-white/8 px-4 py-3.5 ring-1 ring-white/15">
      {/* A blockquote rule rather than a giant quote glyph: it marks the text as quoted
          without stealing the corner of a card this small, and it reads the same in RTL. */}
      <span aria-hidden className="w-0.5 shrink-0 self-stretch rounded-full bg-accent-300/70" />

      <div className="min-w-0 flex-1">
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
                  onClick={() => setIndex(i)}
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
