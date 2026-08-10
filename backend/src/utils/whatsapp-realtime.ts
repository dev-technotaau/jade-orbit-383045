import { getIO } from '../socket';

/**
 * WhatsApp inbox real-time fan-out. Super-admin/admin sockets auto-join the
 * `wa:inbox` room (see socket.ts); an open thread additionally joins
 * `wa:conv:{id}`. Emitting is best-effort — never throws into callers.
 */
const INBOX_ROOM = 'wa:inbox';
const convRoom = (id: string) => `wa:conv:${id}`;

export function emitWa(event: string, payload: unknown, conversationId?: string): void {
  try {
    const io = getIO();
    // ONE emit, chained rooms. Every client joins `wa:inbox` on connect and also
    // joins `wa:conv:<id>` when it opens a thread, so the socket viewing that
    // thread is in both — and two separate emits deliver to it twice. Socket.IO
    // dedupes across rooms within a single emit, but not across emits. The
    // duplicate delivery double-counted the "new messages" badge and fired
    // markRead twice for every inbound message on the open conversation.
    if (conversationId) {
      io.to(INBOX_ROOM).to(convRoom(conversationId)).emit(event, payload);
    } else {
      io.to(INBOX_ROOM).emit(event, payload);
    }
  } catch {
    /* socket not initialised yet — non-critical */
  }
}
