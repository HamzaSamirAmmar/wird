import type * as React from 'react';
import { cn } from './cn';

export function ProgressBar({
  value,
  max = 100,
  className,
  tone = 'brand',
}: {
  value: number;
  max?: number;
  className?: string;
  tone?: 'brand' | 'mint';
}) {
  const pct = max === 0 ? 0 : Math.min(100, Math.max(0, (value / max) * 100));
  return (
    <div
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={max}
      className={cn('h-1.5 w-full overflow-hidden rounded-full bg-neutral-200', className)}
    >
      <div
        className={cn(
          'h-full rounded-full transition-[width] duration-500 ease-(--ease-out-soft)',
          tone === 'mint' ? 'bg-mint-500' : 'bg-primary-600',
        )}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

/**
 * Circular progress. Renders on an SVG circle whose dash offset tracks the ratio, so it
 * animates smoothly and needs no layout maths from the caller.
 */
export function ProgressRing({
  value,
  max,
  size = 44,
  strokeWidth = 4,
  className,
  children,
}: {
  value: number;
  max: number;
  size?: number;
  strokeWidth?: number;
  className?: string;
  children?: React.ReactNode;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const ratio = max === 0 ? 0 : Math.min(1, Math.max(0, value / max));

  return (
    <div
      className={cn('relative inline-flex items-center justify-center', className)}
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} className="-rotate-90" role="presentation">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          className="stroke-current opacity-20"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - ratio)}
          className="stroke-current transition-[stroke-dashoffset] duration-500 ease-(--ease-out-soft)"
        />
      </svg>
      {children && (
        <span className="absolute inset-0 flex items-center justify-center text-[11px] font-semibold tabular-nums">
          {children}
        </span>
      )}
    </div>
  );
}
