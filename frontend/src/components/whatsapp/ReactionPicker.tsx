'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { SmilePlus, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import Tooltip from '@/components/ui/Tooltip';
import { showToast } from '@/components/ui/Toast';
import { whatsappService as svc } from '@/services/whatsapp.service';
import type { ApiError } from '@/types/api';

const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏', '🔥', '✅'];

/**
 * Tiny react-with-emoji control shown on inbound message bubbles. Calls
 * `sendReaction(conversationId, wamid, emoji)`.
 */
export default function ReactionPicker({
  conversationId,
  wamid,
}: {
  conversationId: string;
  wamid: string;
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const reactMut = useMutation({
    mutationFn: (emoji: string) => svc.sendReaction(conversationId, wamid, emoji),
    onSuccess: () => {
      setOpen(false);
      qc.invalidateQueries({ queryKey: ['wa-messages', conversationId] });
    },
    onError: (e) => showToast.error((e as unknown as ApiError).message || 'Failed to react'),
  });

  return (
    <div className="relative">
      <Tooltip content="React">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label="React to message"
          aria-expanded={open}
          className="flex h-6 w-6 items-center justify-center rounded-full text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-secondary)] hover:text-[var(--text)]"
        >
          {reactMut.isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <SmilePlus className="h-3.5 w-3.5" />
          )}
        </button>
      </Tooltip>
      {open && (
        <div
          className={cn(
            'absolute bottom-7 left-0 z-30 flex items-center gap-0.5 rounded-full border border-[var(--border)]',
            'bg-white px-1.5 py-1 shadow-lg',
          )}
          role="menu"
        >
          {QUICK_REACTIONS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              role="menuitem"
              aria-label={`React ${emoji}`}
              onClick={() => reactMut.mutate(emoji)}
              disabled={reactMut.isPending}
              className="rounded-full px-1 text-base leading-none transition-transform hover:scale-125 disabled:opacity-50"
            >
              {emoji}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
