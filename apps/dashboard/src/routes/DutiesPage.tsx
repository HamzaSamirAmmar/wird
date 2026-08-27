import * as React from 'react';
import { BookOpen, CalendarDays, Layers, Pencil, Plus, X } from 'lucide-react';
import { SURAHS, validateRange, formatRange } from '@wird/quran-data';
import { DUTY_CATEGORIES, DUTY_CATEGORY_LABELS, type DutyCategory } from '@wird/domain';
import {
  Alert,
  Badge,
  Button,
  Card,
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  EmptyState,
  Field,
  Input,
  PageHeader,
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
} from '@wird/ui-web';
import { WeekStrip } from '../components/WeekStrip';
import { addDays, formatRelativeDay, isoWeekStart, todayISO } from '../lib/dates';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth-context';

interface AssignmentRow {
  id: string;
  category: DutyCategory;
  due_date: string;
  scope_surah_from: number;
  scope_ayah_from: number;
  scope_surah_to: number;
  scope_ayah_to: number;
  scope_note: string | null;
  group: { id: string; name: string };
}

interface GroupOption {
  id: string;
  name: string;
}

const categoryBadge: Record<DutyCategory, 'brand' | 'in_progress' | 'completed'> = {
  new_memorization: 'brand',
  minor_review: 'in_progress',
  major_review: 'completed',
};

const ASSIGNMENT_COLUMNS =
  'id, category, due_date, scope_surah_from, scope_ayah_from, scope_surah_to, scope_ayah_to, scope_note, group:groups(id, name)';

export default function DutiesPage() {
  const { profile } = useAuth();
  const [selectedDate, setSelectedDate] = React.useState(todayISO());
  const [assignments, setAssignments] = React.useState<AssignmentRow[] | null>(null);
  const [weekCounts, setWeekCounts] = React.useState<Record<string, number>>({});
  const [groups, setGroups] = React.useState<GroupOption[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<AssignmentRow | null>(null);

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
      setError('تعذر تحميل واجبات هذا الأسبوع');
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

  const dayAssignments = assignments?.filter((a) => a.due_date === selectedDate) ?? null;
  const coveredGroups = new Set(dayAssignments?.map((a) => a.group.id)).size;

  function openNew() {
    setEditing(null);
    setDialogOpen(true);
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="الأورد اليومية"
        description="أسند الحفظ والمراجعة لكل مجموعة على تقويم الأسبوع"
        actions={
          <Button onClick={openNew} disabled={groups.length === 0}>
            <Plus className="h-4 w-4" />
            واجب جديد
          </Button>
        }
      />

      {groups.length === 0 && (
        <Alert variant="info" title="لا توجد مجموعات بعد">
          أنشئ مجموعة أولاً لتتمكن من إسناد الأورد.
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

          <div className="grid grid-cols-2 gap-3">
            <StatTile icon={BookOpen} label="واجبات اليوم" value={dayAssignments?.length ?? null} />
            <StatTile
              icon={Layers}
              label="مجموعات مشمولة"
              value={dayAssignments ? coveredGroups : null}
            />
          </div>
        </div>

        <Card className="overflow-hidden">
          <div className="flex items-center justify-between gap-3 border-b border-neutral-100 px-5 py-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-neutral-800">
              <CalendarDays className="h-4 w-4 text-primary-600" />
              {formatRelativeDay(selectedDate)}
            </div>
            {dayAssignments && dayAssignments.length > 0 && (
              <Badge variant="neutral">{dayAssignments.length} واجب</Badge>
            )}
          </div>

          {dayAssignments === null ? (
            <SkeletonRows rows={3} />
          ) : dayAssignments.length === 0 ? (
            <EmptyState
              icon={BookOpen}
              title="لا توجد واجبات في هذا اليوم"
              description="اختر يوماً آخر من التقويم، أو أضف واجباً جديداً لهذه المجموعة."
              action={
                groups.length > 0 && (
                  <Button variant="secondary" size="sm" onClick={openNew}>
                    <Plus className="h-4 w-4" />
                    واجب جديد
                  </Button>
                )
              }
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>المجموعة</TableHead>
                  <TableHead>النوع</TableHead>
                  <TableHead>النطاق</TableHead>
                  <TableHead className="w-px" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {dayAssignments.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="font-medium text-neutral-900">{a.group.name}</TableCell>
                    <TableCell>
                      <Badge variant={categoryBadge[a.category]} dot>
                        {DUTY_CATEGORY_LABELS[a.category]}
                      </Badge>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {formatRange({
                        surahFrom: a.scope_surah_from,
                        ayahFrom: a.scope_ayah_from,
                        surahTo: a.scope_surah_to,
                        ayahTo: a.scope_ayah_to,
                      })}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setEditing(a);
                          setDialogOpen(true);
                        }}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        تعديل
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Card>
      </div>

      <DutyFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        groups={groups}
        editing={editing}
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

function StatTile({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof BookOpen;
  label: string;
  value: number | null;
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

function SurahSelect({
  value,
  onChange,
  label,
}: {
  value: number;
  onChange: (n: number) => void;
  label: string;
}) {
  return (
    <Field label={label}>
      <Select value={String(value)} onValueChange={(v) => onChange(Number(v))}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {SURAHS.map((s) => (
            <SelectItem key={s.number} value={String(s.number)}>
              {s.number}. {s.nameAr}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  );
}

function DutyFormDialog({
  open,
  onOpenChange,
  groups,
  editing,
  defaultDate,
  supervisorId,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groups: GroupOption[];
  editing: AssignmentRow | null;
  defaultDate: string;
  supervisorId: string;
  onSaved: () => void;
}) {
  const isEdit = !!editing;
  const [groupId, setGroupId] = React.useState('');
  const [category, setCategory] = React.useState<DutyCategory>('new_memorization');
  const [surahFrom, setSurahFrom] = React.useState(1);
  const [ayahFrom, setAyahFrom] = React.useState(1);
  const [surahTo, setSurahTo] = React.useState(1);
  const [ayahTo, setAyahTo] = React.useState(1);
  const [dates, setDates] = React.useState<string[]>([]);
  const [dateInput, setDateInput] = React.useState(defaultDate);
  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setError(null);
    if (editing) {
      setGroupId(editing.group.id);
      setCategory(editing.category);
      setSurahFrom(editing.scope_surah_from);
      setAyahFrom(editing.scope_ayah_from);
      setSurahTo(editing.scope_surah_to);
      setAyahTo(editing.scope_ayah_to);
      setDates([editing.due_date]);
    } else {
      setGroupId('');
      setCategory('new_memorization');
      setSurahFrom(1);
      setAyahFrom(1);
      setSurahTo(1);
      setAyahTo(1);
      setDates([defaultDate]);
      setDateInput(defaultDate);
    }
  }, [open, editing, defaultDate]);

  function addDate() {
    if (!dateInput) return;
    if (dates.includes(dateInput)) return;
    setDates((d) => [...d, dateInput].sort());
  }

  function removeDate(date: string) {
    setDates((d) => d.filter((x) => x !== date));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!groupId) {
      setError('يجب اختيار مجموعة');
      return;
    }
    if (dates.length === 0) {
      setError('اختر تاريخاً واحداً على الأقل');
      return;
    }
    const rangeError = validateRange({ surahFrom, ayahFrom, surahTo, ayahTo });
    if (rangeError) {
      setError(rangeError);
      return;
    }

    setSubmitting(true);

    if (isEdit && editing) {
      const { error } = await supabase
        .from('duty_group_assignments')
        .update({
          category,
          scope_surah_from: surahFrom,
          scope_ayah_from: ayahFrom,
          scope_surah_to: surahTo,
          scope_ayah_to: ayahTo,
        })
        .eq('id', editing.id);
      setSubmitting(false);
      if (error) {
        setError('تعذر حفظ التعديل');
        return;
      }
    } else {
      const rows = dates.map((due_date) => ({
        group_id: groupId,
        category,
        due_date,
        scope_surah_from: surahFrom,
        scope_ayah_from: ayahFrom,
        scope_surah_to: surahTo,
        scope_ayah_to: ayahTo,
        assigned_by: supervisorId,
      }));
      const { error } = await supabase.from('duty_group_assignments').insert(rows);
      setSubmitting(false);
      if (error) {
        setError('تعذر إنشاء الواجب');
        return;
      }
    }

    onSaved();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'تعديل الواجب' : 'واجب جديد'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <DialogBody>
            {error && <Alert variant="danger">{error}</Alert>}

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="المجموعة">
                <Select value={groupId} onValueChange={setGroupId} disabled={isEdit}>
                  <SelectTrigger>
                    <SelectValue placeholder="اختر مجموعة" />
                  </SelectTrigger>
                  <SelectContent>
                    {groups.map((g) => (
                      <SelectItem key={g.id} value={g.id}>
                        {g.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="النوع">
                <Select value={category} onValueChange={(v) => setCategory(v as DutyCategory)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DUTY_CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {DUTY_CATEGORY_LABELS[c]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>

            <fieldset className="rounded-xl bg-neutral-50 p-4 ring-1 ring-neutral-200">
              <legend className="px-1 text-xs font-semibold text-neutral-500">نطاق الورد</legend>
              <div className="grid gap-4 sm:grid-cols-2">
                <SurahSelect label="من سورة" value={surahFrom} onChange={setSurahFrom} />
                <Field label="من آية">
                  <Input
                    type="number"
                    min={1}
                    value={ayahFrom}
                    onChange={(e) => setAyahFrom(Number(e.target.value))}
                  />
                </Field>
                <SurahSelect label="إلى سورة" value={surahTo} onChange={setSurahTo} />
                <Field label="إلى آية">
                  <Input
                    type="number"
                    min={1}
                    value={ayahTo}
                    onChange={(e) => setAyahTo(Number(e.target.value))}
                  />
                </Field>
              </div>
            </fieldset>

            {!isEdit && (
              <Field label="التواريخ" hint="أضف أكثر من تاريخ لتكرار نفس الواجب على عدة أيام">
                <div className="flex gap-2">
                  <Input
                    type="date"
                    value={dateInput}
                    onChange={(e) => setDateInput(e.target.value)}
                  />
                  <Button type="button" variant="outline" onClick={addDate}>
                    إضافة
                  </Button>
                </div>
                {dates.length > 0 && (
                  <div className="flex flex-wrap gap-2 pt-2">
                    {dates.map((d) => (
                      <span
                        key={d}
                        className="flex items-center gap-1.5 rounded-full bg-primary-50 py-1 pe-2 ps-3 text-xs font-medium text-primary-800 ring-1 ring-inset ring-primary-100"
                      >
                        <span dir="ltr">{d}</span>
                        <button
                          type="button"
                          aria-label={`إزالة ${d}`}
                          onClick={() => removeDate(d)}
                          className="rounded-full p-0.5 text-primary-500 transition-colors hover:bg-primary-100 hover:text-primary-800"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </Field>
            )}
          </DialogBody>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              إلغاء
            </Button>
            <Button type="submit" loading={submitting}>
              حفظ
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
