export const NOTIFICATION_AUDIENCES = ['all', 'user', 'incomplete_today'] as const;
export type NotificationAudience = (typeof NOTIFICATION_AUDIENCES)[number];
/** camelCase alias used by z.enum in ./validation. */
export const notificationAudiences = NOTIFICATION_AUDIENCES;

export const CAMPAIGN_SCHEDULE_KINDS = ['now', 'once', 'weekly'] as const;
export type CampaignScheduleKind = (typeof CAMPAIGN_SCHEDULE_KINDS)[number];
export const campaignScheduleKinds = CAMPAIGN_SCHEDULE_KINDS;

export interface NotificationCampaign {
  id: string;
  createdBy: string | null;
  title: string;
  body: string;
  audience: NotificationAudience;
  targetProfileId: string | null;
  scheduleKind: CampaignScheduleKind;
  scheduledAt: string | null;
  recurWeekday: number | null;
  recurTime: string | null;
  isActive: boolean;
  nextRunAt: string | null;
  lastSentAt: string | null;
  lastSentCount: number | null;
  lastError: string | null;
  createdAt: string;
}

export const NOTIFICATION_AUDIENCE_LABELS: Record<NotificationAudience, string> = {
  all: 'الجميع',
  user: 'مستخدم محدد',
  incomplete_today: 'من لم يُتمّ واجب اليوم',
};

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
