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
 * centred page on a phone, and an open book of facing pages (odd right, even left, as
 * printed) wherever two pages fit side by side. Whole pages, with
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
  const [box, setBox] = React.useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const mainRef = React.useRef<HTMLElement>(null);
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

  // The reading area's size decides the layout: an open book (two facing pages) when two
  // pages fit side by side at a readable size, one centred page otherwise (phones, portrait
  // tablets, narrow windows).
  React.useLayoutEffect(() => {
    const el = mainRef.current;
    if (!el) return;
    const measure = () => setBox({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const twoUp = box.w >= 960 && box.w / Math.max(box.h, 1) >= 1.2;

  // Slides: single pages, or the muṣḥaf's own spreads — an odd page on the right facing the
  // even page after it on the left, exactly as the printed book opens. A spread that holds
  // only part of the wird still shows its facing page, faded outside the range.
  const slides = React.useMemo<number[][]>(() => {
    if (!twoUp) return pages.map((p) => [p]);
    const out: number[][] = [];
    for (const p of pages) {
      const right = p % 2 === 1 ? p : p - 1;
      const last = out[out.length - 1];
      if (last && last[0] === right) continue;
      out.push([right, right + 1].filter((n) => n >= 1 && n <= 604));
    }
    return out;
  }, [pages, twoUp]);

  const html = React.useMemo(() => {
    if (!data || !scope) return new Map<number, string>();
    const map = new Map<number, string>();
    for (const slide of slides) {
      for (const page of slide)
        if (!map.has(page)) map.set(page, renderPage({ data, page, scope }));
    }
    return map;
  }, [data, scope, slides]);

  // Fit the page (or the open book) to the reading area: whole and as large as it allows.
  const PAD = twoUp ? 20 : 8;
  const COVER = twoUp ? 14 : 0;
  const scale =
    box.w === 0
      ? 0
      : Math.max(
          0.1,
          Math.min(
            (box.w - 2 * PAD - 2 * COVER) / (PAGE_WIDTH * (twoUp ? 2 : 1)),
            (box.h - 2 * PAD - 2 * COVER) / BARE_PAGE_HEIGHT,
          ),
        );

  React.useEffect(() => {
    if (pagerRef.current && html.size > 0) fitLines(pagerRef.current);
  }, [html]);

  const goTo = React.useCallback((i: number, behavior: ScrollBehavior = 'smooth') => {
    const slide = pagerRef.current?.children[i] as HTMLElement | undefined;
    slide?.scrollIntoView({ behavior, inline: 'start', block: 'nearest' });
  }, []);

  // Switching between one page and the open book keeps the page you were on in view.
  const currentPage = React.useRef<number | null>(null);
  currentPage.current = slides[index]?.[0] ?? currentPage.current;
  React.useLayoutEffect(() => {
    const page = currentPage.current;
    if (page === null) return;
    const i = slides.findIndex((sl) => sl.includes(page) || sl.includes(page + 1));
    if (i >= 0) {
      setIndex(i);
      goTo(i, 'instant');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [twoUp]);

  // Which slide is on screen, from the scroll position (works in RTL, where scrollLeft ≤ 0).
  function onScroll() {
    const el = pagerRef.current;
    if (!el || el.clientWidth === 0) return;
    setIndex(Math.round(Math.abs(el.scrollLeft) / el.clientWidth));
  }

  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // Muṣḥaf order: the next page lies to the left.
      if (e.key === 'ArrowLeft') goTo(Math.min(index + 1, slides.length - 1));
      if (e.key === 'ArrowRight') goTo(Math.max(index - 1, 0));
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [goTo, index, slides.length]);

  const shown = slides[index] ?? [];
  const inRange = (p: number) => pages.includes(p);

  const pageBox = (page: number, side: 'right' | 'left' | 'single') => (
    <div
      key={page}
      className="relative overflow-hidden bg-[#fdfaf1]"
      style={{ width: PAGE_WIDTH * scale, height: BARE_PAGE_HEIGHT * scale }}
    >
      <div
        className="absolute left-0 top-0 origin-top-left"
        style={{ width: PAGE_WIDTH, transform: `scale(${scale})` }}
        dangerouslySetInnerHTML={{ __html: html.get(page) ?? '' }}
      />
      {/* The curve of the paper into the spine. */}
      {side !== 'single' && (
        <div
          aria-hidden
          className={cn(
            'pointer-events-none absolute inset-y-0 w-[9%]',
            side === 'right'
              ? 'left-0 bg-linear-to-r from-[rgba(80,55,20,.28)] via-[rgba(80,55,20,.08)] to-transparent'
              : 'right-0 bg-linear-to-l from-[rgba(80,55,20,.28)] via-[rgba(80,55,20,.08)] to-transparent',
          )}
        />
      )}
      {!inRange(page) && (
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-[#efe7d3]/25" />
      )}
    </div>
  );

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

      <main
        ref={mainRef}
        className="relative min-h-0 flex-1 bg-[radial-gradient(ellipse_at_center,#f5eedc_0%,#e9dec3_70%,#ddd0b0_100%)]"
      >
        {error ? (
          <div className="p-4">
            <Alert variant="danger">{error}</Alert>
          </div>
        ) : duty === null ? (
          <div className="p-4">
            <Alert variant="warning">هذا الورد غير موجود على هذا الجهاز.</Alert>
          </div>
        ) : html.size === 0 ? (
          <div className="flex h-full items-center justify-center">
            <Spinner />
          </div>
        ) : null}

        <div
          ref={pagerRef}
          onScroll={onScroll}
          dir="rtl"
          className={cn(
            'absolute inset-0 flex snap-x snap-mandatory overflow-x-auto overflow-y-hidden overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
            (html.size === 0 || scale === 0) && 'invisible',
          )}
        >
          {slides.map((slide) => (
            <div
              key={slide.join('-')}
              className="flex h-full w-full flex-none snap-start snap-always items-center justify-center"
            >
              {twoUp ? (
                // An open muṣḥaf: leather cover, gilt edge, the two facing pages meeting at
                // a shaded spine.
                <div
                  className="relative rounded-[10px] bg-linear-to-b from-[#0e5a61] via-[#0b4f55] to-[#083e43] shadow-[0_30px_60px_-20px_rgba(40,25,5,.55),0_8px_18px_-8px_rgba(40,25,5,.35)]"
                  style={{ padding: COVER }}
                >
                  <div
                    aria-hidden
                    className="pointer-events-none absolute inset-[5px] rounded-[7px] border border-[#e0bc66]/45"
                  />
                  <div className="relative flex" dir="rtl">
                    {/* Page-block edges peeking out under each page. */}
                    <div
                      aria-hidden
                      className="absolute -bottom-[3px] inset-x-[2px] h-[3px] rounded-b-sm bg-[repeating-linear-gradient(90deg,#efe5cb_0_2px,#d9caa4_2px_3px)]"
                    />
                    {slide.length === 2 ? (
                      <>
                        {pageBox(slide[0]!, 'right')}
                        {pageBox(slide[1]!, 'left')}
                      </>
                    ) : (
                      pageBox(slide[0]!, slide[0]! % 2 === 1 ? 'right' : 'left')
                    )}
                    <div
                      aria-hidden
                      className="pointer-events-none absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-[rgba(70,45,10,.35)]"
                    />
                  </div>
                </div>
              ) : (
                <div className="relative rounded-md shadow-[0_14px_34px_-14px_rgba(60,40,10,.5),0_2px_6px_-2px_rgba(60,40,10,.2)] ring-1 ring-[#d6c7a2]">
                  {pageBox(slide[0]!, 'single')}
                </div>
              )}
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

      {slides.length > 0 && (
        <footer className="flex flex-none items-center justify-between gap-3 bg-[#0b4f55] px-3 pb-safe text-white">
          <button
            type="button"
            disabled={index === 0}
            onClick={() => goTo(index - 1)}
            aria-label="الصفحة السابقة"
            className="flex h-12 w-12 items-center justify-center rounded-full transition-colors hover:bg-white/10 disabled:opacity-25 active:bg-white/10"
          >
            <ChevronRight className="h-5 w-5" />
          </button>

          <div className="flex flex-col items-center gap-1.5 py-2">
            <div className="text-sm">
              {shown.length === 2
                ? `الصفحتان ${shown[0]!.toLocaleString('ar-EG')}–${shown[1]!.toLocaleString('ar-EG')}`
                : `صفحة ${shown[0]?.toLocaleString('ar-EG') ?? ''}`}
              {slides.length > 1 && (
                <span className="text-white/60">
                  {' '}
                  · {(index + 1).toLocaleString('ar-EG')} من {slides.length.toLocaleString('ar-EG')}
                </span>
              )}
            </div>
            {slides.length > 1 && slides.length <= 20 && (
              <div className="flex gap-1.5">
                {slides.map((sl, i) => (
                  <button
                    key={sl.join('-')}
                    type="button"
                    aria-label={`صفحة ${sl[0]}`}
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
            disabled={index >= slides.length - 1}
            onClick={() => goTo(index + 1)}
            aria-label="الصفحة التالية"
            className="flex h-12 w-12 items-center justify-center rounded-full transition-colors hover:bg-white/10 disabled:opacity-25 active:bg-white/10"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
        </footer>
      )}
    </div>
  );
}
