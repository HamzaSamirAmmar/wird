import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from './cn';

const badgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs leading-4 font-medium ring-1 ring-inset',
  {
    variants: {
      variant: {
        neutral: 'bg-neutral-100 text-neutral-700 ring-neutral-200',
        brand: 'bg-primary-50 text-primary-800 ring-primary-200',
        pending: 'bg-neutral-100 text-neutral-600 ring-neutral-200',
        in_progress: 'bg-accent-50 text-accent-800 ring-accent-200',
        completed: 'bg-mint-50 text-mint-800 ring-mint-200',
        danger: 'bg-danger-50 text-danger-700 ring-danger-200',
      },
    },
    defaultVariants: { variant: 'neutral' },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {
  /** Small filled circle before the label — reads faster than colour alone in a dense table. */
  dot?: boolean;
}

const dotColor = {
  neutral: 'bg-neutral-400',
  brand: 'bg-primary-500',
  pending: 'bg-neutral-400',
  in_progress: 'bg-accent-500',
  completed: 'bg-mint-500',
  danger: 'bg-danger-500',
} as const;

export function Badge({ className, variant, dot, children, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props}>
      {dot && <span className={cn('h-1.5 w-1.5 rounded-full', dotColor[variant ?? 'neutral'])} />}
      {children}
    </span>
  );
}
