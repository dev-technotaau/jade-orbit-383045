'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, MessageSquareText, Pencil, Plus, Trash2, X } from 'lucide-react';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';
import { showToast } from '@/components/ui/Toast';
import { confirmDialog } from '@/components/ui/dialog-service';
import FormattedTextarea from '@/components/whatsapp/FormattedTextarea';
import { whatsappService as svc } from '@/services/whatsapp.service';
import type { WaCannedReply } from '@/types/whatsapp';
import type { ApiError } from '@/types/api';

/**
 * Saved (canned) replies manager — reusable message snippets agents can drop
 * into the inbox composer. Uses the `wa-canned` query key so the
 * composer's canned-reply picker stays in sync. Supports create / inline edit /
 * delete, all WhatsApp-formatting aware via FormattedTextarea.
 */
export default function SavedRepliesManager() {
  const qc = useQueryClient();
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editText, setEditText] = useState('');

  const { data, isLoading, isError } = useQuery({
    queryKey: ['wa-canned'],
    queryFn: () => svc.listCannedReplies(),
  });
  const replies = data?.data ?? [];

  const createMut = useMutation({
    mutationFn: () => svc.createCannedReply({ title: title.trim(), text: text.trim() }),
    onSuccess: () => {
      showToast.success('Saved reply added');
      setTitle('');
      setText('');
      qc.invalidateQueries({ queryKey: ['wa-canned'] });
    },
    onError: (e) =>
      showToast.error((e as unknown as ApiError).message || 'Failed to add saved reply'),
  });

  const updateMut = useMutation({
    mutationFn: (vars: { id: string; title: string; text: string }) =>
      svc.updateCannedReply(vars.id, { title: vars.title.trim(), text: vars.text.trim() }),
    onSuccess: () => {
      showToast.success('Saved reply updated');
      setEditingId(null);
      setEditTitle('');
      setEditText('');
      qc.invalidateQueries({ queryKey: ['wa-canned'] });
    },
    onError: (e) =>
      showToast.error((e as unknown as ApiError).message || 'Failed to update saved reply'),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => svc.deleteCannedReply(id),
    onSuccess: () => {
      showToast.success('Saved reply deleted');
      qc.invalidateQueries({ queryKey: ['wa-canned'] });
    },
    onError: (e) =>
      showToast.error((e as unknown as ApiError).message || 'Failed to delete saved reply'),
  });

  const submitCreate = () => {
    if (!title.trim()) return showToast.error('Enter a title');
    if (!text.trim()) return showToast.error('Enter a message');
    createMut.mutate();
  };

  const startEdit = (reply: WaCannedReply) => {
    setEditingId(reply.id);
    setEditTitle(reply.title);
    setEditText(reply.text);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditTitle('');
    setEditText('');
  };

  const submitEdit = (id: string) => {
    if (!editTitle.trim()) return showToast.error('Enter a title');
    if (!editText.trim()) return showToast.error('Enter a message');
    updateMut.mutate({ id, title: editTitle, text: editText });
  };

  const handleDelete = async (reply: WaCannedReply) => {
    const ok = await confirmDialog({
      title: 'Delete saved reply',
      message: `Delete the "${reply.title}" saved reply?`,
      confirmLabel: 'Delete',
      variant: 'danger',
    });
    if (ok) deleteMut.mutate(reply.id);
  };

  return (
    <section className="space-y-3">
      <div>
        <h2 className="flex items-center gap-2 text-sm font-semibold text-[var(--text)]">
          <MessageSquareText className="h-4 w-4 text-[var(--primary)]" /> Saved replies
        </h2>
        <p className="mt-0.5 text-xs text-[var(--text-muted)]">
          Reusable message snippets your agents can drop into the composer. Supports WhatsApp
          formatting.
        </p>
      </div>

      <div className="rounded-xl border border-[var(--border)] bg-white p-4">
        {/* Create form */}
        <div className="space-y-3">
          <Input
            label="Title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Office hours"
          />
          <FormattedTextarea
            label="Message"
            value={text}
            onChange={setText}
            rows={3}
            placeholder="Type the reusable message…"
          />
          <div className="flex justify-end">
            <Button
              leftIcon={<Plus className="h-4 w-4" />}
              isLoading={createMut.isPending}
              onClick={submitCreate}
            >
              Add reply
            </Button>
          </div>
        </div>

        {/* List */}
        <div className="mt-4 border-t border-[var(--border)] pt-4">
          {isLoading && (
            <p className="flex items-center justify-center gap-2 py-6 text-sm text-[var(--text-muted)]">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading saved replies…
            </p>
          )}
          {isError && (
            <p className="py-4 text-center text-sm text-red-600">Failed to load saved replies.</p>
          )}
          {!isLoading && !isError && replies.length === 0 && (
            <p className="py-6 text-center text-sm text-[var(--text-muted)]">
              No saved replies yet.
            </p>
          )}

          {!isLoading && !isError && replies.length > 0 && (
            <ul className="space-y-2">
              {replies.map((reply) => (
                <li
                  key={reply.id}
                  className="rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] p-3"
                >
                  {editingId === reply.id ? (
                    <div className="space-y-3">
                      <Input
                        label="Title"
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        placeholder="e.g. Office hours"
                      />
                      <FormattedTextarea
                        label="Message"
                        value={editText}
                        onChange={setEditText}
                        rows={3}
                        placeholder="Type the reusable message…"
                      />
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="secondary"
                          leftIcon={<X className="h-4 w-4" />}
                          onClick={cancelEdit}
                        >
                          Cancel
                        </Button>
                        <Button
                          isLoading={updateMut.isPending && updateMut.variables?.id === reply.id}
                          onClick={() => submitEdit(reply.id)}
                        >
                          Save
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-[var(--text)]">{reply.title}</p>
                        <p className="mt-0.5 line-clamp-2 text-sm whitespace-pre-wrap text-[var(--text-muted)]">
                          {reply.text}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          tooltip="Edit"
                          onClick={() => startEdit(reply)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          tooltip="Delete"
                          isLoading={deleteMut.isPending && deleteMut.variables === reply.id}
                          onClick={() => handleDelete(reply)}
                        >
                          <Trash2 className="h-4 w-4 text-red-600" />
                        </Button>
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
