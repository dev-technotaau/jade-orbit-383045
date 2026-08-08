'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { MoreVertical, FileDown, Trash2, ShieldAlert } from 'lucide-react';
import Dropdown from '@/components/ui/Dropdown';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import { showToast } from '@/components/ui/Toast';
import { superAdminWhatsappService as svc } from '@/services/super-admin-whatsapp.service';
import type { WaContact } from '@/types/whatsapp';
import type { ApiError } from '@/types/api';

/**
 * Per-row DPDP (Digital Personal Data Protection) actions for a WhatsApp contact:
 *  - Export data: downloads a JSON portability file for the data principal.
 *  - Erase: anonymizes the contact and deletes their message content/media.
 *    Destructive — gated behind a confirm modal.
 */
export default function ContactDpdpActions({ contact }: { contact: WaContact }) {
  const qc = useQueryClient();
  const [confirmErase, setConfirmErase] = useState(false);
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    setExporting(true);
    try {
      await svc.exportContactData(contact.id);
      showToast.success('Data export downloaded');
    } catch (e) {
      showToast.error((e as unknown as ApiError).message || 'Export failed');
    } finally {
      setExporting(false);
    }
  };

  const eraseMut = useMutation({
    mutationFn: () => svc.eraseContact(contact.id),
    onSuccess: () => {
      showToast.success('Contact erased');
      qc.invalidateQueries({ queryKey: ['wa-contacts'] });
      setConfirmErase(false);
    },
    onError: (e) => showToast.error((e as unknown as ApiError).message || 'Erasure failed'),
  });

  const label = contact.name || contact.phone;

  return (
    <>
      <Dropdown
        align="right"
        trigger={
          <button
            type="button"
            aria-label={`DPDP actions for ${label}`}
            className="rounded-md p-1.5 text-[var(--text-muted)] hover:bg-[var(--bg-secondary)] hover:text-[var(--text)]"
          >
            <MoreVertical className="h-4 w-4" />
          </button>
        }
        items={[
          {
            label: exporting ? 'Exporting…' : 'Export data',
            icon: FileDown,
            disabled: exporting,
            onClick: () => void handleExport(),
          },
          {
            label: 'Erase',
            icon: Trash2,
            destructive: true,
            onClick: () => setConfirmErase(true),
          },
        ]}
      />

      <Modal
        isOpen={confirmErase}
        onClose={() => !eraseMut.isPending && setConfirmErase(false)}
        title="Erase contact data"
        size="sm"
        footer={
          <div className="flex justify-end gap-3">
            <Button
              variant="outline"
              onClick={() => setConfirmErase(false)}
              disabled={eraseMut.isPending}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              leftIcon={<Trash2 className="h-4 w-4" />}
              onClick={() => eraseMut.mutate()}
              isLoading={eraseMut.isPending}
            >
              Erase contact
            </Button>
          </div>
        }
      >
        <div className="flex gap-3">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-[var(--error)]" />
          <div className="space-y-2 text-sm text-[var(--text-secondary)]">
            <p>
              This will <strong>anonymize</strong>{' '}
              <span className="font-medium text-[var(--text)]">{label}</span> and{' '}
              <strong>permanently delete</strong> their message content and media.
            </p>
            <p>This action cannot be undone. Use it to honour a DPDP erasure request.</p>
          </div>
        </div>
      </Modal>
    </>
  );
}
