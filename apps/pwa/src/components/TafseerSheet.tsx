import * as React from 'react';
import { Copy, Play, X } from 'lucide-react';
import { getSurah, globalAyahIndex } from '@wird/quran-data';
import { cn } from '@wird/ui-web';
import { haptic } from '../lib/celebrate';
import { ayahText, loadTafseer } from '../lib/tafseer';
import { HAFS_FAMILY, type MushafData } from '../lib/mushaf';

export interface AyahRefHit {
  surah: number;
  ayah: number;
}

const ar = (n: number) => n.toLocaleString('ar-u-nu-latn');

/**
 * The long-press sheet: the ayah in the muṣḥaf's own type, then its التفسير الميسر —
 * all offline (the tafseer asset is precached). «استماع» hands the ayah to the reciter
 * player; «نسخ» puts ayah + tafseer on the clipboard as one block.
 */
export function TafseerSheet({
  hit,
  data,
  onClose,
  onListen,
}: {
  hit: AyahRefHit;
  data: MushafData | null;
  onClose: () => void;
  onListen: (from: AyahRefHit) => void;
}) {
  const [tafseer, setTafseer] = React.useState<string | null | undefined>(undefined);
  const [copied, setCopied] = React.useState(false);

  React.useEffect(() => {
    let alive = true;
    loadTafseer()
      .then((rows) => {
        if (alive) setTafseer(rows[globalAyahIndex(hit.surah, hit.ayah) - 1] ?? '');
      })
      .catch(() => alive && setTafseer(null));
    return () => {
      alive = false;
    };
  }, [hit]);

  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const surah = getSurah(hit.surah);
  const text = data ? ayahText(data, hit.surah, hit.ayah) : '';

  async function copy() {
    const block = `${surah.nameAr} (${ar(hit.ayah)})\n${text}\n\nالتفسير الميسر:\n${tafseer ?? ''}`;
    try {
      await navigator.clipboard.writeText(block);
      haptic(10);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard denied — the button just does nothing */
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end" role="dialog" aria-modal="true">
      <button
        type="button"
        aria-label="إغلاق"
        className="absolute inset-0 cursor-default bg-black/35 backdrop-blur-[2px]"
        onClick={onClose}
      />
      <div className="animate-slide-up relative mx-auto flex max-h-[85dvh] w-full max-w-xl flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl">
        <div className="flex flex-none items-center justify-between border-b border-[#b08a3e]/25 bg-[#f7efd9] px-4 py-3">
          <div className="min-w-0">
            <div className="font-display text-base text-[#0b4f55]">
              سورة {surah.nameAr} · الآية {ar(hit.ayah)}
            </div>
            <div className="mt-0.5 text-[11px] text-[#9c7025]">التفسير الميسر</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="إغلاق"
            className="flex h-9 w-9 flex-none items-center justify-center rounded-full text-[#0b4f55] transition-colors hover:bg-[#0b4f55]/8"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">
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

        <div className="flex flex-none items-center gap-2 border-t border-neutral-100 px-4 pb-safe pt-3">
          <button
            type="button"
            onClick={() => onListen(hit)}
            className="flex h-11 flex-1 items-center justify-center gap-2 rounded-full bg-[#0b4f55] text-sm font-semibold text-white transition-colors hover:bg-[#0e5a61] active:bg-[#083f44]"
          >
            <Play className="h-4 w-4" />
            استماع
          </button>
          <button
            type="button"
            onClick={copy}
            className={cn(
              'flex h-11 items-center justify-center gap-2 rounded-full px-5 text-sm font-semibold transition-colors',
              copied
                ? 'bg-mint-600 text-white'
                : 'bg-[#0b4f55]/8 text-[#0b4f55] hover:bg-[#0b4f55]/12',
            )}
          >
            <Copy className="h-4 w-4" />
            {copied ? 'تم النسخ' : 'نسخ'}
          </button>
        </div>
      </div>
    </div>
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
