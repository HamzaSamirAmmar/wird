import * as React from 'react';
import { cn } from '@wird/ui-web';
import { haptic } from '../lib/celebrate';

/** The animated close of the enclosing sheet, for the sheet's own buttons. */
const CloseContext = React.createContext<() => void>(() => {});
export function useSheetClose(): () => void {
  return React.useContext(CloseContext);
}

/**
 * The app's one bottom sheet: dark backdrop, rounded panel rising from the bottom edge,
 * a grip you can drag to dismiss. Layout rules that keep it inside the screen: the panel
 * sits inside a `pb-safe` wrapper (lifted above the home-indicator zone in installed
 * PWAs), never exceeds 86% of the viewport height, and its middle section is the only
 * scroller (`min-h-0 flex-1 overflow-y-auto overscroll-contain`).
 *
 * Every close path animates: the panel slides down and the backdrop fades before
 * `onClose` unmounts it. The browser/Android **back button closes the sheet** instead of
 * leaving the screen — a sentinel history entry is pushed while the sheet is open, popped
 * by whichever close path didn't come from back itself. (Sheets never swap directly into
 * one another; if that ever changes, revisit the sentinel dance.)
 *
 * While a sheet is open the page behind it stops scrolling (body lock) and Escape closes.
 * The sheet's own buttons close through `useSheetClose()` so they animate too.
 */
export function BottomSheet({
  onClose,
  children,
  label,
  className,
}: {
  onClose: () => void;
  children: React.ReactNode;
  /** Accessible name («تفسير الآية»…). */
  label: string;
  /** Extra classes for the panel. */
  className?: string;
}) {
  const [drag, setDrag] = React.useState(0);
  const [closing, setClosing] = React.useState(false);
  const closingRef = React.useRef(false);
  const timerRef = React.useRef<number | undefined>(undefined);
  const start = React.useRef<{ y: number; t: number } | null>(null);
  const onCloseRef = React.useRef(onClose);

  React.useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  React.useEffect(() => () => clearTimeout(timerRef.current), []);

  /** Animated close: slide down first, unmount ~230 ms later. */
  const close = React.useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    setClosing(true);
    timerRef.current = window.setTimeout(() => onCloseRef.current(), 230);
  }, []);

  React.useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // Back button: push a sentinel entry, close on pop. Closing by any other means takes
  // the sentinel back off in the cleanup (history.back()), without leaving the screen.
  React.useEffect(() => {
    history.pushState({ wirdSheet: true }, '');
    let popped = false;
    const onPop = () => {
      popped = true;
      close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('popstate', onPop);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('popstate', onPop);
      window.removeEventListener('keydown', onKey);
      if (!popped && history.state?.wirdSheet) history.back();
    };
  }, [close]);

  // Drag the grip down to dismiss (touch only — the mouse already has Escape and the X).
  const onGripPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== 'touch' || closing) return;
    start.current = { y: e.clientY, t: performance.now() };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onGripPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const s = start.current;
    if (!s) return;
    setDrag(Math.max(0, e.clientY - s.y));
  };
  const onGripPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const s = start.current;
    if (!s) return;
    const dy = e.clientY - s.y;
    const dt = performance.now() - s.t;
    start.current = null;
    if (dy > 90 || (dy > 36 && dt < 220)) {
      haptic(8);
      close(); // animates the rest of the way down from wherever the drag left it
    } else {
      setDrag(0);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col justify-end"
      role="dialog"
      aria-modal="true"
      aria-label={label}
    >
      <button
        type="button"
        aria-label="إغلاق"
        className={cn(
          'absolute inset-0 cursor-default bg-black/35 backdrop-blur-[2px]',
          drag > 0 && !closing ? '' : 'transition-opacity duration-200',
        )}
        style={{ opacity: closing ? 0 : Math.max(0, 1 - drag / 240) }}
        onClick={close}
      />
      {/* pb-safe lifts the panel clear of the home indicator; the backdrop fills behind it. */}
      <div className="relative mx-auto flex w-full max-w-xl flex-col pb-safe">
        <div
          style={{ transform: closing ? 'translateY(100%)' : drag > 0 ? `translateY(${drag}px)` : undefined }}
          className={cn(
            'relative flex max-h-[86dvh] flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl',
            'animate-slide-up',
            drag > 0 && !closing ? '' : 'transition-transform duration-200 ease-out',
            className,
          )}
        >
          <div
            className="flex flex-none justify-center pt-2.5 pb-1 touch-none"
            onPointerDown={onGripPointerDown}
            onPointerMove={onGripPointerMove}
            onPointerUp={onGripPointerUp}
            onPointerCancel={onGripPointerUp}
          >
            <span className="h-1.5 w-10 rounded-full bg-neutral-300/80" aria-hidden />
          </div>
          <CloseContext.Provider value={close}>
            {children}
          </CloseContext.Provider>
        </div>
      </div>
    </div>
  );
}
