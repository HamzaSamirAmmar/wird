import * as React from 'react';
import { cn } from './cn';

const fieldBase = [
  'w-full rounded-lg bg-surface text-neutral-900 shadow-xs ring-1 ring-inset ring-neutral-300',
  'transition-[box-shadow,background-color] duration-150',
  'placeholder:text-neutral-400',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600',
  'disabled:cursor-not-allowed disabled:bg-neutral-100 disabled:text-neutral-500',
].join(' ');

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
  /** Rendered inside the field on the leading edge (start in RTL). */
  icon?: React.ReactNode;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, invalid, icon, dir, ...props }, ref) => {
    const input = (
      <input
        ref={ref}
        dir={dir}
        aria-invalid={invalid || undefined}
        className={cn(
          fieldBase,
          'h-11 px-3.5 text-sm',
          icon && 'ps-10',
          invalid && 'ring-danger-500 focus-visible:ring-danger-600',
          className,
        )}
        {...props}
      />
    );
    if (!icon) return input;
    return (
      // The wrapper takes the field's own direction: `ps-10` resolves against the input's dir,
      // so a latin-only (dir="ltr") field must place its icon on the left, not the page's start.
      <div className="relative" dir={dir}>
        <span className="pointer-events-none absolute inset-y-0 start-3 flex items-center text-neutral-400">
          {icon}
        </span>
        {input}
      </div>
    );
  },
);
Input.displayName = 'Input';

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }
>(({ className, invalid, ...props }, ref) => (
  <textarea
    ref={ref}
    aria-invalid={invalid || undefined}
    className={cn(
      fieldBase,
      'min-h-24 px-3.5 py-2.5 text-sm',
      invalid && 'ring-danger-500',
      className,
    )}
    {...props}
  />
));
Textarea.displayName = 'Textarea';

export { fieldBase };
