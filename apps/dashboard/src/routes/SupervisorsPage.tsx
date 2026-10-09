import * as React from 'react';
import { Navigate } from 'react-router-dom';
import { Check, Copy, Pencil, Plus, ShieldCheck, UserPlus } from 'lucide-react';
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
  Pagination,
} from '@wird/ui-web';
import { createEmployeeSchema, formatTelegramInput } from '@wird/domain';
import { useAuth } from '../lib/auth-context';
import { supabase } from '../lib/supabase';
import { suggestUsername } from '../lib/suggest-username';
import { DeleteUserSection } from '../components/DeleteUserSection';
import { ResetPasswordSection } from '../components/ResetPasswordSection';

interface SupervisorRow {
  id: string;
  username: string;
  full_name: string;
  /** 'supervisor' = admin only; 'employee' = also a regular user (does duties) */
  role: 'supervisor' | 'employee';
  is_active: boolean;
  /** The group they MANAGE (admin_group_id) */
  group: { id: string; name: string } | null;
  /** The group they belong to as an employee (null for admin-only accounts) */
  ownGroup: { id: string; name: string } | null;
}

interface GroupOption {
  id: string;
  name: string;
}

/**
 * Superadmin-only: creates and manages admins (the people who manage one group). An admin is
 * either admin-only (no wird of their own) or also a regular user — an employee who does their
 * own duties in their own group while managing a group (the same one or another). Admins can't
 * be created by another admin — only by a superadmin, via the `create-employee` edge function —
 * and an existing employee can be promoted. Permissions of an admin are scoped to the group they
 * manage.
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
  const [promoteOpen, setPromoteOpen] = React.useState(false);

  const load = React.useCallback(async () => {
    const [supervisorsRes, groupsRes] = await Promise.all([
      supabase
        .from('profiles')
        .select(
          'id, username, full_name, role, is_active, ownGroup:groups!profiles_group_id_fkey(id, name), group:groups!profiles_admin_group_id_fkey(id, name)',
        )
        .not('admin_group_id', 'is', null)
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

  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(10);

  if (profile && profile.role !== 'superadmin') return <Navigate to="/unauthorized" replace />;

  const totalPages = Math.max(1, Math.ceil((supervisors?.length ?? 0) / pageSize));
  const currentPage = Math.min(page, totalPages);
  const paginatedSupervisors = (supervisors ?? []).slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="المشرفون"
        description="أنشئ حسابات المشرفين وأسند كل واحد منهم إلى مجموعة واحدة يديرها — وقد يكون المشرف مستخدماً في الوقت نفسه"
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => setPromoteOpen(true)}
              disabled={groups.length === 0}
            >
              <UserPlus className="h-4 w-4" />
              ترقية مستخدم
            </Button>
            <Button onClick={() => setDialogOpen(true)} disabled={groups.length === 0}>
              <Plus className="h-4 w-4" />
              مشرف جديد
            </Button>
          </div>
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
          <>
            {/* Phones: the roster as stacked cards — the five-column table does not fit. */}
            <ul className="flex flex-col divide-y divide-neutral-100 md:hidden">
              {paginatedSupervisors.map((s) => (
                <SupervisorCard key={s.id} supervisor={s} onEdit={() => setEditing(s)} />
              ))}
            </ul>
            <div className="hidden md:block">
              <Table className="min-w-[540px]">
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
                  {paginatedSupervisors.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar name={s.full_name} size="sm" />
                          <span className="font-medium text-neutral-900">{s.full_name}</span>
                          {s.role === 'employee' && <Badge variant="neutral">مشرف ومستخدم</Badge>}
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
                          <IconButton
                            aria-label={`تعديل ${s.full_name}`}
                            onClick={() => setEditing(s)}
                          >
                            <Pencil className="h-4 w-4" />
                          </IconButton>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}

        {supervisors && supervisors.length > 0 && (
          <Pagination
            page={currentPage}
            pageSize={pageSize}
            totalItems={supervisors.length}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
          />
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

      <PromoteDialog
        open={promoteOpen}
        onOpenChange={setPromoteOpen}
        groups={groups}
        onPromoted={() => {
          setPromoteOpen(false);
          load();
        }}
      />

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

/** Phone-width rendition of a supervisor row — same data and actions as the table. */
function SupervisorCard({ supervisor, onEdit }: { supervisor: SupervisorRow; onEdit: () => void }) {
  return (
    <li className="flex items-start gap-3 p-4">
      <Avatar name={supervisor.full_name} size="sm" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate font-medium text-neutral-900">
            {supervisor.full_name}
          </span>
          <IconButton aria-label={`تعديل ${supervisor.full_name}`} onClick={onEdit}>
            <Pencil className="h-4 w-4" />
          </IconButton>
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-neutral-500">
          <span dir="ltr" className="font-mono">
            {supervisor.username}
          </span>
          <span className="truncate">{supervisor.group?.name ?? '—'}</span>
          {supervisor.role === 'employee' && <Badge variant="neutral">مشرف ومستخدم</Badge>}
        </div>
        <div className="mt-2">
          <Badge variant={supervisor.is_active ? 'completed' : 'neutral'} dot>
            {supervisor.is_active ? 'نشط' : 'موقوف'}
          </Badge>
        </div>
      </div>
    </li>
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
  // Also a regular user: does duties in `ownGroupId` while managing `groupId`.
  const [alsoUser, setAlsoUser] = React.useState(false);
  const [ownGroupId, setOwnGroupId] = React.useState('');
  const [telegram, setTelegram] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [usernameTouched, setUsernameTouched] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setUsername('');
      setFullName('');
      setGroupId('');
      setAlsoUser(false);
      setOwnGroupId('');
      setTelegram('');
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
      // Admin-only accounts sit in the group they manage; an admin who is also a user sits in
      // their own group and manages `groupId` separately.
      groupId: alsoUser ? ownGroupId : groupId,
      role: alsoUser ? 'employee' : 'supervisor',
      telegramUsername: alsoUser ? telegram : undefined,
    });
    if (alsoUser && !groupId) {
      setError('يجب اختيار المجموعة التي يديرها');
      return;
    }
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
    }>('create-employee', {
      body: { ...parsed.data, adminGroupId: alsoUser ? groupId : undefined },
    });
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

            <label className="flex w-fit cursor-pointer items-center gap-2 text-sm text-neutral-700">
              <Checkbox checked={alsoUser} onCheckedChange={(v) => setAlsoUser(v === true)} />
              وهو أيضاً مستخدم (يستلم وِرداً)
            </label>

            {alsoUser && (
              <>
                <Field label="مجموعته كمستخدم" hint="قد تختلف عن المجموعة التي يديرها">
                  <Select value={ownGroupId} onValueChange={setOwnGroupId}>
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
                <Field label="معرّف تيليجرام" htmlFor="supervisor-telegram">
                  <Input
                    id="supervisor-telegram"
                    dir="ltr"
                    value={telegram}
                    onChange={(e) => setTelegram(formatTelegramInput(e.target.value))}
                    placeholder="@username"
                  />
                </Field>
              </>
            )}
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

  async function removeAdmin() {
    if (!supervisor) return;
    setSubmitting(true);
    setError(null);
    const { error } = await supabase
      .from('profiles')
      .update({ admin_group_id: null })
      .eq('id', supervisor.id);
    setSubmitting(false);
    if (error) {
      setError('تعذر إزالة صلاحية الإشراف');
      return;
    }
    onSaved();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!supervisor || !groupId) return;

    setSubmitting(true);
    setError(null);
    // An admin-only account sits in the group it manages, so both columns move together; for
    // an admin who is also a user, their own group is untouched.
    const { error } = await supabase
      .from('profiles')
      .update(
        supervisor.role === 'supervisor'
          ? { group_id: groupId, admin_group_id: groupId, is_active: isActive }
          : { admin_group_id: groupId, is_active: isActive },
      )
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

            {supervisor?.role === 'employee' && (
              <Field label="مجموعته كمستخدم" hint="تُعدَّل من صفحة المستخدمين">
                <Input value={supervisor.ownGroup?.name ?? '—'} disabled readOnly />
              </Field>
            )}

            <Field label="المجموعة التي يديرها">
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

            {supervisor?.role === 'employee' && (
              <div>
                <Button type="button" variant="outline" onClick={removeAdmin} disabled={submitting}>
                  إزالة صلاحية الإشراف (يبقى مستخدماً)
                </Button>
              </div>
            )}

            {supervisor && (
              <ResetPasswordSection
                key={supervisor.id}
                userId={supervisor.id}
                name={supervisor.full_name}
              />
            )}

            {supervisor && (
              <DeleteUserSection
                userId={supervisor.id}
                name={supervisor.full_name}
                detail={
                  supervisor.role === 'employee'
                    ? 'وهو أيضاً مستخدم، فستُحذف أوراده كذلك.'
                    : undefined
                }
                onDeleted={onSaved}
              />
            )}
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

/** Makes an existing employee an admin of a group (they keep their own wird). */
function PromoteDialog({
  open,
  onOpenChange,
  groups,
  onPromoted,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groups: GroupOption[];
  onPromoted: () => void;
}) {
  const [candidates, setCandidates] = React.useState<
    { id: string; full_name: string; username: string }[]
  >([]);
  const [userId, setUserId] = React.useState('');
  const [groupId, setGroupId] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setUserId('');
    setGroupId('');
    setError(null);
    supabase
      .from('profiles')
      .select('id, full_name, username')
      .eq('role', 'employee')
      .is('admin_group_id', null)
      .order('full_name')
      .then(({ data }) => setCandidates(data ?? []));
  }, [open]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!userId || !groupId) {
      setError('اختر المستخدم والمجموعة');
      return;
    }
    setSubmitting(true);
    setError(null);
    const { error } = await supabase
      .from('profiles')
      .update({ admin_group_id: groupId })
      .eq('id', userId);
    setSubmitting(false);
    if (error) {
      setError('تعذرت الترقية');
      return;
    }
    onPromoted();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>ترقية مستخدم إلى مشرف</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <DialogBody>
            {error && <Alert variant="danger">{error}</Alert>}
            <Field label="المستخدم" hint="يبقى مستخدماً ويستمر في تسلّم أوراده">
              <Select value={userId} onValueChange={setUserId}>
                <SelectTrigger>
                  <SelectValue placeholder="اختر مستخدماً" />
                </SelectTrigger>
                <SelectContent>
                  {candidates.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.full_name} ({c.username})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="المجموعة التي سيديرها">
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
              ترقية
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
