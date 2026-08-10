'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { X, Plus, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import DialogShell from '@/components/ui/DialogShell';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';
import PhoneInput from '@/components/ui/PhoneInput';
import { showToast } from '@/components/ui/Toast';
import { whatsappService as svc } from '@/services/whatsapp.service';
import type { ApiError } from '@/types/api';

/** Shape of the WhatsApp contacts payload entry we POST to the Cloud API. */
interface WaContactPayload {
  name: { formatted_name: string; first_name: string; last_name?: string };
  phones: Array<{ phone: string; type: string }>;
  emails?: Array<{ email: string; type: string }>;
  org?: { company: string };
}

const MAX_PHONES = 3;

/**
 * Compose + send a single WhatsApp contact card into an open conversation.
 * Mirrors TemplateComposeModal's chrome (overlay, X close, footer actions).
 */
export default function ContactComposeModal({
  conversationId,
  onClose,
  onSent,
}: {
  conversationId: string;
  onClose: () => void;
  onSent: () => void;
}) {
  const qc = useQueryClient();
  const [first, setFirst] = useState('');
  const [last, setLast] = useState('');
  const [phones, setPhones] = useState<string[]>(['']);
  const [email, setEmail] = useState('');
  const [org, setOrg] = useState('');

  const setPhoneAt = (i: number, val: string) =>
    setPhones((prev) => prev.map((p, idx) => (idx === i ? val : p)));
  const addPhone = () => setPhones((prev) => (prev.length < MAX_PHONES ? [...prev, ''] : prev));
  const removePhone = (i: number) =>
    setPhones((prev) => (prev.length > 1 ? prev.filter((_, idx) => idx !== i) : prev));

  const cleanPhones = phones.map((p) => p.trim()).filter(Boolean);
  const firstName = first.trim();
  const lastName = last.trim();
  const formattedName = `${firstName} ${lastName}`.trim() || cleanPhones[0] || '';
  const canSend = Boolean(formattedName) && cleanPhones.length > 0;

  const mutation = useMutation({
    mutationFn: async (): Promise<void> => {
      const trimmedEmail = email.trim();
      const trimmedOrg = org.trim();
      const contact: WaContactPayload = {
        name: {
          formatted_name: formattedName,
          first_name: firstName,
          ...(lastName ? { last_name: lastName } : {}),
        },
        phones: cleanPhones.map((p) => ({ phone: p, type: 'CELL' })),
        ...(trimmedEmail ? { emails: [{ email: trimmedEmail, type: 'WORK' }] } : {}),
        ...(trimmedOrg ? { org: { company: trimmedOrg } } : {}),
      };
      await svc.sendContacts(conversationId, [contact]);
    },
    onSuccess: () => {
      showToast.success('Contact sent');
      qc.invalidateQueries({ queryKey: ['wa-messages', conversationId] });
      onSent();
      onClose();
    },
    onError: (e) => showToast.error((e as unknown as ApiError).message || 'Failed to send contact'),
  });

  const submit = () => {
    if (!firstName && !formattedName) return showToast.error('Enter a first name');
    if (cleanPhones.length === 0) return showToast.error('Add at least one phone number');
    mutation.mutate();
  };

  return (
    <DialogShell onClose={onClose} label="Send a contact">
      <div className="flex max-h-[90vh] w-full max-w-md flex-col rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-[var(--border)] p-6 pb-4">
          <h2 className="text-lg font-bold text-[var(--text)]">Send a contact</h2>
          <button onClick={onClose} className="rounded p-1 hover:bg-[var(--bg-secondary)]">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 overflow-y-auto p-6">
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="First name"
              required
              value={first}
              onChange={(e) => setFirst(e.target.value)}
              placeholder="Jane"
            />
            <Input
              label="Last name"
              value={last}
              onChange={(e) => setLast(e.target.value)}
              placeholder="Doe"
            />
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-[var(--text)]">
              Phone numbers<span className="text-error ml-0.5">*</span>
            </label>
            {phones.map((p, i) => (
              <div key={i} className="flex items-end gap-2">
                <div className="flex-1">
                  <PhoneInput value={p} onValueChange={(full) => setPhoneAt(i, full)} />
                </div>
                {phones.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removePhone(i)}
                    className="hover:text-error flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[var(--border)] text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-secondary)]"
                    aria-label="Remove phone number"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            ))}
            {phones.length < MAX_PHONES && (
              <button
                type="button"
                onClick={addPhone}
                className={cn(
                  'text-primary inline-flex items-center gap-1.5 text-sm font-medium',
                  'transition-colors hover:underline',
                )}
              >
                <Plus className="h-4 w-4" />
                Add phone
              </button>
            )}
          </div>

          <Input
            label="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="jane@example.com"
          />
          <Input
            label="Company / Organization"
            value={org}
            onChange={(e) => setOrg(e.target.value)}
            placeholder="Acme Inc."
          />
        </div>

        <div className="flex justify-end gap-2 border-t border-[var(--border)] p-6 pt-4">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} isLoading={mutation.isPending} disabled={!canSend}>
            Send contact
          </Button>
        </div>
      </div>
    </DialogShell>
  );
}
