import * as React from 'react';
import type { Banner } from '@wird/domain';
import { cn } from '@wird/ui-web';
import { supabase } from '../lib/supabase';

const BANNER_COLUMNS =
  'id, body, source, is_active, sort_order, created_by, created_at, updated_at';

/**
 * The supervisor's reminder cards, as a snap-scrolling rail directly under the header.
 *
 * Top placement is deliberate: a reminder is something you read on the way in, not a task, so
 * it sits above the checklist but stays visually light — tinted panels rather than raised
 * cards, and it renders nothing at all when there is nothing to say.
 *
 * Banners used to be typed (آية / حديث / حكمة / ملاحظة), each with its own tint. They are now
 * free text, so the rail carries one calm treatment and lets the words do the distinguishing.
 */
export function BannerRail() {
  const [banners, setBanners] = React.useState<Banner[] | null>(null);
  const [active, setActive] = React.useState(0);
  const scrollRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    let cancelled = false;
    if (!navigator.onLine) return;

    supabase
      .from('banners')
      .select(BANNER_COLUMNS)
      .eq('is_active', true)
      .order('sort_order')
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (cancelled || error) return;
        setBanners(
          (data ?? []).map((r) => ({
            id: r.id,
            body: r.body,
            source: r.source,
            isActive: r.is_active,
            sortOrder: r.sort_order,
            createdBy: r.created_by,
            createdAt: r.created_at,
            updatedAt: r.updated_at,
          })),
        );
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // Which card is centred, for the dots. Reading scrollLeft beats an IntersectionObserver
  // here: the rail is short, and RTL makes the observer's root margins fiddly.
  function handleScroll() {
    const el = scrollRef.current;
    if (!el || !banners || banners.length < 2) return;
    const per = el.scrollWidth / banners.length;
    const index = Math.round(Math.abs(el.scrollLeft) / per);
    setActive(Math.min(banners.length - 1, Math.max(0, index)));
  }

  if (!banners || banners.length === 0) return null;

  const many = banners.length > 1;

  return (
    <div className="mb-4">
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        // Full-bleed out of the padded <main> so cards can run to the screen edge and the last
        // one still ends on the same gutter the rest of the page uses.
        className={cn(
          '-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1',
          '[scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
        )}
      >
        {banners.map((banner) => (
          <BannerCard key={banner.id} banner={banner} standalone={!many} />
        ))}
      </div>

      {many && (
        <div className="mt-2 flex items-center justify-center gap-1.5">
          {banners.map((banner, i) => (
            <span
              key={banner.id}
              aria-hidden
              className={cn(
                'h-1.5 rounded-full transition-all duration-200',
                i === active ? 'w-4 bg-primary-500' : 'w-1.5 bg-neutral-300',
              )}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function BannerCard({ banner, standalone }: { banner: Banner; standalone: boolean }) {
  return (
    <article
      className={cn(
        'relative snap-start overflow-hidden rounded-2xl px-4 py-3.5',
        'bg-linear-to-bl from-primary-50 to-mint-50/70 ring-1 ring-primary-100',
        // A lone card fills the rail; siblings leave the next one peeking so the swipe is
        // discoverable without a hint telling you to swipe.
        standalone ? 'w-full' : 'w-[85%] shrink-0',
      )}
    >
      {/* A quote glyph rather than an icon badge: it reads as typography, not as chrome,
          and it is the one mark that suits every kind of reminder now that kinds are gone. */}
      <span
        aria-hidden
        className="pointer-events-none absolute -top-4 start-1.5 select-none font-serif text-7xl leading-none text-primary-200/50"
      >
        ”
      </span>

      <p className="relative whitespace-pre-line text-[15px] leading-[2] text-neutral-800">
        {banner.body}
      </p>

      {banner.source && (
        <div className="relative mt-2 text-[11px] font-medium text-primary-700">
          — {banner.source}
        </div>
      )}
    </article>
  );
}
