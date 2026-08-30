import * as React from 'react';
import { ChevronDown, ListChecks, TrendingUp, Trophy, UserCheck, UserX } from 'lucide-react';
import {
  DUTY_CATEGORIES,
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
  cn,
} from '@wird/ui-web';
import { addDays, formatDayLabel, todayISO } from '../lib/dates';
import { supabase } from '../lib/supabase';

type Preset = '7d' | '30d' | 'month' | 'all' | 'custom';

const PRESET_LABELS: Record<Preset, string> = {
  '7d': 'آخر ٧ أيام',
  '30d': 'آخر ٣٠ يوماً',
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

export default function FollowupPage() {
  const [groups, setGroups] = React.useState<{ id: string; name: string }[]>([]);
  const [groupId, setGroupId] = React.useState('all');
  const [preset, setPreset] = React.useState<Preset>('30d');
  const [customFrom, setCustomFrom] = React.useState('');
  const [customTo, setCustomTo] = React.useState('');
  const [onlyGaps, setOnlyGaps] = React.useState(false);
  const [sort, setSort] = React.useState<{ key: SortKey; dir: 'asc' | 'desc' }>({
    key: 'rate',
    dir: 'asc',
  });

  const [rows, setRows] = React.useState<DutyFollowupRow[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [expanded, setExpanded] = React.useState<string | null>(null);

  const { from, to } = rangeFor(preset, customFrom, customTo);

  React.useEffect(() => {
    supabase
      .from('groups')
      .select('id, name')
      .order('name')
      .then(({ data }) => setGroups(data ?? []));
  }, []);

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
    const filtered = onlyGaps ? rows.filter((r) => r.incompleteCount > 0) : rows;
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
  }, [rows, onlyGaps, sort]);

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

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="المتابعة"
        description="من أنجز أوراداً ومن تعثّر، عبر أي مدى زمني ولكل مجموعة"
      />

      {error && <Alert variant="danger">{error}</Alert>}

      <Card className="flex flex-col gap-4 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-neutral-500">المجموعة</label>
            <Select value={groupId} onValueChange={setGroupId}>
              <SelectTrigger className="h-9 w-48 text-sm">
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
              {(['7d', '30d', 'month', 'all'] as const).map((p) => (
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

          <div className="flex items-end gap-2">
            <div className="flex flex-col gap-1.5">
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
            <div className="flex flex-col gap-1.5">
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

        <label className="flex w-fit cursor-pointer items-center gap-2 text-sm text-neutral-600">
          <input
            type="checkbox"
            checked={onlyGaps}
            onChange={(e) => setOnlyGaps(e.target.checked)}
            className="h-4 w-4 rounded border-neutral-300 text-primary-600 focus:ring-primary-500"
          />
          المتعثرون فقط
        </label>
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
            title={onlyGaps ? 'لا يوجد متعثرون في هذا المدى' : 'لا توجد بيانات'}
            description={onlyGaps ? 'الجميع أتمّ أوراداً — أحسنوا.' : 'اختر مجموعة أو مدى زمني آخر.'}
          />
        ) : (
          <Table>
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
              {visible.map((row) => (
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

interface DayBreakdown {
  date: string;
  cats: { category: DutyCategory; status: DutyStatus }[];
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
  const [days, setDays] = React.useState<DayBreakdown[] | null>(null);
  const pct = Math.round(row.completionRate * 100);
  const nothing = row.assignedCount === 0;

  React.useEffect(() => {
    // Refetch whenever the panel opens or the active range changes under it.
    if (!open) return;
    let cancelled = false;
    setDays(null);
    supabase
      .from('duties')
      .select('due_date, category, status')
      .eq('employee_id', row.employeeId)
      .gte('due_date', from)
      .lte('due_date', to)
      .order('due_date')
      .then(({ data }) => {
        if (cancelled) return;
        const byDay = new Map<string, DayBreakdown>();
        for (const d of data ?? []) {
          const entry = byDay.get(d.due_date) ?? { date: d.due_date, cats: [] };
          entry.cats.push({ category: d.category, status: d.status });
          byDay.set(d.due_date, entry);
        }
        setDays([...byDay.values()]);
      });
    return () => {
      cancelled = true;
    };
  }, [open, row.employeeId, from, to]);

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
          <TableCell colSpan={9} className="bg-neutral-50/60">
            {days === null ? (
              <div className="py-2 text-xs text-neutral-400">جارٍ تحميل التفصيل اليومي…</div>
            ) : days.length === 0 ? (
              <div className="py-2 text-xs text-neutral-400">لا توجد أوراد مُسندة في هذا المدى.</div>
            ) : (
              <div className="flex flex-wrap gap-2 py-1">
                {days.map((day) => (
                  <DayChip key={day.date} day={day} />
                ))}
              </div>
            )}
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

const statusDot: Record<DutyStatus, string> = {
  completed: 'bg-mint-500',
  in_progress: 'bg-accent-500',
  pending: 'bg-danger-400',
};

function DayChip({ day }: { day: DayBreakdown }) {
  const allDone = day.cats.every((c) => c.status === 'completed');
  const noneDone = day.cats.every((c) => c.status === 'pending');

  return (
    <div
      className={cn(
        'flex flex-col gap-1 rounded-lg px-2.5 py-1.5 ring-1',
        allDone
          ? 'bg-mint-50 ring-mint-200'
          : noneDone
            ? 'bg-danger-50 ring-danger-200'
            : 'bg-accent-50 ring-accent-200',
      )}
    >
      <span className="text-[11px] font-medium text-neutral-600">{formatDayLabel(day.date)}</span>
      <div className="flex items-center gap-1.5">
        {DUTY_CATEGORIES.filter((c) => day.cats.some((x) => x.category === c)).map((c) => {
          const cat = day.cats.find((x) => x.category === c)!;
          return (
            <span
              key={c}
              title={`${DUTY_CATEGORY_LABELS[c]}: ${cat.status}`}
              className={cn('h-2 w-2 rounded-full', statusDot[cat.status])}
            />
          );
        })}
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
