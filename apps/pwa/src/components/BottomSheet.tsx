import * as React from 'react';
import { cn } from '@wird/ui-web';
import { haptic } from '../lib/celebrate';

/**
 * The app's one bottom sheet: dark backdrop, rounded panel rising from the bottom edge,
 * a grip you can drag to dismiss. Layout rules that fix the old overflow-from-the-bottom:
 * the panel sits inside a `pb-safe` wrapper (so it lifts above the home-indicator zone in
 * installed PWAs), never exceeds 86% of the viewport height, and its middle section is the
 * only scroller (`min-h-0 flex-1 overflow-y-auto overscroll-contain`).
 *
 * While a sheet is open the page behind it stops scrolling (body lock) and Escape closes.
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
  /** Extra classes for the panel (e.g. a taller max-height). */
  className?: string;
}) {
  const panelRef = React.useRef<HTMLDivElement>(null);
  const [drag, setDrag] = React.useState(0);
  const start = React.useRef<{ y: number; t: number } | null>(null);

  React.useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Drag the grip down to dismiss (touch only — the mouse already has Escape and the X).
  const onGripPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== 'touch') return;
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
      onClose();
    } else {
      setDrag(0);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end" role="dialog" aria-modal="true" aria-label={label}>
      <button
        type="button"
        aria-label="إغلاق"
        className="absolute inset-0 cursor-default bg-black/35 backdrop-blur-[2px]"
        style={{ opacity: Math.max(0, 1 - drag / 240) }}
        onClick={onClose}
      />
      {/* pb-safe lifts the panel clear of the home indicator; the backdrop fills behind it. */}
      <div className="relative mx-auto flex w-full max-w-xl flex-col pb-safe">
        <div
          ref={panelRef}
          style={{ transform: drag > 0 ? `translateY(${drag}px)` : undefined }}
          className={cn(
            'relative flex max-h-[86dvh] flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl',
            drag > 0 ? '' : 'transition-transform duration-200',
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
          {children}
        </div>
      </div>
    </div>
  );
}
