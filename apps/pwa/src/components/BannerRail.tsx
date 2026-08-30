import * as React from 'react';
import { BookOpenText, Quote, ScrollText, Sparkles } from 'lucide-react';
import { BANNER_KIND_LABELS, type Banner, type BannerKind } from '@wird/domain';
import { cn } from '@wird/ui-web';
import { supabase } from '../lib/supabase';

const kindStyle: Record<
  BannerKind,
  { card: string; pill: string; icon: typeof Quote; quran?: boolean }
> = {
  ayah: {
    card: 'bg-primary-50 ring-primary-100',
    pill: 'bg-primary-100 text-primary-800',
    icon: BookOpenText,
    // Rendered in the same face as the muṣḥaf reader, so revelation always looks like itself.
    quran: true,
  },
  hadith: {
    card: 'bg-mint-50 ring-mint-100',
    pill: 'bg-mint-100 text-mint-800',
    icon: ScrollText,
  },
  hikmah: {
    card: 'bg-accent-50 ring-accent-100',
    pill: 'bg-accent-100 text-accent-800',
    icon: Sparkles,
  },
  note: {
    card: 'bg-surface ring-neutral-200',
    pill: 'bg-neutral-100 text-neutral-600',
    icon: Quote,
  },
};

/**
 * The supervisor's reminder cards, as a snap-scrolling rail directly under the header.
 *
 * Top placement is deliberate: a reminder is something you read on the way in, not a task, so
 * it sits above the checklist but stays visually light — one card tall, tinted panels rather
 * than raised cards, and it renders nothing at all when there is nothing to say.
 */
export function BannerRail() {
  const [banners, setBanners] = React.useState<Banner[] | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    if (!navigator.onLine) return;

    supabase
      .from('banners')
      .select('id, kind, body, source, is_active, sort_order, created_by, created_at, updated_at')
      .eq('is_active', true)
      .order('sort_order')
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (cancelled || error) return;
        setBanners(
          (data ?? []).map((r) => ({
            id: r.id,
            kind: r.kind,
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

  if (!banners || banners.length === 0) return null;

  const many = banners.length > 1;

  return (
    <div
      // Full-bleed out of the padded <main> so cards can run to the screen edge and the last
      // one still ends on the same gutter the rest of the page uses.
      className={cn(
        '-mx-4 mb-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1',
        '[scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
      )}
    >
      {banners.map((banner) => (
        <BannerCard key={banner.id} banner={banner} standalone={!many} />
      ))}
    </div>
  );
}

function BannerCard({ banner, standalone }: { banner: Banner; standalone: boolean }) {
  const s = kindStyle[banner.kind];
  const Icon = s.icon;

  return (
    <article
      className={cn(
        'flex snap-start flex-col gap-2 rounded-xl px-4 py-3 ring-1',
        s.card,
        // A lone card fills the rail; siblings leave the next one peeking so the swipe is discoverable.
        standalone ? 'w-full' : 'w-[85%] shrink-0',
      )}
    >
      <div className="flex items-center gap-1.5">
        <span
          className={cn(
            'flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium',
            s.pill,
          )}
        >
          <Icon className="h-3 w-3" />
          {BANNER_KIND_LABELS[banner.kind]}
        </span>
      </div>

      <p
        className={cn(
          'whitespace-pre-line text-neutral-800',
          s.quran
            ? "text-justify font-[Amiri,_'Scheherazade_New',_serif] text-[1.15rem] leading-[2.1]"
            : 'text-sm leading-relaxed',
        )}
      >
        {banner.body}
      </p>

      {banner.source && (
        <div className="text-[11px] font-medium text-neutral-500">— {banner.source}</div>
      )}
    </article>
  );
}
