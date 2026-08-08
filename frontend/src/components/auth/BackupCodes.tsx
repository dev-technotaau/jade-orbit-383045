'use client';

/**
 * BackupCodes — the one place two-factor backup codes are rendered.
 *
 * Every MFA surface used to print the codes into a bare grid with no way to keep
 * them: no download, no copy. Backup codes are shown exactly once, so an
 * operator's only options were to screenshot them or retype them by hand — and
 * for the super-admin flow that enables MFA *on behalf of an admin*, they then
 * had to get them to that person somehow.
 *
 * The grid markup is deliberately byte-identical to what each surface had
 * before, so swapping this in changes nothing visually except the added action
 * row beneath.
 *
 * Used by:
 *   · SuperAdminMfaSetup            — forced setup at first super-admin login
 *   · /super-admin/settings         — own codes, an admin's codes, regenerations
 *   · /candidate|/employer settings — self-service regeneration
 */

import { useCallback, useState } from 'react';
import { Check, Copy, Download } from 'lucide-react';
import Button from '@/components/ui/Button';
import { showToast } from '@/components/ui/Toast';

interface Props {
  codes: string[];
  /**
   * Goes into the filename and the file header — e.g. an email address when a
   * super-admin generates codes for someone else, so two downloads taken in the
   * same session don't collide or get mixed up.
   */
  label?: string;
  className?: string;
}

/** Filesystem-safe slug for the filename. */
function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

/**
 * Plain text rather than PDF/CSV: these get printed, pasted into a password
 * manager, or dropped in a safe. A .txt opens everywhere and has no tooling
 * dependency.
 */
function buildFile(codes: string[], label?: string): string {
  const lines = [
    'Hire Adda — two-factor backup codes',
    `Generated: ${new Date().toISOString()}`,
    ...(label ? [`Account: ${label}`] : []),
    '',
    'Each code can be used ONCE to sign in if you lose your authenticator app.',
    'Store this file somewhere safe and offline. Cross off codes as you use them.',
    'Generating new codes invalidates every code listed here.',
    '',
    ...codes.map((code, i) => `${String(i + 1).padStart(2, ' ')}. ${code}`),
    '',
  ];
  return lines.join('\r\n');
}

export default function BackupCodes({ codes, label, className = '' }: Props) {
  const [copied, setCopied] = useState(false);

  const copyAll = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(codes.join('\n'));
      setCopied(true);
      showToast.success('Backup codes copied');
      // Revert the button after a beat; a permanent "Copied" reads as stuck.
      setTimeout(() => setCopied(false), 2000);
    } catch {
      showToast.error('Could not copy — select the codes and copy manually');
    }
  }, [codes]);

  const download = useCallback(() => {
    const blob = new Blob([buildFile(codes, label)], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `hire-adda-backup-codes${label ? `-${slug(label)}` : ''}-${
      new Date().toISOString().split('T')[0]
    }.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast.success('Backup codes downloaded');
  }, [codes, label]);

  if (codes.length === 0) return null;

  return (
    <div className={`space-y-3 ${className}`}>
      {/* Unchanged from every call site's previous markup. */}
      <div className="grid grid-cols-2 gap-2 rounded-lg bg-[var(--bg-secondary)] p-3">
        {codes.map((code) => (
          <code key={code} className="font-mono text-sm text-[var(--text)]">
            {code}
          </code>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => void download()}
          leftIcon={<Download className="h-4 w-4" />}
          tooltip="Save the codes as a .txt file"
        >
          Download
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void copyAll()}
          leftIcon={copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          tooltip="Copy all codes to the clipboard"
        >
          {copied ? 'Copied' : 'Copy all'}
        </Button>
      </div>

      <p className="text-xs text-[var(--text-muted)]">
        Shown once. Each code works a single time, and generating new codes invalidates these.
      </p>
    </div>
  );
}
