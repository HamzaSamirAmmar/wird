import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from './Button';
import { cn } from './cn';

export interface PaginationProps {
  page: number;
  pageSize: number;
  totalItems: number;
  onPageChange: (newPage: number) => void;
  onPageSizeChange?: (newPageSize: number) => void;
  pageSizeOptions?: number[];
  className?: string;
}

export function Pagination({
  page,
  pageSize,
  totalItems,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 25, 50],
  className,
}: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const currentPage = Math.min(Math.max(1, page), totalPages);

  const startItem = totalItems === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const endItem = Math.min(currentPage * pageSize, totalItems);

  const getPageNumbers = () => {
    if (totalPages <= 7) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }
    const pages: (number | 'ellipsis')[] = [1];
    if (currentPage > 3) {
      pages.push('ellipsis');
    }
    const start = Math.max(2, currentPage - 1);
    const end = Math.min(totalPages - 1, currentPage + 1);
    for (let i = start; i <= end; i++) {
      pages.push(i);
    }
    if (currentPage < totalPages - 2) {
      pages.push('ellipsis');
    }
    pages.push(totalPages);
    return pages;
  };

  return (
    <div
      className={cn(
        'flex flex-wrap items-center justify-between gap-3 border-t border-neutral-100 px-4 py-3 text-sm text-neutral-600',
        className,
      )}
    >
      <div className="flex items-center gap-3">
        <span className="text-xs text-neutral-500">
          عرض{' '}
          <span className="font-semibold text-neutral-800 tabular-nums">
            {startItem}–{endItem}
          </span>{' '}
          من <span className="font-semibold text-neutral-800 tabular-nums">{totalItems}</span>
        </span>

        {onPageSizeChange && pageSizeOptions.length > 1 && (
          <div className="flex items-center gap-1.5 text-xs text-neutral-500">
            <span>لكل صفحة:</span>
            <select
              aria-label="عدد العناصر لكل صفحة"
              value={pageSize}
              onChange={(e) => {
                onPageSizeChange(Number(e.target.value));
                onPageChange(1);
              }}
              className="h-7 rounded-md border border-neutral-200 bg-surface px-1.5 text-xs text-neutral-800 focus:border-primary-500 focus:outline-none"
            >
              {pageSizeOptions.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant="outline"
          size="xs"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage <= 1}
          aria-label="الصفحة السابقة"
          className="gap-1 px-2 font-normal"
        >
          <ChevronRight className="h-3.5 w-3.5" />
          <span>السابق</span>
        </Button>

        <div className="hidden items-center gap-1 sm:flex">
          {getPageNumbers().map((p, idx) =>
            p === 'ellipsis' ? (
              <span key={`ellipsis-${idx}`} className="px-1 text-xs text-neutral-400">
                …
              </span>
            ) : (
              <button
                key={p}
                type="button"
                onClick={() => onPageChange(p)}
                className={cn(
                  'h-7 min-w-7 rounded-md px-1.5 text-xs font-medium tabular-nums transition-colors',
                  p === currentPage
                    ? 'bg-primary-700 text-white'
                    : 'text-neutral-700 hover:bg-neutral-100',
                )}
              >
                {p}
              </button>
            ),
          )}
        </div>

        <span className="px-1 text-xs text-neutral-500 sm:hidden tabular-nums">
          {currentPage} / {totalPages}
        </span>

        <Button
          type="button"
          variant="outline"
          size="xs"
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage >= totalPages}
          aria-label="الصفحة التالية"
          className="gap-1 px-2 font-normal"
        >
          <span>التالي</span>
          <ChevronLeft className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
