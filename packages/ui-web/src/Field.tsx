import * as React from 'react';
import { Label } from './Label';
import { cn } from './cn';

export interface FieldProps extends React.HTMLAttributes<HTMLDivElement> {
  label: React.ReactNode;
  /** Wired to the control via htmlFor when the control is an <Input id="…" />. */
  htmlFor?: string;
  hint?: React.ReactNode;
  error?: React.ReactNode;
}

/** Label + control + hint/error, with the spacing every form in the app uses. */
export function Field({ label, htmlFor, hint, error, className, children, ...props }: FieldProps) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)} {...props}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {error ? (
        <p className="text-xs font-medium text-danger-600">{error}</p>
      ) : (
        hint && <p className="text-xs text-neutral-500">{hint}</p>
      )}
    </div>
  );
}
