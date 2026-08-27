import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from './cn';

const cardVariants = cva('rounded-xl bg-surface', {
  variants: {
    variant: {
      /** Default surface: hairline ring, barely-there lift. */
      raised: 'shadow-sm ring-1 ring-neutral-200/70',
      /** Sits directly on the canvas with no lift — for dense lists. */
      flat: 'ring-1 ring-neutral-200',
      /** Tinted panel for callouts and summaries. */
      brand: 'bg-primary-50 ring-1 ring-primary-100',
    },
    interactive: {
      true: 'transition-shadow duration-150 ease-(--ease-out-soft) hover:shadow-md',
    },
  },
  defaultVariants: { variant: 'raised' },
});

export interface CardProps
  extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof cardVariants> {}

export function Card({ className, variant, interactive, ...props }: CardProps) {
  return <div className={cn(cardVariants({ variant, interactive }), className)} {...props} />;
}

export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex flex-col gap-1 p-5', className)} {...props} />;
}

export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn('text-base font-semibold text-neutral-900', className)} {...props} />;
}

export function CardDescription({
  className,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('text-sm leading-relaxed text-neutral-500', className)} {...props} />;
}

export function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('p-5 pt-0', className)} {...props} />;
}

export function CardFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex items-center gap-2 p-5 pt-0', className)} {...props} />;
}
