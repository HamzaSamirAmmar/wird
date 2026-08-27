import * as React from 'react';
import { Plus, Copy } from 'lucide-react';
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
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [createdCreds, setCreatedCreds] = React.useState<{ username: string; password: string } | null>(null);

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
    } else {
      setEmployees(employeesRes.data as unknown as EmployeeRow[]);
    }
    if (!groupsRes.error) setGroups(groupsRes.data ?? []);
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-neutral-900">الموظفون</h1>
        <Button onClick={() => setDialogOpen(true)} disabled={groups.length === 0}>
          <Plus className="h-4 w-4" />
          موظف جديد
        </Button>
      </div>

      {groups.length === 0 && (
        <Alert variant="info">يجب إنشاء مجموعة واحدة على الأقل قبل إضافة موظفين</Alert>
      )}
      {error && <Alert variant="danger">{error}</Alert>}

      <Card>
        <CardContent className="p-0">
          {employees === null ? (
            <div className="flex justify-center p-8">
              <Spinner />
            </div>
          ) : employees.length === 0 ? (
            <p className="p-8 text-center text-sm text-neutral-500">لا يوجد موظفون بعد</p>
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
                {employees.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="font-medium text-neutral-900">{e.full_name}</TableCell>
                    <TableCell dir="ltr" className="text-end">
                      {e.username}
                    </TableCell>
                    <TableCell>{e.group?.name ?? '—'}</TableCell>
                    <TableCell>
                      <Badge variant={e.is_active ? 'completed' : 'neutral'}>
                        {e.is_active ? 'نشط' : 'موقوف'}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
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
      <DialogContent>
        <DialogHeader>
          <DialogTitle>موظف جديد</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {error && <Alert variant="danger">{error}</Alert>}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="full-name">الاسم الكامل</Label>
            <Input id="full-name" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="username">اسم المستخدم</Label>
            <Input
              id="username"
              dir="ltr"
              value={username}
              onChange={(e) => setUsername(e.target.value.toLowerCase())}
              placeholder="ahmed_ali"
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>المجموعة</Label>
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
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              إلغاء
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'جاري الإنشاء...' : 'إنشاء'}
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
      <DialogContent>
        <DialogHeader>
          <DialogTitle>تم إنشاء الحساب</DialogTitle>
        </DialogHeader>
        <Alert variant="info" className="mb-4">
          انسخ بيانات الدخول وأرسلها للموظف — لن تظهر كلمة المرور مرة أخرى
        </Alert>
        <div className="flex flex-col gap-3" dir="ltr">
          <CredentialRow label="اسم المستخدم" value={creds?.username ?? ''} />
          <CredentialRow label="كلمة المرور" value={creds?.password ?? ''} />
        </div>
        <DialogFooter>
          <Button onClick={onClose}>تم</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CredentialRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = React.useState(false);
  return (
    <div className="flex items-center justify-between rounded-lg border border-neutral-200 p-3">
      <div>
        <div className="text-xs text-neutral-500">{label}</div>
        <div className="font-mono text-sm font-medium text-neutral-900">{value}</div>
      </div>
      <button
        type="button"
        onClick={() => {
          navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
        className="rounded-md p-2 text-neutral-500 hover:bg-neutral-100"
      >
        {copied ? <span className="text-xs text-primary-700">✓</span> : <Copy className="h-4 w-4" />}
      </button>
    </div>
  );
}
