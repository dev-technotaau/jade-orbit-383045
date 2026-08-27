'use client';

import { useEffect, useState } from 'react';
import type { Socket } from 'socket.io-client';

/**
 * Who else has this conversation open.
 *
 * Two operators could open the same thread and each type a reply with no sign of
 * the other, so the customer received the same answer twice in different words —
 * or two different answers. Nothing in the product said a colleague was already
 * there.
 *
 * Its own hook rather than another block inside the inbox page: that component
 * is large enough that the React Compiler stops optimising it when it grows, and
 * the presence state has no reason to live there. It also keeps the heartbeat
 * next to the state it refreshes.
 */
export function useThreadViewers(
  socket: Socket | null,
  conversationId: string | null,
  /** This operator's own label, so they are excluded from their own warning. */
  operatorLabel: string | undefined,
  emit: (event: string, payload: unknown) => void,
): string[] {
  /**
   * Scoped BY conversation in the state itself.
   *
   * The same shape the page's `mediaPick` uses, and for the same reason: a
   * thread switch then needs no reset step to forget, so the previous thread's
   * viewers cannot render over the new one while its first frame is in flight.
   */
  const [viewers, setViewers] = useState<{ convId: string | null; list: string[] }>({
    convId: null,
    list: [],
  });

  useEffect(() => {
    if (!socket) return;
    const onViewers = (p: { conversationId: string; viewers?: string[] }) => {
      setViewers({ convId: p.conversationId, list: p.viewers ?? [] });
    };
    socket.on('wa:viewers', onViewers);
    return () => {
      socket.off('wa:viewers', onViewers);
    };
  }, [socket]);

  useEffect(() => {
    if (!conversationId) return;
    /**
     * Keep the server entry alive.
     *
     * It expires on its own so a closed laptop cannot be reported as a live
     * colleague; a tab that IS still open has to keep saying so. Well inside the
     * server's window, because a missed beat would flicker this operator out of
     * their colleagues' viewer list and straight back in.
     */
    const beat = window.setInterval(() => emit('wa:viewing', conversationId), 20_000);
    return () => window.clearInterval(beat);
  }, [conversationId, emit]);

  if (viewers.convId !== conversationId) return [];
  return viewers.list.filter((v) => v !== operatorLabel);
}
