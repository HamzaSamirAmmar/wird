import * as React from 'react';
import { BookOpen, CalendarDays, Pencil, Plus } from 'lucide-react';
import { formatRange } from '@wird/quran-data';
import { DUTY_CATEGORIES, DUTY_CATEGORY_LABELS, type DutyCategory } from '@wird/domain';
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  PageHeader,
  SkeletonRows,
} from '@wird/ui-web';
import {
  DayAssignmentDialog,
  type AssignmentRow,
  type GroupOption,
} from '../components/DayAssignmentDialog';
import { WeekStrip } from '../components/WeekStrip';
import { addDays, formatRelativeDay, isoWeekStart, todayISO } from '../lib/dates';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth-context';

const categoryBadge: Record<DutyCategory, 'brand' | 'in_progress' | 'completed'> = {
  new_memorization: 'brand',
  minor_review: 'in_progress',
  major_review: 'completed',
};

const ASSIGNMENT_COLUMNS =
  'id, category, due_date, scope_surah_from, scope_ayah_from, scope_surah_to, scope_ayah_to, group:groups(id, name)';

export default function DutiesPage() {
  const { profile } = useAuth();
  const [selectedDate, setSelectedDate] = React.useState(todayISO());
  const [assignments, setAssignments] = React.useState<AssignmentRow[] | null>(null);
  const [weekCounts, setWeekCounts] = React.useState<Record<string, number>>({});
  const [groups, setGroups] = React.useState<GroupOption[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editingGroupId, setEditingGroupId] = React.useState<string | null>(null);

  const weekStart = isoWeekStart(selectedDate);

  // One query for the whole visible week: the day list and the strip's dots come from it,
  // so switching days inside a week needs no round trip.
  const loadWeek = React.useCallback(async () => {
    setAssignments(null);
    const { data, error } = await supabase
      .from('duty_group_assignments')
      .select(ASSIGNMENT_COLUMNS)
      .gte('due_date', weekStart)
      .lte('due_date', addDays(weekStart, 6))
      .order('created_at');

    if (error) {
      setError('تعذر تحميل أوراد هذا الأسبوع');
      setAssignments([]);
      return;
    }
    setError(null);
    const rows = data as unknown as AssignmentRow[];
    setAssignments(rows);
    setWeekCounts(
      rows.reduce<Record<string, number>>((acc, r) => {
        acc[r.due_date] = (acc[r.due_date] ?? 0) + 1;
        return acc;
      }, {}),
    );
  }, [weekStart]);

  React.useEffect(() => {
    loadWeek();
  }, [loadWeek]);

  React.useEffect(() => {
    supabase
      .from('groups')
      .select('id, name')
      .order('name')
      .then(({ data }) => setGroups(data ?? []));
  }, []);

  const dayRows = assignments?.filter((a) => a.due_date === selectedDate) ?? null;

  // A day is edited per group, not per row: one card per group holding all its categories.
  const byGroup = React.useMemo(() => {
    if (!dayRows) return null;
    const map = new Map<string, { group: AssignmentRow['group']; rows: AssignmentRow[] }>();
    for (const row of dayRows) {
      const entry = map.get(row.group.id) ?? { group: row.group, rows: [] };
      entry.rows.push(row);
      map.set(row.group.id, entry);
    }
    return [...map.values()].sort((a, b) => a.group.name.localeCompare(b.group.name, 'ar'));
  }, [dayRows]);

  const editingRows = editingGroupId
    ? (dayRows ?? []).filter((r) => r.group.id === editingGroupId)
    : [];

  function openFor(groupId: string | null) {
    setEditingGroupId(groupId);
    setDialogOpen(true);
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="الأوراد اليومية"
        description="لكل مجموعة يوم واحد يجمع أنواع الورد الثلاثة، ولكل نوع نطاقه الخاص"
        actions={
          <Button onClick={() => openFor(null)} disabled={groups.length === 0}>
            <Plus className="h-4 w-4" />
            ورد جديد
          </Button>
        }
      />

      {groups.length === 0 && (
        <Alert variant="info" title="لا توجد مجموعات بعد">
          أنشئ مجموعة أولاً لتتمكن من إسناد الأوراد.
        </Alert>
      )}
      {error && <Alert variant="danger">{error}</Alert>}

      <div className="grid gap-6 lg:grid-cols-[24rem_1fr] lg:items-start">
        <div className="flex flex-col gap-4">
          <Card className="p-4">
            <WeekStrip value={selectedDate} onChange={setSelectedDate} markers={weekCounts} />
            <div className="mt-4 flex items-center gap-2 border-t border-neutral-100 pt-4">
              <Input
                type="date"
                aria-label="اختيار تاريخ"
                value={selectedDate}
                onChange={(e) => e.target.value && setSelectedDate(e.target.value)}
                className="h-9 text-sm"
              />
              {selectedDate !== todayISO() && (
                <Button variant="quiet" size="sm" onClick={() => setSelectedDate(todayISO())}>
                  اليوم
                </Button>
              )}
            </div>
          </Card>
        </div>

        <Card className="overflow-hidden">
          <div className="flex items-center justify-between gap-3 border-b border-neutral-100 px-5 py-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-neutral-800">
              <CalendarDays className="h-4 w-4 text-primary-600" />
              {formatRelativeDay(selectedDate)}
            </div>
            {byGroup && byGroup.length > 0 && (
              <Badge variant="neutral">{byGroup.length} مجموعة</Badge>
            )}
          </div>

          {byGroup === null ? (
            <SkeletonRows rows={3} />
          ) : byGroup.length === 0 ? (
            <EmptyState
              icon={BookOpen}
              title="لا توجد أوراد في هذا اليوم"
              description="اختر يوماً آخر من التقويم، أو أسند أوراداً جديدة لمجموعة."
              action={
                groups.length > 0 && (
                  <Button variant="secondary" size="sm" onClick={() => openFor(null)}>
                    <Plus className="h-4 w-4" />
                    ورد جديد                  </Button>
                )
              }
            />
          ) : (
            <div className="divide-y divide-neutral-100">
              {byGroup.map(({ group, rows }) => (
                <div key={group.id} className="flex flex-col gap-3 p-5">
                  <div className="flex items-center justify-between gap-3">
                    <div className="font-semibold text-neutral-900">{group.name}</div>
                    <Button variant="ghost" size="sm" onClick={() => openFor(group.id)}>
                      <Pencil className="h-3.5 w-3.5" />
                      تعديل
                    </Button>
                  </div>

                  <div className="flex flex-col gap-2">
                    {DUTY_CATEGORIES.filter((c) => rows.some((r) => r.category === c)).map((c) => {
                      const row = rows.find((r) => r.category === c)!;
                      return (
                        <div
                          key={c}
                          className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-neutral-50 px-3 py-2"
                        >
                          <Badge variant={categoryBadge[c]} dot>
                            {DUTY_CATEGORY_LABELS[c]}
                          </Badge>
                          <span className="text-sm text-neutral-700">
                            {formatRange({
                              surahFrom: row.scope_surah_from,
                              ayahFrom: row.scope_ayah_from,
                              surahTo: row.scope_surah_to,
                              ayahTo: row.scope_ayah_to,
                            })}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <DayAssignmentDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        groups={groups}
        existing={editingRows}
        defaultDate={selectedDate}
        supervisorId={profile?.id ?? ''}
        onSaved={() => {
          setDialogOpen(false);
          loadWeek();
        }}
      />
    </div>
  );
}
