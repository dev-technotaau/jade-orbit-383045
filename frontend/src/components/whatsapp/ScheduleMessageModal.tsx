'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import Modal from '@/components/ui/Modal';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';
import Select from '@/components/ui/Select';
import DatePicker from '@/components/ui/DatePicker';
import Textarea from '@/components/ui/Textarea';
import { waMediaKind } from '@/constants/config';
import { showToast } from '@/components/ui/Toast';
import TemplatePicker from '@/components/whatsapp/TemplatePicker';
import { whatsappService as svc } from '@/services/whatsapp.service';
import { analyzeTemplate, templateParamsBeyondBody } from '@/lib/whatsapp-template-vars';
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
 * Schedule a message — plain text, an approved template, or a FILE — to be sent
 * later.
 *
 * The file option is not cosmetic parity with the attach menu: "send this price
 * list at 9am tomorrow" was impossible, and the schedule button sitting next to
 * the paperclip made the gap read as a bug. The bytes are archived server-side
 * at schedule time and uploaded to Meta seconds before the send, because a Meta
 * media id expires after 30 days.
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
  const [kind, setKind] = useState<'text' | 'template' | 'media'>('text');
  const [text, setText] = useState(initialText ?? '');
  const [file, setFile] = useState<File | null>(null);
  /**
   * Whether the chosen file can carry a caption at all.
   *
   * Same rule the send path enforces: Meta accepts no caption on a sticker or on
   * audio, and the server drops it. This sheet offered the box for every file, so
   * scheduling an MP3 with a note sent the file and silently discarded the note —
   * and the operator only learned that from the customer, hours later.
   */
  const mediaCaptionless = useMemo(() => {
    if (!file) return false;
    const k = waMediaKind(file.type || 'application/octet-stream', file.size);
    return k === 'sticker' || k === 'audio';
  }, [file]);
  const [caption, setCaption] = useState('');
  // The picked template itself, not just its id — the picker searches the
  // catalogue server-side, so there is no local list to look the id up in.
  const [selectedTemplate, setSelectedTemplate] = useState<WaTemplate | null>(null);
  const [params, setParams] = useState<string[]>([]);
  const [sendAt, setSendAt] = useState('');

  const templateId = selectedTemplate?.id ?? '';
  const varCount = selectedTemplate ? bodyVarCount(selectedTemplate) : 0;
  /**
   * What this template needs that a scheduled row cannot carry.
   *
   * The row holds a template id and an ordered list of body values and nothing
   * else, so a template with a media header, a location pin, a dynamic link, a
   * coupon or an offer expiry was scheduled happily and then refused by Meta at
   * dispatch — and the panel lists PENDING rows, so the FAILED row simply
   * vanished. The server refuses it too; this says so before the modal closes.
   */
  const unsupported = useMemo(
    () => (selectedTemplate ? templateParamsBeyondBody(analyzeTemplate(selectedTemplate)) : []),
    [selectedTemplate],
  );

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
      if (kind === 'media') {
        return svc.scheduleMediaMessage(conversationId, file as File, {
          sendAt: iso,
          // Never send a caption the server will drop — see mediaCaptionless.
          caption: mediaCaptionless ? undefined : caption.trim() || undefined,
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
    if (kind === 'template' && unsupported.length > 0) {
      return showToast.error(
        `This template needs ${unsupported.join(', ')}, which a scheduled message cannot supply. Pick a template that needs body values alone.`,
      );
    }
    if (kind === 'media' && !file) return showToast.error('Choose a file');
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
            { value: 'media', label: 'A file (image, video, document)' },
            { value: 'template', label: 'Approved template' },
          ]}
          value={kind}
          onChange={(v) => setKind(v as 'text' | 'template' | 'media')}
        />

        {kind === 'media' ? (
          <div className="space-y-3">
            <div>
              <label
                htmlFor="wa-schedule-file"
                className="mb-1 block text-sm font-medium text-[var(--text)]"
              >
                File
              </label>
              <input
                id="wa-schedule-file"
                type="file"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="block w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm text-[var(--text)] file:mr-3 file:rounded-md file:border-0 file:bg-[var(--bg-secondary)] file:px-3 file:py-1.5 file:text-sm file:font-medium"
              />
              <p className="mt-1 text-xs text-[var(--text-muted)]">
                Held in your own storage until it is sent, then uploaded to WhatsApp. A file only
                sends inside the 24-hour reply window — schedule a template for anything later.
              </p>
            </div>
            {mediaCaptionless ? (
              <p className="rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] p-2.5 text-xs text-[var(--text-muted)]">
                WhatsApp carries no caption on this kind of file. Schedule your message as its own
                text send if it needs to go with it.
              </p>
            ) : (
              <Input
                label="Caption (optional)"
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                placeholder="Here's the price list you asked for"
              />
            )}
          </div>
        ) : kind === 'text' ? (
          <Textarea
            label="Message"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={4}
            placeholder="Type the message to send later…"
          />
        ) : (
          <>
            <TemplatePicker
              label="Template"
              value={templateId}
              onChange={(t) => {
                setSelectedTemplate(t);
                setParams([]);
              }}
            />
            {unsupported.length > 0 && (
              <p className="text-error text-xs">
                This template needs {unsupported.join(', ')}. A scheduled message carries its body
                values only — pick a template that needs nothing else.
              </p>
            )}
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
