import * as React from 'react';
import { BellRing, Plus, Send, Trash2 } from 'lucide-react';
import {
  NOTIFICATION_AUDIENCES,
  NOTIFICATION_AUDIENCE_LABELS,
  CAMPAIGN_SCHEDULE_KINDS,
  WEEKDAY_LABELS,
  notificationCampaignSchema,
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
  Textarea,
  cn,
} from '@wird/ui-web';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth-context';

const CAMPAIGN_COLUMNS =
  'id, title, body, audience, target_profile_id, schedule_kind, scheduled_at, recur_weekday, recur_time, is_active, next_run_at, last_sent_at, last_sent_count, last_error, created_at';

const SCHEDULE_KIND_LABELS: Record<CampaignScheduleKind, string> = {
  now: 'إرسال فوري',
  once: 'مرة واحدة',
  weekly: 'أسبوعي',
};

const audienceBadge: Record<NotificationAudience, 'brand' | 'completed' | 'in_progress'> = {
  all: 'brand',
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

// The DB columns are text + check constraints (plain `string` in database.types.ts);
// values are guaranteed to be one of the domain unions.
function toCampaign(r: {
  id: string;
  title: string;
  body: string;
  audience: string;
  target_profile_id: string | null;
  schedule_kind: string;
  scheduled_at: string | null;
  recur_weekday: number | null;
  recur_time: string | null;
  is_active: boolean;
  next_run_at: string | null;
  last_sent_at: string | null;
  last_sent_count: number | null;
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
    scheduleKind: r.schedule_kind as CampaignScheduleKind,
    scheduledAt: r.scheduled_at,
    recurWeekday: r.recur_weekday,
    recurTime: r.recur_time,
    isActive: r.is_active,
    nextRunAt: r.next_run_at,
    lastSentAt: r.last_sent_at,
    lastSentCount: r.last_sent_count,
    lastError: r.last_error,
    createdAt: r.created_at,
  };
}

function scheduleSummary(c: NotificationCampaign): string {
  if (c.scheduleKind === 'now') return SCHEDULE_KIND_LABELS.now;
  if (c.scheduleKind === 'once') {
    return c.scheduledAt ? dateTimeFormat.format(new Date(c.scheduledAt)) : '—';
  }
  const day = c.recurWeekday !== null ? WEEKDAY_LABELS[c.recurWeekday] : '—';
  const time = c.recurTime?.slice(0, 5) ?? '—';
  return `كل ${day} ${time} (بتوقيت الرياض)`;
}

/** Immediate dispatch of a campaign through the push-notifications edge function. */
async function dispatchCampaign(
  campaignId: string,
): Promise<{ ok: boolean; sent?: number; skipped?: boolean }> {
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
  return { ok: true, sent: body.sent, skipped: !!body.skipped };
}

export default function NotificationsPage() {
  const { profile } = useAuth();
  const [campaigns, setCampaigns] = React.useState<NotificationCampaign[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [composing, setComposing] = React.useState(false);
  const [confirmDelete, setConfirmDelete] = React.useState<NotificationCampaign | null>(null);
  const [sendingNow, setSendingNow] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    const { data, error } = await supabase
      .from('notification_campaigns')
      .select(CAMPAIGN_COLUMNS)
      .order('created_at', { ascending: false });

    if (error) {
      setError('تعذر تحميل الإشعارات');
      setCampaigns([]);
      return;
    }
    setError(null);
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
      setError('تعذر تغيير حالة الإشعار');
      load();
    }
  }

  async function remove(campaign: NotificationCampaign) {
    setConfirmDelete(null);
    const { error } = await supabase.from('notification_campaigns').delete().eq('id', campaign.id);
    if (error) {
      setError('تعذر حذف الإشعار');
      return;
    }
    load();
  }

  async function dispatchNow(campaign: NotificationCampaign) {
    setSendingNow(campaign.id);
    setError(null);
    const result = await dispatchCampaign(campaign.id);
    setSendingNow(null);
    if (!result.ok) setError('تعذر الإرسال الآن — سيعيد المجدول المحاولة تلقائياً');
    else if (result.skipped) setError('الإشعار أُرسل للتو من مجدول آخر');
    else setError(`تم الإرسال إلى ${result.sent ?? 0} جهاز`);
    load();
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="الإشعارات"
        description="إشعارات فورية أو مجدولة تصل الموظفين على أجهزتهم حتى مع إغلاق التطبيق"
        actions={
          <Button onClick={() => setComposing(true)}>
            <Plus className="h-4 w-4" />
            إشعار جديد
          </Button>
        }
      />

      {error && <Alert variant="danger">{error}</Alert>}

      {campaigns === null ? (
        <Card>
          <SkeletonRows rows={3} />
        </Card>
      ) : campaigns.length === 0 ? (
        <Card>
          <EmptyState
            icon={BellRing}
            title="لا توجد إشعارات بعد"
            description="أرسل إشعاراً فورياً للجميع، أو جدول تذكيراً أسبوعياً لمن لم يُتمّ واجبه."
            action={
              <Button size="sm" onClick={() => setComposing(true)}>
                <Plus className="h-4 w-4" />
                إشعار جديد
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {campaigns.map((campaign) => (
            <Card
              key={campaign.id}
              className={cn('flex items-start gap-4 p-4', !campaign.isActive && 'bg-neutral-50')}
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={audienceBadge[campaign.audience]} dot>
                    {NOTIFICATION_AUDIENCE_LABELS[campaign.audience]}
                  </Badge>
                  <Badge variant="neutral">{scheduleSummary(campaign)}</Badge>
                  {!campaign.isActive && <Badge variant="neutral">معطّل</Badge>}
                  {campaign.lastError && <Badge variant="pending">خطأ في آخر إرسال</Badge>}
                </div>

                <div className="mt-2 text-sm font-medium text-neutral-900">{campaign.title}</div>
                <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-neutral-600">
                  {campaign.body}
                </p>

                {campaign.lastSentAt && (
                  <div className="mt-1.5 text-xs text-neutral-500">
                    آخر إرسال: {dateTimeFormat.format(new Date(campaign.lastSentAt))}
                    {campaign.lastSentCount !== null && ` — ${campaign.lastSentCount} جهاز`}
                  </div>
                )}
                {campaign.isActive && campaign.nextRunAt && (
                  <div className="mt-0.5 text-xs text-primary-700">
                    الإرسال القادم: {dateTimeFormat.format(new Date(campaign.nextRunAt))}
                  </div>
                )}
              </div>

              <div className="flex shrink-0 items-center gap-1">
                <label className="flex cursor-pointer items-center gap-2 pe-2 text-xs text-neutral-500">
                  <Checkbox
                    checked={campaign.isActive}
                    onCheckedChange={() => toggleActive(campaign)}
                    aria-label="مفعّل"
                  />
                  مفعّل
                </label>
                {campaign.isActive && campaign.nextRunAt && (
                  <IconButton
                    aria-label="إرسال الآن"
                    disabled={sendingNow === campaign.id}
                    onClick={() => dispatchNow(campaign)}
                  >
                    <Send
                      className={cn('h-4 w-4', sendingNow === campaign.id && 'animate-pulse')}
                    />
                  </IconButton>
                )}
                <IconButton
                  aria-label="حذف"
                  onClick={() => setConfirmDelete(campaign)}
                  className="text-danger-600 hover:bg-danger-50"
                >
                  <Trash2 className="h-4 w-4" />
                </IconButton>
              </div>
            </Card>
          ))}
        </div>
      )}

      <ComposeDialog
        open={composing}
        supervisorId={profile?.id ?? ''}
        onClose={() => setComposing(false)}
        onSaved={() => {
          setComposing(false);
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
  );
}

function ComposeDialog({
  open,
  supervisorId,
  onClose,
  onSaved,
}: {
  open: boolean;
  supervisorId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = React.useState('');
  const [body, setBody] = React.useState('');
  const [audience, setAudience] = React.useState<NotificationAudience>('all');
  const [targetProfileId, setTargetProfileId] = React.useState('');
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
    setAudience('all');
    setTargetProfileId('');
    setScheduleKind('now');
    setScheduledLocal('');
    setRecurWeekday(5);
    setRecurTime('08:00');
    setError(null);
  }, [open]);

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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = notificationCampaignSchema.safeParse({
      title,
      body,
      audience,
      targetProfileId: targetProfileId || null,
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

    // datetime-local carries no timezone; supervisors mean Riyadh wall time (+03:00, no DST).
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
        schedule_kind: v.scheduleKind,
        scheduled_at: scheduledAt,
        recur_weekday: v.scheduleKind === 'weekly' ? v.recurWeekday : null,
        recur_time: v.scheduleKind === 'weekly' ? v.recurTime : null,
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
    onSaved();
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
                  {NOTIFICATION_AUDIENCES.map((a) => (
                    <SelectItem key={a} value={a}>
                      {NOTIFICATION_AUDIENCE_LABELS[a]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

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
              <Field label="تاريخ ووقت الإرسال (بتوقيت الرياض)">
                <Input
                  type="datetime-local"
                  value={scheduledLocal}
                  onChange={(e) => setScheduledLocal(e.target.value)}
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
                <Field label="الوقت (بتوقيت الرياض)">
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
