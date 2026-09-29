export const NOTIFICATION_AUDIENCES = [
  'all',
  'group',
  'user',
  'assigned_today',
  'incomplete_today',
] as const;
export type NotificationAudience = (typeof NOTIFICATION_AUDIENCES)[number];
/** camelCase alias used by z.enum in ./validation. */
export const notificationAudiences = NOTIFICATION_AUDIENCES;

/** Where a campaign is delivered: the app (FCM push), the Telegram bot, or both. */
export const NOTIFICATION_CHANNELS = ['push', 'telegram', 'both'] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];
export const notificationChannels = NOTIFICATION_CHANNELS;

export const NOTIFICATION_CHANNEL_LABELS: Record<NotificationChannel, string> = {
  push: 'إشعار التطبيق',
  telegram: 'تيليجرام',
  both: 'التطبيق وتيليجرام',
};

export const CAMPAIGN_SCHEDULE_KINDS = ['now', 'once', 'daily', 'weekly'] as const;
export type CampaignScheduleKind = (typeof CAMPAIGN_SCHEDULE_KINDS)[number];
export const campaignScheduleKinds = CAMPAIGN_SCHEDULE_KINDS;

/**
 * The three shapes a campaign can have, which is what the dashboard groups by:
 *
 * - `instant`  — 'now'. Fires once on save; afterwards it is only a log entry.
 * - `once`     — a single send at a chosen moment, then finished. Ends by itself.
 * - `recurring`— 'daily' / 'weekly'. A standing rule that keeps firing until disabled.
 *
 * Only the last two carry a meaningful next run, and only a recurring rule is worth
 * enabling/disabling over time — a one-off is either still pending or already spent.
 */
export type CampaignShape = 'instant' | 'once' | 'recurring';

export const RECURRING_SCHEDULE_KINDS = ['daily', 'weekly'] as const;

export function campaignShape(kind: CampaignScheduleKind): CampaignShape {
  if (kind === 'now') return 'instant';
  if (kind === 'once') return 'once';
  return 'recurring';
}

export const CAMPAIGN_SHAPE_LABELS: Record<CampaignShape, string> = {
  instant: 'فورية',
  once: 'لمرة واحدة',
  recurring: 'متكررة',
};

/**
 * Finished = an instant or one-off that has nothing left to fire (the send claim nulls
 * next_run_at). A recurring rule is never finished — it is a standing rule until deleted.
 */
export function campaignIsSent(c: {
  scheduleKind: CampaignScheduleKind;
  nextRunAt: string | null;
}) {
  return campaignShape(c.scheduleKind) !== 'recurring' && !c.nextRunAt;
}

/**
 * Whether "send now" makes sense: an instant message may be re-sent any number of times, a
 * recurring rule may be fired early, but a one-off that already went out is spent.
 */
export function campaignCanSendNow(c: {
  scheduleKind: CampaignScheduleKind;
  nextRunAt: string | null;
}) {
  const shape = campaignShape(c.scheduleKind);
  if (shape === 'instant' || shape === 'recurring') return true;
  return !!c.nextRunAt;
}

export interface NotificationCampaign {
  id: string;
  createdBy: string | null;
  title: string;
  body: string;
  audience: NotificationAudience;
  targetProfileId: string | null;
  /** null = every group (superadmin only). Set = scoped to that group, for any audience. */
  groupId: string | null;
  channel: NotificationChannel;
  scheduleKind: CampaignScheduleKind;
  scheduledAt: string | null;
  recurWeekday: number | null;
  recurTime: string | null;
  isActive: boolean;
  nextRunAt: string | null;
  lastSentAt: string | null;
  /** Devices the last send reached. */
  lastSentCount: number | null;
  /** Devices the last send failed on. */
  lastFailedCount: number | null;
  /** People the audience resolved to at the last send… */
  lastTargetCount: number | null;
  /** …and how many of them at least one device reached. */
  lastRecipientCount: number | null;
  lastError: string | null;
  createdAt: string;
}

export const NOTIFICATION_AUDIENCE_LABELS: Record<NotificationAudience, string> = {
  all: 'الجميع',
  group: 'مجموعة',
  user: 'مستخدم محدد',
  assigned_today: 'من لديه واجب اليوم',
  incomplete_today: 'من لم يُتمّ واجب اليوم',
};

/** Audiences a group-scoped supervisor may use — never 'all'. */
export const SUPERVISOR_NOTIFICATION_AUDIENCES = [
  'group',
  'user',
  'assigned_today',
  'incomplete_today',
] as const;

/** 0=Sunday … 5=Friday … 6=Saturday — matches Postgres dow and JS Date.getDay. */
export const WEEKDAY_LABELS: Record<number, string> = {
  0: 'الأحد',
  1: 'الاثنين',
  2: 'الثلاثاء',
  3: 'الأربعاء',
  4: 'الخميس',
  5: 'الجمعة',
  6: 'السبت',
};
