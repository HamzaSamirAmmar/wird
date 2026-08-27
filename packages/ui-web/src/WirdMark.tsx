import * as React from 'react';
import {
  FRAME_PATH,
  PAGE_LEFT_PATH,
  PAGE_RIGHT_PATH,
  STROKE_WIDTH,
  VIEW_BOX,
} from '@wird/brand/mark.mjs';
import { cn } from './cn';

export interface WirdMarkProps extends React.SVGAttributes<SVGSVGElement> {
  /** Solid medallion with knocked-out pages. Holds together below ~24px; the stroked mark does not. */
  filled?: boolean;
}

/**
 * The brand mark: an open muṣḥaf inside a mihrab medallion. Paints in `currentColor`, so set
 * the colour on the element (or a parent) rather than passing a fill.
 */
export function WirdMark({ filled, className, ...props }: WirdMarkProps) {
  return (
    <svg viewBox={VIEW_BOX} role="presentation" className={cn('h-6 w-6', className)} {...props}>
      <path
        d={FRAME_PATH}
        fill={filled ? 'currentColor' : 'none'}
        stroke={filled ? undefined : 'currentColor'}
        strokeWidth={filled ? undefined : STROKE_WIDTH}
        strokeLinejoin="round"
      />
      {/* In the filled cut the pages are a hole, so they take the backdrop colour. */}
      <g fill={filled ? 'var(--wird-mark-knockout, #fff)' : 'currentColor'}>
        <path d={PAGE_LEFT_PATH} />
        <path d={PAGE_RIGHT_PATH} />
      </g>
    </svg>
  );
}

/** Mark in a teal tile — the app-icon lockup, for headers and auth screens. */
export function WirdLogo({
  className,
  markClassName,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { markClassName?: string }) {
  return (
    <div
      className={cn(
        'inline-flex items-center justify-center rounded-xl bg-linear-to-br from-primary-700 to-primary-900 text-white shadow-glow',
        'h-10 w-10',
        className,
      )}
      {...props}
    >
      <WirdMark className={cn('h-[62%] w-[62%]', markClassName)} />
    </div>
  );
}

/** Full lockup: tile + Arabic wordmark. */
export function WirdWordmark({
  subtitle,
  size = 'md',
  className,
}: {
  subtitle?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const tile = { sm: 'h-8 w-8 rounded-lg', md: 'h-10 w-10', lg: 'h-14 w-14 rounded-2xl' }[size];
  const word = { sm: 'text-lg', md: 'text-xl', lg: 'text-3xl' }[size];
  return (
    <div className={cn('flex items-center gap-3', className)}>
      <WirdLogo className={tile} />
      <div className="leading-tight">
        <div className={cn('font-display font-medium text-neutral-900', word)}>ورد</div>
        {subtitle && <div className="text-xs text-neutral-500">{subtitle}</div>}
      </div>
    </div>
  );
}
