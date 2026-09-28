export const NOTIFICATION_AUDIENCES = ['all', 'group', 'user', 'incomplete_today'] as const;
export type NotificationAudience = (typeof NOTIFICATION_AUDIENCES)[number];
/** camelCase alias used by z.enum in ./validation. */
export const notificationAudiences = NOTIFICATION_AUDIENCES;

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

export interface NotificationCampaign {
  id: string;
  createdBy: string | null;
  title: string;
  body: string;
  audience: NotificationAudience;
  targetProfileId: string | null;
  /** null = every group (superadmin only). Set = scoped to that group, for any audience. */
  groupId: string | null;
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
  incomplete_today: 'من لم يُتمّ واجب اليوم',
};

/** Audiences a group-scoped supervisor may use — never 'all'. */
export const SUPERVISOR_NOTIFICATION_AUDIENCES = ['group', 'user', 'incomplete_today'] as const;

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
