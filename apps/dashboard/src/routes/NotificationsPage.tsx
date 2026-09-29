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
  NOTIFICATION_CHANNELS,
  NOTIFICATION_CHANNEL_LABELS,
  SUPERVISOR_NOTIFICATION_AUDIENCES,
  CAMPAIGN_SCHEDULE_KINDS,
  WEEKDAY_LABELS,
  campaignCanSendNow,
  campaignIsSent,
  campaignShape,
  notificationCampaignSchema,
  type CampaignShape,
  type NotificationAudience,
  type NotificationChannel,
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
  Pagination,
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
  'id, title, body, audience, target_profile_id, group_id, channel, schedule_kind, scheduled_at, recur_weekday, recur_time, is_active, next_run_at, last_sent_at, last_sent_count, last_failed_count, last_target_count, last_recipient_count, last_error, created_at';

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
  assigned_today: 'completed',
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
  channel: string;
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
    channel: r.channel as NotificationChannel,
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
  const [tab, setTab] = React.useState<StatusTab>('all');
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
  const upcoming = filtered?.filter((c) => !campaignIsSent(c)) ?? [];
  const sent = filtered?.filter(campaignIsSent) ?? [];
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
            <Tabs value={tab} onValueChange={(v) => setTab(v as StatusTab)}>
              <div className="flex flex-wrap items-center gap-3 border-b border-neutral-100 p-4">
                {/* What a supervisor asks is "what is still going to go out" vs "what already
                  went out" — the repeat pattern is a column, not a place to hunt in. */}
                <TabsList className="w-full sm:w-auto">
                  <TabsTrigger value="all" className="flex-1 sm:flex-initial">
                    الكل ({filtered?.length ?? 0})
                  </TabsTrigger>
                  <TabsTrigger value="upcoming" className="flex-1 sm:flex-initial">
                    القادمة ({upcoming.length})
                  </TabsTrigger>
                  <TabsTrigger value="sent" className="flex-1 sm:flex-initial">
                    المُرسلة ({sent.length})
                  </TabsTrigger>
                </TabsList>

                <div className="flex flex-1 flex-wrap items-center justify-end gap-2 w-full sm:w-auto">
                  <Input
                    icon={<Search className="h-4 w-4" />}
                    placeholder="ابحث في العنوان أو النص"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    className="h-10 w-full sm:max-w-xs"
                  />
                  <Select
                    value={audienceFilter}
                    onValueChange={(v) => setAudienceFilter(v as NotificationAudience | '*')}
                  >
                    <SelectTrigger className="h-10 w-full sm:w-48">
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

              {(['all', 'upcoming', 'sent'] as const).map((t) => (
                <TabsContent key={t} value={t}>
                  <CampaignTable
                    tab={t}
                    rows={t === 'all' ? (filtered ?? []) : t === 'upcoming' ? upcoming : sent}
                    filtersActive={filtersActive}
                    sendingNow={sendingNow}
                    onCompose={() => setComposing(true)}
                    onToggleActive={toggleActive}
                    onSend={dispatchNow}
                    onDelete={setConfirmDelete}
                  />
                </TabsContent>
              ))}
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
            // Follow the campaign to where it now lives, so saving never looks like nothing
            // happened.
            setTab(kind === 'now' ? 'sent' : 'upcoming');
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

type StatusTab = 'all' | 'upcoming' | 'sent';

const SHAPE_ICONS: Record<CampaignShape, typeof Zap> = {
  instant: Zap,
  once: CalendarClock,
  recurring: Repeat,
};

const EMPTY_COPY: Record<StatusTab, { title: string; description: string }> = {
  all: {
    title: 'لا توجد إشعارات بعد',
    description: 'أرسل إشعاراً فورياً، أو جدوله لموعد محدد، أو اجعله يتكرر يومياً أو أسبوعياً.',
  },
  upcoming: {
    title: 'لا توجد إشعارات قادمة',
    description: 'الإشعارات المجدولة والمتكررة التي لم تُرسل بعد تظهر هنا.',
  },
  sent: {
    title: 'لم يُرسل شيء بعد',
    description: 'الإشعارات الفورية والمجدولة لمرة واحدة تنتقل إلى هنا بعد إرسالها مع نتيجتها.',
  },
};

/**
 * One table for every shape. What differs is per row: the active toggle only exists while
 * something is still going to fire (a sent one-off has nothing left to enable), and "send now"
 * follows campaignCanSendNow — instant messages re-send freely, spent one-offs never.
 */
function CampaignTable({
  tab,
  rows,
  filtersActive,
  sendingNow,
  onCompose,
  onToggleActive,
  onSend,
  onDelete,
}: {
  tab: StatusTab;
  rows: NotificationCampaign[];
  filtersActive: boolean;
  sendingNow: string | null;
  onCompose: () => void;
  onToggleActive: (c: NotificationCampaign) => void;
  onSend: (c: NotificationCampaign) => void;
  onDelete: (c: NotificationCampaign) => void;
}) {
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(10);

  if (rows.length === 0) {
    const copy = EMPTY_COPY[tab];
    return (
      <EmptyState
        icon={tab === 'sent' ? Send : tab === 'upcoming' ? CalendarClock : Zap}
        title={filtersActive ? 'لا نتائج مطابقة' : copy.title}
        description={
          filtersActive ? 'جرّب كلمة بحث أخرى أو غيّر فئة المرسل إليهم.' : copy.description
        }
        action={
          filtersActive || tab === 'sent' ? undefined : (
            <Button size="sm" onClick={onCompose}>
              <Plus className="h-4 w-4" />
              إشعار جديد
            </Button>
          )
        }
      />
    );
  }

  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const paginatedRows = rows.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  return (
    <div>
      {/* Phones: each campaign as a card — the six-column table does not fit. */}
      <ul className="flex flex-col divide-y divide-neutral-100 md:hidden">
        {paginatedRows.map((campaign) => (
          <CampaignCard
            key={campaign.id}
            campaign={campaign}
            sending={sendingNow === campaign.id}
            onToggleActive={onToggleActive}
            onSend={onSend}
            onDelete={onDelete}
          />
        ))}
      </ul>

      <div className="hidden md:block">
        <Table className="min-w-[620px]">
          <TableHeader>
            <TableRow>
              <TableHead>الإشعار</TableHead>
              <TableHead>المرسل إليهم</TableHead>
              <TableHead>التوقيت</TableHead>
              <TableHead>آخر إرسال</TableHead>
              <TableHead>مفعّل</TableHead>
              <TableHead>
                <span className="sr-only">إجراءات</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginatedRows.map((campaign) => {
              const shape = campaignShape(campaign.scheduleKind);
              const isSent = campaignIsSent(campaign);
              // Only a scheduled message that has yet to fire has anything to switch off.
              const toggleable = shape !== 'instant' && !isSent;
              const muted = toggleable && !campaign.isActive;
              const ShapeIcon = SHAPE_ICONS[shape];
              return (
                <TableRow key={campaign.id} className={cn(muted && 'bg-neutral-50/70')}>
                  <TableCell>
                    <CampaignCell campaign={campaign} muted={muted} />
                  </TableCell>
                  <TableCell>
                    <AudienceCell campaign={campaign} />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5 text-neutral-700">
                      <ShapeIcon className="h-3.5 w-3.5 shrink-0 text-neutral-400" />
                      <span>{scheduleSummary(campaign)}</span>
                    </div>
                    {!isSent && campaign.nextRunAt && campaign.isActive ? (
                      <div className="mt-0.5 text-xs text-primary-700">
                        القادم: {compactDateTime.format(new Date(campaign.nextRunAt))}
                      </div>
                    ) : shape === 'instant' && !campaign.lastSentAt ? (
                      /* Created but the immediate dispatch did not land; the cron dispatcher
                         still owns it while next_run_at is set. */
                      <div className="mt-1">
                        <Badge variant="in_progress" dot>
                          بانتظار الإرسال
                        </Badge>
                      </div>
                    ) : (
                      isSent && (
                        <div className="mt-1">
                          <Badge variant="completed" dot>
                            أُرسل
                          </Badge>
                        </div>
                      )
                    )}
                  </TableCell>
                  <TableCell>
                    <LastSendCell campaign={campaign} />
                  </TableCell>
                  <TableCell>
                    {toggleable ? (
                      <Checkbox
                        checked={campaign.isActive}
                        onCheckedChange={() => onToggleActive(campaign)}
                        aria-label={campaign.isActive ? 'تعطيل الإشعار' : 'تفعيل الإشعار'}
                      />
                    ) : (
                      <span className="text-neutral-300">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <RowActions
                      campaign={campaign}
                      canSend={campaignCanSendNow(campaign)}
                      resend={shape === 'instant' && !!campaign.lastSentAt}
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
      </div>

      {rows.length > 0 && (
        <Pagination
          page={currentPage}
          pageSize={pageSize}
          totalItems={rows.length}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
        />
      )}
    </div>
  );
}

/**
 * Phone-width rendition of a campaign row. Same rules as the table — the toggle only
 * exists while something is still going to fire, "send now" follows campaignCanSendNow —
 * but stacked, with labels the hidden table headers can no longer provide.
 */
function CampaignCard({
  campaign,
  sending,
  onToggleActive,
  onSend,
  onDelete,
}: {
  campaign: NotificationCampaign;
  sending: boolean;
  onToggleActive: (c: NotificationCampaign) => void;
  onSend: (c: NotificationCampaign) => void;
  onDelete: (c: NotificationCampaign) => void;
}) {
  const shape = campaignShape(campaign.scheduleKind);
  const isSent = campaignIsSent(campaign);
  const toggleable = shape !== 'instant' && !isSent;
  const muted = toggleable && !campaign.isActive;
  const ShapeIcon = SHAPE_ICONS[shape];

  return (
    <li className={cn('flex flex-col gap-2.5 p-4', muted && 'bg-neutral-50/70')}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className={cn('font-medium text-neutral-900', muted && 'text-neutral-500')}>
            {campaign.title}
          </div>
          {/* Bodies run to 500 chars; two lines is enough to tell campaigns apart. */}
          <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-neutral-500">
            {campaign.body}
          </p>
        </div>
        <RowActions
          campaign={campaign}
          canSend={campaignCanSendNow(campaign)}
          resend={shape === 'instant' && !!campaign.lastSentAt}
          sending={sending}
          onSend={() => onSend(campaign)}
          onDelete={() => onDelete(campaign)}
        />
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <AudienceCell campaign={campaign} />
        <span className="inline-flex min-w-0 items-center gap-1.5 text-xs text-neutral-700">
          <ShapeIcon className="h-3.5 w-3.5 shrink-0 text-neutral-400" />
          <span className="truncate">{scheduleSummary(campaign)}</span>
        </span>
      </div>

      {!isSent && campaign.nextRunAt && campaign.isActive ? (
        <div className="text-xs text-primary-700">
          القادم: {compactDateTime.format(new Date(campaign.nextRunAt))}
        </div>
      ) : shape === 'instant' && !campaign.lastSentAt ? (
        <Badge variant="in_progress" dot>
          بانتظار الإرسال
        </Badge>
      ) : (
        isSent && (
          <Badge variant="completed" dot>
            أُرسل
          </Badge>
        )
      )}

      {campaign.lastSentAt && (
        <div className="text-xs leading-relaxed">
          <span className="text-neutral-700">
            آخر إرسال: {compactDateTime.format(new Date(campaign.lastSentAt))}
          </span>
          <div className="mt-0.5">
            <ReachSummary campaign={campaign} />
          </div>
        </div>
      )}
      {campaign.lastError && (
        <div>
          <Badge variant="danger" dot>
            فشل الإرسال
          </Badge>
        </div>
      )}

      {toggleable && (
        <label className="flex w-fit cursor-pointer items-center gap-2 text-xs text-neutral-600">
          <Checkbox
            checked={campaign.isActive}
            onCheckedChange={() => onToggleActive(campaign)}
            aria-label={campaign.isActive ? 'تعطيل الإشعار' : 'تفعيل الإشعار'}
          />
          مفعّل
        </label>
      )}
    </li>
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
      <span className="text-xs text-neutral-500">
        {NOTIFICATION_CHANNEL_LABELS[campaign.channel]}
      </span>
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
  resend,
  sending,
  onSend,
  onDelete,
}: {
  campaign: NotificationCampaign;
  canSend: boolean;
  resend: boolean;
  sending: boolean;
  onSend: () => void;
  onDelete: () => void;
}) {
  const label = resend ? 'إعادة الإرسال' : 'إرسال الآن';
  return (
    <div className="flex items-center justify-end gap-1">
      {canSend && (
        <IconButton aria-label={label} title={label} disabled={sending} onClick={onSend}>
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
  const [channel, setChannel] = React.useState<NotificationChannel>('push');
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
    setChannel('push');
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
      channel,
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
        channel: v.channel,
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

            <Field label="قناة الإرسال">
              <Select value={channel} onValueChange={(v) => setChannel(v as NotificationChannel)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {NOTIFICATION_CHANNELS.map((c) => (
                    <SelectItem key={c} value={c}>
                      {NOTIFICATION_CHANNEL_LABELS[c]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

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
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
                يُرسل فوراً عند الحفظ إلى التطبيق وتيليجرام معاً، ويمكن إعادة إرساله لاحقاً.
              </p>
            )}

            <NotificationPreview
              title={title}
              body={body}
              withWird={audience === 'assigned_today' || audience === 'incomplete_today'}
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
  telegram: boolean;
  last_seen_at: string | null;
}

const PLATFORM_LABELS: Record<string, string> = {
  ios: 'آيفون',
  android: 'أندرويد',
  desktop: 'حاسوب',
};

/**
 * Who a send can actually reach. A push only ever lands on devices that registered, and
 * Telegram only on accounts whose owner tapped Start — so the practical question before
 * and after any campaign is "who is reachable on neither": those are the people to help
 * in person.
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
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(10);

  React.useEffect(() => {
    supabase.rpc('push_coverage', {}).then(({ data, error }) => {
      setRows(error ? [] : ((data ?? []) as CoverageRow[]));
    });
  }, []);

  if (!rows || rows.length === 0) return null;

  const covered = rows.filter((r) => r.device_count > 0 || r.telegram).length;
  const missing = rows.filter((r) => r.device_count === 0 && !r.telegram);
  const appCount = rows.filter((r) => r.device_count > 0).length;
  const telegramCount = rows.filter((r) => r.telegram).length;
  const pct = Math.round((covered / rows.length) * 100);
  // People reachable on neither channel first — they are who the supervisor has to help.
  const sorted = [...rows].sort(
    (a, b) =>
      Number(a.device_count > 0) +
        Number(a.telegram) -
        (Number(b.device_count > 0) + Number(b.telegram)) ||
      a.full_name.localeCompare(b.full_name, 'ar'),
  );

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const paginatedSorted = sorted.slice((currentPage - 1) * pageSize, currentPage * pageSize);

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
              : `${missing.length} لن تصلهم الإشعارات حتى يفعّلوها من التطبيق أو يربطوا تيليجرام`}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-1.5 sm:hidden">
            <Badge variant="brand">التطبيق: {appCount}</Badge>
            <Badge variant="in_progress">تيليجرام: {telegramCount}</Badge>
          </div>
        </div>
        <div className="hidden shrink-0 items-center gap-2 sm:flex">
          <Badge variant="brand">التطبيق: {appCount}</Badge>
          <Badge variant="in_progress">تيليجرام: {telegramCount}</Badge>
        </div>
        <ChevronDown
          className={cn('h-4 w-4 text-neutral-400 transition-transform', open && 'rotate-180')}
        />
      </button>

      {open && (
        <>
          {/* Phones: one card per user — the coverage table does not fit. */}
          <ul className="flex flex-col divide-y divide-neutral-100 md:hidden">
            {paginatedSorted.map((r) => (
              <li key={r.profile_id} className="flex flex-col gap-2 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate font-medium text-neutral-900">{r.full_name}</div>
                    {showGroup && (
                      <div className="truncate text-xs text-neutral-500">
                        {groupNames.get(r.group_id) ?? '—'}
                      </div>
                    )}
                  </div>
                  <span className="shrink-0 text-xs text-neutral-500">
                    {r.last_seen_at ? compactDateTime.format(new Date(r.last_seen_at)) : '—'}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {r.device_count === 0 ? (
                    <Badge variant="danger" dot>
                      التطبيق غير مفعّلة
                    </Badge>
                  ) : (
                    <Badge variant="completed" dot>
                      التطبيق مفعّلة
                    </Badge>
                  )}
                  {r.telegram ? (
                    <Badge variant="completed" dot>
                      تيليجرام مربوط
                    </Badge>
                  ) : (
                    <Badge variant="danger" dot>
                      تيليجرام غير مربوط
                    </Badge>
                  )}
                </div>
                {r.device_count > 0 && (
                  <span className="text-xs text-neutral-500">
                    {r.platforms.map((p) => PLATFORM_LABELS[p] ?? p).join('، ') ||
                      `${r.device_count} جهاز`}
                    {!r.installed && ' · من المتصفح'}
                  </span>
                )}
              </li>
            ))}
          </ul>

          <div className="hidden md:block">
            <Table className="min-w-[560px]">
              <TableHeader>
                <TableRow>
                  <TableHead>المستخدم</TableHead>
                  {showGroup && <TableHead>المجموعة</TableHead>}
                  <TableHead>إشعارات التطبيق</TableHead>
                  <TableHead>تيليجرام</TableHead>
                  <TableHead>آخر ظهور</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedSorted.map((r) => (
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
                        <div className="flex flex-col items-start gap-0.5">
                          <Badge variant="completed" dot>
                            مفعّلة
                          </Badge>
                          <span className="text-xs text-neutral-500">
                            {r.platforms.map((p) => PLATFORM_LABELS[p] ?? p).join('، ') ||
                              `${r.device_count} جهاز`}
                            {!r.installed && ' · من المتصفح'}
                          </span>
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={r.telegram ? 'completed' : 'danger'} dot>
                        {r.telegram ? 'مربوط' : 'غير مربوط'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-neutral-600">
                      {r.last_seen_at ? compactDateTime.format(new Date(r.last_seen_at)) : '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {sorted.length > 0 && (
            <Pagination
              page={currentPage}
              pageSize={pageSize}
              totalItems={sorted.length}
              onPageChange={setPage}
              onPageSizeChange={setPageSize}
            />
          )}
        </>
      )}
    </Card>
  );
}
