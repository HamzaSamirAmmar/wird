import * as React from 'react';
import {
  ChevronDown,
  ListChecks,
  Search,
  TrendingUp,
  Trophy,
  UserCheck,
  UserX,
} from 'lucide-react';
import {
  DUTY_CATEGORY_LABELS,
  type DutyCategory,
  type DutyFollowupRow,
  type DutyStatus,
} from '@wird/domain';
import {
  Alert,
  Avatar,
  Badge,
  Card,
  EmptyState,
  Input,
  PageHeader,
  ProgressBar,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SkeletonRows,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Pagination,
  cn,
} from '@wird/ui-web';
import { formatRange } from '@wird/quran-data';
import { addDays, formatDayLabel, todayISO } from '../lib/dates';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth-context';
import { managedGroups } from '../lib/groups';

type Preset = 'today' | 'yesterday' | '7d' | '30d' | 'month' | 'all' | 'custom';

const PRESET_LABELS: Record<Preset, string> = {
  today: 'اليوم',
  yesterday: 'أمس',
  '7d': 'آخر 7 أيام',
  '30d': 'آخر 30 يوماً',
  month: 'هذا الشهر',
  all: 'كل السجل',
  custom: 'مخصص',
};

const EPOCH = '2020-01-01';

function rangeFor(
  preset: Preset,
  customFrom: string,
  customTo: string,
): { from: string; to: string } {
  const today = todayISO();
  switch (preset) {
    case 'today':
      return { from: today, to: today };
    case 'yesterday': {
      const yesterday = addDays(today, -1);
      return { from: yesterday, to: yesterday };
    }
    case '7d':
      return { from: addDays(today, -6), to: today };
    case '30d':
      return { from: addDays(today, -29), to: today };
    case 'month':
      return { from: `${today.slice(0, 7)}-01`, to: today };
    case 'all':
      return { from: EPOCH, to: today };
    case 'custom':
      return { from: customFrom || EPOCH, to: customTo || today };
  }
}

type SortKey = 'rate' | 'remaining' | 'name' | 'streak';

/** Phone sorting lives in chips — the sortable table headers are md-and-up only. */
const SORT_CHIPS: { key: SortKey; label: string }[] = [
  { key: 'name', label: 'الاسم' },
  { key: 'rate', label: 'نسبة الإنجاز' },
  { key: 'remaining', label: 'المتبقّي' },
  { key: 'streak', label: 'التتابع' },
];

export default function FollowupPage() {
  const { profile } = useAuth();
  const [groups, setGroups] = React.useState<{ id: string; name: string }[]>([]);
  const [groupId, setGroupId] = React.useState('all');
  const [preset, setPreset] = React.useState<Preset>('30d');
  const [customFrom, setCustomFrom] = React.useState('');
  const [customTo, setCustomTo] = React.useState('');
  const [onlyGaps, setOnlyGaps] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const [sort, setSort] = React.useState<{ key: SortKey; dir: 'asc' | 'desc' }>({
    key: 'rate',
    dir: 'asc',
  });

  const [rows, setRows] = React.useState<DutyFollowupRow[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [expanded, setExpanded] = React.useState<string | null>(null);

  const { from, to } = rangeFor(preset, customFrom, customTo);

  React.useEffect(() => {
    managedGroups(profile).then(({ data }) => setGroups(data ?? []));
  }, [profile]);

  const load = React.useCallback(async () => {
    setRows(null);
    setExpanded(null);
    const { data, error } = await supabase.rpc('duty_followup', {
      p_from: from,
      p_to: to,
      p_group_id: groupId === 'all' ? null : groupId,
    });
    if (error) {
      setError('تعذر تحميل بيانات المتابعة');
      setRows([]);
      return;
    }
    setError(null);
    setRows(
      (data ?? []).map((r) => ({
        employeeId: r.employee_id,
        fullName: r.full_name,
        groupId: r.group_id,
        groupName: r.group_name,
        assignedCount: r.assigned_count,
        completedCount: r.completed_count,
        incompleteCount: r.incomplete_count,
        daysAssigned: r.days_assigned,
        daysAllComplete: r.days_all_complete,
        completionRate: Number(r.completion_rate),
        currentStreak: r.current_streak,
      })),
    );
  }, [from, to, groupId]);

  React.useEffect(() => {
    load();
  }, [load]);

  const visible = React.useMemo(() => {
    if (!rows) return null;
    const needle = normalizeArabic(query.trim());
    const filtered = rows.filter(
      (r) =>
        (!onlyGaps || r.incompleteCount > 0) &&
        (!needle ||
          normalizeArabic(r.fullName).includes(needle) ||
          normalizeArabic(r.groupName ?? '').includes(needle)),
    );
    const dir = sort.dir === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      switch (sort.key) {
        case 'name':
          return a.fullName.localeCompare(b.fullName, 'ar') * dir;
        case 'remaining':
          return (a.incompleteCount - b.incompleteCount) * dir;
        case 'streak':
          return (a.currentStreak - b.currentStreak) * dir;
        case 'rate':
        default:
          return (a.completionRate - b.completionRate) * dir;
      }
    });
  }, [rows, onlyGaps, sort, query]);

  const totals = React.useMemo(() => {
    if (!rows) return null;
    const assigned = rows.reduce((s, r) => s + r.assignedCount, 0);
    const completed = rows.reduce((s, r) => s + r.completedCount, 0);
    return {
      employees: rows.length,
      fullyComplete: rows.filter((r) => r.assignedCount > 0 && r.incompleteCount === 0).length,
      withGaps: rows.filter((r) => r.incompleteCount > 0).length,
      rate: assigned === 0 ? null : Math.round((completed / assigned) * 100),
    };
  }, [rows]);

  function toggleSort(key: SortKey) {
    setSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: key === 'name' ? 'asc' : 'desc' },
    );
  }

  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(10);

  const filterKey = `${groupId}:${preset}:${customFrom}:${customTo}:${onlyGaps}:${sort.key}:${sort.dir}:${query}`;
  const [prevFilterKey, setPrevFilterKey] = React.useState(filterKey);
  if (filterKey !== prevFilterKey) {
    setPrevFilterKey(filterKey);
    setPage(1);
  }

  const totalPages = Math.max(1, Math.ceil((visible?.length ?? 0) / pageSize));
  const currentPage = Math.min(page, totalPages);
  const paginatedRows = (visible ?? []).slice((currentPage - 1) * pageSize, currentPage * pageSize);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="المتابعة"
        description="من أنجز أوراداً ومن تعثّر، عبر أي مدى زمني ولكل مجموعة"
      />

      {error && <Alert variant="danger">{error}</Alert>}

      <Card className="flex flex-col gap-4 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1.5 w-full sm:w-auto">
            <label className="text-xs font-medium text-neutral-500">المجموعة</label>
            <Select value={groupId} onValueChange={setGroupId}>
              <SelectTrigger className="h-9 w-full sm:w-48 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل المجموعات</SelectItem>
                {groups.map((g) => (
                  <SelectItem key={g.id} value={g.id}>
                    {g.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-neutral-500">المدى</label>
            <div className="flex flex-wrap gap-1">
              {(['today', 'yesterday', '7d', '30d', 'month', 'all'] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPreset(p)}
                  className={cn(
                    'rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
                    preset === p
                      ? 'bg-primary-600 text-white'
                      : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200',
                  )}
                >
                  {PRESET_LABELS[p]}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-end gap-2 w-full sm:w-auto">
            <div className="flex flex-col gap-1.5 flex-1 min-w-0 sm:w-36">
              <label className="text-xs font-medium text-neutral-500">من</label>
              <Input
                type="date"
                value={preset === 'custom' ? customFrom : from}
                max={to}
                onChange={(e) => {
                  setPreset('custom');
                  setCustomFrom(e.target.value);
                }}
                className="h-9 text-sm"
              />
            </div>
            <div className="flex flex-col gap-1.5 flex-1 min-w-0 sm:w-36">
              <label className="text-xs font-medium text-neutral-500">إلى</label>
              <Input
                type="date"
                value={preset === 'custom' ? customTo || todayISO() : to}
                max={todayISO()}
                onChange={(e) => {
                  setPreset('custom');
                  setCustomTo(e.target.value);
                }}
                className="h-9 text-sm"
              />
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="w-full sm:w-72">
            <Input
              type="search"
              icon={<Search className="h-4 w-4" />}
              placeholder="ابحث بالاسم أو المجموعة"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="h-9 text-sm"
            />
          </div>
          <label className="flex w-fit cursor-pointer items-center gap-2 text-sm text-neutral-600">
            <input
              type="checkbox"
              checked={onlyGaps}
              onChange={(e) => setOnlyGaps(e.target.checked)}
              className="h-4 w-4 rounded border-neutral-300 text-primary-600 focus:ring-primary-500"
            />
            المتعثرون فقط
          </label>

          <div className="flex flex-wrap items-center gap-1 md:hidden">
            <span className="me-1 text-xs font-medium text-neutral-500">الترتيب:</span>
            {SORT_CHIPS.map(({ key, label }) => (
              <button
                key={key}
                type="button"
                onClick={() => toggleSort(key)}
                className={cn(
                  'inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors',
                  sort.key === key
                    ? 'bg-primary-600 text-white'
                    : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200',
                )}
              >
                {label}
                <ChevronDown
                  className={cn(
                    'h-3 w-3 transition-transform',
                    sort.key === key ? 'opacity-100' : 'opacity-30',
                    sort.key === key && sort.dir === 'asc' && 'rotate-180',
                  )}
                />
              </button>
            ))}
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile icon={ListChecks} label="المستخدمون" value={totals?.employees ?? null} />
        <StatTile icon={UserCheck} label="مكتمِلون بالكامل" value={totals?.fullyComplete ?? null} />
        <StatTile icon={UserX} label="لديهم تعثّر" value={totals?.withGaps ?? null} />
        <StatTile
          icon={TrendingUp}
          label="نسبة الإنجاز"
          value={totals ? (totals.rate === null ? '—' : `${totals.rate}%`) : null}
        />
      </div>

      <Card className="overflow-hidden">
        {visible === null ? (
          <SkeletonRows rows={5} />
        ) : visible.length === 0 ? (
          <EmptyState
            icon={Trophy}
            title={
              query.trim()
                ? 'لا نتائج مطابقة للبحث'
                : onlyGaps
                  ? 'لا يوجد متعثرون في هذا المدى'
                  : 'لا توجد بيانات'
            }
            description={
              query.trim()
                ? 'جرّب اسماً آخر أو امسح البحث.'
                : onlyGaps
                  ? 'الجميع أتمّ أوراداً — أحسنوا.'
                  : 'اختر مجموعة أو مدى زمني آخر.'
            }
          />
        ) : (
          <>
            {/* Phones: one expandable card per employee — the nine-column table does not fit. */}
            <ul className="flex flex-col divide-y divide-neutral-100 md:hidden">
              {paginatedRows.map((row) => (
                <EmployeeCard
                  key={row.employeeId}
                  row={row}
                  from={from}
                  to={to}
                  open={expanded === row.employeeId}
                  onToggle={() =>
                    setExpanded((cur) => (cur === row.employeeId ? null : row.employeeId))
                  }
                />
              ))}
            </ul>
            <div className="hidden md:block">
              <Table className="min-w-[720px]">
                <TableHeader>
                  <TableRow>
                    <SortHead
                      label="الاسم"
                      active={sort.key === 'name'}
                      dir={sort.dir}
                      onClick={() => toggleSort('name')}
                    />
                    <TableHead>المجموعة</TableHead>
                    <TableHead className="text-center">مُسند</TableHead>
                    <TableHead className="text-center">مكتمل</TableHead>
                    <SortHead
                      label="متبقٍّ"
                      className="text-center"
                      active={sort.key === 'remaining'}
                      dir={sort.dir}
                      onClick={() => toggleSort('remaining')}
                    />
                    <TableHead className="text-center">أيام مكتملة</TableHead>
                    <SortHead
                      label="نسبة الإنجاز"
                      active={sort.key === 'rate'}
                      dir={sort.dir}
                      onClick={() => toggleSort('rate')}
                    />
                    <SortHead
                      label="التتابع"
                      className="text-center"
                      active={sort.key === 'streak'}
                      dir={sort.dir}
                      onClick={() => toggleSort('streak')}
                    />
                    <TableHead className="w-8" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedRows.map((row) => (
                    <EmployeeRows
                      key={row.employeeId}
                      row={row}
                      from={from}
                      to={to}
                      open={expanded === row.employeeId}
                      onToggle={() =>
                        setExpanded((cur) => (cur === row.employeeId ? null : row.employeeId))
                      }
                    />
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}

        {visible && visible.length > 0 && (
          <Pagination
            page={currentPage}
            pageSize={pageSize}
            totalItems={visible.length}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
          />
        )}
      </Card>
    </div>
  );
}

function SortHead({
  label,
  active,
  dir,
  onClick,
  className,
}: {
  label: string;
  active: boolean;
  dir: 'asc' | 'desc';
  onClick: () => void;
  className?: string;
}) {
  return (
    <TableHead className={className}>
      <button
        type="button"
        onClick={onClick}
        className={cn(
          'inline-flex items-center gap-1 transition-colors hover:text-neutral-800',
          active && 'text-primary-700',
        )}
      >
        {label}
        <ChevronDown
          className={cn(
            'h-3 w-3 transition-transform',
            active ? 'opacity-100' : 'opacity-30',
            active && dir === 'asc' && 'rotate-180',
          )}
        />
      </button>
    </TableHead>
  );
}

interface DutyRow {
  id: string;
  date: string;
  category: DutyCategory;
  status: DutyStatus;
  range: { surahFrom: number; ayahFrom: number; surahTo: number; ayahTo: number };
}

type DutyFilter = 'open' | 'pending' | 'in_progress' | 'completed' | 'all';

const DUTY_FILTERS: { key: DutyFilter; label: string }[] = [
  { key: 'open', label: 'غير مكتملة' },
  { key: 'pending', label: 'لم تبدأ' },
  { key: 'in_progress', label: 'قيد التنفيذ' },
  { key: 'completed', label: 'مكتملة' },
  { key: 'all', label: 'الكل' },
];

const STATUS_STYLE: Record<DutyStatus, { label: string; dot: string; text: string }> = {
  pending: { label: 'لم تبدأ', dot: 'bg-danger-500', text: 'text-danger-700' },
  in_progress: { label: 'قيد التنفيذ', dot: 'bg-accent-500', text: 'text-accent-800' },
  completed: { label: 'مكتملة', dot: 'bg-mint-500', text: 'text-mint-700' },
};

/** Rows shown per «عرض المزيد» step — a year of wirds must not render as a wall of cards. */
const DETAIL_STEP = 12;

function matchesFilter(status: DutyStatus, f: DutyFilter): boolean {
  if (f === 'all') return true;
  if (f === 'open') return status !== 'completed';
  return status === f;
}

/**
 * The expanded per-employee breakdown, built to stay small however many wirds the range
 * holds: a strip of one square per assigned day (done / partly / missed — the whole range at
 * a glance), status tabs with counts (unfinished first — what a supervisor opens this for),
 * and a day-grouped list that grows in steps. Mounted only while open, so the fetch runs on
 * open — shared by the desktop table row and the phone card.
 */
function DutyDetail({ employeeId, from, to }: { employeeId: string; from: string; to: string }) {
  const [duties, setDuties] = React.useState<DutyRow[] | null>(null);
  const [filter, setFilter] = React.useState<DutyFilter | null>(null);
  const [limit, setLimit] = React.useState(DETAIL_STEP);

  React.useEffect(() => {
    let cancelled = false;
    setDuties(null);
    supabase
      .from('duties')
      .select(
        'id, due_date, category, status, scope_surah_from, scope_ayah_from, scope_surah_to, scope_ayah_to',
      )
      .eq('employee_id', employeeId)
      .gte('due_date', from)
      .lte('due_date', to)
      .order('due_date', { ascending: false })
      .then(({ data }) => {
        if (cancelled) return;
        setDuties(
          (data ?? []).map((d) => ({
            id: d.id,
            date: d.due_date,
            category: d.category,
            status: d.status,
            range: {
              surahFrom: d.scope_surah_from,
              ayahFrom: d.scope_ayah_from,
              surahTo: d.scope_surah_to,
              ayahTo: d.scope_ayah_to,
            },
          })),
        );
      });
    return () => {
      cancelled = true;
    };
  }, [employeeId, from, to]);

  // One entry per assigned day, oldest first for the strip (read like a timeline).
  const days = React.useMemo(() => {
    const map = new Map<string, DutyRow[]>();
    for (const d of duties ?? []) map.set(d.date, [...(map.get(d.date) ?? []), d]);
    return [...map.entries()]
      .map(([date, list]) => {
        const done = list.filter((d) => d.status === 'completed').length;
        const started = list.some((d) => d.status !== 'pending');
        const state: 'done' | 'partial' | 'missed' =
          done === list.length ? 'done' : started ? 'partial' : 'missed';
        return { date, list, state, done };
      })
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [duties]);

  if (duties === null) {
    return <div className="py-2 text-xs text-neutral-400">جارٍ تحميل تفصيل الأوراد…</div>;
  }
  if (duties.length === 0) {
    return <div className="py-2 text-xs text-neutral-400">لا توجد أوراد مُسندة في هذا المدى.</div>;
  }

  const counts: Record<DutyFilter, number> = {
    open: duties.filter((d) => d.status !== 'completed').length,
    pending: duties.filter((d) => d.status === 'pending').length,
    in_progress: duties.filter((d) => d.status === 'in_progress').length,
    completed: duties.filter((d) => d.status === 'completed').length,
    all: duties.length,
  };
  // Default: what is still open — or everything, when nothing is.
  const active: DutyFilter = filter ?? (counts.open > 0 ? 'open' : 'all');
  const shown = duties.filter((d) => matchesFilter(d.status, active));
  const page = shown.slice(0, limit);

  // Group the visible page by day (already newest first).
  const groups: { date: string; list: DutyRow[] }[] = [];
  for (const d of page) {
    const last = groups[groups.length - 1];
    if (last && last.date === d.date) last.list.push(d);
    else groups.push({ date: d.date, list: [d] });
  }

  return (
    <div className="flex flex-col gap-3">
      {/* The whole range at a glance: one square per assigned day. */}
      <div>
        <div className="mb-1.5 flex items-center justify-between text-[11px] text-neutral-500">
          <span>
            الأيام: <b className="text-mint-700">{days.filter((d) => d.state === 'done').length}</b>{' '}
            مكتملة من {days.length}
          </span>
          <span className="flex items-center gap-2.5">
            <Legend className="bg-mint-500" label="مكتمل" />
            <Legend className="bg-accent-400" label="جزئي" />
            <Legend className="bg-danger-400" label="لم يبدأ" />
          </span>
        </div>
        <div className="flex flex-wrap gap-1" dir="ltr">
          {days.map((d) => (
            <span
              key={d.date}
              title={`${formatDayLabel(d.date)} — ${d.done}/${d.list.length}`}
              className={cn(
                'h-3.5 w-3.5 rounded-[4px]',
                d.state === 'done'
                  ? 'bg-mint-500'
                  : d.state === 'partial'
                    ? 'bg-accent-400'
                    : 'bg-danger-400',
              )}
            />
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-1">
        {DUTY_FILTERS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => {
              setFilter(key);
              setLimit(DETAIL_STEP);
            }}
            aria-pressed={active === key}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors',
              active === key
                ? 'bg-primary-600 text-white'
                : 'bg-white text-neutral-600 ring-1 ring-neutral-200 hover:bg-neutral-100',
            )}
          >
            {label}
            <span
              className={cn('tabular-nums', active === key ? 'text-white/80' : 'text-neutral-400')}
            >
              {counts[key]}
            </span>
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <p className="py-2 text-xs text-neutral-400">لا شيء هنا.</p>
      ) : (
        <div className="overflow-hidden rounded-xl bg-white ring-1 ring-neutral-200">
          {groups.map((g) => (
            <div key={g.date} className="border-b border-neutral-100 last:border-0">
              <div className="bg-neutral-50 px-3 py-1 text-[11px] font-medium text-neutral-500">
                {formatDayLabel(g.date)}
              </div>
              <ul className="divide-y divide-neutral-100">
                {g.list.map((duty) => {
                  const st = STATUS_STYLE[duty.status];
                  return (
                    <li key={duty.id} className="flex items-center gap-3 px-3 py-2">
                      <span className={cn('h-2 w-2 shrink-0 rounded-full', st.dot)} />
                      <span className="w-24 shrink-0 text-xs font-medium text-neutral-800">
                        {DUTY_CATEGORY_LABELS[duty.category]}
                      </span>
                      {/* The range is the duty — a date and a category alone do not tell a
                          supervisor which passage was missed. */}
                      <span className="min-w-0 flex-1 truncate text-xs text-neutral-500">
                        {formatRange(duty.range)}
                      </span>
                      <span className={cn('shrink-0 text-[11px] font-medium', st.text)}>
                        {st.label}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
          {shown.length > limit && (
            <button
              type="button"
              onClick={() => setLimit((l) => l + DETAIL_STEP * 2)}
              className="w-full border-t border-neutral-100 py-2 text-xs font-medium text-primary-700 transition-colors hover:bg-primary-50/50"
            >
              عرض المزيد ({shown.length - limit})
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function Legend({ className, label }: { className: string; label: string }) {
  return (
    <span className="flex items-center gap-1">
      <span className={cn('h-2.5 w-2.5 rounded-[3px]', className)} />
      {label}
    </span>
  );
}

function EmployeeRows({
  row,
  from,
  to,
  open,
  onToggle,
}: {
  row: DutyFollowupRow;
  from: string;
  to: string;
  open: boolean;
  onToggle: () => void;
}) {
  const pct = Math.round(row.completionRate * 100);
  const nothing = row.assignedCount === 0;

  return (
    <>
      <TableRow className="cursor-pointer" onClick={onToggle}>
        <TableCell>
          <div className="flex items-center gap-2.5">
            <Avatar name={row.fullName} size="sm" />
            <span className="font-medium text-neutral-900">{row.fullName}</span>
          </div>
        </TableCell>
        <TableCell className="text-neutral-500">{row.groupName}</TableCell>
        <TableCell className="text-center tabular-nums">{row.assignedCount}</TableCell>
        <TableCell className="text-center tabular-nums text-mint-700">
          {row.completedCount}
        </TableCell>
        <TableCell className="text-center tabular-nums">
          {row.incompleteCount > 0 ? (
            <span className="font-semibold text-danger-600">{row.incompleteCount}</span>
          ) : (
            <span className="text-neutral-300">0</span>
          )}
        </TableCell>
        <TableCell className="text-center tabular-nums text-neutral-500">
          {row.daysAllComplete}/{row.daysAssigned}
        </TableCell>
        <TableCell>
          <div className="flex items-center gap-2">
            <ProgressBar
              value={row.completedCount}
              max={row.assignedCount || 1}
              tone={pct === 100 ? 'mint' : 'brand'}
              className="w-24"
            />
            <span
              className={cn(
                'text-xs font-semibold tabular-nums',
                nothing ? 'text-neutral-300' : 'text-neutral-700',
              )}
            >
              {nothing ? '—' : `${pct}%`}
            </span>
          </div>
        </TableCell>
        <TableCell className="text-center">
          {row.currentStreak > 0 ? (
            <Badge variant="brand">{row.currentStreak}</Badge>
          ) : (
            <span className="text-neutral-300">—</span>
          )}
        </TableCell>
        <TableCell>
          <ChevronDown
            className={cn('h-4 w-4 text-neutral-400 transition-transform', open && 'rotate-180')}
          />
        </TableCell>
      </TableRow>

      {open && (
        <TableRow className="hover:bg-transparent">
          <TableCell colSpan={9} className="bg-neutral-50/60 p-4">
            <DutyDetail employeeId={row.employeeId} from={from} to={to} />
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

/** Phone-width rendition of a follow-up row: tappable header, compact stats, same detail. */
function EmployeeCard({
  row,
  from,
  to,
  open,
  onToggle,
}: {
  row: DutyFollowupRow;
  from: string;
  to: string;
  open: boolean;
  onToggle: () => void;
}) {
  const pct = Math.round(row.completionRate * 100);
  const nothing = row.assignedCount === 0;

  return (
    <li className="flex flex-col gap-3 p-4">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-2.5 text-start"
      >
        <Avatar name={row.fullName} size="sm" />
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium text-neutral-900">{row.fullName}</div>
          <div className="truncate text-xs text-neutral-500">{row.groupName}</div>
        </div>
        {row.currentStreak > 0 && <Badge variant="brand">{row.currentStreak}</Badge>}
        <ChevronDown
          className={cn(
            'h-4 w-4 shrink-0 text-neutral-400 transition-transform',
            open && 'rotate-180',
          )}
        />
      </button>

      <div className="flex items-center gap-2">
        <ProgressBar
          value={row.completedCount}
          max={row.assignedCount || 1}
          tone={pct === 100 ? 'mint' : 'brand'}
          className="min-w-0 flex-1"
        />
        <span
          className={cn(
            'shrink-0 text-xs font-semibold tabular-nums',
            nothing ? 'text-neutral-300' : 'text-neutral-700',
          )}
        >
          {nothing ? '—' : `${pct}%`}
        </span>
      </div>

      <div className="grid grid-cols-4 gap-2">
        <MiniStat label="مُسند" value={row.assignedCount} />
        <MiniStat label="مكتمل" value={row.completedCount} valueClassName="text-mint-700" />
        <MiniStat
          label="متبقٍّ"
          value={row.incompleteCount}
          valueClassName={row.incompleteCount > 0 ? 'font-semibold text-danger-600' : undefined}
        />
        <MiniStat
          label="أيام مكتملة"
          value={`${row.daysAllComplete}/${row.daysAssigned}`}
          valueClassName="font-normal text-neutral-500"
        />
      </div>

      {open && <DutyDetail employeeId={row.employeeId} from={from} to={to} />}
    </li>
  );
}

function MiniStat({
  label,
  value,
  valueClassName,
}: {
  label: string;
  value: React.ReactNode;
  valueClassName?: string;
}) {
  return (
    <div className="rounded-lg bg-neutral-50 px-2 py-1.5 text-center ring-1 ring-neutral-100">
      <div className="text-[10px] text-neutral-500">{label}</div>
      <div className={cn('text-sm font-semibold tabular-nums text-neutral-900', valueClassName)}>
        {value}
      </div>
    </div>
  );
}

function StatTile({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof ListChecks;
  label: string;
  value: number | string | null;
}) {
  return (
    <Card className="flex items-center gap-3 p-4">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary-600">
        <Icon className="h-4.5 w-4.5" />
      </span>
      <div className="min-w-0">
        <div className="text-lg font-semibold tabular-nums text-neutral-900">{value ?? '—'}</div>
        <div className="truncate text-xs text-neutral-500">{label}</div>
      </div>
    </Card>
  );
}

/** Letter-variant-insensitive Arabic for search: أ/إ/آ → ا, ة → ه, ى → ي, no tashkeel. */
function normalizeArabic(text: string): string {
  return text
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .toLowerCase();
}
