import * as React from 'react';
import { Plus, UsersRound } from 'lucide-react';
import {
  Alert,
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
  Skeleton,
} from '@wird/ui-web';
import { createGroupSchema } from '@wird/domain';
import { supabase } from '../lib/supabase';

interface GroupRow {
  id: string;
  name: string;
  created_at: string;
  employee_count: number;
}

export default function GroupsPage() {
  const [groups, setGroups] = React.useState<GroupRow[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = React.useState(false);

  const load = React.useCallback(async () => {
    const { data, error } = await supabase
      .from('groups')
      .select('id, name, created_at, profiles!profiles_group_id_fkey(count)')
      .order('created_at', { ascending: false });

    if (error) {
      setError('تعذر تحميل المجموعات');
      setGroups([]);
      return;
    }
    setError(null);
    setGroups(
      (data ?? []).map((g) => ({
        id: g.id,
        name: g.name,
        created_at: g.created_at,
        employee_count: (g.profiles as unknown as { count: number }[])?.[0]?.count ?? 0,
      })),
    );
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="المجموعات"
        description="كل موظف ينتمي لمجموعة واحدة، والأورد تُسند للمجموعة"
        actions={
          <Button onClick={() => setDialogOpen(true)}>
            <Plus className="h-4 w-4" />
            مجموعة جديدة
          </Button>
        }
      />

      {error && <Alert variant="danger">{error}</Alert>}

      {groups === null ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }, (_, i) => (
            <Card key={i} className="flex items-center gap-4 p-5">
              <Skeleton className="h-11 w-11 rounded-xl" />
              <div className="flex flex-1 flex-col gap-2">
                <Skeleton className="h-3.5 w-2/3" />
                <Skeleton className="h-3 w-1/3" />
              </div>
            </Card>
          ))}
        </div>
      ) : groups.length === 0 ? (
        <Card>
          <EmptyState
            icon={UsersRound}
            title="لا توجد مجموعات بعد"
            description="ابدأ بإنشاء مجموعة، ثم أضف إليها الموظفين وأسند لها الأورد."
            action={
              <Button size="sm" onClick={() => setDialogOpen(true)}>
                <Plus className="h-4 w-4" />
                مجموعة جديدة
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {groups.map((g) => (
            <Card key={g.id} interactive className="flex items-center gap-4 p-5">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-700 ring-1 ring-primary-100">
                <UsersRound className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <div className="truncate font-semibold text-neutral-900">{g.name}</div>
                <div className="text-sm text-neutral-500">
                  <span className="tabular-nums">{g.employee_count}</span> موظف
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <CreateGroupDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onCreated={() => {
          setDialogOpen(false);
          load();
        }}
      />
    </div>
  );
}

function CreateGroupDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}) {
  const [name, setName] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setName('');
      setError(null);
    }
  }, [open]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = createGroupSchema.safeParse({ name });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'خطأ في البيانات');
      return;
    }
    setSubmitting(true);
    setError(null);
    const { error } = await supabase.from('groups').insert({ name: parsed.data.name });
    setSubmitting(false);
    if (error) {
      setError('تعذر إنشاء المجموعة');
      return;
    }
    onCreated();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>مجموعة جديدة</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <DialogBody>
            {error && <Alert variant="danger">{error}</Alert>}
            <Field label="اسم المجموعة" htmlFor="group-name" hint="مثال: مجموعة الفجر">
              <Input
                id="group-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
                required
              />
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              إلغاء
            </Button>
            <Button type="submit" loading={submitting}>
              إنشاء
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
