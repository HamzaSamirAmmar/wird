import * as React from 'react';
import { BannerRail } from '../components/BannerRail';
export default function Preview() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col bg-canvas">
      <header className="relative overflow-hidden bg-linear-to-br from-primary-700 via-primary-800 to-primary-950 px-4 pb-4 pt-safe">
        <div className="relative pt-3 text-[11px] text-primary-100/70">السلام عليكم</div>
        <div className="relative"><BannerRail /></div>
      </header>
    </div>
  );
}
