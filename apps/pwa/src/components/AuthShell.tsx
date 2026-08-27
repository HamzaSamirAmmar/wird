import * as React from 'react';
import { WirdMark } from '@wird/ui-web';

/**
 * Mobile auth screen: a teal brand hero that the form card overlaps from below.
 * Shared by Login and ChangePassword so the two never drift.
 */
export function AuthShell({
  title,
  description,
  children,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col bg-canvas">
      <div className="relative overflow-hidden bg-linear-to-br from-primary-700 via-primary-800 to-primary-950 pb-16 pt-safe">
        <div className="mihrab-pattern absolute inset-0 opacity-80" />
        <WirdMark className="absolute -end-10 -top-10 h-44 w-44 text-white/8" />

        <div className="relative flex flex-col items-center gap-3 px-6 pt-12">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/12 text-white ring-1 ring-white/20">
            <WirdMark className="h-9 w-9" />
          </div>
          <div className="text-center">
            <div className="font-display text-3xl font-medium text-white">ورد</div>
            <p className="mt-1 text-sm text-primary-100/75">الورد اليومي</p>
          </div>
        </div>
      </div>

      {/* z-10: the hero's absolutely-positioned pattern would otherwise paint over this card. */}
      <div className="relative z-10 -mt-10 flex-1 px-4 pb-8">
        <div className="mx-auto w-full max-w-sm rounded-2xl bg-surface p-6 shadow-lg ring-1 ring-neutral-200/70">
          <h1 className="text-lg font-semibold text-neutral-900">{title}</h1>
          {description && (
            <p className="mt-1 text-sm leading-relaxed text-neutral-500">{description}</p>
          )}
          <div className="mt-6">{children}</div>
        </div>
      </div>
    </div>
  );
}
