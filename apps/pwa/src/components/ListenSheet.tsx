import * as React from 'react';
import { Check, ChevronDown, CloudOff, Download, Play, Search, Trash2, X } from 'lucide-react';
import { globalAyahIndex, type AyahRef } from '@wird/quran-data';
import { cn } from '@wird/ui-web';
import { haptic } from '../lib/celebrate';
import { useOnline } from '../lib/connectivity';
import { RECITERS, reciterById, reciterLabel } from '../lib/reciters';
import {
  clearAudioCache,
  countCached,
  downloadAudios,
  queueUrls,
  requestPersistentStorage,
} from '../lib/audioOffline';
import { useWirdPlayerSnapshot, wirdPlayer } from '../lib/wirdPlayer';
import { BottomSheet, useSheetClose } from './BottomSheet';
import type { AyahRefHit } from './TafseerSheet';

const ar = (n: number) => n.toLocaleString('ar-u-nu-latn');

/**
 * «استماع»: the reciter, three settings (quality, ×7 repeat, speed), the offline download
 * of this wird's audio, and the play buttons (whole wird / from a chosen ayah / that ayah).
 * Deliberately terse — every control says what it is, nothing explains how to use it.
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
  const [picking, setPicking] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const [cached, setCached] = React.useState<number | null>(null);
  const [downloading, setDownloading] = React.useState<{ done: number; total: number } | null>(
    null,
  );
  const close = useSheetClose();

  const urls = React.useMemo(
    () =>
      queueUrls(
        queue.map((a) => globalAyahIndex(a.surah, a.ayah)),
        player.reciterId,
        player.bitrate,
      ),
    [queue, player.reciterId, player.bitrate],
  );

  const refreshCached = React.useCallback(() => {
    void countCached(urls).then(setCached);
  }, [urls]);

  React.useEffect(refreshCached, [refreshCached]);

  const reciter = reciterById(player.reciterId);
  const needle = normalizeArabic(query.trim());
  const reciters = needle
    ? RECITERS.filter((r) => normalizeArabic(reciterLabel(r)).includes(needle))
    : RECITERS;
  const fullyCached = cached !== null && cached >= urls.length && urls.length > 0;
  // The per-ayah files average ~90 KB at 128 kbps and ~45 KB at 64.
  const estMb = (queue.length * (player.bitrate === 128 ? 0.09 : 0.045)).toLocaleString(
    'ar-u-nu-latn',
    { maximumFractionDigits: 1 },
  );

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

  const startIndex = fromAyah
    ? queue.findIndex((a) => a.surah === fromAyah.surah && a.ayah === fromAyah.ayah)
    : -1;
  const fromHere = !!fromAyah && startIndex >= 0;

  function play(q: AyahRef[], i: number) {
    close();
    wirdPlayer.playQueue(q, i);
  }

  return (
    <BottomSheet label="الاستماع" onClose={onClose}>
      <>
        <div className="flex flex-none items-center justify-between border-b border-[#b08a3e]/25 bg-[#f7efd9] py-1.5 ps-4 pe-2">
          <span className="font-display text-base text-[#0b4f55]">الاستماع</span>
          <button
            type="button"
            onClick={close}
            aria-label="إغلاق"
            className="flex h-10 w-10 items-center justify-center rounded-full text-[#0b4f55] transition-colors hover:bg-[#0b4f55]/8"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">
          {/* ── Reciter ── */}
          <button
            type="button"
            onClick={() => setPicking((v) => !v)}
            aria-expanded={picking}
            className="flex w-full items-center gap-3 rounded-2xl bg-[#f7efd9] p-2.5 text-start ring-1 ring-[#b08a3e]/25 transition-colors hover:bg-[#f4ead0]"
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#0b4f55] font-display text-lg text-[#e0bc66]">
              {reciter.name.charAt(0)}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-[#0b4f55]">
                {reciter.name}
              </span>
              <span className="block truncate text-xs text-[#9c7025]">
                {reciter.note ?? 'القارئ'}
              </span>
            </span>
            <ChevronDown
              className={cn(
                'h-4 w-4 shrink-0 text-[#0b4f55]/60 transition-transform',
                picking && 'rotate-180',
              )}
            />
          </button>

          {picking && (
            <div className="mt-2 overflow-hidden rounded-2xl ring-1 ring-neutral-200">
              <label className="flex items-center gap-2 border-b border-neutral-100 px-3">
                <Search className="h-4 w-4 shrink-0 text-neutral-400" />
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="ابحث عن قارئ"
                  className="h-10 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-neutral-400"
                />
              </label>
              <ul className="max-h-64 overflow-y-auto">
                {reciters.length === 0 && (
                  <li className="px-4 py-4 text-center text-sm text-neutral-500">لا نتائج</li>
                )}
                {reciters.map((r) => {
                  const current = r.id === player.reciterId;
                  return (
                    <li key={r.id}>
                      <button
                        type="button"
                        onClick={() => {
                          wirdPlayer.setReciter(r.id);
                          setPicking(false);
                          setQuery('');
                        }}
                        className={cn(
                          'flex w-full items-center justify-between gap-2 px-4 py-2.5 text-start text-sm transition-colors',
                          current
                            ? 'bg-primary-50 font-semibold text-primary-800'
                            : 'text-neutral-700 hover:bg-neutral-50',
                        )}
                      >
                        <span className="min-w-0">
                          {r.name}
                          {r.note && (
                            <span className="ms-1.5 text-xs font-normal text-[#9c7025]">
                              {r.note}
                            </span>
                          )}
                        </span>
                        {current && <Check className="h-4 w-4 shrink-0" />}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {/* ── Settings: one row of chips ── */}
          <div className="mt-3 grid grid-cols-3 gap-2">
            <Chip
              label="الجودة"
              value={player.bitrate === 128 ? 'عالية' : 'موفّرة'}
              onClick={() => wirdPlayer.setBitrate(player.bitrate === 128 ? 64 : 128)}
            />
            <Chip
              label="تكرار الآية"
              value={player.repeatEach ? `×${ar(7)}` : 'لا'}
              active={player.repeatEach}
              onClick={() => wirdPlayer.setRepeatEach(!player.repeatEach)}
            />
            <Chip
              label="السرعة"
              value={`×${ar(player.speed)}`}
              active={player.speed !== 1}
              onClick={() => wirdPlayer.cycleSpeed()}
            />
          </div>

          {/* ── Offline download ── */}
          <div className="mt-3 flex items-center gap-3 rounded-2xl bg-neutral-50 p-2.5 ring-1 ring-neutral-200/70">
            <span
              className={cn(
                'flex h-10 w-10 shrink-0 items-center justify-center rounded-full',
                fullyCached ? 'bg-mint-100 text-mint-700' : 'bg-[#0b4f55]/8 text-[#0b4f55]',
              )}
            >
              {fullyCached ? (
                <Check className="h-4.5 w-4.5" />
              ) : !online ? (
                <CloudOff className="h-4.5 w-4.5" />
              ) : (
                <Download className={cn('h-4.5 w-4.5', downloading && 'animate-bounce')} />
              )}
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-neutral-800">
                {fullyCached
                  ? 'متاح دون إنترنت'
                  : downloading
                    ? `جارٍ التنزيل ${ar(downloading.done)}/${ar(downloading.total)}`
                    : 'الاستماع دون إنترنت'}
              </div>
              {downloading ? (
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-neutral-200">
                  <div
                    className="h-full rounded-full bg-[#0b4f55] transition-[width] duration-300"
                    style={{
                      width: `${(downloading.done / Math.max(1, downloading.total)) * 100}%`,
                    }}
                  />
                </div>
              ) : (
                <div className="text-xs text-neutral-500">
                  {fullyCached
                    ? `${ar(queue.length)} آية`
                    : cached
                      ? `${ar(cached)} من ${ar(urls.length)} آية`
                      : `${ar(queue.length)} آية · ${estMb} م.ب`}
                </div>
              )}
            </div>
            {fullyCached ? (
              <button
                type="button"
                onClick={async () => {
                  await clearAudioCache();
                  refreshCached();
                }}
                aria-label="حذف الصوت المنزّل"
                title="حذف الصوت المنزّل"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-red-700 transition-colors hover:bg-red-50"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            ) : (
              !downloading && (
                <button
                  type="button"
                  onClick={download}
                  disabled={!online}
                  className="h-9 shrink-0 rounded-full bg-[#0b4f55] px-4 text-xs font-semibold text-white transition-colors hover:bg-[#0e5a61] disabled:opacity-40"
                >
                  {cached ? 'إكمال' : 'تنزيل'}
                </button>
              )
            )}
          </div>
        </div>

        {/* ── Play ── */}
        <div className="flex flex-none flex-col gap-2 border-t border-neutral-100 px-4 pb-3 pt-3">
          {fromHere && (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => play(queue, startIndex)}
                className="flex h-12 flex-[2] items-center justify-center gap-2 rounded-full bg-[#0b4f55] text-sm font-semibold text-white transition-colors hover:bg-[#0e5a61] active:bg-[#083f44]"
              >
                <Play className="h-4 w-4" />
                من الآية {ar(fromAyah!.ayah)}
              </button>
              <button
                type="button"
                onClick={() => play([queue[startIndex]!], 0)}
                className="h-12 flex-1 rounded-full bg-[#0b4f55]/8 text-sm font-semibold text-[#0b4f55] transition-colors hover:bg-[#0b4f55]/12"
              >
                الآية فقط
              </button>
            </div>
          )}
          <button
            type="button"
            onClick={() => play(queue, 0)}
            className={cn(
              'flex h-12 items-center justify-center gap-2 rounded-full text-sm font-semibold transition-colors',
              fromHere
                ? 'bg-[#0b4f55]/8 text-[#0b4f55] hover:bg-[#0b4f55]/12'
                : 'bg-[#0b4f55] text-white hover:bg-[#0e5a61] active:bg-[#083f44]',
            )}
          >
            <Play className="h-4 w-4" />
            الورد كاملاً
          </button>
        </div>
      </>
    </BottomSheet>
  );
}

/** A settings chip: its name above, its current value below; tap to change. */
function Chip({
  label,
  value,
  active,
  onClick,
}: {
  label: string;
  value: string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'flex h-14 flex-col items-center justify-center rounded-2xl transition-colors',
        active ? 'bg-[#9c7025] text-white' : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200',
      )}
    >
      <span className={cn('text-[11px]', active ? 'text-white/75' : 'text-neutral-500')}>
        {label}
      </span>
      <span className="text-sm font-bold tabular-nums">{value}</span>
    </button>
  );
}

/** Letter-variant-insensitive Arabic for search: أ/إ/آ → ا, ة → ه, ى → ي, no tashkeel. */
function normalizeArabic(s: string): string {
  return s
    .replace(/[ً-ٰٟ]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .toLowerCase();
}
