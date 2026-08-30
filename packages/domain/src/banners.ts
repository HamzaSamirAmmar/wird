// Supervisor-authored reminder cards shown to employees. Mirrors public.banners /
// public.banner_kind in supabase/migrations/20260830140000_banners.sql.

export const BANNER_KINDS = ['ayah', 'hadith', 'hikmah', 'note'] as const;
export type BannerKind = (typeof BANNER_KINDS)[number];

export const BANNER_KIND_LABELS: Record<BannerKind, string> = {
  ayah: 'آية',
  hadith: 'حديث',
  hikmah: 'حكمة',
  note: 'ملاحظة',
};

/** Placeholder shown in the dashboard's body field, so each kind's expected shape is obvious. */
export const BANNER_KIND_PLACEHOLDERS: Record<BannerKind, string> = {
  ayah: 'نص الآية الكريمة…',
  hadith: 'نص الحديث الشريف…',
  hikmah: 'حكمة أو قول مأثور…',
  note: 'رسالة للموظفين…',
};

export const BANNER_BODY_MAX = 1000;
export const BANNER_SOURCE_MAX = 200;

export interface Banner {
  id: string;
  kind: BannerKind;
  body: string;
  /** Attribution — "رواه البخاري", "البقرة: ٢٥٥" — or null when there is nothing to cite. */
  source: string | null;
  isActive: boolean;
  sortOrder: number;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}
