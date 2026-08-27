import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from './cn';

const badgeVariants = cva('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium', {
  variants: {
    variant: {
      neutral: 'bg-neutral-100 text-neutral-700',
      pending: 'bg-neutral-100 text-neutral-600',
      in_progress: 'bg-accent-100 text-accent-800',
      completed: 'bg-primary-100 text-primary-800',
      danger: 'bg-red-100 text-danger',
    },
  },
  defaultVariants: { variant: 'neutral' },
});

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
