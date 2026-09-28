import * as React from 'react';
import { Navigate } from 'react-router-dom';
import {
  CalendarClock,
  ChevronDown,
  Plus,
  Repeat,
  Search,
  Send,
  Smartphone,
  Trash2,
  Zap,
} from 'lucide-react';
import {
  NOTIFICATION_AUDIENCES,
  NOTIFICATION_AUDIENCE_LABELS,
  SUPERVISOR_NOTIFICATION_AUDIENCES,
  CAMPAIGN_SCHEDULE_KINDS,
  CAMPAIGN_SHAPE_LABELS,
  WEEKDAY_LABELS,
  campaignShape,
  notificationCampaignSchema,
  type CampaignShape,
  type NotificationAudience,
  type NotificationCampaign,
  type CampaignScheduleKind,
} from '@wird/domain';
import {
  Alert,
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
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
  cn,
} from '@wird/ui-web';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth-context';

const CAMPAIGN_COLUMNS =
  'id, title, body, audience, target_profile_id, group_id, schedule_kind, scheduled_at, recur_weekday, recur_time, is_active, next_run_at, last_sent_at, last_sent_count, last_failed_count, last_target_count, last_recipient_count, last_error, created_at';

const SCHEDULE_KIND_LABELS: Record<CampaignScheduleKind, string> = {
  now: 'إرسال فوري',
  once: 'مرة واحدة',
  daily: 'يومي',
  weekly: 'أسبوعي',
};

const audienceBadge: Record<NotificationAudience, 'brand' | 'completed' | 'in_progress'> = {
  all: 'brand',
  group: 'brand',
  user: 'in_progress',
  incomplete_today: 'completed',
};

const dateTimeFormat = new Intl.DateTimeFormat('ar', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  hour: 'numeric',
  minute: '2-digit',
});

// The long form above wraps to three lines in a table cell; rows need the compact one.
const compactDateTime = new Intl.DateTimeFormat('ar', {
  day: 'numeric',
  month: 'short',
  hour: 'numeric',
  minute: '2-digit',
});

// The DB columns are text + check constraints (plain `string` in database.types.ts);
// values are guaranteed to be one of the domain unions.
function toCampaign(r: {
  id: string;
  title: string;
  body: string;
  audience: string;
  target_profile_id: string | null;
  group_id: string | null;
  schedule_kind: string;
  scheduled_at: string | null;
  recur_weekday: number | null;
  recur_time: string | null;
  is_active: boolean;
  next_run_at: string | null;
  last_sent_at: string | null;
  last_sent_count: number | null;
  last_failed_count: number | null;
  last_target_count: number | null;
  last_recipient_count: number | null;
  last_error: string | null;
  created_at: string;
}): NotificationCampaign {
  return {
    id: r.id,
    createdBy: null,
    title: r.title,
    body: r.body,
    audience: r.audience as NotificationAudience,
    targetProfileId: r.target_profile_id,
    groupId: r.group_id,
    scheduleKind: r.schedule_kind as CampaignScheduleKind,
    scheduledAt: r.scheduled_at,
    recurWeekday: r.recur_weekday,
    recurTime: r.recur_time,
    isActive: r.is_active,
    nextRunAt: r.next_run_at,
    lastSentAt: r.last_sent_at,
    lastSentCount: r.last_sent_count,
    lastFailedCount: r.last_failed_count,
    lastTargetCount: r.last_target_count,
    lastRecipientCount: r.last_recipient_count,
    lastError: r.last_error,
    createdAt: r.created_at,
  };
}

function scheduleSummary(c: NotificationCampaign): string {
  if (c.scheduleKind === 'now') return SCHEDULE_KIND_LABELS.now;
  if (c.scheduleKind === 'once') {
    return c.scheduledAt ? dateTimeFormat.format(new Date(c.scheduledAt)) : '—';
  }
  const time = c.recurTime?.slice(0, 5) ?? '—';
  if (c.scheduleKind === 'daily') return `كل يوم ${time} (بتوقيت دمشق)`;
  const day = c.recurWeekday !== null ? WEEKDAY_LABELS[c.recurWeekday] : '—';
  return `كل ${day} ${time} (بتوقيت دمشق)`;
}

/** Immediate dispatch of a campaign through the push-notifications edge function. */
async function dispatchCampaign(campaignId: string): Promise<{
  ok: boolean;
  sent?: number;
  recipients?: number;
  targets?: number;
  skipped?: boolean;
}> {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) return { ok: false };

  const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/push-notifications`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ campaignId }),
  });
  const body = await res.json();
  if (!res.ok) return { ok: false };
  return {
    ok: true,
    sent: body.sent,
    recipients: body.recipients,
    targets: body.targets,
    skipped: !!body.skipped,
  };
}

/** "وصل إلى 12 من 15 مستخدماً" — people, which is what a supervisor actually asks about. */
function reachText(recipients: number | null | undefined, targets: number | null | undefined) {
  const r = recipients ?? 0;
  if (targets === null || targets === undefined) return `وصل إلى ${r} مستخدم`;
  return `وصل إلى ${r} من ${targets} مستخدم`;
}

export default function NotificationsPage() {
  const { profile } = useAuth();
  const [campaigns, setCampaigns] = React.useState<NotificationCampaign[] | null>(null);
  // Success and failure both used to render as <Alert variant="danger">, so a good send
  // ("تم الإرسال إلى 12 جهاز") looked like a failure. The tone travels with the message.
  const [notice, setNotice] = React.useState<{ text: string; tone: 'success' | 'danger' } | null>(
    null,
  );
  const [composing, setComposing] = React.useState(false);
  const [confirmDelete, setConfirmDelete] = React.useState<NotificationCampaign | null>(null);
  const [sendingNow, setSendingNow] = React.useState<string | null>(null);
  const [tab, setTab] = React.useState<CampaignShape>('recurring');
  const [query, setQuery] = React.useState('');
  // '*' rather than '' — Radix Select reserves the empty string, and 'all' is already a
  // real audience ("الجميع"), so the no-filter sentinel has to be neither.
  const [audienceFilter, setAudienceFilter] = React.useState<NotificationAudience | '*'>('*');
  const [groups, setGroups] = React.useState<{ id: string; name: string }[]>([]);

  const isSupervisor = profile?.role === 'supervisor';
  const audiences: readonly NotificationAudience[] = isSupervisor
    ? SUPERVISOR_NOTIFICATION_AUDIENCES
    : NOTIFICATION_AUDIENCES;
  const groupNames = React.useMemo(() => new Map(groups.map((g) => [g.id, g.name])), [groups]);

  // RLS already scopes this: a supervisor gets their one group, a superadmin all of them.
  React.useEffect(() => {
    supabase
      .from('groups')
      .select('id, name')
      .order('name')
      .then(({ data }) => setGroups(data ?? []));
  }, []);

  const load = React.useCallback(async () => {
    const { data, error } = await supabase
      .from('notification_campaigns')
      .select(CAMPAIGN_COLUMNS)
      .order('created_at', { ascending: false });

    if (error) {
      setNotice({ text: 'تعذر تحميل الإشعارات', tone: 'danger' });
      setCampaigns([]);
      return;
    }
    setNotice(null);
    setCampaigns((data ?? []).map(toCampaign));
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  async function toggleActive(campaign: NotificationCampaign) {
    // Optimistic like BannersPage; a failure reloads the truth.
    setCampaigns(
      (prev) =>
        prev?.map((c) => (c.id === campaign.id ? { ...c, isActive: !c.isActive } : c)) ?? null,
    );
    const { error } = await supabase
      .from('notification_campaigns')
      .update({ is_active: !campaign.isActive })
      .eq('id', campaign.id);
    if (error) {
      setNotice({ text: 'تعذر تغيير حالة الإشعار', tone: 'danger' });
      load();
    }
  }

  async function remove(campaign: NotificationCampaign) {
    setConfirmDelete(null);
    const { error } = await supabase.from('notification_campaigns').delete().eq('id', campaign.id);
    if (error) {
      setNotice({ text: 'تعذر حذف الإشعار', tone: 'danger' });
      return;
    }
    load();
  }

  async function dispatchNow(campaign: NotificationCampaign) {
    setSendingNow(campaign.id);
    setNotice(null);
    const result = await dispatchCampaign(campaign.id);
    setSendingNow(null);
    if (!result.ok) {
      setNotice({ text: 'تعذر الإرسال الآن — سيعيد المجدول المحاولة تلقائياً', tone: 'danger' });
    } else if (result.skipped) {
      setNotice({ text: 'الإشعار أُرسل للتو من مجدول آخر', tone: 'danger' });
    } else {
      setNotice({
        text: `تم الإرسال — ${reachText(result.recipients, result.targets)} (${result.sent ?? 0} جهاز)`,
        tone: 'success',
      });
    }
    load();
  }

  const needle = query.trim().toLowerCase();
  const filtered = React.useMemo(
    () =>
      campaigns?.filter(
        (c) =>
          (audienceFilter === '*' || c.audience === audienceFilter) &&
          (!needle ||
            c.title.toLowerCase().includes(needle) ||
            c.body.toLowerCase().includes(needle)),
      ) ?? null,
    [campaigns, audienceFilter, needle],
  );
  const byShape = (shape: CampaignShape) =>
    filtered?.filter((c) => campaignShape(c.scheduleKind) === shape) ?? [];
  const recurring = byShape('recurring');
  const once = byShape('once');
  const instant = byShape('instant');
  // Distinguishes "nothing matches your filters" from "nothing exists yet" — the second
  // wants a create button, the first wants you to widen the search.
  const filtersActive = !!needle || audienceFilter !== '*';

  if (profile && profile.role !== 'superadmin' && profile.role !== 'supervisor') {
    return <Navigate to="/unauthorized" replace />;
  }

  return (
    <GroupNamesContext.Provider value={groupNames}>
      <div className="flex flex-col gap-6">
        <PageHeader
          title="الإشعارات"
          description={
            isSupervisor
              ? 'إشعارات فورية أو مجدولة لمجموعتك، تحمل ورد اليوم وتصل حتى مع إغلاق التطبيق'
              : 'إشعارات فورية أو مجدولة تحمل ورد اليوم وتصل المستخدمين حتى مع إغلاق التطبيق'
          }
          actions={
            <Button onClick={() => setComposing(true)}>
              <Plus className="h-4 w-4" />
              إشعار جديد
            </Button>
          }
        />

        {notice && <Alert variant={notice.tone}>{notice.text}</Alert>}

        <CoveragePanel groupNames={groupNames} showGroup={!isSupervisor} />

        {campaigns === null ? (
          <Card>
            <SkeletonRows rows={3} />
          </Card>
        ) : (
          <Card className="overflow-hidden">
            <Tabs value={tab} onValueChange={(v) => setTab(v as CampaignShape)}>
              <div className="flex flex-wrap items-center gap-3 border-b border-neutral-100 p-4">
                {/* Three shapes, not three raw kinds: a supervisor thinks "does this repeat,
                  does it end, or did it already go out" — not "is this row 'weekly'". */}
                <TabsList>
                  <TabsTrigger value="recurring">
                    {CAMPAIGN_SHAPE_LABELS.recurring} ({recurring.length})
                  </TabsTrigger>
                  <TabsTrigger value="once">
                    {CAMPAIGN_SHAPE_LABELS.once} ({once.length})
                  </TabsTrigger>
                  <TabsTrigger value="instant">
                    {CAMPAIGN_SHAPE_LABELS.instant} ({instant.length})
                  </TabsTrigger>
                </TabsList>

                <div className="flex flex-1 flex-wrap items-center justify-end gap-2">
                  <Input
                    icon={<Search className="h-4 w-4" />}
                    placeholder="ابحث في العنوان أو النص"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    className="h-10 w-full max-w-xs"
                  />
                  <Select
                    value={audienceFilter}
                    onValueChange={(v) => setAudienceFilter(v as NotificationAudience | '*')}
                  >
                    <SelectTrigger className="h-10 w-48">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="*">كل الفئات</SelectItem>
                      {audiences.map((a) => (
                        <SelectItem key={a} value={a}>
                          {NOTIFICATION_AUDIENCE_LABELS[a]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Standing rules: they keep firing, so enable/disable and next-run are the point. */}
              <TabsContent value="recurring">
                <ScheduledTable
                  shape="recurring"
                  rows={recurring}
                  filtersActive={filtersActive}
                  sendingNow={sendingNow}
                  onCompose={() => setComposing(true)}
                  onToggleActive={toggleActive}
                  onSend={dispatchNow}
                  onDelete={setConfirmDelete}
                />
              </TabsContent>

              {/* One-offs: they end by themselves, so the question is only whether the moment
                has passed yet — not whether the rule is still worth keeping on. */}
              <TabsContent value="once">
                <ScheduledTable
                  shape="once"
                  rows={once}
                  filtersActive={filtersActive}
                  sendingNow={sendingNow}
                  onCompose={() => setComposing(true)}
                  onToggleActive={toggleActive}
                  onSend={dispatchNow}
                  onDelete={setConfirmDelete}
                />
              </TabsContent>

              {/* Instant: a send log. No enable/disable — a one-off send has nothing to disable
                once it has fired, and toggling it off before it fires just loses it silently. */}
              <TabsContent value="instant">
                {instant.length === 0 ? (
                  <EmptyState
                    icon={Zap}
                    title={filtersActive ? 'لا نتائج مطابقة' : 'لا توجد إشعارات فورية'}
                    description={
                      filtersActive
                        ? 'جرّب كلمة بحث أخرى أو غيّر فئة المرسل إليهم.'
                        : 'الإشعارات التي ترسلها فوراً تظهر هنا مع نتيجة كل إرسال.'
                    }
                    action={
                      filtersActive ? undefined : (
                        <Button size="sm" onClick={() => setComposing(true)}>
                          <Plus className="h-4 w-4" />
                          إشعار جديد
                        </Button>
                      )
                    }
                  />
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>الإشعار</TableHead>
                        <TableHead>المرسل إليهم</TableHead>
                        <TableHead>أُرسل في</TableHead>
                        <TableHead>النتيجة</TableHead>
                        <TableHead>
                          <span className="sr-only">إجراءات</span>
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {instant.map((campaign) => (
                        <TableRow key={campaign.id}>
                          <TableCell>
                            <CampaignCell campaign={campaign} />
                          </TableCell>
                          <TableCell>
                            <AudienceCell campaign={campaign} />
                          </TableCell>
                          <TableCell>
                            {campaign.lastSentAt ? (
                              <span className="text-neutral-700">
                                {compactDateTime.format(new Date(campaign.lastSentAt))}
                              </span>
                            ) : (
                              /* Created but the immediate dispatch did not land; the cron
                               dispatcher still owns it while next_run_at is set. */
                              <Badge variant="in_progress" dot>
                                بانتظار الإرسال
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            {campaign.lastError ? (
                              <div title={campaign.lastError}>
                                <Badge variant="danger" dot>
                                  فشل الإرسال
                                </Badge>
                              </div>
                            ) : campaign.lastSentAt ? (
                              <ReachSummary campaign={campaign} />
                            ) : (
                              <span className="text-neutral-400">—</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <RowActions
                              campaign={campaign}
                              canSend={!!campaign.nextRunAt}
                              sending={sendingNow === campaign.id}
                              onSend={() => dispatchNow(campaign)}
                              onDelete={() => setConfirmDelete(campaign)}
                            />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </TabsContent>
            </Tabs>
          </Card>
        )}

        <ComposeDialog
          open={composing}
          supervisorId={profile?.id ?? ''}
          // A supervisor's campaigns are always their own group's; the picker is superadmin-only.
          fixedGroupId={isSupervisor ? (profile?.groupId ?? null) : null}
          audiences={audiences}
          groups={groups}
          onClose={() => setComposing(false)}
          onSaved={(kind) => {
            setComposing(false);
            // Follow the campaign to its tab, otherwise composing an instant notification while
            // the recurring tab is open looks like nothing happened.
            setTab(campaignShape(kind));
            load();
          }}
        />

        <Dialog open={!!confirmDelete} onOpenChange={(open) => !open && setConfirmDelete(null)}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>حذف الإشعار</DialogTitle>
            </DialogHeader>
            <DialogBody>
              <p className="text-sm text-neutral-600">
                سيُحذف الإشعار نهائياً ولن يُرسل مجدداً. لتعطيله مؤقتاً استخدم خيار «مفعّل».
              </p>
            </DialogBody>
            <DialogFooter>
              <Button variant="outline" onClick={() => setConfirmDelete(null)}>
                إلغاء
              </Button>
              <Button
                className="bg-danger-600 hover:bg-danger-700"
                onClick={() => confirmDelete && remove(confirmDelete)}
              >
                حذف
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </GroupNamesContext.Provider>
  );
}

/**
 * The two scheduled shapes share every column but one: a recurring rule shows its repeat
 * pattern, a one-off shows the single moment it is aimed at. Everything else — the toggle,
 * the last send, the actions — is identical, so they share a table rather than a copy of one.
 */
function ScheduledTable({
  shape,
  rows,
  filtersActive,
  sendingNow,
  onCompose,
  onToggleActive,
  onSend,
  onDelete,
}: {
  shape: 'recurring' | 'once';
  rows: NotificationCampaign[];
  filtersActive: boolean;
  sendingNow: string | null;
  onCompose: () => void;
  onToggleActive: (c: NotificationCampaign) => void;
  onSend: (c: NotificationCampaign) => void;
  onDelete: (c: NotificationCampaign) => void;
}) {
  const isOnce = shape === 'once';

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={isOnce ? CalendarClock : Repeat}
        title={
          filtersActive
            ? 'لا نتائج مطابقة'
            : isOnce
              ? 'لا توجد إشعارات لمرة واحدة'
              : 'لا توجد إشعارات متكررة'
        }
        description={
          filtersActive
            ? 'جرّب كلمة بحث أخرى أو غيّر فئة المرسل إليهم.'
            : isOnce
              ? 'جدول إشعاراً لموعد محدد؛ يُرسل مرة واحدة ثم ينتهي.'
              : 'جدول تذكيراً يومياً أو أسبوعياً يتكرر حتى تعطّله.'
        }
        action={
          filtersActive ? undefined : (
            <Button size="sm" onClick={onCompose}>
              <Plus className="h-4 w-4" />
              إشعار جديد
            </Button>
          )
        }
      />
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>الإشعار</TableHead>
          <TableHead>المرسل إليهم</TableHead>
          <TableHead>{isOnce ? 'موعد الإرسال' : 'التكرار'}</TableHead>
          <TableHead>آخر إرسال</TableHead>
          <TableHead>مفعّل</TableHead>
          <TableHead>
            <span className="sr-only">إجراءات</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((campaign) => {
          // A one-off whose moment has passed is spent, not "upcoming" — the claim nulls
          // next_run_at on send, so that is what distinguishes the two.
          const spent = isOnce && !campaign.nextRunAt;
          return (
            <TableRow key={campaign.id} className={cn(!campaign.isActive && 'bg-neutral-50/70')}>
              <TableCell>
                <CampaignCell campaign={campaign} muted={!campaign.isActive} />
              </TableCell>
              <TableCell>
                <AudienceCell campaign={campaign} />
              </TableCell>
              <TableCell>
                <div className="text-neutral-700">{scheduleSummary(campaign)}</div>
                {campaign.isActive && campaign.nextRunAt ? (
                  <div className="mt-0.5 text-xs text-primary-700">
                    القادم: {compactDateTime.format(new Date(campaign.nextRunAt))}
                  </div>
                ) : (
                  spent && <div className="mt-0.5 text-xs text-neutral-400">انتهى</div>
                )}
              </TableCell>
              <TableCell>
                <LastSendCell campaign={campaign} />
              </TableCell>
              <TableCell>
                <Checkbox
                  checked={campaign.isActive}
                  onCheckedChange={() => onToggleActive(campaign)}
                  aria-label={campaign.isActive ? 'تعطيل الإشعار' : 'تفعيل الإشعار'}
                />
              </TableCell>
              <TableCell>
                <RowActions
                  campaign={campaign}
                  canSend={campaign.isActive && !!campaign.nextRunAt}
                  sending={sendingNow === campaign.id}
                  onSend={() => onSend(campaign)}
                  onDelete={() => onDelete(campaign)}
                />
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

function CampaignCell({ campaign, muted }: { campaign: NotificationCampaign; muted?: boolean }) {
  return (
    <>
      <div className={cn('font-medium text-neutral-900', muted && 'text-neutral-500')}>
        {campaign.title}
      </div>
      {/* Bodies run to 500 chars; two lines is enough to tell campaigns apart. */}
      <p className="mt-0.5 line-clamp-2 max-w-sm text-xs leading-relaxed text-neutral-500">
        {campaign.body}
      </p>
    </>
  );
}

function AudienceCell({ campaign }: { campaign: NotificationCampaign }) {
  const groupNames = React.useContext(GroupNamesContext);
  const groupName = campaign.groupId ? groupNames.get(campaign.groupId) : null;
  return (
    <div className="flex flex-col items-start gap-1">
      <Badge variant={audienceBadge[campaign.audience]} dot>
        {NOTIFICATION_AUDIENCE_LABELS[campaign.audience]}
      </Badge>
      {groupName && <span className="text-xs text-neutral-500">{groupName}</span>}
    </div>
  );
}

/** Group id → name, for labelling group-scoped campaigns. */
const GroupNamesContext = React.createContext<Map<string, string>>(new Map());

/**
 * People reached, then devices. Sends made before the reach columns existed only have a device
 * count, so that is what they show.
 */
function ReachSummary({ campaign }: { campaign: NotificationCampaign }) {
  if (campaign.lastRecipientCount === null) {
    return (
      <span className="text-xs tabular-nums text-neutral-500">
        {campaign.lastSentCount ?? 0} جهاز
      </span>
    );
  }
  const missed = (campaign.lastTargetCount ?? 0) - campaign.lastRecipientCount;
  return (
    <div className="text-xs tabular-nums leading-relaxed">
      <div className="text-neutral-700">
        {reachText(campaign.lastRecipientCount, campaign.lastTargetCount)}
      </div>
      <div className="text-neutral-500">
        {campaign.lastSentCount ?? 0} جهاز
        {(campaign.lastFailedCount ?? 0) > 0 && ` · ${campaign.lastFailedCount} فشل`}
      </div>
      {missed > 0 && <div className="text-accent-700">{missed} بلا جهاز مفعّل</div>}
    </div>
  );
}

function LastSendCell({ campaign }: { campaign: NotificationCampaign }) {
  return (
    <>
      {campaign.lastSentAt ? (
        <>
          <div className="text-neutral-700">
            {compactDateTime.format(new Date(campaign.lastSentAt))}
          </div>
          <div className="mt-0.5">
            <ReachSummary campaign={campaign} />
          </div>
        </>
      ) : (
        <span className="text-neutral-400">—</span>
      )}
      {campaign.lastError && (
        /* The message itself was never surfaced anywhere before — only a badge saying an
           error existed, which is unactionable on its own. */
        <div className="mt-1" title={campaign.lastError}>
          <Badge variant="danger" dot>
            فشل الإرسال
          </Badge>
        </div>
      )}
    </>
  );
}

function RowActions({
  campaign,
  canSend,
  sending,
  onSend,
  onDelete,
}: {
  campaign: NotificationCampaign;
  canSend: boolean;
  sending: boolean;
  onSend: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex items-center justify-end gap-1">
      {canSend && (
        <IconButton aria-label="إرسال الآن" disabled={sending} onClick={onSend}>
          <Send className={cn('h-4 w-4', sending && 'animate-pulse')} />
        </IconButton>
      )}
      <IconButton
        aria-label={`حذف ${campaign.title}`}
        onClick={onDelete}
        className="text-danger-600 hover:bg-danger-50"
      >
        <Trash2 className="h-4 w-4" />
      </IconButton>
    </div>
  );
}

function ComposeDialog({
  open,
  supervisorId,
  fixedGroupId,
  audiences,
  groups,
  onClose,
  onSaved,
}: {
  open: boolean;
  supervisorId: string;
  /** Set for a supervisor: every campaign they create belongs to this group. */
  fixedGroupId: string | null;
  audiences: readonly NotificationAudience[];
  groups: { id: string; name: string }[];
  onClose: () => void;
  onSaved: (kind: CampaignScheduleKind) => void;
}) {
  const [title, setTitle] = React.useState('');
  const [body, setBody] = React.useState('');
  const [audience, setAudience] = React.useState<NotificationAudience>(audiences[0]!);
  const [targetProfileId, setTargetProfileId] = React.useState('');
  const [groupId, setGroupId] = React.useState('');
  const [scheduleKind, setScheduleKind] = React.useState<CampaignScheduleKind>('now');
  const [scheduledLocal, setScheduledLocal] = React.useState('');
  const [recurWeekday, setRecurWeekday] = React.useState<number>(5);
  const [recurTime, setRecurTime] = React.useState('08:00');
  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [employees, setEmployees] = React.useState<{ id: string; fullName: string }[]>([]);

  React.useEffect(() => {
    if (!open) return;
    setTitle('');
    setBody('');
    setAudience(audiences[0]!);
    setTargetProfileId('');
    setGroupId('');
    setScheduleKind('now');
    setScheduledLocal('');
    setRecurWeekday(5);
    setRecurTime('08:00');
    setError(null);
    // audiences is one of two module constants, so it only changes with the viewer's role.
  }, [open, audiences]);

  React.useEffect(() => {
    if (!open || employees.length > 0) return;
    supabase
      .from('profiles')
      .select('id, full_name')
      .eq('role', 'employee')
      .eq('is_active', true)
      .order('full_name')
      .then(({ data }) =>
        setEmployees(
          (data ?? []).map((p: { id: string; full_name: string }) => ({
            id: p.id,
            fullName: p.full_name,
          })),
        ),
      );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // The group the campaign is scoped to: a supervisor's own, or the superadmin's pick for the
  // 'group' audience. Everything else a superadmin sends is global.
  const effectiveGroupId = fixedGroupId ?? (audience === 'group' ? groupId || null : null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = notificationCampaignSchema.safeParse({
      title,
      body,
      audience,
      targetProfileId: targetProfileId || null,
      groupId: effectiveGroupId,
      scheduleKind,
      scheduledLocal: scheduledLocal || undefined,
      recurWeekday,
      recurTime,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'خطأ في البيانات');
      return;
    }

    setSubmitting(true);
    setError(null);
    const v = parsed.data;

    // datetime-local carries no timezone; supervisors mean Damascus wall time (+03:00, no DST).
    const scheduledAt =
      v.scheduleKind === 'once' && v.scheduledLocal
        ? new Date(`${v.scheduledLocal}:00+03:00`).toISOString()
        : null;

    const { data: inserted, error: insertError } = await supabase
      .from('notification_campaigns')
      .insert({
        title: v.title,
        body: v.body,
        audience: v.audience,
        target_profile_id: v.audience === 'user' ? v.targetProfileId : null,
        group_id: v.groupId ?? null,
        schedule_kind: v.scheduleKind,
        scheduled_at: scheduledAt,
        recur_weekday: v.scheduleKind === 'weekly' ? v.recurWeekday : null,
        // Both recurring kinds need the time; only the weekly one needs a weekday.
        recur_time: v.scheduleKind === 'weekly' || v.scheduleKind === 'daily' ? v.recurTime : null,
        created_by: supervisorId,
      })
      .select('id')
      .single();

    if (insertError || !inserted) {
      setSubmitting(false);
      setError('تعذر إنشاء الإشعار');
      return;
    }

    if (v.scheduleKind === 'now') {
      const result = await dispatchCampaign(inserted.id);
      setSubmitting(false);
      if (!result.ok) {
        setError('تم الحفظ لكن الإرسال الفوري فشل — سيتولاه المجدول خلال دقائق');
        return;
      }
    }
    setSubmitting(false);
    onSaved(v.scheduleKind);
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>إشعار جديد</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <DialogBody>
            {error && <Alert variant="danger">{error}</Alert>}

            <Field label="العنوان">
              <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={100} />
            </Field>

            <Field label="النص">
              <Textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={3}
                maxLength={500}
              />
            </Field>

            <Field label="المرسل إليهم">
              <Select
                value={audience}
                onValueChange={(v) => setAudience(v as NotificationAudience)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {audiences.map((a) => (
                    <SelectItem key={a} value={a}>
                      {a === 'group' && fixedGroupId ? 'مجموعتي' : NOTIFICATION_AUDIENCE_LABELS[a]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            {audience === 'group' && !fixedGroupId && (
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
            )}

            {audience === 'user' && (
              <Field label="المستخدم">
                <Select value={targetProfileId} onValueChange={setTargetProfileId}>
                  <SelectTrigger>
                    <SelectValue placeholder="اختر مستخدماً" />
                  </SelectTrigger>
                  <SelectContent>
                    {employees.map((emp) => (
                      <SelectItem key={emp.id} value={emp.id}>
                        {emp.fullName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            )}

            <Field label="التوقيت">
              <Select
                value={scheduleKind}
                onValueChange={(v) => setScheduleKind(v as CampaignScheduleKind)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CAMPAIGN_SCHEDULE_KINDS.map((k) => (
                    <SelectItem key={k} value={k}>
                      {SCHEDULE_KIND_LABELS[k]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            {scheduleKind === 'once' && (
              <Field label="تاريخ ووقت الإرسال (بتوقيت دمشق)">
                <Input
                  type="datetime-local"
                  value={scheduledLocal}
                  onChange={(e) => setScheduledLocal(e.target.value)}
                />
              </Field>
            )}

            {scheduleKind === 'daily' && (
              <Field label="الوقت (بتوقيت دمشق)" hint="يُرسل كل يوم في هذا الوقت">
                <Input
                  type="time"
                  value={recurTime}
                  onChange={(e) => setRecurTime(e.target.value)}
                />
              </Field>
            )}

            {scheduleKind === 'weekly' && (
              <div className="grid grid-cols-2 gap-3">
                <Field label="اليوم">
                  <Select
                    value={String(recurWeekday)}
                    onValueChange={(v) => setRecurWeekday(Number(v))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(WEEKDAY_LABELS).map(([day, label]) => (
                        <SelectItem key={day} value={day}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="الوقت (بتوقيت دمشق)">
                  <Input
                    type="time"
                    value={recurTime}
                    onChange={(e) => setRecurTime(e.target.value)}
                  />
                </Field>
              </div>
            )}

            {scheduleKind === 'now' && (
              <p className="text-xs leading-relaxed text-neutral-500">
                يُرسل فوراً عند الحفظ إلى الأجهزة المسجّلة للإشعارات.
              </p>
            )}

            <NotificationPreview
              title={title}
              body={body}
              withWird={audience === 'incomplete_today'}
            />
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              إلغاء
            </Button>
            <Button type="submit" disabled={submitting}>
              {scheduleKind === 'now' ? 'إرسال' : 'حفظ'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Roughly how the push lands on a phone. For the "unfinished today" audience the app appends
 * each employee's own remaining wird under the text, so that is shown too.
 */
function NotificationPreview({
  title,
  body,
  withWird,
}: {
  title: string;
  body: string;
  withWird: boolean;
}) {
  return (
    <div className="rounded-2xl bg-neutral-100 p-3">
      <div className="mb-2 text-[11px] font-medium text-neutral-500">معاينة على الهاتف</div>
      <div className="flex gap-3 rounded-xl bg-surface p-3 shadow-xs">
        <img src="/icon-192.png" alt="" className="h-9 w-9 shrink-0 rounded-lg" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-sm font-semibold text-neutral-900">
              {title || 'عنوان الإشعار'}
            </span>
            <span className="shrink-0 text-[10px] text-neutral-400">الآن</span>
          </div>
          <p className="mt-0.5 whitespace-pre-line text-xs leading-relaxed text-neutral-600">
            {body || 'نص الإشعار'}
            {withWird && (
              <span className="text-neutral-400">
                {'\n'}حفظ جديد: البقرة (1-10){'\n'}مراجعة صغرى: آل عمران (1-30)
              </span>
            )}
          </p>
        </div>
      </div>
      {withWird && (
        <p className="mt-2 text-[11px] leading-relaxed text-neutral-500">
          يُضاف ورد كل مستخدم المتبقي تلقائياً، ويُحفظ على جهازه ليفتح عليه حتى دون إنترنت.
        </p>
      )}
    </div>
  );
}

interface CoverageRow {
  profile_id: string;
  full_name: string;
  group_id: string;
  device_count: number;
  platforms: string[];
  installed: boolean;
  last_seen_at: string | null;
}

const PLATFORM_LABELS: Record<string, string> = {
  ios: 'آيفون',
  android: 'أندرويد',
  desktop: 'حاسوب',
};

/**
 * Who a push can actually reach. A send only ever lands on devices that registered, so the
 * practical question before and after any campaign is "who has not enabled notifications" —
 * those are the people to help in person.
 */
function CoveragePanel({
  groupNames,
  showGroup,
}: {
  groupNames: Map<string, string>;
  showGroup: boolean;
}) {
  const [rows, setRows] = React.useState<CoverageRow[] | null>(null);
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    supabase.rpc('push_coverage', {}).then(({ data, error }) => {
      setRows(error ? [] : ((data ?? []) as CoverageRow[]));
    });
  }, []);

  if (!rows || rows.length === 0) return null;

  const covered = rows.filter((r) => r.device_count > 0).length;
  const missing = rows.filter((r) => r.device_count === 0);
  const pct = Math.round((covered / rows.length) * 100);

  return (
    <Card className="overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-4 p-4 text-start"
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-700">
          <Smartphone className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="font-medium text-neutral-900">
            الإشعارات مفعّلة لدى {covered} من {rows.length} مستخدم ({pct}%)
          </div>
          <div className="mt-0.5 text-xs text-neutral-500">
            {missing.length === 0
              ? 'كل المستخدمين يستقبلون الإشعارات'
              : `${missing.length} لن تصلهم الإشعارات حتى يفعّلوها من التطبيق`}
          </div>
        </div>
        <ChevronDown
          className={cn('h-4 w-4 text-neutral-400 transition-transform', open && 'rotate-180')}
        />
      </button>

      {open && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>المستخدم</TableHead>
              {showGroup && <TableHead>المجموعة</TableHead>}
              <TableHead>الأجهزة</TableHead>
              <TableHead>آخر ظهور</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.profile_id}>
                <TableCell className="font-medium text-neutral-900">{r.full_name}</TableCell>
                {showGroup && (
                  <TableCell className="text-neutral-600">
                    {groupNames.get(r.group_id) ?? '—'}
                  </TableCell>
                )}
                <TableCell>
                  {r.device_count === 0 ? (
                    <Badge variant="danger" dot>
                      غير مفعّلة
                    </Badge>
                  ) : (
                    <span className="text-neutral-700">
                      {r.platforms.map((p) => PLATFORM_LABELS[p] ?? p).join('، ') ||
                        `${r.device_count} جهاز`}
                      {!r.installed && (
                        <span className="text-xs text-neutral-400"> · من المتصفح</span>
                      )}
                    </span>
                  )}
                </TableCell>
                <TableCell className="text-neutral-600">
                  {r.last_seen_at ? compactDateTime.format(new Date(r.last_seen_at)) : '—'}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Card>
  );
}
