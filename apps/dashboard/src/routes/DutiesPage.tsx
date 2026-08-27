import * as React from 'react';
import { Plus, ChevronRight, ChevronLeft, X } from 'lucide-react';
import { SURAHS, validateRange, formatRange } from '@wird/quran-data';
import { DUTY_CATEGORIES, DUTY_CATEGORY_LABELS, type DutyCategory } from '@wird/domain';
import {
  Button,
  Input,
  Label,
  Card,
  CardContent,
  Alert,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  Spinner,
  Badge,
} from '@wird/ui-web';
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

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function addDays(iso: string, days: number) {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export default function DutiesPage() {
  const { profile } = useAuth();
  const [selectedDate, setSelectedDate] = React.useState(todayISO());
  const [assignments, setAssignments] = React.useState<AssignmentRow[] | null>(null);
  const [groups, setGroups] = React.useState<GroupOption[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<AssignmentRow | null>(null);

  const loadAssignments = React.useCallback(async () => {
    setAssignments(null);
    const { data, error } = await supabase
      .from('duty_group_assignments')
      .select(
        'id, category, due_date, scope_surah_from, scope_ayah_from, scope_surah_to, scope_ayah_to, scope_note, group:groups(id, name)',
      )
      .eq('due_date', selectedDate)
      .order('created_at');

    if (error) {
      setError('تعذر تحميل واجبات هذا اليوم');
      return;
    }
    setAssignments(data as unknown as AssignmentRow[]);
  }, [selectedDate]);

  React.useEffect(() => {
    loadAssignments();
  }, [loadAssignments]);

  React.useEffect(() => {
    supabase
      .from('groups')
      .select('id, name')
      .order('name')
      .then(({ data }) => setGroups(data ?? []));
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-neutral-900">الأورد اليومية</h1>
        <Button onClick={() => { setEditing(null); setDialogOpen(true); }} disabled={groups.length === 0}>
          <Plus className="h-4 w-4" />
          واجب جديد
        </Button>
      </div>

      {groups.length === 0 && <Alert variant="info">أنشئ مجموعة أولاً لتتمكن من إسناد الأورد</Alert>}
      {error && <Alert variant="danger">{error}</Alert>}

      <div className="flex items-center justify-center gap-3">
        <Button variant="outline" size="sm" onClick={() => setSelectedDate((d) => addDays(d, 1))}>
          <ChevronRight className="h-4 w-4" />
        </Button>
        <Input
          type="date"
          value={selectedDate}
          onChange={(e) => setSelectedDate(e.target.value)}
          className="w-44 text-center"
        />
        <Button variant="outline" size="sm" onClick={() => setSelectedDate((d) => addDays(d, -1))}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        {selectedDate !== todayISO() && (
          <Button variant="ghost" size="sm" onClick={() => setSelectedDate(todayISO())}>
            اليوم
          </Button>
        )}
      </div>

      <Card>
        <CardContent className="p-0">
          {assignments === null ? (
            <div className="flex justify-center p-8">
              <Spinner />
            </div>
          ) : assignments.length === 0 ? (
            <p className="p-8 text-center text-sm text-neutral-500">لا توجد واجبات في هذا اليوم</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>المجموعة</TableHead>
                  <TableHead>النوع</TableHead>
                  <TableHead>النطاق</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {assignments.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="font-medium text-neutral-900">{a.group.name}</TableCell>
                    <TableCell>
                      <Badge variant="neutral">{DUTY_CATEGORY_LABELS[a.category]}</Badge>
                    </TableCell>
                    <TableCell>
                      {formatRange({
                        surahFrom: a.scope_surah_from,
                        ayahFrom: a.scope_ayah_from,
                        surahTo: a.scope_surah_to,
                        ayahTo: a.scope_ayah_to,
                      })}
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="sm" onClick={() => { setEditing(a); setDialogOpen(true); }}>
                        تعديل
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <DutyFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        groups={groups}
        editing={editing}
        defaultDate={selectedDate}
        supervisorId={profile?.id ?? ''}
        onSaved={() => {
          setDialogOpen(false);
          loadAssignments();
        }}
      />
    </div>
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
    <div className="flex flex-col gap-1.5">
      <Label>{label}</Label>
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
    </div>
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
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {error && <Alert variant="danger">{error}</Alert>}

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label>المجموعة</Label>
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
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>النوع</Label>
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
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <SurahSelect label="من سورة" value={surahFrom} onChange={setSurahFrom} />
            <div className="flex flex-col gap-1.5">
              <Label>من آية</Label>
              <Input
                type="number"
                min={1}
                value={ayahFrom}
                onChange={(e) => setAyahFrom(Number(e.target.value))}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <SurahSelect label="إلى سورة" value={surahTo} onChange={setSurahTo} />
            <div className="flex flex-col gap-1.5">
              <Label>إلى آية</Label>
              <Input type="number" min={1} value={ayahTo} onChange={(e) => setAyahTo(Number(e.target.value))} />
            </div>
          </div>

          {!isEdit && (
            <div className="flex flex-col gap-1.5">
              <Label>التواريخ</Label>
              <div className="flex gap-2">
                <Input type="date" value={dateInput} onChange={(e) => setDateInput(e.target.value)} />
                <Button type="button" variant="outline" onClick={addDate}>
                  إضافة
                </Button>
              </div>
              <div className="flex flex-wrap gap-2 pt-1">
                {dates.map((d) => (
                  <span
                    key={d}
                    className="flex items-center gap-1 rounded-full bg-primary-50 px-3 py-1 text-xs font-medium text-primary-800"
                  >
                    {d}
                    <button type="button" onClick={() => removeDate(d)}>
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              إلغاء
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'جاري الحفظ...' : 'حفظ'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
