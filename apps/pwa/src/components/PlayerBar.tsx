import { Pause, Play, Repeat, SkipBack, SkipForward, Volume2, X } from 'lucide-react';
import { getSurah } from '@wird/quran-data';
import { cn } from '@wird/ui-web';
import { reciterById } from '../lib/reciters';
import { useWirdPlayerSnapshot, wirdPlayer } from '../lib/wirdPlayer';

const ar = (n: number) => n.toLocaleString('ar-u-nu-latn');

/**
 * The slim player docked under the reading area while a wird plays: where you are, the
 * reciter, and the controls (prev / play–pause / next, ×7 repeat, speed, stop). Mirrors
 * the Media Session handlers — the lock screen and this bar do the same things.
 */
export function PlayerBar() {
  const player = useWirdPlayerSnapshot();
  const current = player.queue[player.index];
  if (!current) return null;
  const surah = getSurah(current.surah);
  const reciter = reciterById(player.reciterId);
  const playing = player.status === 'playing' || player.status === 'loading';

  return (
    <div className="flex flex-none items-center gap-2 border-t border-[#b08a3e]/40 bg-[#0b4f55] px-3 py-2 text-white">
      <Volume2 className="h-4 w-4 flex-none text-[#e0bc66]" />

      <div className="min-w-0 flex-1 leading-tight">
        <div className="truncate text-[13px] font-semibold">
          {surah.nameAr} · الآية {ar(current.ayah)}
          <span className="text-white/55"> / {ar(player.queue.length)}</span>
        </div>
        <div className="truncate text-[11px] text-white/65">
          {reciter.note ? `${reciter.name} (${reciter.note})` : reciter.name}
          {player.error ? <span className="text-red-300"> · {player.error}</span> : null}
        </div>
      </div>

      <button
        type="button"
        onClick={() => wirdPlayer.setRepeatEach(!player.repeatEach)}
        aria-pressed={player.repeatEach}
        aria-label="تكرار كل آية سبع مرات"
        title="تكرار كل آية ×٧"
        className={cn(
          'relative flex h-8 w-8 flex-none items-center justify-center rounded-full transition-colors',
          player.repeatEach ? 'bg-[#e0bc66] text-[#0b4f55]' : 'hover:bg-white/10',
        )}
      >
        <Repeat className="h-3.5 w-3.5" />
        {player.repeatEach && (
          <span className="absolute -end-0.5 -top-1 text-[9px] font-bold leading-none">
            {ar(7)}
          </span>
        )}
      </button>

      <button
        type="button"
        onClick={() => wirdPlayer.cycleSpeed()}
        aria-label="سرعة التشغيل"
        title="سرعة التشغيل"
        className="h-8 min-w-10 flex-none rounded-full px-1 text-[11px] font-bold tabular-nums transition-colors hover:bg-white/10"
      >
        ×{player.speed.toLocaleString('ar-u-nu-latn')}
      </button>

      <div className="flex flex-none items-center gap-0.5">
        <button
          type="button"
          onClick={() => wirdPlayer.prev()}
          aria-label="الآية السابقة"
          className="flex h-9 w-9 items-center justify-center rounded-full transition-colors hover:bg-white/10"
        >
          <SkipForward className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => wirdPlayer.toggle()}
          aria-label={playing ? 'إيقاف مؤقت' : 'تشغيل'}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-[#e0bc66] text-[#0b4f55] transition-colors hover:bg-[#d2a343]"
        >
          {playing ? <Pause className="h-4.5 w-4.5" /> : <Play className="h-4.5 w-4.5" />}
        </button>
        <button
          type="button"
          onClick={() => wirdPlayer.next()}
          aria-label="الآية التالية"
          className="flex h-9 w-9 items-center justify-center rounded-full transition-colors hover:bg-white/10"
        >
          <SkipBack className="h-4 w-4" />
        </button>
      </div>

      <button
        type="button"
        onClick={() => wirdPlayer.stop()}
        aria-label="إيقاف الاستماع"
        className="flex h-8 w-8 flex-none items-center justify-center rounded-full text-white/70 transition-colors hover:bg-white/10"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
