import * as React from 'react';
import { Check, Download, Play, Trash2, Volume2 } from 'lucide-react';
import { globalAyahIndex, type AyahRef } from '@wird/quran-data';
import { cn } from '@wird/ui-web';
import { haptic } from '../lib/celebrate';
import { useOnline } from '../lib/connectivity';
import {
  RECITERS,
  reciterById,
  reciterLabel,
  type AudioBitrate,
} from '../lib/reciters';
import {
  clearAudioCache,
  countCached,
  downloadAudios,
  queueUrls,
  requestPersistentStorage,
} from '../lib/audioOffline';
import { useWirdPlayerSnapshot, wirdPlayer } from '../lib/wirdPlayer';
import { BottomSheet } from './BottomSheet';
import type { AyahRefHit } from './TafseerSheet';

const ar = (n: number) => n.toLocaleString('ar-u-nu-latn');

/**
 * «استماع»: everything about recitation in one place — the reciter, the quality, the
 * memorization aids (×7 repeat, speed), the offline download of this wird's audio, and
 * the play scopes (whole wird / from a chosen ayah / that ayah alone).
 */
export function ListenSheet({
  queue,
  fromAyah,
  onClose,
}: {
  /** The wird's ayat in order — the playback queue and the download set. */
  queue: AyahRef[];
  /** An ayah the reader has selected (long-press), if any. */
  fromAyah: AyahRefHit | null;
  onClose: () => void;
}) {
  const player = useWirdPlayerSnapshot();
  const online = useOnline();
  const [pickingReciter, setPickingReciter] = React.useState(false);
  const [cached, setCached] = React.useState<number | null>(null);
  const [downloading, setDownloading] = React.useState<{ done: number; total: number } | null>(
    null,
  );

  const urls = React.useMemo(
    () => queueUrls(queue.map((a) => globalAyahIndex(a.surah, a.ayah)), player.reciterId, player.bitrate),
    [queue, player.reciterId, player.bitrate],
  );

  const refreshCached = React.useCallback(() => {
    void countCached(urls).then(setCached);
  }, [urls]);

  React.useEffect(refreshCached, [refreshCached]);

  const reciter = reciterById(player.reciterId);
  const fullyCached = cached !== null && cached >= urls.length && urls.length > 0;
  // The CDN's per-ayah files average ~90 KB at 128 kbps and ~45 KB at 64.
  const estMb = ((queue.length * (player.bitrate === 128 ? 0.09 : 0.045))).toFixed(1);

  function requestClose() {
    if (!downloading) onClose();
  }

  async function download() {
    if (downloading) return;
    haptic(10);
    await requestPersistentStorage();
    setDownloading({ done: 0, total: urls.length });
    const failed = await downloadAudios(urls, (p) => setDownloading(p));
    setDownloading(null);
    refreshCached();
    if (failed > 0) window.setTimeout(() => haptic([30, 60, 30]), 0);
  }

  function playFrom(i: number) {
    onClose();
    wirdPlayer.playQueue(queue, i);
  }

  const startIndex = fromAyah
    ? queue.findIndex((a) => a.surah === fromAyah.surah && a.ayah === fromAyah.ayah)
    : -1;

  return (
    <BottomSheet label="استماع إلى الورد" onClose={requestClose}>
      <div className="flex flex-none items-center justify-between border-b border-[#b08a3e]/25 bg-[#f7efd9] px-4 py-3">
        <div className="flex items-center gap-2 font-display text-base text-[#0b4f55]">
          <Volume2 className="h-5 w-5" />
          استماع إلى الورد
        </div>
        <span className="text-[11px] text-[#9c7025]">اسحب للأسفل للإغلاق</span>
      </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">
          {/* ── Reciter ── */}
          <button
            type="button"
            onClick={() => setPickingReciter((v) => !v)}
            className="flex w-full items-center justify-between rounded-2xl bg-[#f7efd9] px-4 py-3 text-start ring-1 ring-[#b08a3e]/25 transition-colors hover:bg-[#f4ead0]"
          >
            <span>
              <span className="block text-[11px] font-semibold text-[#9c7025]">القارئ</span>
              <span className="mt-0.5 block text-sm font-semibold text-[#0b4f55]">
                {reciterLabel(reciter)}
              </span>
            </span>
            <span className="text-xs text-[#0b4f55]/60">
              {pickingReciter ? 'إخفاء' : `اختيار (${ar(RECITERS.length)})`}
            </span>
          </button>

          {pickingReciter && (
            <ul className="mt-2 max-h-64 overflow-y-auto rounded-2xl ring-1 ring-neutral-200">
              {RECITERS.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => wirdPlayer.setReciter(r.id)}
                    className={cn(
                      'flex w-full items-center justify-between px-4 py-2.5 text-start text-sm transition-colors',
                      r.id === player.reciterId
                        ? 'bg-primary-50 font-semibold text-primary-800'
                        : 'text-neutral-700 hover:bg-neutral-50',
                    )}
                  >
                    <span>{reciterLabel(r)}</span>
                    {r.id === player.reciterId && <Check className="h-4 w-4" />}
                  </button>
                </li>
              ))}
            </ul>
          )}

          {/* ── Quality ── */}
          <div className="mt-4">
            <div className="mb-1.5 text-[11px] font-semibold text-[#9c7025]">جودة الصوت</div>
            <div className="flex gap-2">
              {([128, 64] as AudioBitrate[]).map((b) => (
                <button
                  key={b}
                  type="button"
                  onClick={() => wirdPlayer.setBitrate(b)}
                  className={cn(
                    'h-10 flex-1 rounded-xl text-sm font-semibold transition-colors',
                    player.bitrate === b
                      ? 'bg-[#0b4f55] text-white'
                      : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200',
                  )}
                >
                  {b === 128 ? 'عالية (128kbps)' : 'موفّرة (64kbps)'}
                </button>
              ))}
            </div>
          </div>

          {/* ── Memorization aids ── */}
          <div className="mt-4 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => wirdPlayer.setRepeatEach(!player.repeatEach)}
              aria-pressed={player.repeatEach}
              className={cn(
                'h-10 rounded-xl text-sm font-semibold transition-colors',
                player.repeatEach
                  ? 'bg-[#9c7025] text-white'
                  : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200',
              )}
            >
              تكرار كل آية ×{ar(7)}
            </button>
            <button
              type="button"
              onClick={() => wirdPlayer.cycleSpeed()}
              className="h-10 rounded-xl bg-neutral-100 text-sm font-semibold text-neutral-600 transition-colors hover:bg-neutral-200"
            >
              السرعة ×{player.speed.toLocaleString('ar-u-nu-latn')}
            </button>
          </div>

          {/* ── Offline download ── */}
          <div className="mt-4 rounded-2xl bg-[#f7f9f9] p-3 ring-1 ring-neutral-200/70">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={download}
                disabled={!online || downloading !== null || fullyCached}
                className={cn(
                  'flex h-10 flex-1 items-center justify-center gap-2 rounded-full text-sm font-semibold transition-colors disabled:opacity-50',
                  fullyCached
                    ? 'bg-mint-600 text-white'
                    : 'bg-[#0b4f55] text-white hover:bg-[#0e5a61]',
                )}
              >
                {downloading ? (
                  <>
                    <Download className="h-4 w-4 animate-bounce" />
                    {ar(downloading.done)} من {ar(downloading.total)}
                  </>
                ) : fullyCached ? (
                  <>
                    <Check className="h-4 w-4" />
                    الصوت منزّل بالكامل
                  </>
                ) : (
                  <>
                    <Download className="h-4 w-4" />
                    تنزيل صوت الورد ({ar(queue.length)} آية)
                  </>
                )}
              </button>
              {(cached ?? 0) > 0 && !downloading && (
                <button
                  type="button"
                  onClick={async () => {
                    await clearAudioCache();
                    refreshCached();
                  }}
                  aria-label="مسح الصوتيات المنزّلة"
                  title="مسح الصوتيات المنزّلة"
                  className="flex h-10 w-10 flex-none items-center justify-center rounded-full text-red-700 transition-colors hover:bg-red-50"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-neutral-500">
              {!online
                ? 'التنزيل يحتاج اتصالاً بالإنترنت.'
                : downloading
                  ? 'جارٍ التنزيل — يمكنك إغلاق النافذة والمتابعة بالقراءة.'
                  : fullyCached
                    ? 'يعمل هذا الورد صوتيًا دون اتصال.'
                    : cached !== null && cached > 0
                      ? `منزّل ${ar(cached)} من ${ar(urls.length)} — يتم استكمال التنزيل عند الطلب.`
                      : `الاستماع يحتاج اتصالاً بالإنترنت ما لم تنزّل الصوت مسبقًا (الحجم التقريبي ${estMb} ميغابايت).`}
            </p>
          </div>
        </div>

        {/* ── Play ── */}
        <div className="flex flex-none flex-col gap-2 border-t border-neutral-100 px-4 pb-3 pt-3">
          <button
            type="button"
            onClick={() => playFrom(0)}
            className="flex h-12 items-center justify-center gap-2 rounded-full bg-[#0b4f55] text-sm font-semibold text-white transition-colors hover:bg-[#0e5a61] active:bg-[#083f44]"
          >
            <Play className="h-4 w-4" />
            تشغيل الورد كامل
          </button>
          {fromAyah && startIndex >= 0 && (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => playFrom(startIndex)}
                className="h-11 flex-1 rounded-full bg-[#0b4f55]/8 text-sm font-semibold text-[#0b4f55] transition-colors hover:bg-[#0b4f55]/12"
              >
                من الآية {ar(fromAyah.ayah)}
              </button>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  wirdPlayer.playQueue([queue[startIndex]!], 0);
                }}
                className="h-11 flex-1 rounded-full bg-[#0b4f55]/8 text-sm font-semibold text-[#0b4f55] transition-colors hover:bg-[#0b4f55]/12"
              >
                الآية فقط
              </button>
            </div>
          )}
        </div>
    </BottomSheet>
  );
}
