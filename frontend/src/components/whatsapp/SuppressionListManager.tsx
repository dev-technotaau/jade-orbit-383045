'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, Plus, ShieldX, Trash2 } from 'lucide-react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import PhoneInput from '@/components/ui/PhoneInput';
import { showToast } from '@/components/ui/Toast';
import { confirmDialog } from '@/components/ui/dialog-service';
import { formatDate } from '@/lib/utils';
import { whatsappService as svc } from '@/services/whatsapp.service';
import type { WaSuppression } from '@/types/whatsapp';
import type { ApiError } from '@/types/api';

/**
 * Suppression list — the global do-not-contact list. Numbers added here are
 * excluded from every campaign send. Supports adding a number (phone + optional
 * reason) and removing existing entries. Backed by listSuppressions /
 * addSuppression / removeSuppression; invalidates `wa-suppressions`.
 */
export default function SuppressionListManager() {
  const qc = useQueryClient();
  const [phone, setPhone] = useState('');
  const [reason, setReason] = useState('');

  const { data, isLoading, isError } = useQuery({
    queryKey: ['wa-suppressions'],
    queryFn: () => svc.listSuppressions(),
  });
  const entries = data?.data ?? [];

  const addMut = useMutation({
    mutationFn: () => svc.addSuppression(phone.trim(), reason.trim() || undefined),
    onSuccess: () => {
      showToast.success('Number added to suppression list');
      setPhone('');
      setReason('');
      qc.invalidateQueries({ queryKey: ['wa-suppressions'] });
    },
    onError: (e) => showToast.error((e as unknown as ApiError).message || 'Failed to add number'),
  });

  const removeMut = useMutation({
    mutationFn: (id: string) => svc.removeSuppression(id),
    onSuccess: () => {
      showToast.success('Number removed from suppression list');
      qc.invalidateQueries({ queryKey: ['wa-suppressions'] });
    },
    onError: (e) =>
      showToast.error((e as unknown as ApiError).message || 'Failed to remove number'),
  });

  const submit = () => {
    if (!phone.trim()) return showToast.error('Enter a phone number');
    addMut.mutate();
  };

  const handleRemove = async (entry: WaSuppression) => {
    const ok = await confirmDialog({
      title: 'Remove from suppression list',
      message: `Remove ${entry.phone} from the suppression list?`,
      confirmLabel: 'Remove',
      variant: 'danger',
    });
    if (ok) {
      removeMut.mutate(entry.id);
    }
  };

  return (
    <section className="space-y-3">
      <div>
        <h2 className="flex items-center gap-2 text-sm font-semibold text-[var(--text)]">
          <ShieldX className="h-4 w-4 text-red-600" /> Suppression list
        </h2>
        <p className="mt-0.5 text-xs text-[var(--text-muted)]">
          A global do-not-contact list. Numbers added here are permanently excluded from every
          campaign send, regardless of audience or segment.
        </p>
      </div>

      <div className="rounded-xl border border-[var(--border)] bg-white p-4">
        {/* Add number form */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="flex-1">
            <PhoneInput
              label="Phone number"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  submit();
                }
              }}
            />
          </div>
          <div className="flex-1">
            <Input
              label="Reason (optional)"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  submit();
                }
              }}
              placeholder="e.g. Bounced / spam complaint"
            />
          </div>
          <Button
            leftIcon={<Plus className="h-4 w-4" />}
            isLoading={addMut.isPending}
            onClick={submit}
          >
            Add number
          </Button>
        </div>
      </div>

      {/* List */}
      <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-white">
        {isLoading && (
          <p className="flex items-center justify-center gap-2 p-8 text-sm text-[var(--text-muted)]">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading suppression list…
          </p>
        )}
        {isError && (
          <p className="p-4 text-center text-sm text-red-600">Failed to load suppression list.</p>
        )}
        {!isLoading && !isError && entries.length === 0 && (
          <p className="p-8 text-center text-sm text-[var(--text-muted)]">
            No suppressed numbers yet.
          </p>
        )}

        {!isLoading && !isError && entries.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-left text-xs text-[var(--text-muted)]">
                  <th className="px-4 py-2.5 font-medium">Phone</th>
                  <th className="px-4 py-2.5 font-medium">Reason</th>
                  <th className="px-4 py-2.5 font-medium">Added</th>
                  <th className="px-4 py-2.5 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr
                    key={entry.id}
                    className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--bg-secondary)]"
                  >
                    <td className="px-4 py-2.5 font-mono font-medium text-[var(--text)]">
                      {entry.phone}
                    </td>
                    <td className="px-4 py-2.5 text-[var(--text-secondary)]">
                      {entry.reason || '—'}
                    </td>
                    <td className="px-4 py-2.5 text-[var(--text-secondary)]">
                      {formatDate(entry.createdAt)}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center justify-end">
                        <Button
                          variant="ghost"
                          size="icon"
                          tooltip="Remove"
                          isLoading={removeMut.isPending && removeMut.variables === entry.id}
                          onClick={() => handleRemove(entry)}
                        >
                          <Trash2 className="h-4 w-4 text-red-600" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
