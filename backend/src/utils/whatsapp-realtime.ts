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
    io.to(INBOX_ROOM).emit(event, payload);
    if (conversationId) io.to(convRoom(conversationId)).emit(event, payload);
  } catch {
    /* socket not initialised yet — non-critical */
  }
}
