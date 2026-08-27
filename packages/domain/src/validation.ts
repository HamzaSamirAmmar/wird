import { z } from 'zod';
import { DUTY_CATEGORIES } from './dutyCategories';
import { USERNAME_PATTERN } from './username';

export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(USERNAME_PATTERN, 'اسم المستخدم يجب أن يكون بين 3 و32 حرفاً (أحرف إنجليزية صغيرة وأرقام فقط)');

export const quranScopeSchema = z
  .object({
    scopeSurahFrom: z.number().int().min(1).max(114),
    scopeAyahFrom: z.number().int().min(1),
    scopeSurahTo: z.number().int().min(1).max(114),
    scopeAyahTo: z.number().int().min(1),
    scopeNote: z.string().trim().max(500).nullable().optional(),
  })
  .refine(
    (v) => v.scopeSurahFrom < v.scopeSurahTo || (v.scopeSurahFrom === v.scopeSurahTo && v.scopeAyahFrom <= v.scopeAyahTo),
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

export const changePasswordSchema = z
  .object({
    newPassword: z.string().min(8, 'كلمة المرور يجب أن تكون 8 أحرف على الأقل'),
    confirmPassword: z.string(),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    message: 'كلمتا المرور غير متطابقتين',
    path: ['confirmPassword'],
  });
