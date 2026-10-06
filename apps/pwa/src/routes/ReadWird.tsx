import * as React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Minus,
  MoveHorizontal,
  Plus,
  Volume2,
} from 'lucide-react';
import { DUTY_CATEGORY_LABELS } from '@wird/domain';
import { ayahsInRange, formatRange, pageOfAyah } from '@wird/quran-data';
import { Alert, Spinner, cn } from '@wird/ui-web';
import { useAuth } from '../lib/auth-context';
import { completeStep, getCachedDuties } from '../lib/duties';
import type { CachedDuty, CachedStep } from '../lib/offline';
import { RepeatCounter } from '../components/RepeatCounter';
import { TafseerSheet, type AyahRefHit } from '../components/TafseerSheet';
import { ListenSheet } from '../components/ListenSheet';
import { PlayerBar } from '../components/PlayerBar';
import { useWirdPlayerSnapshot, wirdPlayer } from '../lib/wirdPlayer';
import { haptic } from '../lib/celebrate';
import {
  DOUBLE_TAP_ZOOM,
  applyZoomAnchor,
  attachReaderGestures,
  captureZoomAnchor,
  tweenZoom,
} from '../lib/readerGestures';
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

/** Zoom is relative to the fitted page: 1 shows it whole, MAX_ZOOM is 4× that. */
const MAX_ZOOM = 4;
const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(1, z));

/**
 * A duty's range as Madinah muṣḥaf pages, turned right-to-left like a printed muṣḥaf: one
 * centred page on a phone, and an open book of facing pages (odd right, even left, as
 * printed) wherever two pages fit side by side. Whole pages, with
 * the ayat outside the duty faded — you open the page, not a fragment. Everything it reads is
 * cached (the duty in Dexie, the layout and font precached), so it opens offline.
 *
 * Zoom and every gesture run through lib/readerGestures: pinch writes the pager's
 * `--zoom` CSS variable directly (no React render per frame) and commits once when the
 * gesture settles. A long-press on an ayah opens its tafseer; the استماع sheet plays it
 * through a reciter, following along with a highlight and turning pages by itself.
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
  const [zoom, setZoom] = React.useState(1);
  const [selected, setSelected] = React.useState<AyahRefHit | null>(null);
  const [listenOpen, setListenOpen] = React.useState(false);
  const zoomed = zoom > 1.001;
  const mainRef = React.useRef<HTMLElement>(null);
  const pagerRef = React.useRef<HTMLDivElement>(null);
  const hasSteps = !!duty?.steps && duty.steps.length > 0;
  const player = useWirdPlayerSnapshot();

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
  const xs = (box.w - 2 * PAD - 2 * COVER) / (PAGE_WIDTH * (twoUp ? 2 : 1));
  const ys = (box.h - 2 * PAD - 2 * COVER) / BARE_PAGE_HEIGHT;
  const scale = Math.max(0.1, Math.min(xs, ys));
  // «ملء العرض»: the zoom that trades the letterboxed height for full width — bigger
  // type on short-wide windows, panned vertically.
  const fitWidthZoom = clampZoom(ys > 0 && xs > ys ? xs / ys : 1);

  React.useEffect(() => {
    if (pagerRef.current && html.size > 0) fitLines(pagerRef.current);
  }, [html]);

  // Each slide pans inside its own scroller; the page (or book) sits in it.
  const scrollerAt = (i: number) =>
    (pagerRef.current?.children[i]?.firstElementChild as HTMLElement | null | undefined) ?? null;

  // ── Zoom plumbing ────────────────────────────────────────────────────────────
  // `--zoom` lives as a CSS variable on the pager: gestures write it imperatively (many
  // times a second, no React render), commits land in state once. React mirrors the same
  // value through the style prop, so renders and gestures never fight over it.
  const indexRef = React.useRef(0);
  indexRef.current = index;
  const zoomRef = React.useRef(1);
  zoomRef.current = zoom;
  const slidesLenRef = React.useRef(0);
  slidesLenRef.current = slides.length;

  const zoomImmediate = React.useCallback((z: number, cx?: number, cy?: number) => {
    const pager = pagerRef.current;
    if (!pager) return;
    const sc = scrollerAt(indexRef.current);
    const anchor =
      sc && cx !== undefined && cy !== undefined ? captureZoomAnchor(sc, cx, cy) : null;
    zoomRef.current = z;
    pager.style.setProperty('--zoom', String(z));
    if (sc && anchor) applyZoomAnchor(sc, anchor);
  }, []);

  const zoomAt = React.useCallback(
    (next: number, cx?: number, cy?: number) => {
      const z = clampZoom(next);
      zoomImmediate(z, cx, cy);
      setZoom(z);
    },
    [zoomImmediate],
  );

  const goToRef = React.useRef<(i: number, behavior?: ScrollBehavior, keepScroll?: boolean) => void>(
    () => {},
  );

  const goTo = React.useCallback((i: number, behavior: ScrollBehavior = 'smooth', keepScroll = false) => {
    const pager = pagerRef.current;
    if (!pager) return;
    // Turning while zoomed keeps the vertical reading position on the next page.
    const cur = scrollerAt(indexRef.current);
    const frac =
      keepScroll && cur && cur.scrollHeight > cur.clientHeight + 1
        ? cur.scrollTop / (cur.scrollHeight - cur.clientHeight)
        : 0;
    const slide = pager.children[i] as HTMLElement | undefined;
    const sc = slide?.firstElementChild as HTMLElement | null | undefined;
    if (sc) {
      // A fresh page opens at its top right, where its first line starts.
      sc.scrollTop = frac * Math.max(0, sc.scrollHeight - sc.clientHeight);
      sc.scrollLeft = sc.scrollWidth;
    }
    slide?.scrollIntoView({ behavior, inline: 'start', block: 'nearest' });
    setIndex(i);
  }, []);
  goToRef.current = goTo;

  /** Turn one slide in the muṣḥaf's direction (+1 next), preserving zoom and position. */
  const turnPage = React.useCallback((dir: 1 | -1) => {
    const i = indexRef.current;
    const next = Math.max(0, Math.min(slidesLenRef.current - 1, i + dir));
    if (next !== i) goToRef.current(next, 'smooth', true);
  }, []);

  const toggleZoom = React.useCallback(
    (cx: number, cy: number) => {
      const from = zoomRef.current;
      const to = clampZoom(from > 1.001 ? 1 : DOUBLE_TAP_ZOOM);
      tweenZoom(
        from,
        to,
        (z) => zoomImmediate(z, cx, cy),
        (z) => {
          zoomImmediate(z, cx, cy);
          setZoom(z);
        },
      );
    },
    [zoomImmediate],
  );

  // Every pointer gesture the reader knows: pinch (touch/trackpad/Safari), double-tap,
  // drag-to-pan, edge-drag page turns, and the long-press that opens the tafseer.
  React.useEffect(() => {
    const el = mainRef.current;
    if (!el) return;
    return attachReaderGestures(el, {
      getZoom: () => zoomRef.current,
      clampZoom,
      zoomImmediate,
      commitZoom: setZoom,
      toggleZoom,
      activeScroller: () => scrollerAt(indexRef.current),
      isZoomed: () => zoomRef.current > 1.001,
      turn: turnPage,
      onAyahLongPress: (hit) => {
        haptic(14);
        setSelected(hit);
      },
    });
  }, [zoomImmediate, toggleZoom, turnPage]);

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

  // A felt tick when a page settles (not on the first paint).
  const firstSettle = React.useRef(true);
  React.useEffect(() => {
    if (firstSettle.current) {
      firstSettle.current = false;
      return;
    }
    haptic(6);
  }, [index]);

  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        if (selected) setSelected(null);
        else if (zoomRef.current > 1) zoomAt(1);
        return;
      }
      // While a sheet is open the page behind it must not react to navigation keys.
      if (selected || listenOpen) return;
      // Ctrl/⌘ +, −, 0 (and the bare keys) zoom the page rather than the whole app.
      if (e.key === '+' || e.key === '=' || e.key === '-' || e.key === '0') {
        e.preventDefault();
        if (e.key === '0') zoomAt(1);
        else zoomAt(zoomRef.current * (e.key === '-' ? 1 / 1.25 : 1.25));
        return;
      }
      // Muṣḥaf order: the next page lies to the left.
      if (e.key === 'ArrowLeft' || e.key === 'PageDown') turnPage(1);
      else if (e.key === 'ArrowRight' || e.key === 'PageUp') turnPage(-1);
      else if (e.key === 'Home') goToRef.current(0, 'smooth', true);
      else if (e.key === 'End') goToRef.current(slidesLenRef.current - 1, 'smooth', true);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [zoomAt, turnPage, selected, listenOpen]);

  // Leaving the reader pauses the reciter (the lock-screen controls go with it).
  React.useEffect(() => () => wirdPlayer.stop(), []);

  // ── Recitation follow-along ──────────────────────────────────────────────────
  const playingAyah =
    player.status !== 'idle' ? (player.queue[player.index] ?? null) : null;

  // Playback crossing onto another page turns it by itself.
  React.useEffect(() => {
    if (!playingAyah) return;
    const page = pageOfAyah(playingAyah.surah, playingAyah.ayah);
    const i = slides.findIndex((sl) => sl.includes(page));
    if (i >= 0 && i !== indexRef.current) goToRef.current(i, 'smooth', true);
  }, [playingAyah, slides]);

  // ── Ayah highlights (selection + playing) ────────────────────────────────────
  // Bands are painted in page units inside a counter-scaled overlay, so zooming never
  // needs a repaint and the text itself is never touched.
  const paintRef = React.useRef<() => void>(() => {});
  paintRef.current = () => {
    const pager = pagerRef.current;
    if (!pager) return;
    for (const o of pager.querySelectorAll('.rw-overlay')) o.replaceChildren();
    const marks: Array<[AyahRefHit | { surah: number; ayah: number }, 'sel' | 'play']> = [];
    if (playingAyah) marks.push([playingAyah, 'play']);
    if (selected) marks.push([selected, 'sel']);
    for (const [ref, kind] of marks) {
      const wraps = pager.querySelectorAll(
        `.mp-ayah[data-s="${ref.surah}"][data-a="${ref.ayah}"]`,
      );
      for (const wrap of wraps) {
        const pageBox = (wrap as Element).closest('.rw-pagebox');
        const overlay = pageBox?.querySelector(':scope > .rw-overlay');
        if (!pageBox || !overlay) continue;
        const box = pageBox as HTMLElement;
        const s = box.clientWidth / PAGE_WIDTH || 1;
        const br = box.getBoundingClientRect();
        // One continuous band per line the ayah touches.
        const bands: { l: number; t: number; r: number; b: number }[] = [];
        for (const w of (wrap as Element).querySelectorAll(':scope > span:not(.mp-e)')) {
          for (const rect of (w as HTMLElement).getClientRects()) {
            const l = (rect.left - br.left) / s;
            const t = (rect.top - br.top) / s;
            const r = (rect.right - br.left) / s;
            const b = (rect.bottom - br.top) / s;
            const band = bands.find((x) => t < x.b + 4 && b > x.t - 4);
            if (band) {
              band.l = Math.min(band.l, l);
              band.r = Math.max(band.r, r);
              band.t = Math.min(band.t, t);
              band.b = Math.max(band.b, b);
            } else {
              bands.push({ l, t, r, b });
            }
          }
        }
        let first = true;
        for (const band of bands) {
          const d = document.createElement('div');
          d.className = `rw-hl rw-hl-${kind}`;
          d.style.left = `${band.l - 4}px`;
          d.style.top = `${band.t - 3}px`;
          d.style.width = `${band.r - band.l + 8}px`;
          d.style.height = `${band.b - band.t + 6}px`;
          overlay.append(d);
          // Follow along when zoomed: bring the playing ayah into view.
          if (first && kind === 'play' && zoomRef.current > 1.001) {
            first = false;
            d.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
          }
        }
      }
    }
  };

  React.useEffect(() => {
    paintRef.current();
  }, [selected, playingAyah, html]);

  // The wird's ayat in order — the playback queue and the download set.
  const queue = React.useMemo(
    () =>
      duty
        ? ayahsInRange({
            surahFrom: duty.scopeSurahFrom,
            ayahFrom: duty.scopeAyahFrom,
            surahTo: duty.scopeSurahTo,
            ayahTo: duty.scopeAyahTo,
          })
        : [],
    [duty],
  );

  function listenFrom(hit: AyahRefHit) {
    setSelected(null);
    const i = queue.findIndex((a) => a.surah === hit.surah && a.ayah === hit.ayah);
    if (queue.length > 0) wirdPlayer.playQueue(queue, Math.max(0, i));
  }

  const shown = slides[index] ?? [];
  const inRange = (p: number) => pages.includes(p);

  const pageBox = (page: number, side: 'right' | 'left' | 'single') => (
    <div
      key={page}
      className="rw-pagebox relative overflow-hidden bg-[#fdfaf1]"
      style={
        {
          width: `calc(${PAGE_WIDTH}px * var(--fit) * var(--zoom))`,
          height: `calc(${BARE_PAGE_HEIGHT}px * var(--fit) * var(--zoom))`,
        } as React.CSSProperties
      }
    >
      <div
        className="absolute left-0 top-0 origin-top-left"
        style={{
          width: PAGE_WIDTH,
          transform: 'scale(calc(var(--fit) * var(--zoom)))',
        }}
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
      {/* Ayah highlights paint here (page units, counter-scaled) — above the ink and
          the spine shading, never part of the text flow. */}
      <div
        aria-hidden
        className="rw-overlay pointer-events-none absolute left-0 top-0 origin-top-left"
        style={
          {
            width: PAGE_WIDTH,
            height: BARE_PAGE_HEIGHT,
            transform: 'scale(calc(var(--fit) * var(--zoom)))',
          } as React.CSSProperties
        }
      />
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
          {duty && (
            <button
              type="button"
              onClick={() => setListenOpen(true)}
              aria-label="استماع إلى الورد"
              title="استماع إلى الورد"
              className={cn(
                'flex h-10 w-10 items-center justify-center rounded-full transition-colors',
                playingAyah ? 'bg-[#e0bc66] text-[#0b4f55]' : 'active:bg-white/10',
              )}
            >
              <Volume2 className="h-5 w-5" />
            </button>
          )}
        </div>
        {/* Gold rule — the muṣḥaf's frame colour, echoing the pages below. */}
        <div className="absolute inset-x-0 bottom-0 h-[3px] bg-linear-to-l from-[#b08a3e] via-[#e0bc66] to-[#b08a3e]" />
      </header>

      <main
        ref={mainRef}
        className="relative min-h-0 flex-1 select-none bg-[radial-gradient(ellipse_at_center,#f5eedc_0%,#e9dec3_70%,#ddd0b0_100%)] [-webkit-touch-callout:none]"
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
          style={{ '--fit': scale, '--zoom': zoom } as React.CSSProperties}
          className={cn(
            'absolute inset-0 flex snap-x snap-mandatory overflow-y-hidden overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
            // Zoomed, a swipe pans the page; the arrows, keys and edge-drags still turn it.
            zoomed ? 'overflow-x-hidden' : 'overflow-x-auto',
            (html.size === 0 || scale === 0) && 'invisible',
          )}
        >
          {slides.map((slide) => (
            <div
              key={slide.join('-')}
              className="relative h-full w-full flex-none snap-start snap-always"
            >
              <div
                dir="ltr"
                className={cn(
                  'absolute inset-0 flex overscroll-contain',
                  zoomed ? 'cursor-grab overflow-auto active:cursor-grabbing' : 'overflow-hidden',
                )}
              >
                <div className="m-auto flex-none" style={{ padding: PAD }}>
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
              </div>
            </div>
          ))}
        </div>

        {html.size > 0 && scale > 0 && (
          // Zoom controls: always there with a mouse or trackpad; on a touch screen (where
          // pinching does it) only the way back to the whole page, once zoomed.
          <div
            className={cn(
              'absolute bottom-3 left-3 z-10 items-center gap-0.5 rounded-full bg-[#0b4f55]/90 p-1 text-white shadow-lg backdrop-blur-sm',
              zoomed ? 'flex' : 'hidden pointer-fine:flex',
            )}
            onDoubleClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => zoomAt(zoom / 1.25)}
              disabled={!zoomed}
              aria-label="تصغير"
              className="hidden h-8 w-8 items-center justify-center rounded-full transition-colors hover:bg-white/10 disabled:opacity-30 pointer-fine:flex"
            >
              <Minus className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => zoomAt(1)}
              aria-label="عرض الصفحة كاملة"
              title="عرض الصفحة كاملة"
              className="h-8 min-w-12 rounded-full px-2 text-xs tabular-nums transition-colors hover:bg-white/10"
            >
              {`${Math.round(zoom * 100).toLocaleString('ar-u-nu-latn')}%`}
            </button>
            <button
              type="button"
              onClick={() => zoomAt(zoom * 1.25)}
              disabled={zoom >= MAX_ZOOM}
              aria-label="تكبير"
              className="hidden h-8 w-8 items-center justify-center rounded-full transition-colors hover:bg-white/10 disabled:opacity-30 pointer-fine:flex"
            >
              <Plus className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => zoomAt(Math.abs(zoom - fitWidthZoom) < 0.01 ? 1 : fitWidthZoom)}
              disabled={fitWidthZoom <= 1}
              aria-label="ملء العرض"
              title="ملء العرض"
              className="flex h-8 w-8 items-center justify-center rounded-full transition-colors hover:bg-white/10 disabled:opacity-30"
            >
              <MoveHorizontal className="h-4 w-4" />
            </button>
          </div>
        )}
      </main>

      {player.status !== 'idle' && <PlayerBar />}

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
            onClick={() => goTo(index - 1, 'smooth', true)}
            aria-label="الصفحة السابقة"
            className="flex h-12 w-12 items-center justify-center rounded-full transition-colors hover:bg-white/10 disabled:opacity-25 active:bg-white/10"
          >
            <ChevronRight className="h-5 w-5" />
          </button>

          <div className="flex flex-col items-center gap-1.5 py-2">
            <div className="text-sm">
              {shown.length === 2
                ? `الصفحتان ${shown[0]!.toLocaleString('ar-u-nu-latn')}–${shown[1]!.toLocaleString('ar-u-nu-latn')}`
                : `صفحة ${shown[0]?.toLocaleString('ar-u-nu-latn') ?? ''}`}
              {slides.length > 1 && (
                <span className="text-white/60">
                  {' '}
                  · {(index + 1).toLocaleString('ar-u-nu-latn')} من{' '}
                  {slides.length.toLocaleString('ar-u-nu-latn')}
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
                    onClick={() => goTo(i, 'smooth', true)}
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
            onClick={() => goTo(index + 1, 'smooth', true)}
            aria-label="الصفحة التالية"
            className="flex h-12 w-12 items-center justify-center rounded-full transition-colors hover:bg-white/10 disabled:opacity-25 active:bg-white/10"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
        </footer>
      )}

      {selected && (
        <TafseerSheet
          hit={selected}
          data={data}
          onClose={() => setSelected(null)}
          onListen={listenFrom}
        />
      )}

      {listenOpen && duty && queue.length > 0 && (
        <ListenSheet
          queue={queue}
          fromAyah={selected}
          onClose={() => setListenOpen(false)}
        />
      )}
    </div>
  );
}
