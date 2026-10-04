import * as React from 'react';
import { ArrowRightLeft, Check, Copy, Pencil, Plus, Search, UserPlus, Users } from 'lucide-react';
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
  cn,
} from '@wird/ui-web';
import { createEmployeeSchema, formatTelegramInput, updateEmployeeSchema } from '@wird/domain';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth-context';
import { managedGroups } from '../lib/groups';
import { DeleteUserSection } from '../components/DeleteUserSection';
import { suggestUsername } from '../lib/suggest-username';
import { BulkCreateDialog, type BulkCreatedCreds } from '../components/BulkCreateDialog';
import { BulkCredentialsDialog } from '../components/BulkCredentialsDialog';
import { buildWelcomeMessage } from '../lib/welcomeMessage';

interface EmployeeRow {
  id: string;
  username: string;
  full_name: string;
  is_active: boolean;
  telegram_username: string | null;
  group: { id: string; name: string } | null;
  /** Present once the employee opened the bot and tapped Start (telegram_chats row). */
  telegram: { chat_id: number } | null;
}

interface GroupOption {
  id: string;
  name: string;
}

export default function EmployeesPage() {
  const { profile } = useAuth();
  const [employees, setEmployees] = React.useState<EmployeeRow[] | null>(null);
  const [groups, setGroups] = React.useState<GroupOption[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [query, setQuery] = React.useState('');
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [bulkDialogOpen, setBulkDialogOpen] = React.useState(false);
  const [createdCreds, setCreatedCreds] = React.useState<{
    fullName: string;
    username: string;
    password: string;
  } | null>(null);
  const [bulkCreds, setBulkCreds] = React.useState<BulkCreatedCreds[] | null>(null);
  const [editing, setEditing] = React.useState<EmployeeRow | null>(null);

  // Bulk reassign state
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [reassignGroupId, setReassignGroupId] = React.useState('');
  const [reassigning, setReassigning] = React.useState(false);

  const load = React.useCallback(async () => {
    const [employeesRes, groupsRes] = await Promise.all([
      supabase
        .from('profiles')
        .select(
          'id, username, full_name, is_active, telegram_username, group:groups!profiles_group_id_fkey(id, name), telegram:telegram_chats(chat_id)',
        )
        .eq('role', 'employee')
        .order('created_at', { ascending: false }),
      managedGroups(profile),
    ]);

    if (employeesRes.error) {
      setError('تعذر تحميل المستخدمين');
      setEmployees([]);
    } else {
      setError(null);
      setEmployees(employeesRes.data as unknown as EmployeeRow[]);
    }
    if (!groupsRes.error) setGroups(groupsRes.data ?? []);
  }, [profile]);

  React.useEffect(() => {
    load();
  }, [load]);

  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(10);

  const needle = query.trim().toLowerCase();
  const visible = needle
    ? (employees ?? []).filter(
        (e) =>
          e.full_name.toLowerCase().includes(needle) ||
          e.username.includes(needle) ||
          (e.group?.name ?? '').toLowerCase().includes(needle),
      )
    : employees;

  const [prevQuery, setPrevQuery] = React.useState(query);
  if (query !== prevQuery) {
    setPrevQuery(query);
    setPage(1);
  }

  const totalPages = Math.max(1, Math.ceil((visible?.length ?? 0) / pageSize));
  const currentPage = Math.min(page, totalPages);
  const paginatedEmployees = (visible ?? []).slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  );

  const pageVisibleIds = paginatedEmployees.map((e) => e.id);
  const allPageSelected =
    pageVisibleIds.length > 0 && pageVisibleIds.every((id) => selected.has(id));
  const someSelected = selected.size > 0;

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectPage() {
    if (allPageSelected) {
      setSelected((prev) => {
        const next = new Set(prev);
        for (const id of pageVisibleIds) next.delete(id);
        return next;
      });
    } else {
      setSelected((prev) => {
        const next = new Set(prev);
        for (const id of pageVisibleIds) next.add(id);
        return next;
      });
    }
  }

  async function handleBulkReassign() {
    if (!reassignGroupId || selected.size === 0) return;
    setReassigning(true);
    const { error } = await supabase
      .from('profiles')
      .update({ group_id: reassignGroupId })
      .in('id', [...selected]);
    setReassigning(false);
    if (error) {
      setError('تعذر نقل المستخدمين');
      return;
    }
    setSelected(new Set());
    setReassignGroupId('');
    load();
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="المستخدمون"
        description="أنشئ حسابات المستخدمين وأسندهم إلى المجموعات"
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => setBulkDialogOpen(true)}
              disabled={groups.length === 0}
            >
              <UserPlus className="h-4 w-4" />
              إضافة دفعة
            </Button>
            <Button onClick={() => setDialogOpen(true)} disabled={groups.length === 0}>
              <Plus className="h-4 w-4" />
              مستخدم جديد
            </Button>
          </div>
        }
      />

      {groups.length === 0 && (
        <Alert variant="warning" title="أنشئ مجموعة أولاً">
          يجب إنشاء مجموعة واحدة على الأقل قبل إضافة مستخدمين.
        </Alert>
      )}
      {error && <Alert variant="danger">{error}</Alert>}

      {/* Bulk reassign action bar */}
      {someSelected && (
        <Card className="flex flex-wrap items-center gap-3 p-3">
          <Badge variant="brand">{selected.size} محدد</Badge>
          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            <ArrowRightLeft className="h-4 w-4 text-neutral-500" />
            <span className="text-sm text-neutral-600">نقل إلى:</span>
            <Select value={reassignGroupId} onValueChange={setReassignGroupId}>
              <SelectTrigger className="h-8 w-36 sm:w-48">
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
            <Button
              size="sm"
              onClick={handleBulkReassign}
              disabled={!reassignGroupId}
              loading={reassigning}
            >
              نقل
            </Button>
          </div>
          <p className="w-full text-xs text-accent-700">
            النقل يحذف أوراد المنقولين السابقة ويسند إليهم أوراد المجموعة الجديدة من اليوم.
          </p>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSelected(new Set())}
            className="ms-auto"
          >
            إلغاء التحديد
          </Button>
        </Card>
      )}

      <Card className="overflow-hidden">
        <div className="border-b border-neutral-100 p-4">
          <Input
            icon={<Search className="h-4 w-4" />}
            placeholder="ابحث بالاسم أو اسم المستخدم أو المجموعة"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-10 w-full max-w-sm"
          />
        </div>

        {visible === null ? (
          <SkeletonRows rows={4} />
        ) : visible.length === 0 ? (
          <EmptyState
            icon={Users}
            title={needle ? 'لا نتائج مطابقة' : 'لا يوجد مستخدمون بعد'}
            description={
              needle
                ? 'جرّب كلمة بحث أخرى.'
                : 'أنشئ حساب مستخدم؛ ستظهر بيانات الدخول مرة واحدة فقط بعد الإنشاء.'
            }
          />
        ) : (
          <>
            {/* Phones: the roster as stacked cards — the seven-column table does not fit. */}
            <ul className="flex flex-col divide-y divide-neutral-100 md:hidden">
              {paginatedEmployees.map((e) => (
                <EmployeeCard
                  key={e.id}
                  employee={e}
                  selected={selected.has(e.id)}
                  onSelect={() => toggleSelect(e.id)}
                  onEdit={() => setEditing(e)}
                />
              ))}
            </ul>
            <div className="hidden md:block">
              <Table className="min-w-[620px]">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox
                        checked={allPageSelected}
                        onCheckedChange={toggleSelectPage}
                        aria-label="تحديد الصفحة"
                      />
                    </TableHead>
                    <TableHead>الاسم</TableHead>
                    <TableHead>اسم المستخدم</TableHead>
                    <TableHead>المجموعة</TableHead>
                    <TableHead>تيليجرام</TableHead>
                    <TableHead>الحالة</TableHead>
                    <TableHead>
                      <span className="sr-only">إجراءات</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedEmployees.map((e) => (
                    <TableRow key={e.id} className={selected.has(e.id) ? 'bg-primary-50/50' : ''}>
                      <TableCell>
                        <Checkbox
                          checked={selected.has(e.id)}
                          onCheckedChange={() => toggleSelect(e.id)}
                          aria-label={`تحديد ${e.full_name}`}
                        />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar name={e.full_name} size="sm" />
                          <span className="font-medium text-neutral-900">{e.full_name}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span dir="ltr" className="font-mono text-xs text-neutral-500">
                          {e.username}
                        </span>
                      </TableCell>
                      <TableCell>{e.group?.name ?? '—'}</TableCell>
                      <TableCell>
                        {e.telegram_username ? (
                          <div className="flex flex-col items-start gap-1">
                            <span dir="ltr" className="font-mono text-xs text-neutral-500">
                              @{e.telegram_username}
                            </span>
                            <Badge variant={e.telegram ? 'completed' : 'neutral'} dot>
                              {e.telegram ? 'مرتبط' : 'لم يبدأ'}
                            </Badge>
                          </div>
                        ) : (
                          '—'
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={e.is_active ? 'completed' : 'neutral'} dot>
                          {e.is_active ? 'نشط' : 'موقوف'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end">
                          <IconButton
                            aria-label={`تعديل ${e.full_name}`}
                            onClick={() => setEditing(e)}
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

        {visible && visible.length > 0 && (
          <Pagination
            page={currentPage}
            pageSize={pageSize}
            totalItems={visible.length}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
          />
        )}
      </Card>

      <CreateEmployeeDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        groups={groups}
        onCreated={(creds) => {
          setDialogOpen(false);
          setCreatedCreds(creds);
          load();
        }}
      />

      <BulkCreateDialog
        open={bulkDialogOpen}
        onOpenChange={setBulkDialogOpen}
        groups={groups}
        onCreated={(creds) => {
          setBulkDialogOpen(false);
          setBulkCreds(creds);
          load();
        }}
      />

      <CredentialsDialog creds={createdCreds} onClose={() => setCreatedCreds(null)} />

      <BulkCredentialsDialog creds={bulkCreds} onClose={() => setBulkCreds(null)} />

      <EditEmployeeDialog
        employee={editing}
        currentUserId={profile?.id}
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

/** Phone-width rendition of an employee row — same data and actions as the table. */
function EmployeeCard({
  employee,
  selected,
  onSelect,
  onEdit,
}: {
  employee: EmployeeRow;
  selected: boolean;
  onSelect: () => void;
  onEdit: () => void;
}) {
  return (
    <li className={cn('flex items-start gap-3 p-4', selected && 'bg-primary-50/50')}>
      <Checkbox
        checked={selected}
        onCheckedChange={onSelect}
        aria-label={`تحديد ${employee.full_name}`}
        className="mt-1.5"
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2.5">
          <Avatar name={employee.full_name} size="sm" />
          <span className="min-w-0 flex-1 truncate font-medium text-neutral-900">
            {employee.full_name}
          </span>
          <IconButton aria-label={`تعديل ${employee.full_name}`} onClick={onEdit}>
            <Pencil className="h-4 w-4" />
          </IconButton>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-neutral-500">
          <span dir="ltr" className="font-mono">
            {employee.username}
          </span>
          <span className="truncate">{employee.group?.name ?? '—'}</span>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <Badge variant={employee.is_active ? 'completed' : 'neutral'} dot>
            {employee.is_active ? 'نشط' : 'موقوف'}
          </Badge>
          {employee.telegram_username && (
            <Badge variant={employee.telegram ? 'completed' : 'neutral'} dot>
              {employee.telegram ? 'تيليجرام مرتبط' : 'تيليجرام لم يبدأ'}
            </Badge>
          )}
        </div>
      </div>
    </li>
  );
}

function CreateEmployeeDialog({
  open,
  onOpenChange,
  groups,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groups: GroupOption[];
  onCreated: (creds: { fullName: string; username: string; password: string }) => void;
}) {
  const [username, setUsername] = React.useState('');
  const [fullName, setFullName] = React.useState('');
  const [groupId, setGroupId] = React.useState('');
  const [telegram, setTelegram] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  /** Once the user manually edits the username, stop overwriting it */
  const [usernameTouched, setUsernameTouched] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setUsername('');
      setFullName('');
      setGroupId('');
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
      groupId,
      telegramUsername: telegram,
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
      setError(data?.error ?? 'تعذر إنشاء المستخدم');
      return;
    }
    onCreated({ fullName: data.fullName, username: data.username, password: data.password });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>مستخدم جديد</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <DialogBody>
            {error && <Alert variant="danger">{error}</Alert>}
            <Field label="الاسم الكامل" htmlFor="full-name">
              <Input
                id="full-name"
                value={fullName}
                onChange={(e) => handleFullNameChange(e.target.value)}
                autoFocus
                required
              />
            </Field>
            <Field label="اسم المستخدم" htmlFor="username" hint="يُقترح تلقائياً — يمكنك تعديله">
              <Input
                id="username"
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
            <Field
              label="معرف تيليجرام"
              htmlFor="telegram"
              hint="مطلوب — يفتح الموظف البوت ويضغط ابدأ ليصله ورده يومياً"
            >
              <Input
                id="telegram"
                dir="ltr"
                value={telegram}
                onChange={(e) => setTelegram(formatTelegramInput(e.target.value))}
                placeholder="@ahmed"
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

/**
 * Edits the things about an employee that actually change: their display name, which
 * group they belong to, and their Telegram matching username. Username is deliberately
 * not editable — it is the auth identity (`<username>@wird.local`) that the account was
 * created against, so renaming it here would silently lock the employee out.
 *
 * Moving a group only changes future fan-out: `duties` rows already created for this employee
 * are theirs and stay put, which is why nothing else has to be rewritten here.
 */
function EditEmployeeDialog({
  employee,
  currentUserId,
  groups,
  onClose,
  onSaved,
}: {
  employee: EmployeeRow | null;
  currentUserId: string | undefined;
  groups: GroupOption[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [fullName, setFullName] = React.useState('');
  const [groupId, setGroupId] = React.useState('');
  const [isActive, setIsActive] = React.useState(true);
  const [telegram, setTelegram] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (!employee) return;
    setFullName(employee.full_name);
    setGroupId(employee.group?.id ?? '');
    setIsActive(employee.is_active);
    setTelegram(formatTelegramInput(employee.telegram_username ?? ''));
    setError(null);
  }, [employee]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!employee) return;

    const parsed = updateEmployeeSchema.safeParse({
      fullName,
      groupId,
      telegramUsername: telegram,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'خطأ في البيانات');
      return;
    }

    setSubmitting(true);
    setError(null);
    const { error } = await supabase
      .from('profiles')
      .update({
        full_name: parsed.data.fullName,
        group_id: parsed.data.groupId,
        telegram_username: parsed.data.telegramUsername ?? null,
        is_active: isActive,
      })
      .eq('id', employee.id);
    setSubmitting(false);

    if (error) {
      setError(error.code === '23505' ? 'هذا المعرف مستخدم لمستخدم آخر' : 'تعذر حفظ التعديلات');
      return;
    }
    onSaved();
  }

  const movingGroup = !!employee && groupId !== (employee.group?.id ?? '');

  return (
    <Dialog open={!!employee} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>تعديل المستخدم</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <DialogBody>
            {error && <Alert variant="danger">{error}</Alert>}

            <Field label="الاسم الكامل" htmlFor="edit-full-name">
              <Input
                id="edit-full-name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                autoFocus
                required
              />
            </Field>

            <Field label="اسم المستخدم" hint="لا يمكن تغييره — هو معرّف الدخول للحساب">
              <Input dir="ltr" value={employee?.username ?? ''} disabled readOnly />
            </Field>

            <Field
              label="معرف تيليجرام"
              htmlFor="edit-telegram"
              hint={
                employee?.telegram_username && !employee?.telegram
                  ? 'لم يفتح الموظف البوت بعد — اطلب منه الضغط على ابدأ'
                  : 'اتركه فارغاً لإلغاء الربط'
              }
            >
              <Input
                id="edit-telegram"
                dir="ltr"
                value={telegram}
                onChange={(e) => setTelegram(formatTelegramInput(e.target.value))}
                placeholder="@ahmed"
              />
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

            {movingGroup && (
              <Alert variant="warning">
                ستُحذف جميع أوراد المستخدم السابقة، وتُسند إليه أوراد المجموعة الجديدة لليوم والأيام
                القادمة.
              </Alert>
            )}

            <label className="flex w-fit cursor-pointer items-center gap-2 text-sm text-neutral-700">
              <Checkbox checked={isActive} onCheckedChange={(v) => setIsActive(v === true)} />
              الحساب نشط
            </label>

            {employee && employee.id !== currentUserId && (
              <DeleteUserSection
                userId={employee.id}
                name={employee.full_name}
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

function CredentialsDialog({
  creds,
  onClose,
}: {
  creds: { fullName: string; username: string; password: string } | null;
  onClose: () => void;
}) {
  const [copied, setCopied] = React.useState(false);

  React.useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);

  function copyMessage() {
    if (!creds) return;
    navigator.clipboard.writeText(buildWelcomeMessage(creds));
    setCopied(true);
  }

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
          <Button variant="outline" onClick={copyMessage}>
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copied ? 'تم النسخ' : 'نسخ رسالة الترحيب'}
          </Button>
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
