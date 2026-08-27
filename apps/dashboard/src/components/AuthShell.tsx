import * as React from 'react';
import { WirdMark } from '@wird/ui-web';

/**
 * Split screen for the unauthenticated routes: a brand panel that collapses away below `lg`,
 * and the form column. Keeps Login / ChangePassword / Unauthorized visually identical.
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
    <div className="flex min-h-screen bg-canvas">
      <div className="relative hidden w-[46%] max-w-2xl overflow-hidden bg-linear-to-br from-primary-700 via-primary-800 to-primary-950 lg:block">
        <div className="mihrab-pattern absolute inset-0 opacity-80" />
        {/* Oversized mark, cropped off the trailing edge — the panel's only ornament. */}
        <WirdMark className="absolute -bottom-24 -start-24 h-[26rem] w-[26rem] text-white/6" />

        <div className="relative flex h-full flex-col justify-between p-12">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/12 text-white ring-1 ring-white/20">
              <WirdMark className="h-6.5 w-6.5" />
            </div>
            <span className="font-display text-2xl font-medium text-white">ورد</span>
          </div>

          <div className="max-w-md">
            <p className="font-display text-3xl leading-[1.6] text-white">
              خير الأعمال أدومها وإن قلّ
            </p>
            <p className="mt-4 text-sm leading-relaxed text-primary-100/70">
              متابعة الورد اليومي: حفظ جديد، مراجعة صغرى، ومراجعة كبرى — لكل مجموعة ولكل موظف.
            </p>
          </div>
        </div>
      </div>

      <div className="flex flex-1 items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex flex-col items-center gap-3 text-center lg:hidden">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-linear-to-br from-primary-700 to-primary-900 text-white shadow-glow">
              <WirdMark className="h-8 w-8" />
            </div>
            <span className="font-display text-2xl font-medium text-neutral-900">ورد</span>
          </div>

          <h1 className="font-display text-2xl font-medium text-neutral-900">{title}</h1>
          {description && (
            <p className="mt-1.5 text-sm leading-relaxed text-neutral-500">{description}</p>
          )}

          <div className="mt-7">{children}</div>
        </div>
      </div>
    </div>
  );
}
