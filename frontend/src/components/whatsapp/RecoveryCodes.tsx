'use client';

import { useState } from 'react';
import { Copy, Download, Check, AlertTriangle } from 'lucide-react';
import Button from '@/components/ui/Button';

/**
 * The one and only display of a set of recovery codes.
 *
 * They exist for the case where the authenticator is gone — a lost or wiped
 * phone — so an operator who does not save them is one dead device away from
 * being locked out of the console with no way back in. That makes the copy here
 * load-bearing, not decoration: the warning is blunt on purpose, and both
 * copy and download are offered because "select the text carefully" is exactly
 * how half a set gets saved.
 */
export default function RecoveryCodes({
  codes,
  brandName = 'TechnoTaau',
}: {
  codes: string[];
  brandName?: string;
}) {
  const [copied, setCopied] = useState(false);

  if (codes.length === 0) return null;

  const asText = [
    `${brandName} — WhatsApp console recovery codes`,
    `Generated ${new Date().toISOString()}`,
    '',
    'Each code works ONCE. Store them somewhere you can reach without your phone.',
    '',
    ...codes,
    '',
  ].join('\n');

  const copy = async () => {
    await navigator.clipboard.writeText(codes.join('\n'));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const download = () => {
    const blob = new Blob([asText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${brandName.toLowerCase().replace(/\s+/g, '-')}-recovery-codes.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <p>
          <strong>Save these now.</strong> They will not be shown again. Each code works once, and
          they are the only way back in if you lose your authenticator.
        </p>
      </div>

      <ul className="grid grid-cols-2 gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] p-3">
        {codes.map((code) => (
          <li
            key={code}
            className="text-center font-mono text-sm tracking-wider text-[var(--text)]"
          >
            {code}
          </li>
        ))}
      </ul>

      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void copy()}
          leftIcon={copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
        >
          {copied ? 'Copied' : 'Copy'}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={download}
          leftIcon={<Download className="h-4 w-4" />}
        >
          Download
        </Button>
      </div>
    </div>
  );
}
