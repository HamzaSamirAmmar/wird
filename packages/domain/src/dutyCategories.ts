// Single source of truth for the three fixed daily-duty categories and their steps.
// Mirrors the seed data in supabase/migrations/20260827074248_initial_schema.sql
// (public.duty_category_steps) — keep the two in sync if this ever changes.

export const DUTY_CATEGORIES = ['new_memorization', 'minor_review', 'major_review'] as const;
export type DutyCategory = (typeof DUTY_CATEGORIES)[number];

export interface DutyStepDefinition {
  order: number;
  key: string;
  label: string;
}

export const DUTY_CATEGORY_LABELS: Record<DutyCategory, string> = {
  new_memorization: 'حفظ جديد',
  minor_review: 'مراجعة صغرى',
  major_review: 'مراجعة كبرى',
};

export const DUTY_CATEGORY_STEPS: Record<DutyCategory, DutyStepDefinition[]> = {
  new_memorization: [
    { order: 1, key: 'listen', label: 'سماع الحفظ الجديد من قارئ عدة مرات كل على حسبه' },
    { order: 2, key: 'read_seeing_7', label: 'قراءة الحفظ الجديد سبع مرات عن حاضر مع تمعن النظر' },
    {
      order: 3,
      key: 'read_by_heart_watch_7',
      label:
        'قراءة الحفظ الجديد سبع مرات غيباً قدر الإمكان، وعند التوقف مشاهدة مكان الخطأ ثم إتمام القراءة غيباً',
    },
    { order: 4, key: 'read_by_heart_7', label: 'قراءة الحفظ الجديد سبع مرات غيباً' },
  ],
  minor_review: [
    { order: 1, key: 'read_once', label: 'قراءة ما تم تحديده كمراجعة صغرى مرة واحدة غيباً' },
  ],
  major_review: [
    { order: 1, key: 'read_once', label: 'قراءة ما تم تحديده كمراجعة كبرى مرة واحدة غيباً' },
  ],
};
