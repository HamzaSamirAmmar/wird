import * as React from 'react';
import {
  ArrowDown,
  ArrowUp,
  Eye,
  EyeOff,
  MessageSquareQuote,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react';
import { BANNER_BODY_MAX, BANNER_SOURCE_MAX, bannerSchema, type Banner } from '@wird/domain';
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
  SkeletonRows,
  Textarea,
  cn,
} from '@wird/ui-web';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth-context';

const BANNER_COLUMNS =
  'id, body, source, is_active, sort_order, created_by, created_at, updated_at';

function toBanner(r: {
  id: string;
  body: string;
  source: string | null;
  is_active: boolean;
  sort_order: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}): Banner {
  return {
    id: r.id,
    body: r.body,
    source: r.source,
    isActive: r.is_active,
    sortOrder: r.sort_order,
    createdBy: r.created_by,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export default function BannersPage() {
  const { profile } = useAuth();
  const [banners, setBanners] = React.useState<Banner[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [editing, setEditing] = React.useState<Banner | 'new' | null>(null);
  const [confirmDelete, setConfirmDelete] = React.useState<Banner | null>(null);

  const load = React.useCallback(async () => {
    const { data, error } = await supabase
      .from('banners')
      .select(BANNER_COLUMNS)
      .order('sort_order')
      .order('created_at', { ascending: false });

    if (error) {
      setError('تعذر تحميل البطاقات');
      setBanners([]);
      return;
    }
    setError(null);
    setBanners((data ?? []).map(toBanner));
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  async function toggleActive(banner: Banner) {
    // Optimistic: the switch should feel instant; a failure reloads the truth.
    setBanners(
      (prev) =>
        prev?.map((b) => (b.id === banner.id ? { ...b, isActive: !b.isActive } : b)) ?? null,
    );
    const { error } = await supabase
      .from('banners')
      .update({ is_active: !banner.isActive })
      .eq('id', banner.id);
    if (error) {
      setError('تعذر تغيير حالة البطاقة');
      load();
    }
  }

  /** Reorders by swapping this card's position with its neighbour's. */
  async function move(index: number, delta: -1 | 1) {
    if (!banners) return;
    const a = banners[index];
    const b = banners[index + delta];
    if (!a || !b) return;

    const next = [...banners];
    next[index] = b;
    next[index + delta] = a;
    setBanners(next);

    // Ties on sort_order are broken by created_at, so equal values would not actually swap —
    // rewrite the whole list's positions instead of trading two numbers.
    const results = await Promise.all(
      next.map((banner, i) =>
        supabase.from('banners').update({ sort_order: i }).eq('id', banner.id),
      ),
    );
    if (results.some((r) => r.error)) {
      setError('تعذر إعادة الترتيب');
      load();
    }
  }

  async function remove(banner: Banner) {
    setConfirmDelete(null);
    const { error } = await supabase.from('banners').delete().eq('id', banner.id);
    if (error) {
      setError('تعذر حذف البطاقة');
      return;
    }
    load();
  }

  const visibleCount = banners?.filter((b) => b.isActive).length ?? 0;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="البطاقات"
        description="رسائل قصيرة تظهر للموظفين أعلى شاشة الأوراد — آية، حديث، حكمة، أو أي تذكير"
        actions={
          <Button onClick={() => setEditing('new')}>
            <Plus className="h-4 w-4" />
            بطاقة جديدة
          </Button>
        }
      />

      {error && <Alert variant="danger">{error}</Alert>}

      {banners === null ? (
        <Card>
          <SkeletonRows rows={3} />
        </Card>
      ) : banners.length === 0 ? (
        <Card>
          <EmptyState
            icon={MessageSquareQuote}
            title="لا توجد بطاقات بعد"
            description="اكتب تذكيراً قصيراً؛ سيظهر للموظفين في شريط أعلى شاشة الأوراد."
            action={
              <Button size="sm" onClick={() => setEditing('new')}>
                <Plus className="h-4 w-4" />
                بطاقة جديدة
              </Button>
            }
          />
        </Card>
      ) : (
        <>
          <div className="flex items-center justify-between gap-3 text-sm text-neutral-500">
            <span>
              <span className="font-medium text-neutral-700">{visibleCount}</span> من{' '}
              <span className="tabular-nums">{banners.length}</span> ظاهرة للموظفين
            </span>
            <span className="text-xs">الترتيب هنا هو ترتيب ظهورها في التطبيق</span>
          </div>

          <div className="flex flex-col gap-3">
            {banners.map((banner, i) => (
              <Card
                key={banner.id}
                className={cn(
                  'group relative flex items-stretch gap-4 overflow-hidden p-4 transition-colors',
                  !banner.isActive && 'bg-neutral-50/80',
                )}
              >
                {/* Accent rail doubles as the visible/hidden signal, readable at a glance
                    down the whole list without reading any badge. */}
                <span
                  aria-hidden
                  className={cn(
                    'absolute inset-y-0 start-0 w-1',
                    banner.isActive ? 'bg-primary-500' : 'bg-neutral-200',
                  )}
                />

                <div className="flex shrink-0 flex-col items-center gap-1 ps-2">
                  <IconButton
                    aria-label="تحريك لأعلى"
                    disabled={i === 0}
                    onClick={() => move(i, -1)}
                    className="h-7 w-7 disabled:opacity-25"
                  >
                    <ArrowUp className="h-3.5 w-3.5" />
                  </IconButton>
                  <span className="text-[11px] font-semibold tabular-nums text-neutral-400">
                    {i + 1}
                  </span>
                  <IconButton
                    aria-label="تحريك لأسفل"
                    disabled={i === banners.length - 1}
                    onClick={() => move(i, 1)}
                    className="h-7 w-7 disabled:opacity-25"
                  >
                    <ArrowDown className="h-3.5 w-3.5" />
                  </IconButton>
                </div>

                <div className="min-w-0 flex-1">
                  <p
                    className={cn(
                      'whitespace-pre-line text-[15px] leading-[1.9]',
                      banner.isActive ? 'text-neutral-800' : 'text-neutral-400',
                    )}
                  >
                    {banner.body}
                  </p>
                  {banner.source && (
                    <div className="mt-2 text-xs font-medium text-neutral-500">
                      — {banner.source}
                    </div>
                  )}
                  {!banner.isActive && (
                    <Badge variant="neutral" className="mt-2.5">
                      <EyeOff className="h-3 w-3" />
                      مخفية
                    </Badge>
                  )}
                </div>

                <div className="flex shrink-0 flex-col items-end justify-between gap-2">
                  <div className="flex items-center gap-1">
                    <IconButton aria-label="تعديل" onClick={() => setEditing(banner)}>
                      <Pencil className="h-4 w-4" />
                    </IconButton>
                    <IconButton
                      aria-label="حذف"
                      onClick={() => setConfirmDelete(banner)}
                      className="text-danger-600 hover:bg-danger-50"
                    >
                      <Trash2 className="h-4 w-4" />
                    </IconButton>
                  </div>
                  <label className="flex cursor-pointer items-center gap-2 text-xs text-neutral-500">
                    <Checkbox
                      checked={banner.isActive}
                      onCheckedChange={() => toggleActive(banner)}
                      aria-label="ظاهرة للموظفين"
                    />
                    ظاهرة
                  </label>
                </div>
              </Card>
            ))}
          </div>
        </>
      )}

      <BannerDialog
        target={editing}
        supervisorId={profile?.id ?? ''}
        nextSortOrder={banners?.length ?? 0}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          load();
        }}
      />

      <Dialog open={!!confirmDelete} onOpenChange={(open) => !open && setConfirmDelete(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>حذف البطاقة</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <p className="text-sm text-neutral-600">
              سيُحذف نص البطاقة نهائياً ولن يظهر للموظفين. لإخفائها مؤقتاً استخدم خيار «ظاهرة» بدلاً
              من الحذف.
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

/**
 * Mirrors the employee app's BannerRail card closely enough to be worth trusting — the
 * supervisor is writing for a phone, so showing the desktop textarea alone hides how the
 * text will actually break.
 */
function EmployeePreview({ body, source }: { body: string; source: string }) {
  const empty = !body.trim();
  return (
    <div className="rounded-xl bg-neutral-100 p-3">
      <div className="mb-2 flex items-center gap-1.5 text-[11px] font-medium text-neutral-500">
        <Eye className="h-3.5 w-3.5" />
        كما ستظهر للموظف
      </div>
      <article className="relative overflow-hidden rounded-xl bg-primary-50 px-4 py-3.5 ring-1 ring-primary-100">
        <span
          aria-hidden
          className="pointer-events-none absolute -top-3 start-2 select-none font-serif text-6xl leading-none text-primary-200/60"
        >
          ”
        </span>
        <p
          className={cn(
            'relative whitespace-pre-line text-[15px] leading-[1.95]',
            empty ? 'text-neutral-400' : 'text-neutral-800',
          )}
        >
          {empty ? 'سيظهر نص البطاقة هنا…' : body}
        </p>
        {source.trim() && (
          <div className="relative mt-2 text-[11px] font-medium text-primary-700">
            — {source.trim()}
          </div>
        )}
      </article>
    </div>
  );
}

function BannerDialog({
  target,
  supervisorId,
  nextSortOrder,
  onClose,
  onSaved,
}: {
  target: Banner | 'new' | null;
  supervisorId: string;
  nextSortOrder: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const existing = target && target !== 'new' ? target : null;
  const [body, setBody] = React.useState('');
  const [source, setSource] = React.useState('');
  const [isActive, setIsActive] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (!target) return;
    setBody(existing?.body ?? '');
    setSource(existing?.source ?? '');
    setIsActive(existing?.isActive ?? true);
    setError(null);
  }, [target, existing]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = bannerSchema.safeParse({ body, source, isActive });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'خطأ في البيانات');
      return;
    }

    setSubmitting(true);
    setError(null);
    const values = {
      body: parsed.data.body,
      source: parsed.data.source,
      is_active: parsed.data.isActive,
    };

    const { error } = existing
      ? await supabase.from('banners').update(values).eq('id', existing.id)
      : await supabase
          .from('banners')
          .insert({ ...values, sort_order: nextSortOrder, created_by: supervisorId });

    setSubmitting(false);
    if (error) {
      setError(existing ? 'تعذر حفظ البطاقة' : 'تعذر إنشاء البطاقة');
      return;
    }
    onSaved();
  }

  return (
    <Dialog open={!!target} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{existing ? 'تعديل البطاقة' : 'بطاقة جديدة'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <DialogBody>
            {error && <Alert variant="danger">{error}</Alert>}

            <Field
              label="النص"
              htmlFor="banner-body"
              hint={`${body.trim().length} / ${BANNER_BODY_MAX}`}
            >
              <Textarea
                id="banner-body"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="اكتب آية أو حديثاً أو حكمة أو أي تذكير للموظفين…"
                maxLength={BANNER_BODY_MAX}
                className="min-h-36 leading-[1.9]"
                autoFocus
                required
              />
            </Field>

            <Field label="المصدر" htmlFor="banner-source" hint="اختياري — مثال: رواه البخاري">
              <Input
                id="banner-source"
                value={source}
                onChange={(e) => setSource(e.target.value)}
                placeholder="البقرة: ٢٥٥"
                maxLength={BANNER_SOURCE_MAX}
              />
            </Field>

            <EmployeePreview body={body} source={source} />

            <label className="flex w-fit cursor-pointer items-center gap-2 text-sm text-neutral-700">
              <Checkbox checked={isActive} onCheckedChange={(v) => setIsActive(v === true)} />
              ظاهرة للموظفين
            </label>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              إلغاء
            </Button>
            <Button type="submit" loading={submitting}>
              حفظ
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
