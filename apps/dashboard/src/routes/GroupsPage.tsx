import * as React from 'react';
import { ChevronLeft, Plus, UserRound, UsersRound } from 'lucide-react';
import {
  Alert,
  Avatar,
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
  Skeleton,
  SkeletonRows,
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
  const [viewing, setViewing] = React.useState<GroupRow | null>(null);

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
        description="كل موظف ينتمي لمجموعة واحدة، والأوراد تُسند للمجموعة"
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
            description="ابدأ بإنشاء مجموعة، ثم أضف إليها الموظفين وأسند لها الأوراد."
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
            <Card key={g.id} interactive className="overflow-hidden">
              <button
                type="button"
                onClick={() => setViewing(g)}
                className="flex w-full items-center gap-4 p-5 text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-500"
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-700 ring-1 ring-primary-100">
                  <UsersRound className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold text-neutral-900">{g.name}</div>
                  <div className="text-sm text-neutral-500">
                    <span className="tabular-nums">{g.employee_count}</span> موظف
                  </div>
                </div>
                <ChevronLeft className="h-4 w-4 shrink-0 text-neutral-300" />
              </button>
            </Card>
          ))}
        </div>
      )}

      <GroupMembersDialog group={viewing} onClose={() => setViewing(null)} />

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

interface MemberRow {
  id: string;
  full_name: string;
  username: string;
  is_active: boolean;
}

/**
 * The roster behind a group card. Fetched on open rather than joined into the group list —
 * the list only ever needed counts, and pulling every member of every group up front would
 * make the page cost grow with headcount for data that is usually not looked at.
 */
function GroupMembersDialog({ group, onClose }: { group: GroupRow | null; onClose: () => void }) {
  const [members, setMembers] = React.useState<MemberRow[] | null>(null);

  React.useEffect(() => {
    if (!group) return;
    let cancelled = false;
    setMembers(null);
    supabase
      .from('profiles')
      .select('id, full_name, username, is_active')
      .eq('role', 'employee')
      .eq('group_id', group.id)
      .order('full_name')
      .then(({ data, error }) => {
        if (cancelled) return;
        setMembers(error ? [] : ((data ?? []) as MemberRow[]));
      });
    return () => {
      cancelled = true;
    };
  }, [group]);

  return (
    <Dialog open={!!group} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{group?.name}</DialogTitle>
        </DialogHeader>
        <DialogBody>
          {members === null ? (
            <SkeletonRows rows={4} />
          ) : members.length === 0 ? (
            <EmptyState
              icon={UserRound}
              title="لا يوجد أعضاء"
              description="أضف مستخدمين إلى هذه المجموعة من صفحة المستخدمين."
            />
          ) : (
            <div className="flex flex-col gap-1">
              {members.map((m) => (
                <div
                  key={m.id}
                  className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-neutral-50"
                >
                  <Avatar name={m.full_name} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-neutral-900">
                      {m.full_name}
                    </div>
                    <div
                      dir="ltr"
                      className="truncate text-start font-mono text-[11px] text-neutral-500"
                    >
                      {m.username}
                    </div>
                  </div>
                  {!m.is_active && <Badge variant="neutral">موقوف</Badge>}
                </div>
              ))}
            </div>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            إغلاق
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
