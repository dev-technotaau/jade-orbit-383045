'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { X } from 'lucide-react';
import DialogShell from '@/components/ui/DialogShell';
import Input from '@/components/ui/Input';
import PhoneInput from '@/components/ui/PhoneInput';
import Button from '@/components/ui/Button';
import Select from '@/components/ui/Select';
import { showToast } from '@/components/ui/Toast';
import { whatsappService as svc } from '@/services/whatsapp.service';
import { analyzeTemplate, type TemplateSendPayload } from '@/lib/whatsapp-template-vars';
import type { ApiError } from '@/types/api';

/**
 * Compose + send an approved template — either to start a NEW conversation
 * (with a phone field) or to re-engage an existing one outside the 24h window.
 */
export default function TemplateComposeModal({
  mode,
  conversationId,
  initialPhone,
  onClose,
  onSent,
}: {
  mode: 'new' | 'reply';
  conversationId?: string;
  /** Pre-fill the phone field (e.g. when messaging a platform user). */
  initialPhone?: string;
  onClose: () => void;
  onSent: (conversationId?: string) => void;
}) {
  const qc = useQueryClient();
  const [phone, setPhone] = useState(initialPhone ?? '');
  const [templateId, setTemplateId] = useState('');
  // Positional body vars (by index) + all named-ish params keyed by field id.
  const [params, setParams] = useState<string[]>([]);
  const [named, setNamed] = useState<Record<string, string>>({});
  const [headerText, setHeaderText] = useState('');
  const [headerMediaUrl, setHeaderMediaUrl] = useState('');
  const [buttonUrlParam, setButtonUrlParam] = useState('');

  const { data } = useQuery({
    queryKey: ['wa-templates', 'approved'],
    queryFn: () => svc.listTemplates({ status: 'APPROVED', limit: 100 }),
  });
  const templates = data?.data?.items ?? [];
  const selected = templates.find((t) => t.id === templateId) ?? null;
  const spec = selected ? analyzeTemplate(selected) : null;
  const options = templates.map((t) => ({ value: t.id, label: `${t.name} (${t.language})` }));

  const resetParams = () => {
    setParams([]);
    setNamed({});
    setHeaderText('');
    setHeaderMediaUrl('');
    setButtonUrlParam('');
  };

  /** Build the full send payload from the template's variable spec. */
  const buildPayload = (): TemplateSendPayload => {
    const payload: TemplateSendPayload = { templateId };
    if (!spec) return payload;
    if (spec.bodyNamed.length) {
      payload.bodyNamedParams = spec.bodyNamed.map((name) => ({
        name,
        text: (named[name] ?? '').trim(),
      }));
    } else if (spec.bodyPositional > 0) {
      payload.bodyParams = Array.from(
        { length: spec.bodyPositional },
        (_, i) => params[i]?.trim() || '',
      );
    }
    if (spec.headerHasTextVar) payload.headerText = headerText.trim();
    if (spec.headerNeedsMedia) {
      payload.headerMediaUrl = headerMediaUrl.trim();
      payload.headerMediaType = spec.headerFormat.toLowerCase() as 'image' | 'video' | 'document';
    }
    if (spec.buttonUrlVar) payload.buttonUrlParam = buttonUrlParam.trim();
    return payload;
  };

  /** Every required field must be filled before Meta will accept the send. */
  const missingRequired = (): boolean => {
    if (!spec) return false;
    if (spec.bodyNamed.length) return spec.bodyNamed.some((n) => !(named[n] ?? '').trim());
    if (spec.bodyPositional > 0)
      return Array.from({ length: spec.bodyPositional }).some((_, i) => !(params[i] ?? '').trim());
    if (spec.headerHasTextVar && !headerText.trim()) return true;
    if (spec.headerNeedsMedia && !headerMediaUrl.trim()) return true;
    if (spec.buttonUrlVar && !buttonUrlParam.trim()) return true;
    return false;
  };

  const mutation = useMutation({
    mutationFn: async (): Promise<{ conversationId?: string }> => {
      const payload = buildPayload();
      if (mode === 'new') {
        const res = await svc.startConversation({ phone, ...payload });
        return { conversationId: res.data?.conversationId };
      }
      await svc.sendTemplate(conversationId as string, payload);
      return { conversationId };
    },
    onSuccess: (result) => {
      showToast.success('Template sent');
      qc.invalidateQueries({ queryKey: ['wa-conversations'] });
      const convId = result.conversationId;
      if (convId) qc.invalidateQueries({ queryKey: ['wa-messages', convId] });
      onSent(convId);
      onClose();
    },
    onError: (e) =>
      showToast.error((e as unknown as ApiError).message || 'Failed to send template'),
  });

  const submit = () => {
    if (mode === 'new' && phone.replace(/\D/g, '').length < 8) {
      return showToast.error('Enter a valid phone number with country code');
    }
    if (!templateId) return showToast.error('Pick an approved template');
    if (missingRequired()) {
      return showToast.error('Fill every template parameter (header, body, and button)');
    }
    mutation.mutate();
  };

  return (
    <DialogShell onClose={onClose} label="Send a template">
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-[var(--text)]">
            {mode === 'new' ? 'New WhatsApp conversation' : 'Send a template'}
          </h2>
          <button onClick={onClose} className="rounded p-1 hover:bg-[var(--bg-secondary)]">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4">
          {mode === 'new' && (
            <PhoneInput
              label="Phone number"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          )}
          <Select
            label="Template"
            options={options}
            value={templateId}
            onChange={(v) => {
              setTemplateId(v);
              resetParams();
            }}
            placeholder={
              templates.length
                ? 'Select an approved template'
                : 'No approved templates — sync first'
            }
          />
          {spec && !spec.none && (
            <div className="space-y-3 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] p-3">
              <p className="text-xs font-semibold text-[var(--text-muted)]">
                Fill template parameters
              </p>

              {spec.headerNeedsMedia && (
                <Input
                  label={`Header ${spec.headerFormat.toLowerCase()} URL`}
                  placeholder={`https://… (public ${spec.headerFormat.toLowerCase()} link)`}
                  value={headerMediaUrl}
                  onChange={(e) => setHeaderMediaUrl(e.target.value)}
                />
              )}
              {spec.headerHasTextVar && (
                <Input
                  label="Header variable {{1}}"
                  value={headerText}
                  onChange={(e) => setHeaderText(e.target.value)}
                />
              )}

              {spec.bodyNamed.length > 0
                ? spec.bodyNamed.map((name) => (
                    <Input
                      key={name}
                      label={`Body {{${name}}}`}
                      value={named[name] ?? ''}
                      onChange={(e) => setNamed((n) => ({ ...n, [name]: e.target.value }))}
                    />
                  ))
                : Array.from({ length: spec.bodyPositional }, (_, i) => (
                    <Input
                      key={i}
                      label={`Body {{${i + 1}}}`}
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

              {spec.buttonUrlVar && (
                <Input
                  label="URL button variable {{1}}"
                  placeholder="e.g. the dynamic part of the button link"
                  value={buttonUrlParam}
                  onChange={(e) => setButtonUrlParam(e.target.value)}
                />
              )}
            </div>
          )}
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} isLoading={mutation.isPending}>
            Send template
          </Button>
        </div>
      </div>
    </DialogShell>
  );
}
