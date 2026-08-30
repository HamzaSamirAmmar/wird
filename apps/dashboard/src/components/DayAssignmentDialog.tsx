import * as React from 'react';
import { SURAHS, formatRange, getSurah, validateRange } from '@wird/quran-data';
import { DUTY_CATEGORIES, DUTY_CATEGORY_LABELS, type DutyCategory } from '@wird/domain';
import {
  Alert,
  Button,
  Checkbox,
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  cn,
} from '@wird/ui-web';
import { supabase } from '../lib/supabase';

export interface AssignmentRow {
  id: string;
  category: DutyCategory;
  due_date: string;
  scope_surah_from: number;
  scope_ayah_from: number;
  scope_surah_to: number;
  scope_ayah_to: number;
  group: { id: string; name: string };
}

export interface GroupOption {
  id: string;
  name: string;
}

interface Scope {
  surahFrom: number;
  ayahFrom: number;
  surahTo: number;
  ayahTo: number;
}

/** Per-category state: whether the day includes it, its range, and the row it came from. */
interface CategoryDraft extends Scope {
  enabled: boolean;
  existingId: string | null;
}

const EMPTY_SCOPE: Scope = { surahFrom: 1, ayahFrom: 1, surahTo: 1, ayahTo: 1 };

function blankDrafts(): Record<DutyCategory, CategoryDraft> {
  return Object.fromEntries(
    DUTY_CATEGORIES.map((c) => [c, { ...EMPTY_SCOPE, enabled: false, existingId: null }]),
  ) as Record<DutyCategory, CategoryDraft>;
}

function toDraft(row: AssignmentRow): CategoryDraft {
  return {
    enabled: true,
    existingId: row.id,
    surahFrom: row.scope_surah_from,
    ayahFrom: row.scope_ayah_from,
    surahTo: row.scope_surah_to,
    ayahTo: row.scope_ayah_to,
  };
}

/**
 * Edits one group's whole day: tick the categories that apply, each carrying its own range.
 * Replaces the old one-row-at-a-time form, so a supervisor can set حفظ جديد + مراجعة صغرى +
 * مراجعة كبرى in a single pass, and later add or drop a type without leaving the dialog.
 */
export function DayAssignmentDialog({
  open,
  onOpenChange,
  groups,
  /** Existing rows for the group/day being edited; empty when creating. */
  existing,
  defaultDate,
  defaultGroupId,
  supervisorId,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groups: GroupOption[];
  existing: AssignmentRow[];
  defaultDate: string;
  defaultGroupId?: string;
  supervisorId: string;
  onSaved: () => void;
}) {
  const isEdit = existing.length > 0;
  const [groupId, setGroupId] = React.useState('');
  const [drafts, setDrafts] = React.useState<Record<DutyCategory, CategoryDraft>>(blankDrafts);
  const [date, setDate] = React.useState(defaultDate);
  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setError(null);
    const next = blankDrafts();
    for (const row of existing) next[row.category] = toDraft(row);
    setDrafts(next);
    setGroupId(existing[0]?.group.id ?? defaultGroupId ?? '');
    setDate(existing[0]?.due_date ?? defaultDate);
  }, [open, existing, defaultDate, defaultGroupId]);

  function patch(category: DutyCategory, changes: Partial<CategoryDraft>) {
    setDrafts((d) => ({ ...d, [category]: { ...d[category], ...changes } }));
  }

  const enabled = DUTY_CATEGORIES.filter((c) => drafts[c].enabled);
  // Categories that existed on load but have since been unticked — these get deleted, taking
  // their fanned-out duties with them (the FK cascades), so warn rather than do it silently.
  const removed = DUTY_CATEGORIES.filter((c) => drafts[c].existingId && !drafts[c].enabled);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!groupId) return setError('يجب اختيار مجموعة');
    if (!date) return setError('اختر تاريخاً');
    if (enabled.length === 0 && removed.length === 0)
      return setError('اختر نوعاً واحداً على الأقل');

    for (const c of enabled) {
      const rangeError = validateRange(drafts[c]);
      if (rangeError) return setError(`${DUTY_CATEGORY_LABELS[c]}: ${rangeError}`);
    }

    setSubmitting(true);

    // Deletes first: unticking then re-ticking a category in one pass must not collide with
    // the (group, category, day) uniqueness constraint.
    const deleteIds = removed.map((c) => drafts[c].existingId!);
    if (deleteIds.length > 0) {
      const { error } = await supabase.from('duty_group_assignments').delete().in('id', deleteIds);
      if (error) {
        setSubmitting(false);
        return setError('تعذر حذف النوع المحذوف');
      }
    }

    for (const c of enabled) {
      const d = drafts[c];
      const scope = {
        scope_surah_from: d.surahFrom,
        scope_ayah_from: d.ayahFrom,
        scope_surah_to: d.surahTo,
        scope_ayah_to: d.ayahTo,
      };

      if (d.existingId) {
        const { error } = await supabase
          .from('duty_group_assignments')
          .update({ category: c, ...scope })
          .eq('id', d.existingId);
        if (error) {
          setSubmitting(false);
          return setError(`تعذر حفظ ${DUTY_CATEGORY_LABELS[c]}`);
        }
      } else {
        // upsert on the uniqueness constraint: re-saving a day is idempotent rather than a
        // duplicate-key error the supervisor has to decipher.
        const { error } = await supabase.from('duty_group_assignments').upsert(
          {
            group_id: groupId,
            category: c,
            due_date: date,
            assigned_by: supervisorId,
            ...scope,
          },
          { onConflict: 'group_id,category,due_date' },
        );
        if (error) {
          setSubmitting(false);
          return setError(`تعذر إنشاء ${DUTY_CATEGORY_LABELS[c]}`);
        }
      }
    }

    setSubmitting(false);
    onSaved();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'تعديل ورد اليوم' : 'ورد جديد'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <DialogBody>
            {error && <Alert variant="danger">{error}</Alert>}

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

            {!isEdit && (
              <Field label="التاريخ">
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </Field>
            )}

            <div className="flex flex-col gap-3">
              <div className="text-xs font-semibold text-neutral-500">أنواع الورد لهذا اليوم</div>
              {DUTY_CATEGORIES.map((c) => (
                <CategorySection
                  key={c}
                  category={c}
                  draft={drafts[c]}
                  onChange={(changes) => patch(c, changes)}
                />
              ))}
            </div>

            {removed.length > 0 && (
              <Alert variant="warning" title="سيتم حذف أنواع">
                {removed.map((c) => DUTY_CATEGORY_LABELS[c]).join('، ')} — سيُحذف الواجب من جميع
                موظفي المجموعة لهذا اليوم، بما في ذلك ما تم إنجازه منه.
              </Alert>
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

function CategorySection({
  category,
  draft,
  onChange,
}: {
  category: DutyCategory;
  draft: CategoryDraft;
  onChange: (changes: Partial<CategoryDraft>) => void;
}) {
  const id = `cat-${category}`;
  return (
    <div
      className={cn(
        'rounded-xl ring-1 transition-colors duration-150',
        draft.enabled ? 'bg-surface ring-primary-200' : 'bg-neutral-50 ring-neutral-200',
      )}
    >
      <label htmlFor={id} className="flex cursor-pointer items-center gap-3 p-4">
        <Checkbox
          id={id}
          checked={draft.enabled}
          onCheckedChange={(v) => onChange({ enabled: v === true })}
        />
        <span className="flex-1 font-medium text-neutral-900">
          {DUTY_CATEGORY_LABELS[category]}
        </span>
        {draft.enabled ? (
          <span className="text-xs text-neutral-500">{formatRange(draft)}</span>
        ) : (
          <span className="text-xs text-neutral-400">غير مفعّل</span>
        )}
      </label>

      {draft.enabled && (
        <div className="grid gap-4 border-t border-neutral-100 p-4 sm:grid-cols-2">
          <Field label="من سورة">
            <SurahSelect
              value={draft.surahFrom}
              onChange={(n) =>
                onChange({
                  surahFrom: n,
                  ayahFrom: Math.min(draft.ayahFrom, getSurah(n).ayahCount),
                })
              }
            />
          </Field>
          <Field label="من آية">
            <AyahSelect
              surah={draft.surahFrom}
              value={draft.ayahFrom}
              onChange={(n) => onChange({ ayahFrom: n })}
            />
          </Field>
          <Field label="إلى سورة">
            <SurahSelect
              value={draft.surahTo}
              onChange={(n) =>
                onChange({ surahTo: n, ayahTo: Math.min(draft.ayahTo, getSurah(n).ayahCount) })
              }
            />
          </Field>
          <Field label="إلى آية">
            <AyahSelect
              surah={draft.surahTo}
              value={draft.ayahTo}
              onChange={(n) => onChange({ ayahTo: n })}
            />
          </Field>
        </div>
      )}
    </div>
  );
}

function SurahSelect({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
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
  );
}

/** Ayah picker bounded by the chosen surah's ayah count. */
function AyahSelect({
  surah,
  value,
  onChange,
}: {
  surah: number;
  value: number;
  onChange: (n: number) => void;
}) {
  const count = getSurah(surah).ayahCount;
  return (
    <Select value={String(value)} onValueChange={(v) => onChange(Number(v))}>
      <SelectTrigger>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {Array.from({ length: count }, (_, i) => i + 1).map((n) => (
          <SelectItem key={n} value={String(n)}>
            {n}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
