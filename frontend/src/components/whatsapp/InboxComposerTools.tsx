'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { MessageSquareText, LayoutList, X, Trash2, Plus } from 'lucide-react';
import DialogShell from '@/components/ui/DialogShell';
import Input from '@/components/ui/Input';
import Textarea from '@/components/ui/Textarea';
import Button from '@/components/ui/Button';
import Select from '@/components/ui/Select';
import Tooltip from '@/components/ui/Tooltip';
import { showToast } from '@/components/ui/Toast';
import { whatsappService as svc } from '@/services/whatsapp.service';
import type { ApiError } from '@/types/api';

function CannedPopover({
  onClose,
  onInsert,
}: {
  onClose: () => void;
  onInsert: (t: string) => void;
}) {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['wa-canned'], queryFn: () => svc.listCannedReplies() });
  const replies = data?.data ?? [];
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');

  const createMut = useMutation({
    mutationFn: () => svc.createCannedReply({ title: title.trim(), text: text.trim() }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['wa-canned'] });
      setAdding(false);
      setTitle('');
      setText('');
    },
    onError: (e) => showToast.error((e as unknown as ApiError).message || 'Failed to save'),
  });
  const delMut = useMutation({
    mutationFn: (id: string) => svc.deleteCannedReply(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['wa-canned'] }),
  });

  return (
    <div className="absolute bottom-14 left-3 z-20 w-72 rounded-lg border border-[var(--border)] bg-white shadow-lg">
      <div className="flex items-center justify-between border-b border-[var(--border)] px-3 py-2">
        <span className="text-xs font-semibold text-[var(--text)]">Canned replies</span>
        <button type="button" onClick={onClose}>
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="max-h-60 overflow-y-auto">
        {replies.length === 0 && (
          <p className="px-3 py-3 text-xs text-[var(--text-muted)]">No canned replies yet.</p>
        )}
        {replies.map((r) => (
          <div
            key={r.id}
            className="flex items-start gap-2 px-3 py-2 hover:bg-[var(--bg-secondary)]"
          >
            <button
              type="button"
              onClick={() => onInsert(r.text)}
              className="min-w-0 flex-1 text-left"
            >
              <p className="truncate text-xs font-medium text-[var(--text)]">{r.title}</p>
              <p className="truncate text-[11px] text-[var(--text-muted)]">{r.text}</p>
            </button>
            <button
              type="button"
              onClick={() => delMut.mutate(r.id)}
              className="text-[var(--text-muted)] hover:text-[var(--error)]"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
      {adding ? (
        <div className="space-y-2 border-t border-[var(--border)] p-3">
          <Input label="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
          <Textarea label="Text" value={text} onChange={(e) => setText(e.target.value)} rows={2} />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setAdding(false)}>
              Cancel
            </Button>
            <Button onClick={() => createMut.mutate()} isLoading={createMut.isPending}>
              Save
            </Button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="flex w-full items-center gap-1.5 border-t border-[var(--border)] px-3 py-2 text-xs font-medium text-[var(--primary)] hover:bg-[var(--bg-secondary)]"
        >
          <Plus className="h-3.5 w-3.5" /> New canned reply
        </button>
      )}
    </div>
  );
}

function InteractiveModal({
  conversationId,
  onClose,
  onSent,
}: {
  conversationId: string;
  onClose: () => void;
  onSent: () => void;
}) {
  const [kind, setKind] = useState<'button' | 'list' | 'cta_url'>('button');
  const [bodyText, setBodyText] = useState('');
  const [buttons, setButtons] = useState<string[]>(['']);
  const [listButton, setListButton] = useState('Menu');
  const [rows, setRows] = useState<Array<{ title: string; description: string }>>([
    { title: '', description: '' },
  ]);
  const [ctaText, setCtaText] = useState('');
  const [ctaUrl, setCtaUrl] = useState('');

  const mutation = useMutation({
    mutationFn: () => {
      if (kind === 'button') {
        const b = buttons
          .map((t) => t.trim())
          .filter(Boolean)
          .slice(0, 3)
          .map((title, i) => ({ id: `btn_${i + 1}`, title }));
        return svc.sendInteractive(conversationId, {
          kind: 'button',
          bodyText: bodyText.trim(),
          buttons: b,
        });
      }
      if (kind === 'cta_url') {
        return svc.sendInteractive(conversationId, {
          kind: 'cta_url',
          bodyText: bodyText.trim(),
          ctaText: ctaText.trim(),
          ctaUrl: ctaUrl.trim(),
        });
      }
      const r = rows
        .map((row, i) => ({
          id: `row_${i + 1}`,
          title: row.title.trim(),
          description: row.description.trim() || undefined,
        }))
        .filter((x) => x.title);
      return svc.sendInteractive(conversationId, {
        kind: 'list',
        bodyText: bodyText.trim(),
        listButton,
        sections: [{ rows: r }],
      });
    },
    onSuccess: () => {
      showToast.success('Interactive message sent');
      onSent();
    },
    onError: (e) => showToast.error((e as unknown as ApiError).message || 'Failed to send'),
  });

  const submit = () => {
    if (!bodyText.trim()) return showToast.error('Body text is required');
    if (kind === 'button' && !buttons.some((b) => b.trim()))
      return showToast.error('Add at least one button');
    if (kind === 'list' && !rows.some((r) => r.title.trim()))
      return showToast.error('Add at least one list item');
    if (kind === 'cta_url') {
      if (!ctaText.trim()) return showToast.error('Button label is required');
      if (!/^https?:\/\//i.test(ctaUrl.trim()))
        return showToast.error('Enter a valid URL starting with https://');
    }
    mutation.mutate();
  };

  return (
    <DialogShell onClose={onClose} label="Interactive message">
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-[var(--text)]">Interactive message</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 hover:bg-[var(--bg-secondary)]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="space-y-4">
          <Select
            label="Type"
            options={[
              { value: 'button', label: 'Reply buttons (max 3)' },
              { value: 'list', label: 'List menu' },
              { value: 'cta_url', label: 'Call-to-action (URL button)' },
            ]}
            value={kind}
            onChange={(v) => setKind(v as 'button' | 'list' | 'cta_url')}
            clearable={false}
          />
          <Textarea
            label="Body text"
            value={bodyText}
            onChange={(e) => setBodyText(e.target.value)}
            rows={3}
          />

          {kind === 'cta_url' ? (
            <div className="space-y-2">
              <Input
                label="Button label"
                value={ctaText}
                onChange={(e) => setCtaText(e.target.value)}
                placeholder="e.g. Visit website"
              />
              <Input
                label="URL"
                type="url"
                value={ctaUrl}
                onChange={(e) => setCtaUrl(e.target.value)}
                placeholder="https://example.com"
              />
            </div>
          ) : kind === 'button' ? (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-[var(--text-muted)]">Buttons</p>
              {buttons.map((b, i) => (
                <div key={i} className="flex gap-2">
                  <Input
                    value={b}
                    onChange={(e) =>
                      setButtons((p) => {
                        const n = [...p];
                        n[i] = e.target.value;
                        return n;
                      })
                    }
                    placeholder={`Button ${i + 1} (≤20 chars)`}
                  />
                  {buttons.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setButtons((p) => p.filter((_, j) => j !== i))}
                      className="text-[var(--text-muted)] hover:text-[var(--error)]"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              ))}
              {buttons.length < 3 && (
                <button
                  type="button"
                  onClick={() => setButtons((p) => [...p, ''])}
                  className="text-xs font-medium text-[var(--primary)]"
                >
                  + Add button
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              <Input
                label="Menu button label"
                value={listButton}
                onChange={(e) => setListButton(e.target.value)}
              />
              <p className="text-xs font-semibold text-[var(--text-muted)]">List items</p>
              {rows.map((row, i) => (
                <div key={i} className="flex gap-2">
                  <Input
                    value={row.title}
                    onChange={(e) =>
                      setRows((p) => {
                        const n = [...p];
                        n[i] = { ...n[i], title: e.target.value };
                        return n;
                      })
                    }
                    placeholder={`Item ${i + 1} title`}
                  />
                  {rows.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setRows((p) => p.filter((_, j) => j !== i))}
                      className="text-[var(--text-muted)] hover:text-[var(--error)]"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              ))}
              {rows.length < 10 && (
                <button
                  type="button"
                  onClick={() => setRows((p) => [...p, { title: '', description: '' }])}
                  className="text-xs font-medium text-[var(--primary)]"
                >
                  + Add item
                </button>
              )}
            </div>
          )}
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} isLoading={mutation.isPending}>
            Send
          </Button>
        </div>
      </div>
    </DialogShell>
  );
}

/** Composer toolbar: canned-replies popover + interactive-message builder. */
export default function InboxComposerTools({
  conversationId,
  onInsert,
  onSent,
}: {
  conversationId: string;
  onInsert: (text: string) => void;
  onSent: () => void;
}) {
  const [cannedOpen, setCannedOpen] = useState(false);
  const [interactiveOpen, setInteractiveOpen] = useState(false);

  return (
    <>
      <Tooltip content="Canned replies">
        <button
          type="button"
          onClick={() => setCannedOpen((v) => !v)}
          aria-label="Canned replies"
          className="flex h-10 items-center rounded-lg px-2 text-[var(--text-muted)] hover:bg-[var(--bg-secondary)] hover:text-[var(--text)]"
        >
          <MessageSquareText className="h-5 w-5" />
        </button>
      </Tooltip>
      <Tooltip content="Interactive message (buttons / list)">
        <button
          type="button"
          onClick={() => setInteractiveOpen(true)}
          aria-label="Interactive message (buttons / list)"
          className="flex h-10 items-center rounded-lg px-2 text-[var(--text-muted)] hover:bg-[var(--bg-secondary)] hover:text-[var(--text)]"
        >
          <LayoutList className="h-5 w-5" />
        </button>
      </Tooltip>

      {cannedOpen && (
        <CannedPopover
          onClose={() => setCannedOpen(false)}
          onInsert={(t) => {
            onInsert(t);
            setCannedOpen(false);
          }}
        />
      )}
      {interactiveOpen && (
        <InteractiveModal
          conversationId={conversationId}
          onClose={() => setInteractiveOpen(false)}
          onSent={() => {
            onSent();
            setInteractiveOpen(false);
          }}
        />
      )}
    </>
  );
}
