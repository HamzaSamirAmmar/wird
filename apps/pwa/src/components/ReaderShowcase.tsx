import * as React from 'react';
import { BookOpen, TextQuote, Volume2 } from 'lucide-react';
import { cn } from '@wird/ui-web';

const ar = (n: number) => n.toLocaleString('ar-u-nu-latn');

interface Slide {
  icon: typeof BookOpen;
  kicker: string;
  title: string;
  body: string;
}

/** How the reader's new capabilities are surfaced once, in the reader itself. */
const SLIDES: Slide[] = [
  {
    icon: BookOpen,
    kicker: 'القراءة',
    title: 'اقرأ كما تقرأ في المصحف',
    body: 'اسحب لتقليب الصفحات، وقرّب بإصبعيك أو بالنقر المزدوج. وأثناء التكبير، اسحب من حافة الصفحة لتقليبها دون أن تعود للتصغير.',
  },
  {
    icon: TextQuote,
    kicker: 'التفسير',
    title: 'تفسير الآية بين يديك',
    body: 'اضغط ضغطًا مطولًا على أي آية — أو انقر عليها بالفأرة — فيظهر تفسيرها من «التفسير الميسر»، مع تنقّل بين الآيات واستماع مباشر. يعمل دون اتصال.',
  },
  {
    icon: Volume2,
    kicker: 'الاستماع',
    title: 'استمع لوردك بصوت قارئك المفضل',
    body: 'اختر القارئ واسمع الورد كاملًا أو آية واحدة، مع تظليل الآية الجارية وتقليب الصفحات تلقائيًا. ونزّل الصوت مسبقًا لتستمع دون اتصال.',
  },
];

const SEEN_KEY = 'wird.showcase.reader.v1';

/** True until the user has seen (or skipped) the showcase once. */
export function showcaseUnseen(): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) !== '1';
  } catch {
    return false;
  }
}

function markSeen(): void {
  try {
    localStorage.setItem(SEEN_KEY, '1');
  } catch {
    /* private mode — it will simply show again next visit */
  }
}

/**
 * A three-beat tour of the reader (reading, tafseer, listening), shown the first time the
 * reader opens and replayable from its help button. Deliberately small: one card, dots,
 * next — no spotlight machinery.
 */
export function ReaderShowcase({ onClose }: { onClose: () => void }) {
  const [i, setI] = React.useState(0);
  const slide = SLIDES[i]!;
  const last = i === SLIDES.length - 1;

  function finish() {
    markSeen();
    onClose();
  }

  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') finish();
      if (e.key === 'ArrowLeft' && !last) setI((v) => v + 1);
      if (e.key === 'ArrowRight' && i > 0) setI((v) => v - 1);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i, last]);

  const Icon = slide.icon;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="جولة في القارئ">
      <button
        type="button"
        aria-label="تخطّي"
        className="absolute inset-0 cursor-default bg-[#083f44]/80 backdrop-blur-sm"
        onClick={finish}
      />
      <div className="animate-scale-in relative w-full max-w-sm overflow-hidden rounded-3xl bg-white shadow-2xl">
        <div className="relative flex flex-col items-center px-6 pb-6 pt-8 text-center">
          <span className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-[#f7efd9] ring-1 ring-[#b08a3e]/30">
            <Icon className="h-8 w-8 text-[#0b4f55]" strokeWidth={1.75} />
          </span>
          <div className="text-[11px] font-semibold tracking-wide text-[#9c7025]">
            {slide.kicker}
          </div>
          <h2 className="mt-1 font-display text-xl text-[#0b4f55]">{slide.title}</h2>
          <p className="mt-3 text-[13.5px] leading-[1.9] text-neutral-600">{slide.body}</p>

          <div className="mt-6 flex w-full items-center justify-between gap-3">
            <button
              type="button"
              onClick={finish}
              className="h-10 rounded-full px-4 text-[13px] font-semibold text-neutral-500 transition-colors hover:bg-neutral-100"
            >
              تخطّي
            </button>
            <div className="flex items-center gap-1.5" aria-hidden>
              {SLIDES.map((s, k) => (
                <span
                  key={s.title}
                  className={cn(
                    'h-1.5 rounded-full transition-all',
                    k === i ? 'w-5 bg-[#e0bc66]' : 'w-1.5 bg-neutral-300',
                  )}
                />
              ))}
            </div>
            <button
              type="button"
              onClick={() => (last ? finish() : setI(i + 1))}
              className="flex h-10 min-w-24 items-center justify-center rounded-full bg-[#0b4f55] px-5 text-[13px] font-semibold text-white transition-colors hover:bg-[#0e5a61]"
            >
              {last ? 'ابدأ القراءة' : `التالي (${ar(i + 1)}/${ar(SLIDES.length)})`}
            </button>
          </div>
        </div>
        {/* The muṣḥaf's gold rule, echoing the reader's chrome. */}
        <div className="h-[3px] bg-linear-to-l from-[#b08a3e] via-[#e0bc66] to-[#b08a3e]" />
      </div>
    </div>
  );
}
