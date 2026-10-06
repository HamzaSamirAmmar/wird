import * as React from 'react';
import { ChevronLeft, ChevronRight, Copy, Play, Share2, X } from 'lucide-react';
import { getSurah, globalAyahIndex } from '@wird/quran-data';
import { cn } from '@wird/ui-web';
import { haptic } from '../lib/celebrate';
import { ayahText, loadTafseer } from '../lib/tafseer';
import { HAFS_FAMILY, type MushafData } from '../lib/mushaf';
import { BottomSheet } from './BottomSheet';

export interface AyahRefHit {
  surah: number;
  ayah: number;
}

const ar = (n: number) => n.toLocaleString('ar-u-nu-latn');

/**
 * The ayah sheet: the ayah in the muṣḥaf's own type, then its التفسير الميسر — all
 * offline (the tafseer asset is precached). Opened by a long-press (touch), a click, or a
 * right-click on an ayah. Arrows walk through the wird's ayat one by one; «استماع» hands
 * the ayah to the reciter player; «نسخ»/«مشاركة» carry ayah + tafseer out.
 */
export function TafseerSheet({
  hit,
  data,
  prev,
  next,
  onNavigate,
  onClose,
  onListen,
}: {
  hit: AyahRefHit;
  data: MushafData | null;
  /** The neighbouring ayat within the wird's pages, or null at either end. */
  prev: AyahRefHit | null;
  next: AyahRefHit | null;
  onNavigate: (dir: 1 | -1) => void;
  onClose: () => void;
  onListen: (from: AyahRefHit) => void;
}) {
  const [tafseer, setTafseer] = React.useState<string | null | undefined>(undefined);
  const [copied, setCopied] = React.useState(false);

  React.useEffect(() => {
    let alive = true;
    setTafseer(undefined);
    loadTafseer()
      .then((rows) => {
        if (alive) setTafseer(rows[globalAyahIndex(hit.surah, hit.ayah) - 1] ?? '');
      })
      .catch(() => alive && setTafseer(null));
    return () => {
      alive = false;
    };
  }, [hit]);

  const surah = getSurah(hit.surah);
  const text = data ? ayahText(data, hit.surah, hit.ayah) : '';
  const canShare = typeof navigator.share === 'function';

  function block(): string {
    return `${surah.nameAr} (${ar(hit.ayah)})\n${text}\n\nالتفسير الميسر:\n${tafseer ?? ''}`;
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(block());
      haptic(10);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard denied — the button just does nothing */
    }
  }

  async function share() {
    try {
      await navigator.share({ title: `سورة ${surah.nameAr} · الآية ${ar(hit.ayah)}`, text: block() });
    } catch {
      /* share sheet dismissed */
    }
  }

  return (
    <BottomSheet label="تفسير الآية" onClose={onClose}>
      <div className="flex flex-none items-center justify-between border-b border-[#b08a3e]/25 bg-[#f7efd9] px-2 py-2.5">
        {/* Muṣḥaf order: the previous ayah lies to the right. */}
        <button
          type="button"
          onClick={() => prev && onNavigate(-1)}
          disabled={!prev}
          aria-label="الآية السابقة"
          className="flex h-10 w-10 items-center justify-center rounded-full text-[#0b4f55] transition-colors hover:bg-[#0b4f55]/8 disabled:opacity-25"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
        <div className="min-w-0 text-center">
          <div className="font-display text-base leading-tight text-[#0b4f55]">
            سورة {surah.nameAr}
          </div>
          <div className="mt-0.5 text-[11px] text-[#9c7025]">
            الآية {ar(hit.ayah)} · التفسير الميسر
          </div>
        </div>
        <div className="flex items-center">
          <button
            type="button"
            onClick={() => next && onNavigate(1)}
            disabled={!next}
            aria-label="الآية التالية"
            className="flex h-10 w-10 items-center justify-center rounded-full text-[#0b4f55] transition-colors hover:bg-[#0b4f55]/8 disabled:opacity-25"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="إغلاق"
            className="flex h-10 w-10 items-center justify-center rounded-full text-[#0b4f55] transition-colors hover:bg-[#0b4f55]/8"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-5 pt-4">
        {text && (
          <p
            dir="rtl"
            className="rounded-2xl bg-[#fdfaf1] p-4 text-center leading-[2.1] text-[#161616] ring-1 ring-[#b08a3e]/25"
            style={{ fontFamily: `${HAFS_FAMILY}, serif`, fontSize: 22 }}
          >
            {text}
          </p>
        )}

        <div className="mt-4">
          {tafseer === undefined ? (
            <div className="flex justify-center py-8">
              <SpinnerDots />
            </div>
          ) : tafseer === null ? (
            <p className="py-6 text-center text-sm text-neutral-500">
              تعذر تحميل التفسير — افتح التطبيق مرة واحدة وأنت متصل بالإنترنت.
            </p>
          ) : (
            <div className="space-y-3 text-[15px] leading-[2] text-neutral-800">
              {tafseer.split('\n').map((line, i) =>
                line.trim() ? (
                  <p key={i} className={cn(line.startsWith('•') && 'ps-4 -indent-4')}>
                    {line}
                  </p>
                ) : null,
              )}
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-none items-center gap-2 border-t border-neutral-100 px-4 pb-3 pt-3">
        <button
          type="button"
          onClick={() => onListen(hit)}
          className="flex h-11 flex-1 items-center justify-center gap-2 rounded-full bg-[#0b4f55] text-sm font-semibold text-white transition-colors hover:bg-[#0e5a61] active:bg-[#083f44]"
        >
          <Play className="h-4 w-4" />
          استماع
        </button>
        {canShare && (
          <button
            type="button"
            onClick={share}
            aria-label="مشاركة"
            className="flex h-11 w-11 items-center justify-center rounded-full bg-[#0b4f55]/8 text-[#0b4f55] transition-colors hover:bg-[#0b4f55]/12"
          >
            <Share2 className="h-4 w-4" />
          </button>
        )}
        <button
          type="button"
          onClick={copy}
          className={cn(
            'flex h-11 items-center justify-center gap-2 rounded-full px-5 text-sm font-semibold transition-colors',
            copied ? 'bg-mint-600 text-white' : 'bg-[#0b4f55]/8 text-[#0b4f55] hover:bg-[#0b4f55]/12',
          )}
        >
          <Copy className="h-4 w-4" />
          {copied ? 'تم النسخ' : 'نسخ'}
        </button>
      </div>
    </BottomSheet>
  );
}

function SpinnerDots() {
  return (
    <span className="flex items-center gap-1.5" aria-label="جارٍ التحميل">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="h-2 w-2 animate-pulse rounded-full bg-[#b08a3e]"
          style={{ animationDelay: `${i * 150}ms` }}
        />
      ))}
    </span>
  );
}
