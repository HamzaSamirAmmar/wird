import * as React from 'react';
import { Check, Copy, Download } from 'lucide-react';
import {
  Button,
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Alert,
  IconButton,
} from '@wird/ui-web';
import type { BulkCreatedCreds } from './BulkCreateDialog';

export function BulkCredentialsDialog({
  creds,
  onClose,
}: {
  creds: BulkCreatedCreds[] | null;
  onClose: () => void;
}) {
  const [copiedAll, setCopiedAll] = React.useState(false);

  React.useEffect(() => {
    if (!copiedAll) return;
    const timer = setTimeout(() => setCopiedAll(false), 1500);
    return () => clearTimeout(timer);
  }, [copiedAll]);

  if (!creds || creds.length === 0) return null;

  function copyAll() {
    const text = creds!
      .map((c) => `${c.fullName}\t${c.username}\t${c.password}`)
      .join('\n');
    navigator.clipboard.writeText(text);
    setCopiedAll(true);
  }

  function downloadCSV() {
    const header = 'الاسم,اسم المستخدم,كلمة المرور';
    const rows = creds!.map((c) => `${c.fullName},${c.username},${c.password}`).join('\n');
    const csv = `${header}\n${rows}`;
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `wird-credentials-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Dialog open={!!creds} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl" preventClose>
        <DialogHeader>
          <DialogTitle>تم إنشاء {creds.length} حساب</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <Alert variant="warning" title="انسخ البيانات الآن">
            لن تظهر كلمات المرور مرة أخرى بعد إغلاق هذه النافذة.
          </Alert>

          <div className="mt-3 max-h-80 overflow-y-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-xs text-neutral-500">
                  <th className="pb-2 text-start font-medium">الاسم</th>
                  <th className="pb-2 text-start font-medium">اسم المستخدم</th>
                  <th className="pb-2 text-start font-medium">كلمة المرور</th>
                  <th className="pb-2">
                    <span className="sr-only">نسخ</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {creds.map((c) => (
                  <CredentialTableRow key={c.username} cred={c} />
                ))}
              </tbody>
            </table>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={downloadCSV}>
            <Download className="h-4 w-4" />
            تصدير CSV
          </Button>
          <Button variant="outline" onClick={copyAll}>
            {copiedAll ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copiedAll ? 'تم النسخ' : 'نسخ الكل'}
          </Button>
          <Button onClick={onClose}>تم</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CredentialTableRow({ cred }: { cred: BulkCreatedCreds }) {
  const [copied, setCopied] = React.useState(false);

  React.useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);

  function copyRow() {
    navigator.clipboard.writeText(`${cred.username}\t${cred.password}`);
    setCopied(true);
  }

  return (
    <tr className="border-b border-neutral-100 last:border-0">
      <td className="py-2 pe-2 text-neutral-900">{cred.fullName}</td>
      <td className="py-2 pe-2">
        <span dir="ltr" className="font-mono text-xs text-neutral-600">
          {cred.username}
        </span>
      </td>
      <td className="py-2 pe-2">
        <span dir="ltr" className="font-mono text-xs text-neutral-600">
          {cred.password}
        </span>
      </td>
      <td className="py-2">
        <IconButton
          aria-label={`نسخ بيانات ${cred.fullName}`}
          onClick={copyRow}
          className={copied ? 'text-mint-600' : undefined}
        >
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
        </IconButton>
      </td>
    </tr>
  );
}
