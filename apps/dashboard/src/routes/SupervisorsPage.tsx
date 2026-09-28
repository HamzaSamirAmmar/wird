import * as React from 'react';
import { Navigate } from 'react-router-dom';
import { Check, Copy, Pencil, Plus, ShieldCheck } from 'lucide-react';
import {
  Alert,
  Avatar,
  Badge,
  Button,
  Card,
  Checkbox,
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  EmptyState,
  Field,
  IconButton,
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
import { createEmployeeSchema } from '@wird/domain';
import { useAuth } from '../lib/auth-context';
import { supabase } from '../lib/supabase';
import { suggestUsername } from '../lib/suggest-username';

interface SupervisorRow {
  id: string;
  username: string;
  full_name: string;
  is_active: boolean;
  group: { id: string; name: string } | null;
}

interface GroupOption {
  id: string;
  name: string;
}

/**
 * Superadmin-only: creates and manages supervisor accounts. Unlike employees, a supervisor
 * is always assigned to exactly one group at creation and cannot be created by another
 * supervisor — only by a superadmin, via the same `create-employee` edge function.
 */
export default function SupervisorsPage() {
  const { profile } = useAuth();
  const [supervisors, setSupervisors] = React.useState<SupervisorRow[] | null>(null);
  const [groups, setGroups] = React.useState<GroupOption[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [createdCreds, setCreatedCreds] = React.useState<{
    username: string;
    password: string;
  } | null>(null);
  const [editing, setEditing] = React.useState<SupervisorRow | null>(null);

  const load = React.useCallback(async () => {
    const [supervisorsRes, groupsRes] = await Promise.all([
      supabase
        .from('profiles')
        .select('id, username, full_name, is_active, group:groups!profiles_group_id_fkey(id, name)')
        .eq('role', 'supervisor')
        .order('created_at', { ascending: false }),
      supabase.from('groups').select('id, name').order('name'),
    ]);

    if (supervisorsRes.error) {
      setError('تعذر تحميل المشرفين');
      setSupervisors([]);
    } else {
      setError(null);
      setSupervisors(supervisorsRes.data as unknown as SupervisorRow[]);
    }
    if (!groupsRes.error) setGroups(groupsRes.data ?? []);
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  if (profile && profile.role !== 'superadmin') return <Navigate to="/unauthorized" replace />;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="المشرفون"
        description="أنشئ حسابات المشرفين وأسند كل واحد منهم إلى مجموعة واحدة يديرها"
        actions={
          <Button onClick={() => setDialogOpen(true)} disabled={groups.length === 0}>
            <Plus className="h-4 w-4" />
            مشرف جديد
          </Button>
        }
      />

      {groups.length === 0 && (
        <Alert variant="warning" title="أنشئ مجموعة أولاً">
          يجب إنشاء مجموعة واحدة على الأقل قبل إضافة مشرفين.
        </Alert>
      )}
      {error && <Alert variant="danger">{error}</Alert>}

      <Card className="overflow-hidden">
        {supervisors === null ? (
          <SkeletonRows rows={4} />
        ) : supervisors.length === 0 ? (
          <EmptyState
            icon={ShieldCheck}
            title="لا يوجد مشرفون بعد"
            description="أنشئ حساب مشرف وأسنده إلى مجموعة؛ ستظهر بيانات الدخول مرة واحدة فقط بعد الإنشاء."
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>الاسم</TableHead>
                <TableHead>اسم المستخدم</TableHead>
                <TableHead>المجموعة</TableHead>
                <TableHead>الحالة</TableHead>
                <TableHead>
                  <span className="sr-only">إجراءات</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {supervisors.map((s) => (
                <TableRow key={s.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar name={s.full_name} size="sm" />
                      <span className="font-medium text-neutral-900">{s.full_name}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <span dir="ltr" className="font-mono text-xs text-neutral-500">
                      {s.username}
                    </span>
                  </TableCell>
                  <TableCell>{s.group?.name ?? '—'}</TableCell>
                  <TableCell>
                    <Badge variant={s.is_active ? 'completed' : 'neutral'} dot>
                      {s.is_active ? 'نشط' : 'موقوف'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end">
                      <IconButton aria-label={`تعديل ${s.full_name}`} onClick={() => setEditing(s)}>
                        <Pencil className="h-4 w-4" />
                      </IconButton>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      <CreateSupervisorDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        groups={groups}
        onCreated={(creds) => {
          setDialogOpen(false);
          setCreatedCreds(creds);
          load();
        }}
      />

      <CredentialsDialog creds={createdCreds} onClose={() => setCreatedCreds(null)} />

      <EditSupervisorDialog
        supervisor={editing}
        groups={groups}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          load();
        }}
      />
    </div>
  );
}

function CreateSupervisorDialog({
  open,
  onOpenChange,
  groups,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groups: GroupOption[];
  onCreated: (creds: { username: string; password: string }) => void;
}) {
  const [username, setUsername] = React.useState('');
  const [fullName, setFullName] = React.useState('');
  const [groupId, setGroupId] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [usernameTouched, setUsernameTouched] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setUsername('');
      setFullName('');
      setGroupId('');
      setError(null);
      setUsernameTouched(false);
    }
  }, [open]);

  function handleFullNameChange(value: string) {
    setFullName(value);
    if (!usernameTouched) {
      setUsername(suggestUsername(value));
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = createEmployeeSchema.safeParse({
      username,
      fullName,
      groupId,
      role: 'supervisor',
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'خطأ في البيانات');
      return;
    }

    setSubmitting(true);
    setError(null);
    const { data, error } = await supabase.functions.invoke<{
      username: string;
      fullName: string;
      password: string;
      error?: string;
    }>('create-employee', { body: parsed.data });
    setSubmitting(false);

    if (error || !data || data.error) {
      setError(data?.error ?? 'تعذر إنشاء المشرف');
      return;
    }
    onCreated({ username: data.username, password: data.password });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>مشرف جديد</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <DialogBody>
            {error && <Alert variant="danger">{error}</Alert>}
            <Field label="الاسم الكامل" htmlFor="supervisor-full-name">
              <Input
                id="supervisor-full-name"
                value={fullName}
                onChange={(e) => handleFullNameChange(e.target.value)}
                autoFocus
                required
              />
            </Field>
            <Field
              label="اسم المستخدم"
              htmlFor="supervisor-username"
              hint="يُقترح تلقائياً — يمكنك تعديله"
            >
              <Input
                id="supervisor-username"
                dir="ltr"
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value.toLowerCase());
                  setUsernameTouched(true);
                }}
                placeholder="ahmed_ali"
                required
              />
            </Field>
            <Field label="المجموعة" hint="المجموعة التي سيديرها هذا المشرف">
              <Select value={groupId} onValueChange={setGroupId}>
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

function EditSupervisorDialog({
  supervisor,
  groups,
  onClose,
  onSaved,
}: {
  supervisor: SupervisorRow | null;
  groups: GroupOption[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [groupId, setGroupId] = React.useState('');
  const [isActive, setIsActive] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (!supervisor) return;
    setGroupId(supervisor.group?.id ?? '');
    setIsActive(supervisor.is_active);
    setError(null);
  }, [supervisor]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!supervisor || !groupId) return;

    setSubmitting(true);
    setError(null);
    const { error } = await supabase
      .from('profiles')
      .update({ group_id: groupId, is_active: isActive })
      .eq('id', supervisor.id);
    setSubmitting(false);

    if (error) {
      setError('تعذر حفظ التعديلات');
      return;
    }
    onSaved();
  }

  return (
    <Dialog open={!!supervisor} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>تعديل المشرف</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <DialogBody>
            {error && <Alert variant="danger">{error}</Alert>}

            <Field label="اسم المستخدم" hint="لا يمكن تغييره — هو معرّف الدخول للحساب">
              <Input dir="ltr" value={supervisor?.username ?? ''} disabled readOnly />
            </Field>

            <Field label="المجموعة">
              <Select value={groupId} onValueChange={setGroupId}>
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

            <label className="flex w-fit cursor-pointer items-center gap-2 text-sm text-neutral-700">
              <Checkbox checked={isActive} onCheckedChange={(v) => setIsActive(v === true)} />
              الحساب نشط
            </label>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
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

function CredentialsDialog({
  creds,
  onClose,
}: {
  creds: { username: string; password: string } | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={!!creds} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md" preventClose>
        <DialogHeader>
          <DialogTitle>تم إنشاء الحساب</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <Alert variant="warning" title="انسخ البيانات الآن">
            لن تظهر كلمة المرور مرة أخرى بعد إغلاق هذه النافذة.
          </Alert>
          <div className="flex flex-col gap-2">
            <CredentialRow label="اسم المستخدم" value={creds?.username ?? ''} />
            <CredentialRow label="كلمة المرور" value={creds?.password ?? ''} />
          </div>
        </DialogBody>
        <DialogFooter>
          <Button onClick={onClose}>تم</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CredentialRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = React.useState(false);

  React.useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg bg-neutral-50 p-3 ring-1 ring-neutral-200">
      <div className="min-w-0">
        <div className="text-xs text-neutral-500">{label}</div>
        <div dir="ltr" className="truncate font-mono text-sm font-medium text-neutral-900">
          {value}
        </div>
      </div>
      <IconButton
        aria-label={`نسخ ${label}`}
        onClick={() => {
          navigator.clipboard.writeText(value);
          setCopied(true);
        }}
        className={copied ? 'text-mint-600' : undefined}
      >
        {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
      </IconButton>
    </div>
  );
}
