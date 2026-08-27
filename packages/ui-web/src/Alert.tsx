import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react';
import { cn } from './cn';

const alertVariants = cva('flex gap-3 rounded-lg p-3.5 text-sm ring-1 ring-inset', {
  variants: {
    variant: {
      info: 'bg-primary-50 text-primary-900 ring-primary-100',
      success: 'bg-mint-50 text-mint-900 ring-mint-200',
      warning: 'bg-accent-50 text-accent-900 ring-accent-200',
      danger: 'bg-danger-50 text-danger-700 ring-danger-200',
    },
  },
  defaultVariants: { variant: 'info' },
});

const icons = { info: Info, success: CheckCircle2, warning: AlertTriangle, danger: XCircle };
const iconTint = {
  info: 'text-primary-600',
  success: 'text-mint-600',
  warning: 'text-accent-600',
  danger: 'text-danger-500',
};

export interface AlertProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'>, VariantProps<typeof alertVariants> {
  title?: React.ReactNode;
}

export function Alert({ className, variant, title, children, ...props }: AlertProps) {
  const key = variant ?? 'info';
  const Icon = icons[key];
  return (
    <div role="alert" className={cn(alertVariants({ variant }), className)} {...props}>
      <Icon className={cn('mt-0.5 h-4.5 w-4.5 shrink-0', iconTint[key])} />
      <div className="flex-1 leading-relaxed">
        {title && <div className="mb-0.5 font-semibold">{title}</div>}
        {children}
      </div>
    </div>
  );
}
