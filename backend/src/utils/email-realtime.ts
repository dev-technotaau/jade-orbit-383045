import { getIO } from '../socket';

/**
 * Email replies-inbox real-time fan-out. Super-admin/admin sockets auto-join the
 * `email:inbox` room (see socket.ts); an open thread additionally joins
 * `email:thread:{id}`. Emitting is best-effort — never throws into callers.
 */
const INBOX_ROOM = 'email:inbox';
const threadRoom = (id: string) => `email:thread:${id}`;

export function emitEmail(event: string, payload: unknown, threadId?: string): void {
  try {
    const io = getIO();
    io.to(INBOX_ROOM).emit(event, payload);
    if (threadId) io.to(threadRoom(threadId)).emit(event, payload);
  } catch {
    /* socket not initialised yet — non-critical */
  }
}
