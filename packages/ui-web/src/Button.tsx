import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { Loader2 } from 'lucide-react';
import { cn } from './cn';

const buttonVariants = cva(
  [
    'relative inline-flex select-none items-center justify-center gap-2 whitespace-nowrap font-medium',
    'transition-[background-color,box-shadow,color,transform] duration-150 ease-(--ease-out-soft)',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/60 focus-visible:ring-offset-2 focus-visible:ring-offset-surface',
    'active:translate-y-px disabled:pointer-events-none disabled:opacity-45',
  ].join(' '),
  {
    variants: {
      variant: {
        primary:
          'bg-primary-700 text-white shadow-xs hover:bg-primary-800 hover:shadow-glow active:bg-primary-900',
        secondary:
          'bg-primary-50 text-primary-800 ring-1 ring-inset ring-primary-100 hover:bg-primary-100',
        outline:
          'bg-surface text-neutral-800 ring-1 ring-inset ring-neutral-300 shadow-xs hover:bg-neutral-50 hover:ring-neutral-400',
        ghost: 'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900',
        danger: 'bg-danger-600 text-white shadow-xs hover:bg-danger-700',
        quiet: 'text-primary-700 hover:bg-primary-50',
      },
      size: {
        xs: 'h-7 rounded-md px-2 text-xs',
        sm: 'h-9 rounded-md px-3 text-sm',
        md: 'h-11 rounded-lg px-4 text-sm',
        lg: 'h-12 rounded-lg px-6 text-base',
      },
      block: { true: 'w-full' },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  /** Swaps the label for a spinner and disables the button. Ignored when `asChild` is set. */
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, block, asChild, loading, children, disabled, ...props }, ref) => {
    const classes = cn(buttonVariants({ variant, size, block }), className);
    if (asChild) {
      return (
        <Slot ref={ref} className={classes} {...props}>
          {children}
        </Slot>
      );
    }
    return (
      <button ref={ref} className={classes} disabled={disabled || loading} {...props}>
        {/* Keep the label mounted but invisible so the button does not resize while loading. */}
        <span className={cn('inline-flex items-center gap-2', loading && 'invisible')}>
          {children}
        </span>
        {loading && <Loader2 className="absolute h-4 w-4 animate-spin" />}
      </button>
    );
  },
);
Button.displayName = 'Button';

export interface IconButtonProps extends Omit<ButtonProps, 'block' | 'loading'> {
  /** Required: the button has no visible label. */
  'aria-label': string;
}

const iconSizes = {
  xs: 'h-7 w-7 px-0',
  sm: 'h-9 w-9 px-0',
  md: 'h-10 w-10 px-0',
  lg: 'h-12 w-12 px-0',
};

export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ className, size = 'sm', variant = 'ghost', ...props }, ref) => (
    <Button
      ref={ref}
      size={size}
      variant={variant}
      className={cn('shrink-0', iconSizes[size ?? 'sm'], className)}
      {...props}
    />
  ),
);
IconButton.displayName = 'IconButton';

export { buttonVariants };
