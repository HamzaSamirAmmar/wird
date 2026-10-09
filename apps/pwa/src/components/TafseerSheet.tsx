import * as React from 'react';
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Copy,
  Minus,
  Play,
  Plus,
  Share2,
  X,
} from 'lucide-react';
import { getSurah, globalAyahIndex } from '@wird/quran-data';
import { cn } from '@wird/ui-web';
import { haptic } from '../lib/celebrate';
import { ayahText, loadTafseer, type Tafseer, type TafseerPassage } from '../lib/tafseer';
import { HAFS_FAMILY, type MushafData } from '../lib/mushaf';
import { BottomSheet, useSheetClose } from './BottomSheet';

export interface AyahRefHit {
  surah: number;
  ayah: number;
}

const ar = (n: number) => n.toLocaleString('ar-u-nu-latn');
/** The ayah-end medallion: the Hafs font draws Arabic-Indic digits as the ornament itself. */
const endMark = (n: number) => n.toLocaleString('ar-u-nu-arab');

const SIZE_KEY = 'wird.tafseer.size';
const SIZES = [14, 15, 17, 19, 22] as const;

function readSize(): number {
  try {
    const i = Number(localStorage.getItem(SIZE_KEY));
    return Number.isInteger(i) && i >= 0 && i < SIZES.length ? i : 1;
  } catch {
    return 1;
  }
}

function sameAyah(a: AyahRefHit, b: AyahRefHit) {
  return a.surah === b.surah && a.ayah === b.ayah;
}

/**
 * The ayah sheet: the ayat in the muṣḥaf's own type, then their التفسير الميسر — all
 * offline (the tafseer asset is precached). Opened by a long-press (touch), a click, or a
 * right-click on an ayah.
 *
 * It works in the book's own units: al-Muyassar explains some runs of ayat as one passage,
 * so the sheet shows that passage once, with every ayah it covers («تفسير الآيات ١–١٤»),
 * and the arrows step passage by passage through the ayat on the wird's pages. The reader
 * highlights the whole passage (`onPassage`). A surah's introduction folds open above the
 * passage that starts it.
 */
export function TafseerSheet({
  hit,
  data,
  list,
  onSelect,
  onPassage,
  onClose,
  onListen,
}: {
  hit: AyahRefHit;
  data: MushafData | null;
  /** Every ayah the reader shows, in muṣḥaf order — what the arrows walk through. */
  list: AyahRefHit[];
  onSelect: (hit: AyahRefHit) => void;
  /** The ayat the shown passage covers, for the reader's highlight. */
  onPassage: (passage: TafseerPassage | null) => void;
  onClose: () => void;
  onListen: (from: AyahRefHit) => void;
}) {
  const [tafseer, setTafseer] = React.useState<Tafseer | null | undefined>(undefined);
  const [copied, setCopied] = React.useState(false);
  const [size, setSize] = React.useState(readSize);
  const [introOpen, setIntroOpen] = React.useState(false);
  const bodyRef = React.useRef<HTMLDivElement>(null);
  const close = useSheetClose();

  React.useEffect(() => {
    let alive = true;
    loadTafseer()
      .then((t) => alive && setTafseer(t))
      .catch(() => alive && setTafseer(null));
    return () => {
      alive = false;
    };
  }, []);

  React.useEffect(() => {
    try {
      localStorage.setItem(SIZE_KEY, String(size));
    } catch {
      /* private mode — the size lasts for this visit */
    }
  }, [size]);

  const passage: TafseerPassage | null = tafseer ? tafseer.passageOf(hit.surah, hit.ayah) : null;
  const passageKey = passage ? `${passage.surah}:${passage.ayahFrom}` : null;

  // The reader highlights the whole passage; a new passage starts at the top, intro folded.
  React.useEffect(() => {
    onPassage(passage);
    setIntroOpen(false);
    bodyRef.current?.scrollTo({ top: 0 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [passageKey]);
  React.useEffect(() => () => onPassage(null), [onPassage]);

  // Passage-wise neighbours within the wird's pages: the next passage starts at the first
  // listed ayah after this one ends; the previous one is whatever covers the ayah before.
  const { prev, next } = React.useMemo(() => {
    const from = passage ?? { surah: hit.surah, ayahFrom: hit.ayah, ayahTo: hit.ayah };
    const first = globalAyahIndex(from.surah, from.ayahFrom);
    const last = globalAyahIndex(from.surah, from.ayahTo);
    let p: AyahRefHit | null = null;
    let n: AyahRefHit | null = null;
    for (const a of list) {
      const g = globalAyahIndex(a.surah, a.ayah);
      if (g < first) p = a;
      else if (g > last) {
        n = a;
        break;
      }
    }
    return { prev: p, next: n };
  }, [list, passage, hit]);

  const go = React.useCallback(
    (to: AyahRefHit | null) => {
      if (!to) return;
      haptic(6);
      // Land on the passage's first ayah when it is on the wird's pages.
      const p = tafseer?.passageOf(to.surah, to.ayah);
      const start = p ? { surah: p.surah, ayah: p.ayahFrom } : to;
      onSelect(list.some((a) => sameAyah(a, start)) ? start : to);
    },
    [tafseer, list, onSelect],
  );

  // Keyboard: the arrows step passages (muṣḥaf order — the next lies to the left).
  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'ArrowLeft') go(next);
      else if (e.key === 'ArrowRight') go(prev);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go, next, prev]);

  const surah = getSurah(hit.surah);
  const from = passage?.ayahFrom ?? hit.ayah;
  const to = passage?.ayahTo ?? hit.ayah;
  const multi = to > from;
  const ayat = React.useMemo(() => {
    const out: { ayah: number; text: string }[] = [];
    if (!data) return out;
    for (let a = from; a <= to; a++) out.push({ ayah: a, text: ayahText(data, hit.surah, a) });
    return out;
  }, [data, hit.surah, from, to]);
  const intro = tafseer && passage && passage.ayahFrom === 1 ? tafseer.introOf(hit.surah) : '';
  const title = multi ? `الآيات ${ar(from)}–${ar(to)}` : `الآية ${ar(from)}`;
  const canShare = typeof navigator.share === 'function';

  function block(): string {
    const text = ayat.map((a) => `${a.text} (${ar(a.ayah)})`).join(' ');
    return `سورة ${surah.nameAr} · ${title}\n${text}\n\nالتفسير الميسر:\n${passage?.text ?? ''}`;
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
      await navigator.share({ title: `سورة ${surah.nameAr} · ${title}`, text: block() });
    } catch {
      /* share sheet dismissed */
    }
  }

  return (
    <BottomSheet label="تفسير الآية" onClose={onClose}>
      <>
        <div className="flex flex-none items-center justify-between gap-1 border-b border-[#b08a3e]/25 bg-[#f7efd9] px-2 py-2">
          {/* Muṣḥaf order: the previous passage lies to the right. */}
          <NavButton label="التفسير السابق" disabled={!prev} onClick={() => go(prev)}>
            <ChevronRight className="h-5 w-5" />
          </NavButton>
          <div className="min-w-0 flex-1 text-center">
            <div className="font-display text-base leading-tight text-[#0b4f55]">
              سورة {surah.nameAr}
            </div>
            <div className="mt-0.5 flex items-center justify-center gap-1.5 text-[11px] text-[#9c7025]">
              <span className="font-semibold">{title}</span>
              <span aria-hidden>·</span>
              <span>التفسير الميسر</span>
            </div>
          </div>
          <NavButton label="التفسير التالي" disabled={!next} onClick={() => go(next)}>
            <ChevronLeft className="h-5 w-5" />
          </NavButton>
          <NavButton label="إغلاق" onClick={close}>
            <X className="h-5 w-5" />
          </NavButton>
        </div>

        <div
          ref={bodyRef}
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-5 pt-4"
        >
          {ayat.length > 0 && (
            <p
              dir="rtl"
              className="rounded-2xl bg-[#fdfaf1] px-4 py-3.5 text-center leading-[2.15] text-[#161616] ring-1 ring-[#b08a3e]/25"
              style={{ fontFamily: `${HAFS_FAMILY}, serif`, fontSize: multi ? 20 : 22 }}
            >
              {ayat.map((a) => (
                <React.Fragment key={a.ayah}>
                  {a.text} <span className="text-[#8a6a1f]">{endMark(a.ayah)}</span>{' '}
                </React.Fragment>
              ))}
            </p>
          )}

          {intro && (
            <div className="mt-3 overflow-hidden rounded-2xl bg-[#0b4f55]/5 ring-1 ring-[#0b4f55]/10">
              <button
                type="button"
                onClick={() => setIntroOpen((v) => !v)}
                aria-expanded={introOpen}
                className="flex w-full items-center justify-between px-4 py-2.5 text-start text-sm font-semibold text-[#0b4f55]"
              >
                <span>التعريف بسورة {surah.nameAr}</span>
                <ChevronDown
                  className={cn('h-4 w-4 transition-transform', introOpen && 'rotate-180')}
                />
              </button>
              {introOpen && (
                <div className="border-t border-[#0b4f55]/10 px-4 pb-3 pt-2">
                  <TafseerText text={intro} size={Math.max(13, SIZES[size]! - 1)} />
                </div>
              )}
            </div>
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
              <TafseerText text={passage?.text ?? ''} size={SIZES[size]!} />
            )}
          </div>
        </div>

        <div className="flex flex-none items-center gap-2 border-t border-neutral-100 px-4 pb-3 pt-3">
          <button
            type="button"
            onClick={() => {
              close();
              onListen({ surah: hit.surah, ayah: from });
            }}
            className="flex h-11 flex-1 items-center justify-center gap-2 rounded-full bg-[#0b4f55] text-sm font-semibold text-white transition-colors hover:bg-[#0e5a61] active:bg-[#083f44]"
          >
            <Play className="h-4 w-4" />
            استماع
          </button>
          {/* Reading size, remembered on the device. */}
          <div className="flex h-11 items-center rounded-full bg-[#0b4f55]/8 text-[#0b4f55]">
            <button
              type="button"
              onClick={() => setSize((s) => Math.max(0, s - 1))}
              disabled={size === 0}
              aria-label="تصغير الخط"
              className="flex h-11 w-9 items-center justify-center rounded-full disabled:opacity-30"
            >
              <Minus className="h-3.5 w-3.5" />
            </button>
            <span className="text-xs font-semibold" aria-hidden>
              أ
            </span>
            <button
              type="button"
              onClick={() => setSize((s) => Math.min(SIZES.length - 1, s + 1))}
              disabled={size === SIZES.length - 1}
              aria-label="تكبير الخط"
              className="flex h-11 w-9 items-center justify-center rounded-full disabled:opacity-30"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>
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
            aria-label="نسخ"
            className={cn(
              'flex h-11 items-center justify-center gap-2 rounded-full px-4 text-sm font-semibold transition-colors',
              copied
                ? 'bg-mint-600 text-white'
                : 'bg-[#0b4f55]/8 text-[#0b4f55] hover:bg-[#0b4f55]/12',
            )}
          >
            <Copy className="h-4 w-4" />
            <span className="hidden min-[400px]:inline">{copied ? 'تم النسخ' : 'نسخ'}</span>
          </button>
        </div>
      </>
    </BottomSheet>
  );
}

function NavButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[#0b4f55] transition-colors hover:bg-[#0b4f55]/8 disabled:opacity-25"
    >
      {children}
    </button>
  );
}

/**
 * Tafseer prose: paragraphs and `•` bullets, with the Qur'an words it quotes («﴿…﴾») set
 * in the muṣḥaf's type and colour so the explanation reads apart from what it explains.
 */
function TafseerText({ text, size }: { text: string; size: number }) {
  const paras = text.split(/\n+/).filter((p) => p.trim());
  return (
    <div className="space-y-3 leading-[2] text-neutral-800" style={{ fontSize: size }}>
      {paras.map((p, i) => {
        const heading = p === 'تسمية السورة' || p === 'من مقاصد السورة';
        return heading ? (
          <h3 key={i} className="text-sm font-bold text-[#9c7025]">
            {p}
          </h3>
        ) : (
          <p key={i} className={cn(p.startsWith('•') && 'ps-4 -indent-4')}>
            {p.split(/(﴿[^﴾]*﴾)/).map((part, j) =>
              part.startsWith('﴿') ? (
                <span
                  key={j}
                  className="text-[#0b4f55]"
                  style={{ fontFamily: `${HAFS_FAMILY}, serif`, fontSize: '1.12em' }}
                >
                  {part}
                </span>
              ) : (
                part
              ),
            )}
          </p>
        );
      })}
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
