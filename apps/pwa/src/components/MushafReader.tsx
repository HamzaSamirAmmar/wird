import * as React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import {
  formatPage,
  formatRange,
  globalAyahIndex,
  pagesForRange,
  type QuranRange,
} from '@wird/quran-data';
import { Alert, Dialog, DialogContent, DialogHeader, DialogTitle, Spinner } from '@wird/ui-web';
import { loadQuranText, renderPage, type RenderedAyah } from '../lib/quran-text';

/**
 * Full-page muṣḥaf reader for a duty's range.
 *
 * Shows whole pages, not just the assigned ayat: a page containing even one ayah of the range
 * is rendered in full, with the ayat outside the range dimmed. That matches how the duty is
 * actually read — you open the page, not a fragment.
 */
export function MushafReader({
  open,
  onOpenChange,
  range,
  title,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  range: QuranRange;
  title: string;
}) {
  const pages = React.useMemo(() => pagesForRange(range), [range]);
  const [pageIndex, setPageIndex] = React.useState(0);
  const [ayahs, setAyahs] = React.useState<RenderedAyah[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const scrollRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (open) setPageIndex(0);
  }, [open, range]);

  const page = pages[pageIndex];

  React.useEffect(() => {
    if (!open || page === undefined) return;
    let cancelled = false;
    setAyahs(null);
    setError(null);

    loadQuranText()
      .then((file) => {
        if (cancelled) return;
        setAyahs(
          renderPage(
            file,
            page,
            {
              fromIndex: globalAyahIndex(range.surahFrom, range.ayahFrom),
              toIndex: globalAyahIndex(range.surahTo, range.ayahTo),
            },
            globalAyahIndex,
          ),
        );
      })
      .catch(() => {
        if (!cancelled)
          setError('تعذر تحميل نص المصحف. افتح التطبيق مرة واحدة وأنت متصل بالإنترنت.');
      });

    return () => {
      cancelled = true;
    };
  }, [open, page, range]);

  // Each page starts at the top, otherwise paging keeps the previous scroll position.
  React.useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [pageIndex]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="h-[92dvh] max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <p className="text-sm text-neutral-500">{formatRange(range)}</p>
        </DialogHeader>

        <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-5">
          {error ? (
            <Alert variant="danger">{error}</Alert>
          ) : ayahs === null ? (
            <div className="flex justify-center py-16">
              <Spinner />
            </div>
          ) : (
            /* Tanzil's licence requires the text be redistributed unmodified and credited. */
            <p className="mt-8 text-center text-[11px] text-neutral-400">
              نص المصحف: مشروع تنزيل — tanzil.net
            </p>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-neutral-100 bg-neutral-50/60 px-4 py-3">
          <button
            type="button"
            disabled={pageIndex === 0}
            onClick={() => setPageIndex((i) => i - 1)}
            aria-label="الصفحة السابقة"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-neutral-600 transition-colors hover:bg-neutral-100 disabled:opacity-30"
          >
            <ChevronRight className="h-5 w-5" />
          </button>

          <div className="text-center">
            <div className="text-sm font-medium text-neutral-800">
              {page !== undefined ? formatPage(page) : '—'}
            </div>
            {pages.length > 1 && (
              <div className="text-[11px] text-neutral-500">
                {pageIndex + 1} من {pages.length}
              </div>
            )}
          </div>

          <button
            type="button"
            disabled={pageIndex >= pages.length - 1}
            onClick={() => setPageIndex((i) => i + 1)}
            aria-label="الصفحة التالية"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-neutral-600 transition-colors hover:bg-neutral-100 disabled:opacity-30"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
