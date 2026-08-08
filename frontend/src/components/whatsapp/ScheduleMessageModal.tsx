'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Modal from '@/components/ui/Modal';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';
import Select from '@/components/ui/Select';
import DatePicker from '@/components/ui/DatePicker';
import Textarea from '@/components/ui/Textarea';
import { showToast } from '@/components/ui/Toast';
import { whatsappService as svc } from '@/services/whatsapp.service';
import type { WaTemplate } from '@/types/whatsapp';
import type { ApiError } from '@/types/api';

/** Highest {{n}} placeholder index in a template's BODY component (0 = none). */
function bodyVarCount(t: WaTemplate): number {
  const comps = Array.isArray(t.components)
    ? (t.components as Array<{ type?: string; text?: string }>)
    : [];
  const body = comps.find((c) => (c.type ?? '').toUpperCase() === 'BODY');
  if (!body?.text) return 0;
  const nums = [...body.text.matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1]));
  return nums.length ? Math.max(...nums) : 0;
}

/**
 * Schedule a message (plain text or an approved template) to be sent later.
 * Calls `scheduleMessage(conversationId, { kind, … , sendAt })`.
 */
export default function ScheduleMessageModal({
  conversationId,
  initialText,
  onClose,
}: {
  conversationId: string;
  initialText?: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [kind, setKind] = useState<'text' | 'template'>('text');
  const [text, setText] = useState(initialText ?? '');
  const [templateId, setTemplateId] = useState('');
  const [params, setParams] = useState<string[]>([]);
  const [sendAt, setSendAt] = useState('');

  const { data } = useQuery({
    queryKey: ['wa-templates', 'approved'],
    queryFn: () => svc.listTemplates({ status: 'APPROVED', limit: 100 }),
  });
  const templates = data?.data?.items ?? [];
  const selectedTemplate = templates.find((t) => t.id === templateId) ?? null;
  const varCount = selectedTemplate ? bodyVarCount(selectedTemplate) : 0;
  const templateOptions = templates.map((t) => ({
    value: t.id,
    label: `${t.name} (${t.language})`,
  }));

  const mutation = useMutation({
    mutationFn: () => {
      const iso = new Date(sendAt).toISOString();
      if (kind === 'template') {
        const bodyParams = Array.from({ length: varCount }, (_, i) => params[i]?.trim() || '');
        return svc.scheduleMessage(conversationId, {
          kind: 'template',
          templateId,
          bodyParams,
          sendAt: iso,
        });
      }
      return svc.scheduleMessage(conversationId, { kind: 'text', text: text.trim(), sendAt: iso });
    },
    onSuccess: () => {
      showToast.success('Message scheduled');
      qc.invalidateQueries({ queryKey: ['wa-scheduled', conversationId] });
      onClose();
    },
    onError: (e) => showToast.error((e as unknown as ApiError).message || 'Failed to schedule'),
  });

  const submit = () => {
    if (!sendAt) return showToast.error('Pick a date and time');
    if (new Date(sendAt).getTime() <= Date.now()) {
      return showToast.error('Pick a time in the future');
    }
    if (kind === 'text' && !text.trim()) return showToast.error('Enter a message');
    if (kind === 'template' && !templateId) return showToast.error('Pick an approved template');
    mutation.mutate();
  };

  return (
    <Modal isOpen onClose={onClose} title="Schedule a message" size="md">
      <div className="space-y-4">
        <Select
          label="What to send"
          clearable={false}
          options={[
            { value: 'text', label: 'Plain text' },
            { value: 'template', label: 'Approved template' },
          ]}
          value={kind}
          onChange={(v) => setKind(v as 'text' | 'template')}
        />

        {kind === 'text' ? (
          <Textarea
            label="Message"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={4}
            placeholder="Type the message to send later…"
          />
        ) : (
          <>
            <Select
              label="Template"
              options={templateOptions}
              value={templateId}
              onChange={(v) => {
                setTemplateId(v);
                setParams([]);
              }}
              placeholder={
                templates.length
                  ? 'Select an approved template'
                  : 'No approved templates — sync first'
              }
            />
            {varCount > 0 && (
              <div className="space-y-2 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] p-3">
                <p className="text-xs font-semibold text-[var(--text-muted)]">
                  Fill template variables
                </p>
                {Array.from({ length: varCount }, (_, i) => (
                  <Input
                    key={i}
                    label={`{{${i + 1}}}`}
                    value={params[i] ?? ''}
                    onChange={(e) =>
                      setParams((p) => {
                        const next = [...p];
                        next[i] = e.target.value;
                        return next;
                      })
                    }
                  />
                ))}
              </div>
            )}
          </>
        )}

        <DatePicker label="Send at" mode="datetime" value={sendAt} onChange={setSendAt} />
      </div>

      <div className="mt-6 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={submit} isLoading={mutation.isPending}>
          Schedule
        </Button>
      </div>
    </Modal>
  );
}
