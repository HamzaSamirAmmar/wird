import * as React from 'react';
import { cn } from '@wird/ui-web';
import { getCachedBanners, refreshBannersFromServer } from '../lib/banners';
import type { CachedBanner } from '../lib/offline';

/**
 * The supervisor's reminder, folded into the teal header under the greeting.
 *
 * It used to be a full-bleed snap-rail sitting between the header and the checklist, which put
 * a passive reminder in the most valuable strip of the screen and pushed the duties below the
 * fold. Inside the header it reads as part of the greeting: ambient, one line of chrome, and it
 * costs the checklist no vertical space at all.
 *
 * Multiple banners rotate on tap rather than scroll — a 3-line panel on a coloured ground is a
 * bad scroll target, and tapping is the gesture the surrounding header already invites.
 */
export function BannerRail() {
  const [banners, setBanners] = React.useState<CachedBanner[]>([]);
  const [index, setIndex] = React.useState(0);

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
  if (!banner) return null;

  const many = banners.length > 1;

  return (
    <button
      type="button"
      disabled={!many}
      onClick={() => setIndex((i) => i + 1)}
      aria-label={many ? 'التذكير التالي' : undefined}
      className={cn(
        'relative mt-3 block w-full overflow-hidden rounded-2xl bg-white/10 px-4 py-3 text-start ring-1 ring-white/12',
        many && 'transition-colors active:bg-white/15',
      )}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute -top-5 start-1 select-none font-serif text-7xl leading-none text-white/10"
      >
        ”
      </span>

      <p className="relative line-clamp-3 whitespace-pre-line text-[13.5px] leading-[1.85] text-primary-50">
        {banner.body}
      </p>

      <div className="relative mt-1.5 flex items-center justify-between gap-3">
        <span className="truncate text-[11px] text-primary-100/70">
          {banner.source ? `— ${banner.source}` : ''}
        </span>
        {many && (
          <span className="flex shrink-0 items-center gap-1" aria-hidden>
            {banners.map((b, i) => (
              <span
                key={b.id}
                className={cn(
                  'h-1 rounded-full transition-all duration-200',
                  i === safeIndex ? 'w-3 bg-white/70' : 'w-1 bg-white/25',
                )}
              />
            ))}
          </span>
        )}
      </div>
    </button>
  );
}
