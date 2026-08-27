import * as React from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from './cn';

export interface EmptyStateProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  icon?: LucideIcon;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
  ...props
}: EmptyStateProps) {
  return (
    <div
      className={cn('flex flex-col items-center gap-3 px-6 py-14 text-center', className)}
      {...props}
    >
      {Icon && (
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary-50 text-primary-600 ring-1 ring-primary-100">
          <Icon className="h-5.5 w-5.5" />
        </div>
      )}
      <div className="text-sm font-semibold text-neutral-800">{title}</div>
      {description && (
        <p className="max-w-xs text-sm leading-relaxed text-neutral-500">{description}</p>
      )}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
