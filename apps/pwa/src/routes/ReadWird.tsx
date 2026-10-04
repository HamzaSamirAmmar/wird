import * as React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowRight, ChevronLeft, ChevronRight } from 'lucide-react';
import { DUTY_CATEGORY_LABELS } from '@wird/domain';
import { formatRange } from '@wird/quran-data';
import { Alert, Spinner, cn } from '@wird/ui-web';
import { useAuth } from '../lib/auth-context';
import { completeStep, getCachedDuties } from '../lib/duties';
import type { CachedDuty, CachedStep } from '../lib/offline';
import { RepeatCounter } from '../components/RepeatCounter';
import {
  MUSHAF_CSS,
  PAGE_WIDTH,
  fitLines,
  hafsReady,
  loadMushaf,
  pagesForScope,
  renderPage,
  scopeOf,
  type MushafData,
} from '../lib/mushaf';

/** Height of a bare (no wird strip) page: 12 + 1035 frame + 12 (mushaf.ts, .mp-bare). */
const BARE_PAGE_HEIGHT = 1059;

/**
 * A duty's range as Madinah muṣḥaf pages, turned right-to-left like a printed muṣḥaf: one
 * page per screen on a phone, a two-page spread from `xl` (an open book). Whole pages, with
 * the ayat outside the duty faded — you open the page, not a fragment. Everything it reads is
 * cached (the duty in Dexie, the layout and font precached), so it opens offline.
 */
export default function ReadWird() {
  const { dutyId } = useParams();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [duty, setDuty] = React.useState<(CachedDuty & { steps: CachedStep[] }) | null | undefined>(
    undefined,
  );

  const load = React.useCallback(async () => {
    if (!profile) return;
    const all = await getCachedDuties(profile.id);
    setDuty(all.find((d) => d.id === dutyId) ?? null);
  }, [profile, dutyId]);

  React.useEffect(() => {
    load();
  }, [load]);

  const back = () => (window.history.length > 1 ? navigate(-1) : navigate('/', { replace: true }));
  return (
    <ReaderView
      duty={duty}
      onBack={back}
      onCompleteStep={async (step) => {
        // The same one-way tick as the checklist (queued offline, synced later).
        await completeStep(step.id);
        await load();
      }}
    />
  );
}

export function ReaderView({
  duty,
  onBack,
  onCompleteStep,
}: {
  /** undefined while loading, null when it is not on this device */
  duty:
    | (Pick<
        CachedDuty,
        'id' | 'category' | 'scopeSurahFrom' | 'scopeAyahFrom' | 'scopeSurahTo' | 'scopeAyahTo'
      > & { steps?: CachedStep[] })
    | null
    | undefined;
  onBack: () => void;
  onCompleteStep?: (step: CachedStep) => Promise<void>;
}) {
  const [data, setData] = React.useState<MushafData | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [index, setIndex] = React.useState(0);
  const [scale, setScale] = React.useState(0);
  const pagerRef = React.useRef<HTMLDivElement>(null);
  const hasSteps = !!duty?.steps && duty.steps.length > 0;

  React.useEffect(() => {
    Promise.all([loadMushaf(), hafsReady()])
      .then(([d]) => setData(d))
      .catch(() =>
        setError('تعذر تحميل صفحات المصحف. افتح التطبيق مرة واحدة وأنت متصل بالإنترنت.'),
      );
  }, []);

  const scope = React.useMemo(
    () =>
      duty
        ? scopeOf({
            surahFrom: duty.scopeSurahFrom,
            ayahFrom: duty.scopeAyahFrom,
            surahTo: duty.scopeSurahTo,
            ayahTo: duty.scopeAyahTo,
          })
        : null,
    [duty],
  );

  const pages = React.useMemo(
    () => (data && scope ? pagesForScope(data, scope) : []),
    [data, scope],
  );

  const html = React.useMemo(
    () => (data && scope ? pages.map((page) => renderPage({ data, page, scope })) : []),
    [data, scope, pages],
  );

  // Fit the page to the screen: whole page visible, as large as the viewport allows.
  // Measured against a slide, not the pager: ≥xl a slide is half the pager (two-page
  // spread, like an open muṣḥaf), and the page must fit the slide.
  React.useLayoutEffect(() => {
    const el = pagerRef.current;
    if (!el) return;
    const measure = () => {
      const slide = el.firstElementChild as HTMLElement | null;
      const avail = slide?.offsetWidth || el.clientWidth;
      setScale(Math.min(avail / PAGE_WIDTH, el.clientHeight / BARE_PAGE_HEIGHT));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [html.length]);

  React.useEffect(() => {
    if (pagerRef.current && html.length > 0) fitLines(pagerRef.current);
  }, [html]);

  const goTo = React.useCallback((i: number) => {
    const slide = pagerRef.current?.children[i] as HTMLElement | undefined;
    slide?.scrollIntoView({ behavior: 'smooth', inline: 'start', block: 'nearest' });
  }, []);

  // Which page is on screen, from the scroll position (works in RTL, where scrollLeft is ≤ 0).
  // The divisor is a slide's width: ≥xl a slide is half the pager (two-page spread).
  function onScroll() {
    const el = pagerRef.current;
    if (!el || el.clientWidth === 0) return;
    const slide = el.firstElementChild as HTMLElement | null;
    const slideWidth = slide?.offsetWidth || el.clientWidth;
    setIndex(Math.round(Math.abs(el.scrollLeft) / slideWidth));
  }

  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // Muṣḥaf order: the next page lies to the left.
      if (e.key === 'ArrowLeft') goTo(Math.min(index + 1, pages.length - 1));
      if (e.key === 'ArrowRight') goTo(Math.max(index - 1, 0));
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [goTo, index, pages.length]);

  return (
    <div className="flex h-dvh flex-col bg-[#efe7d3]">
      <style>{MUSHAF_CSS}</style>

      <header className="relative flex-none bg-[#0b4f55] px-3 pb-3 pt-safe text-white">
        <div className="flex items-center gap-2 pt-2">
          <button
            type="button"
            onClick={onBack}
            aria-label="رجوع"
            className="flex h-10 w-10 items-center justify-center rounded-full active:bg-white/10"
          >
            <ArrowRight className="h-5 w-5" />
          </button>
          <div className="min-w-0 flex-1">
            <div className="font-display text-lg leading-tight">
              {duty ? DUTY_CATEGORY_LABELS[duty.category] : 'قراءة الورد'}
            </div>
            {duty && (
              <div className="truncate text-xs text-white/70">
                {formatRange({
                  surahFrom: duty.scopeSurahFrom,
                  ayahFrom: duty.scopeAyahFrom,
                  surahTo: duty.scopeSurahTo,
                  ayahTo: duty.scopeAyahTo,
                })}
              </div>
            )}
          </div>
        </div>
        {/* Gold rule — the muṣḥaf's frame colour, echoing the pages below. */}
        <div className="absolute inset-x-0 bottom-0 h-[3px] bg-linear-to-l from-[#b08a3e] via-[#e0bc66] to-[#b08a3e]" />
      </header>

      <main className="relative min-h-0 flex-1">
        {error ? (
          <div className="p-4">
            <Alert variant="danger">{error}</Alert>
          </div>
        ) : duty === null ? (
          <div className="p-4">
            <Alert variant="warning">هذا الورد غير موجود على هذا الجهاز.</Alert>
          </div>
        ) : html.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <Spinner />
          </div>
        ) : null}

        <div
          ref={pagerRef}
          onScroll={onScroll}
          dir="rtl"
          className={cn(
            'absolute inset-0 flex snap-x snap-mandatory overflow-x-auto overflow-y-hidden overscroll-x-contain [scrollbar-width:none]',
            html.length === 0 && 'invisible',
          )}
        >
          {html.map((pageHtml, i) => (
            <div
              key={pages[i]}
              className="flex h-full w-full flex-none snap-start snap-always items-center justify-center py-2 xl:w-1/2"
            >
              <div
                className="relative overflow-hidden rounded-md shadow-[0_10px_30px_-12px_rgba(60,40,10,.45)]"
                style={{ width: PAGE_WIDTH * scale, height: BARE_PAGE_HEIGHT * scale }}
              >
                <div
                  className="absolute left-0 top-0 origin-top-left"
                  style={{ width: PAGE_WIDTH, transform: `scale(${scale})` }}
                  dangerouslySetInnerHTML={{ __html: pageHtml }}
                />
              </div>
            </div>
          ))}
        </div>
      </main>

      {hasSteps && duty && (
        <RepeatCounter
          dutyId={duty.id}
          category={duty.category}
          steps={duty.steps!}
          onCompleteStep={onCompleteStep}
        />
      )}

      {pages.length > 0 && (
        <footer className="flex flex-none items-center justify-between gap-3 bg-[#0b4f55] px-3 pb-safe text-white">
          <button
            type="button"
            disabled={index === 0}
            onClick={() => goTo(index - 1)}
            aria-label="الصفحة السابقة"
            className="flex h-12 w-12 items-center justify-center rounded-full disabled:opacity-25 active:bg-white/10"
          >
            <ChevronRight className="h-5 w-5" />
          </button>

          <div className="flex flex-col items-center gap-1.5 py-2">
            <div className="text-sm">
              صفحة {pages[index]?.toLocaleString('ar-EG')}
              {pages.length > 1 && (
                <span className="text-white/60">
                  {' '}
                  · {(index + 1).toLocaleString('ar-EG')} من {pages.length.toLocaleString('ar-EG')}
                </span>
              )}
            </div>
            {pages.length > 1 && pages.length <= 20 && (
              <div className="flex gap-1.5">
                {pages.map((p, i) => (
                  <button
                    key={p}
                    type="button"
                    aria-label={`صفحة ${p}`}
                    onClick={() => goTo(i)}
                    className={cn(
                      'h-1.5 rounded-full transition-all',
                      i === index ? 'w-5 bg-[#e0bc66]' : 'w-1.5 bg-white/35',
                    )}
                  />
                ))}
              </div>
            )}
          </div>

          <button
            type="button"
            disabled={index >= pages.length - 1}
            onClick={() => goTo(index + 1)}
            aria-label="الصفحة التالية"
            className="flex h-12 w-12 items-center justify-center rounded-full disabled:opacity-25 active:bg-white/10"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
        </footer>
      )}
    </div>
  );
}
