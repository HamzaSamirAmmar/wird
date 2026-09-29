import * as React from 'react';
import { Plus, Trash2, Users } from 'lucide-react';
import {
  Alert,
  Button,
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
} from '@wird/ui-web';
import { createEmployeeSchema, formatTelegramInput } from '@wird/domain';
import { supabase } from '../lib/supabase';
import { suggestUsername } from '../lib/suggest-username';

interface GroupOption {
  id: string;
  name: string;
}

interface EmployeeEntry {
  key: number;
  fullName: string;
  username: string;
  /** Shown with a leading '@'; the schema strips it for storage. */
  telegram: string;
  /** true when the user has manually edited the username (disables auto-suggestion) */
  usernameTouched: boolean;
}

export interface BulkCreatedCreds {
  username: string;
  password: string;
  fullName: string;
}

let nextKey = 0;
function freshEntry(): EmployeeEntry {
  return { key: ++nextKey, fullName: '', username: '', telegram: '', usernameTouched: false };
}

export function BulkCreateDialog({
  open,
  onOpenChange,
  groups,
  onCreated,
  initialGroupId,
  lockGroup,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groups: GroupOption[];
  onCreated: (creds: BulkCreatedCreds[]) => void;
  initialGroupId?: string;
  lockGroup?: boolean;
}) {
  const [entries, setEntries] = React.useState<EmployeeEntry[]>([]);
  const [groupId, setGroupId] = React.useState(initialGroupId ?? '');
  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [progress, setProgress] = React.useState<{ done: number; total: number } | null>(null);

  React.useEffect(() => {
    if (open) {
      setEntries([freshEntry(), freshEntry()]);
      setGroupId(initialGroupId ?? '');
      setError(null);
      setProgress(null);
    }
  }, [open, initialGroupId]);

  function updateEntry(key: number, patch: Partial<EmployeeEntry>) {
    setEntries((prev) =>
      prev.map((e) => {
        if (e.key !== key) return e;
        const updated = { ...e, ...patch };
        // Auto-suggest username when name changes and username hasn't been manually touched
        if ('fullName' in patch && !updated.usernameTouched) {
          updated.username = suggestUsername(updated.fullName);
        }
        return updated;
      }),
    );
  }

  function removeEntry(key: number) {
    setEntries((prev) => (prev.length <= 1 ? prev : prev.filter((e) => e.key !== key)));
  }

  function addEntry() {
    setEntries((prev) => [...prev, freshEntry()]);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    // Validate group
    if (!groupId) {
      setError('يجب اختيار مجموعة');
      return;
    }

    // Validate all entries
    const validEntries: {
      username: string;
      fullName: string;
      groupId: string;
      telegramUsername?: string | null;
    }[] = [];
    const seenUsernames = new Set<string>();
    const seenTelegram = new Set<string>();

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      // skip empty rows
      if (!entry.fullName.trim() && !entry.username.trim() && !entry.telegram.trim()) continue;

      const parsed = createEmployeeSchema.safeParse({
        username: entry.username,
        fullName: entry.fullName,
        groupId,
        telegramUsername: entry.telegram,
      });

      if (!parsed.success) {
        setError(`صف ${i + 1}: ${parsed.error.issues[0]?.message ?? 'خطأ في البيانات'}`);
        return;
      }

      if (seenUsernames.has(parsed.data.username)) {
        setError(`صف ${i + 1}: اسم المستخدم "${parsed.data.username}" مكرر`);
        return;
      }
      const tg = parsed.data.telegramUsername;
      if (tg && seenTelegram.has(tg)) {
        setError(`صف ${i + 1}: معرف تيليجرام "@${tg}" مكرر`);
        return;
      }
      seenUsernames.add(parsed.data.username);
      if (tg) seenTelegram.add(tg);
      validEntries.push(parsed.data);
    }

    if (validEntries.length === 0) {
      setError('أدخل بيانات مستخدم واحد على الأقل');
      return;
    }

    setSubmitting(true);
    setError(null);
    setProgress({ done: 0, total: validEntries.length });

    const allCreds: BulkCreatedCreds[] = [];
    const errors: string[] = [];

    for (let i = 0; i < validEntries.length; i++) {
      const entry = validEntries[i];
      const { data, error } = await supabase.functions.invoke<{
        username: string;
        fullName: string;
        password: string;
        error?: string;
      }>('create-employee', { body: entry });

      if (error || !data || data.error) {
        errors.push(`${entry.fullName} (${entry.username}): ${data?.error ?? 'فشل الإنشاء'}`);
      } else {
        allCreds.push({
          username: data.username,
          password: data.password,
          fullName: data.fullName,
        });
      }

      setProgress({ done: i + 1, total: validEntries.length });
    }

    setSubmitting(false);
    setProgress(null);

    if (errors.length > 0 && allCreds.length === 0) {
      setError(errors.join('\n'));
      return;
    }

    if (errors.length > 0) {
      // Some succeeded, some failed — show credentials for successes, report errors
      setError(`تم إنشاء ${allCreds.length} من ${validEntries.length}. فشل:\n${errors.join('\n')}`);
    }

    if (allCreds.length > 0) {
      onCreated(allCreds);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            <Users className="inline-block h-5 w-5 align-text-bottom" /> إضافة مستخدمين دفعة واحدة
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <DialogBody>
            {error && <Alert variant="danger">{error}</Alert>}

            <Field label="المجموعة">
              <Select value={groupId} onValueChange={setGroupId} disabled={lockGroup}>
                <SelectTrigger disabled={lockGroup}>
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

            <div className="mt-2 flex flex-col gap-3">
              <div className="hidden sm:grid sm:grid-cols-[1fr_1fr_1fr_2.5rem] sm:gap-2 text-xs font-medium text-neutral-500">
                <span>الاسم الكامل</span>
                <span>اسم المستخدم</span>
                <span>معرف تيليجرام</span>
                <span />
              </div>

              {entries.map((entry, i) => (
                <div
                  key={entry.key}
                  className="flex flex-col gap-2 rounded-xl border border-neutral-200/80 bg-neutral-50/60 p-3 sm:grid sm:grid-cols-[1fr_1fr_1fr_2.5rem] sm:items-center sm:gap-2 sm:rounded-none sm:border-0 sm:bg-transparent sm:p-0"
                >
                  <div className="flex items-center justify-between pb-1 sm:hidden">
                    <span className="text-xs font-semibold text-neutral-600">
                      المستخدم #{i + 1}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeEntry(entry.key)}
                      className="flex h-7 w-7 items-center justify-center rounded-lg text-neutral-400 transition-colors hover:bg-red-50 hover:text-red-500 disabled:opacity-30"
                      disabled={entries.length <= 1}
                      aria-label="حذف"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <Input
                    value={entry.fullName}
                    onChange={(e) => updateEntry(entry.key, { fullName: e.target.value })}
                    placeholder={i === 0 ? 'الاسم الكامل (أحمد علي)' : 'الاسم الكامل'}
                    autoFocus={i === 0}
                  />
                  <Input
                    dir="ltr"
                    value={entry.username}
                    onChange={(e) =>
                      updateEntry(entry.key, {
                        username: e.target.value.toLowerCase(),
                        usernameTouched: true,
                      })
                    }
                    placeholder="اسم المستخدم (ahmed_ali)"
                  />
                  <Input
                    dir="ltr"
                    value={entry.telegram}
                    onChange={(e) =>
                      updateEntry(entry.key, { telegram: formatTelegramInput(e.target.value) })
                    }
                    placeholder="تيليجرام (@ahmed)"
                    aria-label={`معرف تيليجرام للصف ${i + 1}`}
                  />
                  <button
                    type="button"
                    onClick={() => removeEntry(entry.key)}
                    className="hidden sm:flex h-9 w-9 items-center justify-center rounded-lg text-neutral-400 transition-colors hover:bg-red-50 hover:text-red-500 disabled:opacity-30"
                    disabled={entries.length <= 1}
                    aria-label="حذف الصف"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>

            <Button type="button" variant="ghost" size="sm" onClick={addEntry} className="mt-1">
              <Plus className="h-4 w-4" />
              إضافة صف
            </Button>

            {progress && (
              <div className="mt-2 text-sm text-neutral-500">
                جارٍ الإنشاء… {progress.done} / {progress.total}
              </div>
            )}
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              إلغاء
            </Button>
            <Button type="submit" loading={submitting}>
              إنشاء الكل ({entries.filter((e) => e.fullName.trim()).length})
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
