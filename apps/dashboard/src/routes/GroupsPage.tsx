import * as React from 'react';
import {
  ArrowRightLeft,
  ChevronLeft,
  Plus,
  Pencil,
  Search,
  Trash2,
  UserPlus,
  UserRound,
  Users,
  UsersRound,
} from 'lucide-react';
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
  Input,
  PageHeader,
  Skeleton,
  SkeletonRows,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  cn,
} from '@wird/ui-web';
import { createGroupSchema } from '@wird/domain';
import { useAuth } from '../lib/auth-context';
import { supabase } from '../lib/supabase';
import { BulkCreateDialog, type BulkCreatedCreds } from '../components/BulkCreateDialog';
import { BulkCredentialsDialog } from '../components/BulkCredentialsDialog';

interface GroupRow {
  id: string;
  name: string;
  created_at: string;
  employee_count: number;
}

export default function GroupsPage() {
  const { profile } = useAuth();
  const isSuperadmin = profile?.role === 'superadmin';
  const [groups, setGroups] = React.useState<GroupRow[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [viewing, setViewing] = React.useState<GroupRow | null>(null);
  const [bulkCreateGroup, setBulkCreateGroup] = React.useState<GroupRow | null>(null);
  const [bulkCreds, setBulkCreds] = React.useState<BulkCreatedCreds[] | null>(null);

  const load = React.useCallback(async () => {
    let query = supabase
      .from('groups')
      .select('id, name, created_at, profiles!profiles_group_id_fkey(count)')
      .eq('profiles.role', 'employee')
      .order('created_at', { ascending: false });
    // A group admin sees only the group they manage (RLS also exposes their own employee group).
    if (profile && profile.role !== 'superadmin' && profile.adminGroupId) {
      query = query.eq('id', profile.adminGroupId);
    }
    const { data, error } = await query;

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
  }, [profile]);

  React.useEffect(() => {
    load();
  }, [load]);

  const groupOptions = React.useMemo(
    () => (groups ?? []).map((g) => ({ id: g.id, name: g.name })),
    [groups],
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="المجموعات"
        description="كل مستخدم ينتمي لمجموعة واحدة، والأوراد تُسند للمجموعة"
        actions={
          isSuperadmin && (
            <Button onClick={() => setDialogOpen(true)}>
              <Plus className="h-4 w-4" />
              مجموعة جديدة
            </Button>
          )
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
            description="ابدأ بإنشاء مجموعة، ثم أضف إليها المستخدمين وأسند لها الأوراد."
            action={
              isSuperadmin && (
                <Button size="sm" onClick={() => setDialogOpen(true)}>
                  <Plus className="h-4 w-4" />
                  مجموعة جديدة
                </Button>
              )
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
                    <span className="tabular-nums">{g.employee_count}</span> مستخدم
                  </div>
                </div>
                <ChevronLeft className="h-4 w-4 shrink-0 text-neutral-300" />
              </button>
            </Card>
          ))}
        </div>
      )}

      <GroupMembersDialog
        group={bulkCreateGroup || bulkCreds ? null : viewing}
        canTransfer={isSuperadmin}
        onClose={() => setViewing(null)}
        onBulkCreate={(g) => setBulkCreateGroup(g)}
        onMembersChanged={load}
      />

      <BulkCreateDialog
        open={!!bulkCreateGroup}
        onOpenChange={(open) => {
          if (!open) setBulkCreateGroup(null);
        }}
        groups={groupOptions}
        initialGroupId={bulkCreateGroup?.id}
        lockGroup={true}
        onCreated={(creds) => {
          setBulkCreateGroup(null);
          setBulkCreds(creds);
          load();
        }}
      />

      <BulkCredentialsDialog creds={bulkCreds} onClose={() => setBulkCreds(null)} />

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

interface CandidateRow {
  id: string;
  full_name: string;
  username: string;
  is_active: boolean;
  group: { id: string; name: string } | null;
}

/**
 * The roster behind a group card with bulk addition capabilities:
 * - View existing members with quick search
 * - Add/transfer existing employees from other groups in bulk
 * - Bulk create new employees directly into this group
 */
function GroupMembersDialog({
  group,
  canTransfer,
  onClose,
  onBulkCreate,
  onMembersChanged,
}: {
  group: GroupRow | null;
  canTransfer: boolean;
  onClose: () => void;
  onBulkCreate: (group: GroupRow) => void;
  onMembersChanged: () => void;
}) {
  const [renaming, setRenaming] = React.useState(false);
  const [nameDraft, setNameDraft] = React.useState('');
  const [manageError, setManageError] = React.useState<string | null>(null);
  const [savingName, setSavingName] = React.useState(false);
  const [confirmingDelete, setConfirmingDelete] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);
  const [activeTab, setActiveTab] = React.useState<'members' | 'add-existing'>('members');
  const [members, setMembers] = React.useState<MemberRow[] | null>(null);
  const [candidates, setCandidates] = React.useState<CandidateRow[] | null>(null);
  const [loadingCandidates, setLoadingCandidates] = React.useState(false);
  const [selectedCandidates, setSelectedCandidates] = React.useState<Set<string>>(new Set());
  const [memberQuery, setMemberQuery] = React.useState('');
  const [candidateQuery, setCandidateQuery] = React.useState('');
  const [transferring, setTransferring] = React.useState(false);
  const [transferError, setTransferError] = React.useState<string | null>(null);
  const [transferSuccess, setTransferSuccess] = React.useState<string | null>(null);

  const loadMembers = React.useCallback(async () => {
    if (!group) return;
    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, username, is_active')
      .eq('role', 'employee')
      .eq('group_id', group.id)
      .order('full_name');

    setMembers(error ? [] : ((data ?? []) as MemberRow[]));
  }, [group]);

  const loadCandidates = React.useCallback(async () => {
    if (!group || !canTransfer) return;
    setLoadingCandidates(true);
    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, username, is_active, group:groups!profiles_group_id_fkey(id, name)')
      .eq('role', 'employee')
      .neq('group_id', group.id)
      .order('full_name');

    setLoadingCandidates(false);
    setCandidates(error ? [] : ((data ?? []) as unknown as CandidateRow[]));
  }, [group, canTransfer]);

  React.useEffect(() => {
    if (!group) return;
    setActiveTab('members');
    setSelectedCandidates(new Set());
    setMemberQuery('');
    setCandidateQuery('');
    setTransferError(null);
    setTransferSuccess(null);
    setRenaming(false);
    setConfirmingDelete(false);
    setManageError(null);
    setMembers(null);
    setCandidates(null);

    loadMembers();
    loadCandidates();
  }, [group, loadMembers, loadCandidates]);

  const memberNeedle = memberQuery.trim().toLowerCase();
  const filteredMembers = React.useMemo(() => {
    if (!members) return null;
    if (!memberNeedle) return members;
    return members.filter(
      (m) =>
        m.full_name.toLowerCase().includes(memberNeedle) ||
        m.username.toLowerCase().includes(memberNeedle),
    );
  }, [members, memberNeedle]);

  const candidateNeedle = candidateQuery.trim().toLowerCase();
  const filteredCandidates = React.useMemo(() => {
    if (!candidates) return [];
    if (!candidateNeedle) return candidates;
    return candidates.filter(
      (c) =>
        c.full_name.toLowerCase().includes(candidateNeedle) ||
        c.username.toLowerCase().includes(candidateNeedle) ||
        (c.group?.name ?? '').toLowerCase().includes(candidateNeedle),
    );
  }, [candidates, candidateNeedle]);

  const allFilteredSelected =
    filteredCandidates.length > 0 && filteredCandidates.every((c) => selectedCandidates.has(c.id));

  function toggleSelectAllCandidates() {
    if (allFilteredSelected) {
      setSelectedCandidates((prev) => {
        const next = new Set(prev);
        for (const c of filteredCandidates) {
          next.delete(c.id);
        }
        return next;
      });
    } else {
      setSelectedCandidates((prev) => {
        const next = new Set(prev);
        for (const c of filteredCandidates) {
          next.add(c.id);
        }
        return next;
      });
    }
  }

  function toggleCandidate(id: string) {
    setSelectedCandidates((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleRename(e: React.FormEvent) {
    e.preventDefault();
    if (!group) return;
    const parsed = createGroupSchema.safeParse({ name: nameDraft });
    if (!parsed.success) {
      setManageError(parsed.error.issues[0]?.message ?? 'خطأ في البيانات');
      return;
    }
    setSavingName(true);
    setManageError(null);
    const { error } = await supabase
      .from('groups')
      .update({ name: parsed.data.name })
      .eq('id', group.id);
    setSavingName(false);
    if (error) {
      setManageError('تعذر تغيير اسم المجموعة');
      return;
    }
    onMembersChanged();
    onClose();
  }

  async function handleDeleteGroup() {
    if (!group) return;
    setDeleting(true);
    setManageError(null);
    const { error } = await supabase.from('groups').delete().eq('id', group.id);
    setDeleting(false);
    if (error) {
      setManageError(
        error.code === '23503'
          ? 'لا يمكن حذف مجموعة فيها مستخدمون أو مشرفون؛ انقلهم إلى مجموعة أخرى أولاً'
          : 'تعذر حذف المجموعة',
      );
      setConfirmingDelete(false);
      return;
    }
    onMembersChanged();
    onClose();
  }

  async function handleTransferSubmit() {
    if (!group || selectedCandidates.size === 0) return;
    setTransferring(true);
    setTransferError(null);
    const count = selectedCandidates.size;

    const { error } = await supabase
      .from('profiles')
      .update({ group_id: group.id })
      .in('id', Array.from(selectedCandidates));

    setTransferring(false);
    if (error) {
      setTransferError('تعذر نقل المستخدمين إلى المجموعة');
      return;
    }

    setSelectedCandidates(new Set());
    setCandidateQuery('');
    setTransferSuccess(`تم نقل ${count} مستخدم بنجاح إلى مجموعة ${group.name}`);
    await Promise.all([loadMembers(), loadCandidates()]);
    onMembersChanged();
    setActiveTab('members');
  }

  return (
    <Dialog open={!!group} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{group?.name}</DialogTitle>
        </DialogHeader>
        <DialogBody className="gap-4">
          {canTransfer && group && (
            <div className="flex flex-col gap-3 rounded-lg border border-neutral-100 p-3">
              {manageError && <Alert variant="danger">{manageError}</Alert>}
              {renaming ? (
                <form onSubmit={handleRename} className="flex items-end gap-2">
                  <Field label="اسم المجموعة" htmlFor="rename-group" className="flex-1">
                    <Input
                      id="rename-group"
                      value={nameDraft}
                      onChange={(e) => setNameDraft(e.target.value)}
                      autoFocus
                      required
                    />
                  </Field>
                  <Button type="button" variant="outline" onClick={() => setRenaming(false)}>
                    إلغاء
                  </Button>
                  <Button type="submit" loading={savingName}>
                    حفظ
                  </Button>
                </form>
              ) : confirmingDelete ? (
                <div className="flex flex-col gap-3">
                  <Alert variant="danger" title={`حذف مجموعة ${group.name}؟`}>
                    ستُحذف المجموعة وجميع الأوراد المُسندة لها ولا يمكن التراجع. يجب نقل أعضائها قبل
                    الحذف.
                  </Alert>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setConfirmingDelete(false)}
                    >
                      تراجع
                    </Button>
                    <Button
                      type="button"
                      variant="danger"
                      loading={deleting}
                      onClick={handleDeleteGroup}
                    >
                      نعم، احذف
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setNameDraft(group.name);
                      setManageError(null);
                      setRenaming(true);
                    }}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    تغيير الاسم
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setManageError(null);
                      setConfirmingDelete(true);
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    حذف المجموعة
                  </Button>
                </div>
              )}
            </div>
          )}
          <Tabs
            value={activeTab}
            onValueChange={(val) => {
              setActiveTab(val as 'members' | 'add-existing');
              setTransferSuccess(null);
              setTransferError(null);
            }}
          >
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-100 pb-3">
              <TabsList className="w-full sm:w-auto">
                <TabsTrigger value="members" className="flex-1 sm:flex-initial">
                  الأعضاء
                  {members !== null && (
                    <span className="ms-1.5 rounded-full bg-neutral-200/80 px-1.5 py-0.5 text-xs font-semibold tabular-nums text-neutral-700">
                      {members.length}
                    </span>
                  )}
                </TabsTrigger>
                {canTransfer && (
                  <TabsTrigger value="add-existing" className="flex-1 sm:flex-initial">
                    <ArrowRightLeft className="h-3.5 w-3.5 me-1.5" />
                    ضم مستخدمين
                  </TabsTrigger>
                )}
              </TabsList>

              {group && (
                <Button size="sm" onClick={() => onBulkCreate(group)} className="w-full sm:w-auto">
                  <UserPlus className="h-3.5 w-3.5" />
                  إنشاء دفعة جديدة
                </Button>
              )}
            </div>

            <TabsContent value="members" className="mt-3 flex flex-col gap-3">
              {transferSuccess && <Alert variant="success">{transferSuccess}</Alert>}

              {members === null ? (
                <SkeletonRows rows={4} />
              ) : members.length === 0 ? (
                <EmptyState
                  icon={UserRound}
                  title="لا يوجد أعضاء في هذه المجموعة"
                  description="يمكنك إنشاء حسابات جديدة لهذه المجموعة أو ضم مستخدمين من مجموعات أخرى."
                  action={
                    <div className="flex flex-wrap items-center justify-center gap-2">
                      {group && (
                        <Button size="sm" onClick={() => onBulkCreate(group)}>
                          <UserPlus className="h-4 w-4" />
                          إنشاء دفعة جديدة
                        </Button>
                      )}
                      {canTransfer && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setActiveTab('add-existing');
                            setTransferSuccess(null);
                            setTransferError(null);
                          }}
                        >
                          <ArrowRightLeft className="h-4 w-4" />
                          ضم مستخدمين
                        </Button>
                      )}
                    </div>
                  }
                />
              ) : (
                <div className="flex flex-col gap-2">
                  {members.length > 4 && (
                    <Input
                      icon={<Search className="h-4 w-4" />}
                      placeholder="ابحث بالاسم أو اسم المستخدم..."
                      value={memberQuery}
                      onChange={(e) => setMemberQuery(e.target.value)}
                      className="h-9 text-sm"
                    />
                  )}

                  {filteredMembers && filteredMembers.length === 0 ? (
                    <div className="py-6 text-center text-sm text-neutral-500">
                      لا توجد نتائج مطابقة للبحث
                    </div>
                  ) : (
                    <div className="flex max-h-72 flex-col gap-1 overflow-y-auto pe-1">
                      {(filteredMembers ?? members).map((m) => (
                        <div
                          key={m.id}
                          className="flex items-center gap-3 rounded-lg px-2.5 py-2 hover:bg-neutral-50"
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
                </div>
              )}
            </TabsContent>

            <TabsContent value="add-existing" className="mt-3 flex flex-col gap-3">
              {transferError && <Alert variant="danger">{transferError}</Alert>}

              <Alert variant="info">
                اختر المستخدمين لنقلهم إلى مجموعة &ldquo;{group?.name}&rdquo;. تُحذف أوراد المستخدم
                في مجموعته السابقة بسجلّها كاملاً، ويُسند إليه كل أوراد هذه المجموعة بنفس تواريخها.
              </Alert>

              {loadingCandidates ? (
                <SkeletonRows rows={4} />
              ) : !candidates || candidates.length === 0 ? (
                <EmptyState
                  icon={Users}
                  title="لا يوجد مستخدمون في مجموعات أخرى"
                  description="جميع المستخدمين ينتمون بالفعل لهذه المجموعة، أو لا يوجد مستخدمون مسجلون."
                />
              ) : (
                <div className="flex flex-col gap-2">
                  <Input
                    icon={<Search className="h-4 w-4" />}
                    placeholder="ابحث بالاسم أو اسم المستخدم أو المجموعة الحالية..."
                    value={candidateQuery}
                    onChange={(e) => setCandidateQuery(e.target.value)}
                    className="h-9 text-sm"
                  />

                  <div className="flex items-center justify-between border-b border-neutral-100 py-1.5">
                    <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-neutral-700">
                      <Checkbox
                        checked={allFilteredSelected}
                        onCheckedChange={toggleSelectAllCandidates}
                      />
                      <span>تحديد الكل ({filteredCandidates.length})</span>
                    </label>
                    {selectedCandidates.size > 0 && (
                      <Badge variant="brand">{selectedCandidates.size} محدد</Badge>
                    )}
                  </div>

                  {filteredCandidates.length === 0 ? (
                    <div className="py-6 text-center text-sm text-neutral-500">
                      لا توجد نتائج مطابقة للبحث
                    </div>
                  ) : (
                    <div className="flex max-h-64 flex-col gap-1 overflow-y-auto pe-1">
                      {filteredCandidates.map((c) => {
                        const isSelected = selectedCandidates.has(c.id);
                        return (
                          <label
                            key={c.id}
                            className={cn(
                              'flex cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2 transition-colors',
                              isSelected
                                ? 'bg-primary-50/60 ring-1 ring-primary-200'
                                : 'hover:bg-neutral-50',
                            )}
                          >
                            <Checkbox
                              checked={isSelected}
                              onCheckedChange={() => toggleCandidate(c.id)}
                            />
                            <Avatar name={c.full_name} size="sm" />
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-sm font-medium text-neutral-900">
                                {c.full_name}
                              </div>
                              <div
                                dir="ltr"
                                className="truncate text-start font-mono text-[11px] text-neutral-500"
                              >
                                {c.username}
                              </div>
                            </div>
                            {c.group && (
                              <Badge variant="neutral" className="text-xs">
                                {c.group.name}
                              </Badge>
                            )}
                            {!c.is_active && <Badge variant="neutral">موقوف</Badge>}
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            إغلاق
          </Button>
          {activeTab === 'add-existing' && (
            <Button
              onClick={handleTransferSubmit}
              disabled={selectedCandidates.size === 0}
              loading={transferring}
            >
              <ArrowRightLeft className="h-4 w-4" />
              ضم إلى المجموعة ({selectedCandidates.size})
            </Button>
          )}
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
