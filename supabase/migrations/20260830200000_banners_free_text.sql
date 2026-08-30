-- Banners lose their category. A reminder is now just free text plus optional attribution.
--
-- The kind (آية / حديث / حكمة / ملاحظة) made a supervisor classify a reminder before writing
-- it and bought only a coloured pill in the employee app. Existing bodies and sources are
-- untouched; only the classification goes away.
--
-- idx_banners_active_order is (is_active, sort_order, created_at desc) and never referenced
-- `kind`, so it survives the drop untouched and is deliberately left alone.

alter table public.banners drop column kind;

drop type if exists public.banner_kind;
