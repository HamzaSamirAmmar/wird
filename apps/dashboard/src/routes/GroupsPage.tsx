import * as React from 'react';
import { Plus } from 'lucide-react';
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
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  Spinner,
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
      return;
    }
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
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-neutral-900">المجموعات</h1>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="h-4 w-4" />
          مجموعة جديدة
        </Button>
      </div>

      {error && <Alert variant="danger">{error}</Alert>}

      <Card>
        <CardContent className="p-0">
          {groups === null ? (
            <div className="flex justify-center p-8">
              <Spinner />
            </div>
          ) : groups.length === 0 ? (
            <p className="p-8 text-center text-sm text-neutral-500">لا توجد مجموعات بعد</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>الاسم</TableHead>
                  <TableHead>عدد الموظفين</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {groups.map((g) => (
                  <TableRow key={g.id}>
                    <TableCell className="font-medium text-neutral-900">{g.name}</TableCell>
                    <TableCell>{g.employee_count}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

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
      <DialogContent>
        <DialogHeader>
          <DialogTitle>مجموعة جديدة</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {error && <Alert variant="danger">{error}</Alert>}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="group-name">اسم المجموعة</Label>
            <Input id="group-name" value={name} onChange={(e) => setName(e.target.value)} required />
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
