import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from './cn';

const alertVariants = cva('rounded-lg border p-3 text-sm', {
  variants: {
    variant: {
      danger: 'border-red-200 bg-red-50 text-danger',
      success: 'border-primary-200 bg-primary-50 text-primary-800',
      info: 'border-blue-200 bg-blue-50 text-info',
    },
  },
  defaultVariants: { variant: 'info' },
});

export interface AlertProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof alertVariants> {}

export function Alert({ className, variant, ...props }: AlertProps) {
  return <div role="alert" className={cn(alertVariants({ variant }), className)} {...props} />;
}
