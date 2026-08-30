// Supervisor-authored reminder cards shown to employees. Mirrors public.banners in
// supabase/migrations/20260830140000_banners.sql (+ the drop of `kind` in a later migration).
//
// These used to be typed (آية / حديث / حكمة / ملاحظة), which forced a supervisor to classify a
// reminder before writing it and bought nothing but a coloured pill. A banner is now simply
// free text plus optional attribution.

export const BANNER_BODY_MAX = 1000;
export const BANNER_SOURCE_MAX = 200;

export interface Banner {
  id: string;
  body: string;
  /** Attribution — "رواه البخاري", "البقرة: ٢٥٥" — or null when there is nothing to cite. */
  source: string | null;
  isActive: boolean;
  sortOrder: number;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}
