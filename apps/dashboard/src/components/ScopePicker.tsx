import * as React from 'react';
import { Check, ChevronDown, Minus, Plus, Search } from 'lucide-react';
import {
  countAyahs,
  formatPage,
  formatRange,
  getSurah,
  isWholeSurahRange,
  pagesForRange,
  searchSurahs,
  wholeSurahs,
  type QuranRange,
} from '@wird/quran-data';
import { Checkbox, cn } from '@wird/ui-web';

type Mode = 'surah' | 'ayahs';

/**
 * Picks the Quran range of one category: either whole surahs or an exact ayah span.
 * The value is always a valid range, so the caller never has to handle a half-typed state.
 */
export function ScopePicker({
  value,
  onChange,
}: {
  value: QuranRange;
  onChange: (range: QuranRange) => void;
}) {
  // A range that happens to cover whole surahs opens in the surah tab, everything else in ayahs.
  const [mode, setMode] = React.useState<Mode>(() => (isWholeSurahRange(value) ? 'surah' : 'ayahs'));
  const [multiSurah, setMultiSurah] = React.useState(() => value.surahFrom !== value.surahTo);

  function switchMode(next: Mode) {
    setMode(next);
    if (next === 'surah') onChange(wholeSurahs(value.surahFrom, multiSurah ? value.surahTo : undefined));
  }

  function setFromSurah(n: number) {
    if (mode === 'surah') {
      onChange(wholeSurahs(n, multiSurah ? Math.max(n, value.surahTo) : n));
    } else if (multiSurah) {
      const surahTo = Math.max(n, value.surahTo);
      onChange({
        surahFrom: n,
        ayahFrom: 1,
        surahTo,
        ayahTo: surahTo === value.surahTo ? value.ayahTo : getSurah(surahTo).ayahCount,
      });
    } else {
      onChange({ surahFrom: n, ayahFrom: 1, surahTo: n, ayahTo: getSurah(n).ayahCount });
    }
  }

  function setToSurah(n: number) {
    if (mode === 'surah') onChange(wholeSurahs(value.surahFrom, n));
    else onChange({ ...value, surahTo: n, ayahTo: getSurah(n).ayahCount });
  }

  function toggleMulti(on: boolean) {
    setMultiSurah(on);
    if (mode === 'surah') onChange(wholeSurahs(value.surahFrom, on ? Math.min(value.surahFrom + 1, 114) : value.surahFrom));
    else if (on) {
      const surahTo = Math.min(value.surahFrom + 1, 114);
      onChange({ ...value, surahTo, ayahTo: getSurah(surahTo).ayahCount });
    } else {
      onChange({
        ...value,
        surahTo: value.surahFrom,
        ayahTo: Math.max(value.ayahFrom, Math.min(value.ayahTo, getSurah(value.surahFrom).ayahCount)),
      });
    }
  }

  const fromMax = getSurah(value.surahFrom).ayahCount;
  const toMax = getSurah(value.surahTo).ayahCount;

  return (
    <div className="flex flex-col gap-4">
      <div role="tablist" className="inline-flex self-start rounded-lg bg-neutral-100 p-1">
        {(
          [
            ['surah', 'سورة كاملة'],
            ['ayahs', 'آيات محددة'],
          ] as const
        ).map(([m, label]) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={mode === m}
            onClick={() => switchMode(m)}
            className={cn(
              'rounded-md px-4 py-1.5 text-sm font-medium transition-all duration-150',
              mode === m
                ? 'bg-surface text-primary-800 shadow-xs'
                : 'text-neutral-600 hover:text-neutral-900',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <SurahCombobox
          label={multiSurah ? 'من سورة' : 'السورة'}
          value={value.surahFrom}
          onChange={setFromSurah}
        />
        {multiSurah && (
          <SurahCombobox
            label="إلى سورة"
            value={value.surahTo}
            min={value.surahFrom}
            onChange={setToSurah}
          />
        )}
      </div>

      {mode === 'ayahs' && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Stepper
            label="من آية"
            value={value.ayahFrom}
            min={1}
            max={multiSurah ? fromMax : Math.min(fromMax, value.ayahTo)}
            onChange={(n) => onChange({ ...value, ayahFrom: n })}
            hint={
              <button
                type="button"
                className="text-primary-700 hover:underline"
                onClick={() => onChange({ ...value, ayahFrom: 1 })}
              >
                من البداية
              </button>
            }
          />
          <Stepper
            label="إلى آية"
            value={value.ayahTo}
            min={multiSurah ? 1 : value.ayahFrom}
            max={toMax}
            onChange={(n) => onChange({ ...value, ayahTo: n })}
            hint={
              <button
                type="button"
                className="text-primary-700 hover:underline"
                onClick={() => onChange({ ...value, ayahTo: toMax })}
              >
                إلى النهاية ({toMax.toLocaleString('ar-u-nu-latn')})
              </button>
            }
          />
        </div>
      )}

      <label className="flex w-fit cursor-pointer items-center gap-2 text-sm text-neutral-700">
        <Checkbox checked={multiSurah} onCheckedChange={(v) => toggleMulti(v === true)} />
        {mode === 'surah' ? 'عدة سور متتالية' : 'يمتد إلى سورة أخرى'}
      </label>

      <Summary range={value} />
    </div>
  );
}

function Summary({ range }: { range: QuranRange }) {
  const pages = pagesForRange(range);
  const ayahs = countAyahs(range);
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-primary-50 px-3.5 py-2.5 text-sm ring-1 ring-inset ring-primary-100">
      <span className="font-medium text-primary-900">{formatRange(range)}</span>
      <span className="text-xs text-primary-700">
        {ayahs.toLocaleString('ar-u-nu-latn')} آية ·{' '}
        {pages.length === 1
          ? formatPage(pages[0]!)
          : `${pages.length.toLocaleString('ar-u-nu-latn')} صفحات (${pages[0]!.toLocaleString('ar-u-nu-latn')}–${pages[pages.length - 1]!.toLocaleString('ar-u-nu-latn')})`}
      </span>
    </div>
  );
}

/** Searchable surah list, expanding inline (a floating panel would be clipped by the dialog body). */
function SurahCombobox({
  label,
  value,
  min = 1,
  onChange,
}: {
  label: string;
  value: number;
  min?: number;
  onChange: (n: number) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const surah = getSurah(value);
  const results = React.useMemo(() => searchSurahs(query).filter((s) => s.number >= min), [query, min]);

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-neutral-700">{label}</span>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex h-11 items-center gap-2 rounded-lg bg-surface px-3.5 text-sm text-neutral-900 shadow-xs ring-1 ring-inset ring-neutral-300 transition-shadow hover:ring-neutral-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600"
      >
        <span className="flex h-6 min-w-6 items-center justify-center rounded-md bg-primary-50 px-1 text-[11px] font-semibold tabular-nums text-primary-700">
          {surah.number}
        </span>
        <span className="flex-1 text-start font-medium">{surah.nameAr}</span>
        <span className="text-[11px] text-neutral-400">{surah.ayahCount} آية</span>
        <ChevronDown className={cn('h-4 w-4 text-neutral-400 transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="overflow-hidden rounded-lg bg-surface ring-1 ring-neutral-200">
          <div className="relative border-b border-neutral-100">
            <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="ابحث باسم السورة أو رقمها"
              className="h-10 w-full bg-transparent ps-9 pe-3 text-sm outline-none placeholder:text-neutral-400"
            />
          </div>
          <ul className="max-h-56 overflow-y-auto py-1">
            {results.length === 0 && (
              <li className="px-4 py-3 text-center text-sm text-neutral-400">لا توجد نتائج</li>
            )}
            {results.map((s) => (
              <li key={s.number}>
                <button
                  type="button"
                  onClick={() => {
                    onChange(s.number);
                    setOpen(false);
                    setQuery('');
                  }}
                  className={cn(
                    'flex w-full items-center gap-3 px-3.5 py-2 text-start text-sm transition-colors hover:bg-primary-50',
                    s.number === value && 'bg-primary-50/70 font-medium',
                  )}
                >
                  <span className="w-7 text-[11px] tabular-nums text-neutral-400">{s.number}</span>
                  <span className="flex-1">{s.nameAr}</span>
                  <span className="text-[11px] text-neutral-400">{s.ayahCount} آية</span>
                  {s.number === value && <Check className="h-4 w-4 text-primary-600" />}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** Numeric field with − / + buttons; typing is free-form and clamps once the value is valid. */
function Stepper({
  label,
  value,
  min,
  max,
  onChange,
  hint,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (n: number) => void;
  hint?: React.ReactNode;
}) {
  const [text, setText] = React.useState(String(value));
  React.useEffect(() => setText(String(value)), [value]);

  const clamp = (n: number) => Math.min(max, Math.max(min, n));

  function commit(raw: string) {
    // Arabic-Indic digits are accepted too: supervisors often type on an Arabic keyboard.
    const n = parseInt(
      raw.replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(/\D/g, ''),
      10,
    );
    if (Number.isNaN(n)) return setText(String(value));
    const next = clamp(n);
    setText(String(next));
    if (next !== value) onChange(next);
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-neutral-700">{label}</span>
        <span className="text-[11px]">{hint}</span>
      </div>
      <div className="flex h-11 items-stretch overflow-hidden rounded-lg bg-surface shadow-xs ring-1 ring-inset ring-neutral-300 focus-within:ring-2 focus-within:ring-primary-600">
        <button
          type="button"
          aria-label="زيادة"
          disabled={value >= max}
          onClick={() => onChange(clamp(value + 1))}
          className="flex w-11 items-center justify-center text-neutral-500 transition-colors hover:bg-neutral-50 disabled:opacity-30"
        >
          <Plus className="h-4 w-4" />
        </button>
        <input
          inputMode="numeric"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={(e) => commit(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), commit(text))}
          className="min-w-0 flex-1 bg-transparent text-center text-sm font-medium tabular-nums outline-none"
        />
        <button
          type="button"
          aria-label="إنقاص"
          disabled={value <= min}
          onClick={() => onChange(clamp(value - 1))}
          className="flex w-11 items-center justify-center text-neutral-500 transition-colors hover:bg-neutral-50 disabled:opacity-30"
        >
          <Minus className="h-4 w-4" />
        </button>
      </div>
      <span className="text-[11px] text-neutral-400">من {min.toLocaleString('ar-u-nu-latn')} إلى {max.toLocaleString('ar-u-nu-latn')}</span>
    </div>
  );
}
