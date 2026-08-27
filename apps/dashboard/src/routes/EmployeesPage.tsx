import * as React from 'react';
import { Check, Copy, Plus, Search, Users } from 'lucide-react';
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
import { supabase } from '../lib/supabase';

interface EmployeeRow {
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

export default function EmployeesPage() {
  const [employees, setEmployees] = React.useState<EmployeeRow[] | null>(null);
  const [groups, setGroups] = React.useState<GroupOption[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [query, setQuery] = React.useState('');
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [createdCreds, setCreatedCreds] = React.useState<{
    username: string;
    password: string;
  } | null>(null);

  const load = React.useCallback(async () => {
    const [employeesRes, groupsRes] = await Promise.all([
      supabase
        .from('profiles')
        .select('id, username, full_name, is_active, group:groups!profiles_group_id_fkey(id, name)')
        .eq('role', 'employee')
        .order('created_at', { ascending: false }),
      supabase.from('groups').select('id, name').order('name'),
    ]);

    if (employeesRes.error) {
      setError('تعذر تحميل الموظفين');
      setEmployees([]);
    } else {
      setError(null);
      setEmployees(employeesRes.data as unknown as EmployeeRow[]);
    }
    if (!groupsRes.error) setGroups(groupsRes.data ?? []);
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  const needle = query.trim().toLowerCase();
  const visible = needle
    ? (employees ?? []).filter(
        (e) =>
          e.full_name.toLowerCase().includes(needle) ||
          e.username.includes(needle) ||
          (e.group?.name ?? '').toLowerCase().includes(needle),
      )
    : employees;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="الموظفون"
        description="أنشئ حسابات الموظفين وأسندهم إلى المجموعات"
        actions={
          <Button onClick={() => setDialogOpen(true)} disabled={groups.length === 0}>
            <Plus className="h-4 w-4" />
            موظف جديد
          </Button>
        }
      />

      {groups.length === 0 && (
        <Alert variant="warning" title="أنشئ مجموعة أولاً">
          يجب إنشاء مجموعة واحدة على الأقل قبل إضافة موظفين.
        </Alert>
      )}
      {error && <Alert variant="danger">{error}</Alert>}

      <Card className="overflow-hidden">
        <div className="border-b border-neutral-100 p-4">
          <Input
            icon={<Search className="h-4 w-4" />}
            placeholder="ابحث بالاسم أو اسم المستخدم أو المجموعة"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-10 max-w-sm"
          />
        </div>

        {visible === null ? (
          <SkeletonRows rows={4} />
        ) : visible.length === 0 ? (
          <EmptyState
            icon={Users}
            title={needle ? 'لا نتائج مطابقة' : 'لا يوجد موظفون بعد'}
            description={
              needle
                ? 'جرّب كلمة بحث أخرى.'
                : 'أنشئ حساب موظف؛ ستظهر بيانات الدخول مرة واحدة فقط بعد الإنشاء.'
            }
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>الاسم</TableHead>
                <TableHead>اسم المستخدم</TableHead>
                <TableHead>المجموعة</TableHead>
                <TableHead>الحالة</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((e) => (
                <TableRow key={e.id}>
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
                    <Badge variant={e.is_active ? 'completed' : 'neutral'} dot>
                      {e.is_active ? 'نشط' : 'موقوف'}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
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

      <CredentialsDialog creds={createdCreds} onClose={() => setCreatedCreds(null)} />
    </div>
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
  onCreated: (creds: { username: string; password: string }) => void;
}) {
  const [username, setUsername] = React.useState('');
  const [fullName, setFullName] = React.useState('');
  const [groupId, setGroupId] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setUsername('');
      setFullName('');
      setGroupId('');
      setError(null);
    }
  }, [open]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = createEmployeeSchema.safeParse({ username, fullName, groupId });
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
      setError(data?.error ?? 'تعذر إنشاء الموظف');
      return;
    }
    onCreated({ username: data.username, password: data.password });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>موظف جديد</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <DialogBody>
            {error && <Alert variant="danger">{error}</Alert>}
            <Field label="الاسم الكامل" htmlFor="full-name">
              <Input
                id="full-name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                autoFocus
                required
              />
            </Field>
            <Field
              label="اسم المستخدم"
              htmlFor="username"
              hint="حروف لاتينية صغيرة وأرقام وشرطة سفلية"
            >
              <Input
                id="username"
                dir="ltr"
                value={username}
                onChange={(e) => setUsername(e.target.value.toLowerCase())}
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

function CredentialsDialog({
  creds,
  onClose,
}: {
  creds: { username: string; password: string } | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={!!creds} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
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
