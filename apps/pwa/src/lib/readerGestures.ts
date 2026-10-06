// ─── Reader gesture layer ─────────────────────────────────────────────────────
//
// One module owns every pointer interaction with the muṣḥaf page: pinch-zoom (touch,
// trackpad ctrl+wheel, Safari gesture events), double-tap / double-click zoom, mouse
// drag-to-pan, edge-drag page turns while zoomed, and the long-press that opens the
// tafseer. ReadWird supplies the behaviour; this file supplies the gesture recognition.
//
// The contract that keeps pinch smooth: zoom changes during a gesture go through
// `cfg.zoomImmediate`, which writes the pager's `--zoom` CSS variable and corrects the
// scroll anchors synchronously — no React render per frame. The gesture settles with a
// single `cfg.commitZoom`, and only then does the component re-render (flipping the
// scroller to a pannable overflow, the pill label, etc.).

export interface AyahHit {
  surah: number;
  ayah: number;
}

export interface ReaderGesturesConfig {
  /** Current zoom (read from a ref — called mid-gesture, must never be stale). */
  getZoom(): number;
  clampZoom(z: number): number;
  /** Apply zoom right now at a screen point (CSS var + anchor fix), no React render. */
  zoomImmediate(z: number, cx?: number, cy?: number): void;
  /** A gesture settled: commit the zoom to React state. */
  commitZoom(z: number): void;
  /** Animated zoom toggle used by double-tap / double-click. */
  toggleZoom(cx: number, cy: number): void;
  /** The panning scroller of the slide currently on screen. */
  activeScroller(): HTMLElement | null;
  isZoomed(): boolean;
  /** Turn the page (±1 slide), keeping zoom and the vertical reading position. */
  turn(dir: 1 | -1): void;
  /** Long-press (touch) or context-menu (mouse) landed on an ayah. */
  onAyahLongPress(hit: AyahHit): void;
}

/** How far a finger must keep dragging past a zoomed page's edge to turn it (px). */
const EDGE_TURN_THRESHOLD = 56;
/** Long-press that opens the tafseer (ms) — short enough to feel instant, long enough
 *  not to fire during a swipe. */
const LONG_PRESS_MS = 420;
/** Two taps within this window and distance count as a double-tap. */
const DOUBLE_TAP_MS = 300;
const DOUBLE_TAP_DIST = 32;
/** Trackpad pinch streams wheel events; commit this long after the last one. */
const WHEEL_COMMIT_MS = 160;

interface GestureEvent extends UIEvent {
  scale: number;
  clientX: number;
  clientY: number;
}

export function attachReaderGestures(el: HTMLElement, cfg: ReaderGesturesConfig): () => void {
  // ── pinch (two fingers) ─────────────────────────────────────────────────────
  let pinch: { dist: number; zoom: number } | null = null;
  let pendingZoom: number | null = null;

  const settle = () => {
    if (pendingZoom !== null) {
      cfg.commitZoom(pendingZoom);
      pendingZoom = null;
    }
  };

  const dist = (t: TouchList) =>
    Math.hypot(t[0]!.clientX - t[1]!.clientX, t[0]!.clientY - t[1]!.clientY);
  const mid = (t: TouchList) =>
    [(t[0]!.clientX + t[1]!.clientX) / 2, (t[0]!.clientY + t[1]!.clientY) / 2] as const;

  // ── edge-drag page turn (single finger while zoomed) ────────────────────────
  // The scroller itself pans natively; when it already sits at an edge we measure how
  // much further the finger travels with the content pinned, and turn past a threshold.
  let edge: { dir: 1 | -1; x: number } | null = null;
  let edgeConsumed = false;

  const atEdge = (sc: HTMLElement): 1 | -1 | 0 => {
    // The slide scroller is dir=ltr: scrollLeft 0 is the muṣḥaf's "next page" side (left),
    // its maximum the "previous page" side (right).
    if (sc.scrollLeft <= 0) return -1;
    if (sc.scrollLeft >= sc.scrollWidth - sc.clientWidth - 1) return 1;
    return 0;
  };

  // ── long-press ───────────────────────────────────────────────────────────────
  let press: { x: number; y: number; timer: number } | null = null;

  const ayahAt = (target: EventTarget | null): AyahHit | null => {
    const wrap = (target as HTMLElement | null)?.closest?.('.mp-ayah');
    const s = wrap?.getAttribute('data-s');
    const a = wrap?.getAttribute('data-a');
    return s && a ? { surah: Number(s), ayah: Number(a) } : null;
  };

  const cancelPress = () => {
    if (press) {
      clearTimeout(press.timer);
      press = null;
    }
  };

  // ── double-tap ───────────────────────────────────────────────────────────────
  let lastTap: { t: number; x: number; y: number } | null = null;
  let lastDoubleTapAt = 0;

  // ── mouse drag-to-pan ────────────────────────────────────────────────────────
  let drag: { x: number; y: number; left: number; top: number } | null = null;

  const onTouchStart = (e: TouchEvent) => {
    if (e.touches.length === 2) {
      cancelPress();
      pinch = { dist: dist(e.touches), zoom: cfg.getZoom() };
    } else if (e.touches.length === 1) {
      const t = e.touches[0]!;
      press = {
        x: t.clientX,
        y: t.clientY,
        timer: window.setTimeout(() => {
          const hit = ayahAt(document.elementFromPoint(t.clientX, t.clientY));
          press = null;
          if (hit) cfg.onAyahLongPress(hit);
        }, LONG_PRESS_MS),
      };
    }
  };

  const onTouchMove = (e: TouchEvent) => {
    if (pinch && e.touches.length === 2) {
      e.preventDefault();
      edge = null;
      const [x, y] = mid(e.touches);
      const z = cfg.clampZoom((pinch.zoom * dist(e.touches)) / Math.max(pinch.dist, 1));
      pendingZoom = z;
      cfg.zoomImmediate(z, x, y);
      return;
    }
    if (e.touches.length === 1) {
      // A swipe (or a pan) is not a long-press: moving past a few px cancels it.
      if (press) {
        const t = e.touches[0]!;
        if (Math.hypot(t.clientX - press.x, t.clientY - press.y) > 10) cancelPress();
      }
      if (cfg.isZoomed()) {
        const t = e.touches[0]!;
        const sc = cfg.activeScroller();
        if (!sc) return;
        const at = atEdge(sc);
        if (at !== 0 && !edgeConsumed) {
          // Pinned at the left edge + dragging further left → next page (and mirrored).
          const dir: 1 | -1 = at === -1 ? 1 : -1;
          if (edge === null) {
            edge = { dir, x: t.clientX };
          } else if (edge.dir === dir) {
            const overscroll = dir === 1 ? edge.x - t.clientX : t.clientX - edge.x;
            if (overscroll > EDGE_TURN_THRESHOLD) {
              edgeConsumed = true;
              edge = null;
              cfg.turn(dir);
            }
          } else {
            // Dragging along the edge the other way: re-anchor at this finger position.
            edge = { dir, x: t.clientX };
          }
        } else if (at === 0) {
          edge = null;
        }
      }
    }
  };

  const onTouchEnd = (e: TouchEvent) => {
    if (e.touches.length < 2) {
      pinch = null;
      settle();
    }
    if (e.touches.length === 0) {
      edgeConsumed = false;
      edge = null;
      cancelPress();
      // Track the tap for double-tap detection.
      const changed = e.changedTouches[0];
      if (changed) {
        const now = performance.now();
        if (
          lastTap &&
          now - lastTap.t < DOUBLE_TAP_MS &&
          Math.hypot(changed.clientX - lastTap.x, changed.clientY - lastTap.y) < DOUBLE_TAP_DIST
        ) {
          lastTap = null;
          lastDoubleTapAt = now;
          cancelPress();
          cfg.toggleZoom(changed.clientX, changed.clientY);
        } else {
          lastTap = { t: now, x: changed.clientX, y: changed.clientY };
        }
      }
    }
  };

  // ── wheel: ctrl/⌘ + wheel is a trackpad pinch (Chromium/Firefox) or explicit zoom ──
  let wheelTimer: number | undefined;
  const onWheel = (e: WheelEvent) => {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    const d = Math.max(-50, Math.min(50, e.deltaY));
    const z = cfg.clampZoom(cfg.getZoom() * Math.exp(-d * 0.01));
    pendingZoom = z;
    cfg.zoomImmediate(z, e.clientX, e.clientY);
    clearTimeout(wheelTimer);
    wheelTimer = window.setTimeout(settle, WHEEL_COMMIT_MS);
  };

  // ── Safari's proprietary pinch (macOS/iOS trackpad & touch, non-Chromium) ─────
  let gestureZoom = 1;
  const onGestureStart = (e: Event) => {
    e.preventDefault();
    gestureZoom = cfg.getZoom();
  };
  const onGestureChange = (e: Event) => {
    e.preventDefault();
    if (pinch) return; // iOS reports a touch pinch both ways; the touch path handles it
    const g = e as GestureEvent;
    const z = cfg.clampZoom(gestureZoom * g.scale);
    pendingZoom = z;
    cfg.zoomImmediate(z, g.clientX, g.clientY);
  };
  const onGestureEnd = () => settle();

  // ── mouse ────────────────────────────────────────────────────────────────────
  const onPointerDown = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    if (e.target instanceof Node && (e.target as HTMLElement).closest?.('button,a,input')) return;
    const sc = cfg.activeScroller();
    if (!cfg.isZoomed() || !sc || !sc.contains(e.target as Node)) return;
    drag = { x: e.clientX, y: e.clientY, left: sc.scrollLeft, top: sc.scrollTop };
    el.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: PointerEvent) => {
    const d = drag;
    if (!d) return;
    const sc = cfg.activeScroller();
    if (!sc) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    const wantLeft = d.left - dx;
    const max = sc.scrollWidth - sc.clientWidth;
    // Dragging past a pinned edge turns the page, like flipping a sheet sideways.
    if (wantLeft < 0 && d.left <= 0 && -wantLeft > EDGE_TURN_THRESHOLD) {
      drag = null;
      cfg.turn(1);
      return;
    }
    if (wantLeft > max && d.left >= max - 1 && wantLeft - max > EDGE_TURN_THRESHOLD) {
      drag = null;
      cfg.turn(-1);
      return;
    }
    sc.scrollLeft = wantLeft;
    sc.scrollTop = d.top - dy;
  };

  const onPointerUp = () => (drag = null);

  const onDoubleClick = (e: MouseEvent) => {
    // The touch double-tap path already handled it (touch also synthesizes dblclick)…
    if (Math.abs(performance.now() - lastDoubleTapAt) < 80) return;
    // …and controls double-clicked on their own behalf (stopPropagation on the React side
    // can't help: this native listener sits below React's root handler).
    if (e.target instanceof Node && (e.target as HTMLElement).closest?.('button,a,input')) return;
    e.preventDefault();
    cfg.toggleZoom(e.clientX, e.clientY);
  };

  // Long-press on Android (and right-click anywhere) surfaces the ayah's tafseer instead
  // of a selection callout or browser menu.
  const onContextMenu = (e: MouseEvent) => {
    const hit = ayahAt(e.target);
    if (!hit) return;
    e.preventDefault();
    cancelPress();
    cfg.onAyahLongPress(hit);
  };

  el.addEventListener('touchstart', onTouchStart, { passive: true });
  el.addEventListener('touchmove', onTouchMove, { passive: false });
  el.addEventListener('touchend', onTouchEnd);
  el.addEventListener('touchcancel', onTouchEnd);
  el.addEventListener('wheel', onWheel, { passive: false });
  el.addEventListener('gesturestart', onGestureStart);
  el.addEventListener('gesturechange', onGestureChange);
  el.addEventListener('gestureend', onGestureEnd);
  el.addEventListener('pointerdown', onPointerDown);
  el.addEventListener('pointermove', onPointerMove);
  el.addEventListener('pointerup', onPointerUp);
  el.addEventListener('pointercancel', onPointerUp);
  el.addEventListener('dblclick', onDoubleClick);
  el.addEventListener('contextmenu', onContextMenu);

  return () => {
    cancelPress();
    clearTimeout(wheelTimer);
    el.removeEventListener('touchstart', onTouchStart);
    el.removeEventListener('touchmove', onTouchMove);
    el.removeEventListener('touchend', onTouchEnd);
    el.removeEventListener('touchcancel', onTouchEnd);
    el.removeEventListener('wheel', onWheel);
    el.removeEventListener('gesturestart', onGestureStart);
    el.removeEventListener('gesturechange', onGestureChange);
    el.removeEventListener('gestureend', onGestureEnd);
    el.removeEventListener('pointerdown', onPointerDown);
    el.removeEventListener('pointermove', onPointerMove);
    el.removeEventListener('pointerup', onPointerUp);
    el.removeEventListener('pointercancel', onPointerUp);
    el.removeEventListener('dblclick', onDoubleClick);
    el.removeEventListener('contextmenu', onContextMenu);
  };
}

// ─── Zoom anchor math ─────────────────────────────────────────────────────────

export interface ZoomAnchor {
  /** The point as a fraction of the content (0…1 each way). */
  fx: number;
  fy: number;
  /** The same point relative to the scroller's viewport. */
  cx: number;
  cy: number;
  /** The content wrapper's offset within the scroller's scroll area. */
  left: number;
  top: number;
}

/**
 * Captures a screen point as a fraction of the scroller's content, so that after the
 * content is resized the same fraction can be scrolled back under the same point — the
 * pinch keeps the text under the fingers where it was.
 */
export function captureZoomAnchor(
  sc: HTMLElement,
  cx: number,
  cy: number,
): ZoomAnchor | null {
  const content = sc.firstElementChild as HTMLElement | null;
  if (!content) return null;
  const sr = sc.getBoundingClientRect();
  const r = content.getBoundingClientRect();
  return {
    fx: (cx - r.left) / Math.max(r.width, 1),
    fy: (cy - r.top) / Math.max(r.height, 1),
    cx: cx - sr.left,
    cy: cy - sr.top,
    left: content.offsetLeft,
    top: content.offsetTop,
  };
}

/** Scrolls so the captured fraction lands under the captured viewport point again. */
export function applyZoomAnchor(sc: HTMLElement, a: ZoomAnchor): void {
  const content = sc.firstElementChild as HTMLElement | null;
  if (!content) return;
  sc.scrollLeft = a.left + a.fx * content.offsetWidth - a.cx;
  sc.scrollTop = a.top + a.fy * content.offsetHeight - a.cy;
}

/** Zoom presets in one place: double-tap lands on this. */
export const DOUBLE_TAP_ZOOM = 2;

/**
 * Eases `--zoom` from one value to another over a few frames (double-tap, preset
 * buttons). `step` receives each intermediate value, `done` the final one.
 */
export function tweenZoom(
  from: number,
  to: number,
  step: (z: number) => void,
  done: (z: number) => void,
  ms = 180,
): void {
  if (Math.abs(to - from) < 0.001) {
    done(to);
    return;
  }
  const t0 = performance.now();
  const frame = (t: number) => {
    const k = Math.min(1, (t - t0) / ms);
    const eased = 1 - Math.pow(1 - k, 3);
    step(from + (to - from) * eased);
    if (k < 1) requestAnimationFrame(frame);
    else done(to);
  };
  requestAnimationFrame(frame);
}
