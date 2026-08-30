import { z } from 'zod';
import { BANNER_BODY_MAX, BANNER_KINDS, BANNER_SOURCE_MAX } from './banners';
import { DUTY_CATEGORIES } from './dutyCategories';
import { notificationAudiences, campaignScheduleKinds } from './notifications';
import { USERNAME_PATTERN } from './username';

export const notificationAudiencesSchema = z.enum(notificationAudiences);
export const campaignScheduleKindsSchema = z.enum(campaignScheduleKinds);

export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(
    USERNAME_PATTERN,
    'اسم المستخدم يجب أن يكون بين 3 و32 حرفاً (أحرف إنجليزية صغيرة وأرقام فقط)',
  );

export const quranScopeSchema = z
  .object({
    scopeSurahFrom: z.number().int().min(1).max(114),
    scopeAyahFrom: z.number().int().min(1),
    scopeSurahTo: z.number().int().min(1).max(114),
    scopeAyahTo: z.number().int().min(1),
    scopeNote: z.string().trim().max(500).nullable().optional(),
  })
  .refine(
    (v) =>
      v.scopeSurahFrom < v.scopeSurahTo ||
      (v.scopeSurahFrom === v.scopeSurahTo && v.scopeAyahFrom <= v.scopeAyahTo),
    { message: 'نهاية النطاق يجب أن تكون بعد بدايته', path: ['scopeSurahTo'] },
  );

export const createGroupSchema = z.object({
  name: z.string().trim().min(2, 'اسم المجموعة قصير جداً').max(100),
});

export const createEmployeeSchema = z.object({
  username: usernameSchema,
  fullName: z.string().trim().min(2, 'الاسم قصير جداً').max(100),
  groupId: z.string().uuid('يجب اختيار مجموعة'),
});

export const createDutyAssignmentSchema = z
  .object({
    groupId: z.string().uuid(),
    category: z.enum(DUTY_CATEGORIES),
    dueDates: z.array(z.string().date()).min(1, 'اختر تاريخاً واحداً على الأقل'),
  })
  .and(quranScopeSchema);

export const bannerSchema = z.object({
  kind: z.enum(BANNER_KINDS),
  body: z.string().trim().min(1, 'النص مطلوب').max(BANNER_BODY_MAX, 'النص طويل جداً'),
  // Empty input means "no attribution", which the column stores as null rather than ''.
  source: z
    .string()
    .trim()
    .max(BANNER_SOURCE_MAX, 'المصدر طويل جداً')
    .transform((v) => v || null)
    .nullable(),
  isActive: z.boolean(),
});

export const notificationCampaignSchema = z
  .object({
    title: z.string().trim().min(2, 'العنوان قصير جداً').max(100),
    body: z.string().trim().min(2, 'النص قصير جداً').max(500),
    audience: notificationAudiencesSchema,
    targetProfileId: z.string().uuid().nullable().optional(),
    scheduleKind: campaignScheduleKindsSchema,
    /** Local wall-clock `YYYY-MM-DDTHH:mm` in Asia/Damascus; the UI converts to an instant. */
    scheduledLocal: z.string().optional(),
    recurWeekday: z.number().int().min(0).max(6).nullable().optional(),
    /** `HH:mm` (Damascus). */
    recurTime: z
      .string()
      .regex(/^\d{2}:\d{2}$/, 'اختر وقت الإرسال')
      .nullable()
      .optional(),
  })
  .refine((v) => v.audience !== 'user' || !!v.targetProfileId, {
    message: 'اختر المستخدم',
    path: ['targetProfileId'],
  })
  .refine((v) => v.scheduleKind !== 'once' || !!v.scheduledLocal, {
    message: 'اختر تاريخ ووقت الإرسال',
    path: ['scheduledLocal'],
  })
  .refine((v) => v.scheduleKind !== 'weekly' || (v.recurWeekday !== null && !!v.recurTime), {
    message: 'اختر اليوم والوقت',
    path: ['recurWeekday'],
  });

export const changePasswordSchema = z
  .object({
    newPassword: z.string().min(8, 'كلمة المرور يجب أن تكون 8 أحرف على الأقل'),
    confirmPassword: z.string(),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    message: 'كلمتا المرور غير متطابقتين',
    path: ['confirmPassword'],
  });
