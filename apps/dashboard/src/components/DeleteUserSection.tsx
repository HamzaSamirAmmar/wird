import * as React from 'react';
import { Trash2 } from 'lucide-react';
import { Alert, Button } from '@wird/ui-web';
import { supabase } from '../lib/supabase';

/**
 * Permanent delete, behind an inline two-step confirm. Goes through the `delete-user` edge
 * function (removing an auth account needs the service role); the database then cascades to the
 * person's duties, checklists, push tokens and Telegram link. There is no undo.
 */
export function DeleteUserSection({
  userId,
  name,
  detail,
  onDeleted,
}: {
  userId: string;
  name: string;
  /** What else goes with the account, shown in the confirm warning. */
  detail?: string;
  onDeleted: () => void;
}) {
  const [confirming, setConfirming] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function handleDelete() {
    setDeleting(true);
    setError(null);
    const { data, error } = await supabase.functions.invoke<{ ok?: boolean; error?: string }>(
      'delete-user',
      { body: { userId } },
    );
    setDeleting(false);
    if (error || !data || data.error) {
      setError(data?.error ?? 'تعذر حذف المستخدم');
      return;
    }
    onDeleted();
  }

  return (
    <div className="mt-2 border-t border-neutral-200 pt-4">
      {error && <Alert variant="danger">{error}</Alert>}
      {!confirming ? (
        <Button type="button" variant="outline" onClick={() => setConfirming(true)}>
          <Trash2 className="h-4 w-4" />
          حذف المستخدم نهائياً
        </Button>
      ) : (
        <div className="flex flex-col gap-3">
          <Alert variant="danger" title={`حذف ${name} نهائياً؟`}>
            سيُحذف الحساب وجميع أوراده وسجلّه ولا يمكن التراجع.
            {detail ? ` ${detail}` : ''}
          </Alert>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => setConfirming(false)}>
              تراجع
            </Button>
            <Button type="button" variant="danger" loading={deleting} onClick={handleDelete}>
              نعم، احذف
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
