/**
 * The emoji the composer offers, and the recents list it learns.
 *
 * The composer shipped sixteen hard-coded literals with no search and no
 * categories, and `ReactionPicker` had a second, different eight. An operator
 * who wanted anything else — a flag, a currency, the fruit the customer just
 * asked about — had to leave the app and paste it in.
 *
 * A full Unicode set is deliberately not bundled: ~1,900 entries plus keyword
 * indexes, shipped on every page load for a control most sessions never open.
 * This is a curated working set across the categories a business conversation
 * actually uses, keyworded so search finds them by intent ("thanks" → 🙏)
 * rather than only by name.
 */
export interface EmojiEntry {
  char: string;
  /** Search terms. The first doubles as the accessible name. */
  keywords: readonly string[];
}

export interface EmojiCategory {
  id: string;
  label: string;
  emojis: readonly EmojiEntry[];
}

const e = (char: string, ...keywords: string[]): EmojiEntry => ({ char, keywords });

export const EMOJI_CATEGORIES: readonly EmojiCategory[] = [
  {
    id: 'smileys',
    label: 'Smileys & people',
    emojis: [
      e('😀', 'grin', 'happy', 'smile'),
      e('😃', 'smiley', 'happy'),
      e('😄', 'laugh', 'happy'),
      e('😁', 'beam', 'grin'),
      e('😆', 'laughing', 'lol'),
      e('😅', 'sweat smile', 'phew', 'nervous'),
      e('😂', 'joy', 'lol', 'crying laughing'),
      e('🤣', 'rofl', 'lol'),
      e('🙂', 'slight smile'),
      e('😊', 'blush', 'smile', 'happy'),
      e('😇', 'innocent', 'angel'),
      e('😍', 'heart eyes', 'love'),
      e('😘', 'kiss'),
      e('😉', 'wink'),
      e('😎', 'cool', 'sunglasses'),
      e('🤗', 'hug'),
      e('🤔', 'thinking', 'hmm'),
      e('😐', 'neutral'),
      e('😴', 'sleep', 'tired'),
      e('😢', 'cry', 'sad'),
      e('😭', 'sob', 'crying', 'sad'),
      e('😳', 'flushed', 'shocked'),
      e('😱', 'scream', 'shock'),
      e('😡', 'angry', 'mad'),
      e('🙄', 'eye roll'),
      e('😬', 'grimace', 'awkward'),
      e('🤝', 'handshake', 'deal', 'agree'),
      e('🙏', 'pray', 'thanks', 'please'),
      e('👋', 'wave', 'hi', 'hello', 'bye'),
      e('👍', 'thumbs up', 'ok', 'yes', 'good'),
      e('👎', 'thumbs down', 'no', 'bad'),
      e('👏', 'clap', 'applause', 'well done'),
      e('🙌', 'raised hands', 'celebrate'),
      e('💪', 'strong', 'muscle'),
      e('🫡', 'salute', 'on it'),
      e('👌', 'ok hand', 'perfect'),
      e('✌️', 'peace'),
      e('🤞', 'fingers crossed', 'hope'),
      e('👀', 'eyes', 'looking'),
    ],
  },
  {
    id: 'symbols',
    label: 'Status & symbols',
    emojis: [
      e('✅', 'check', 'done', 'yes', 'tick'),
      e('❌', 'cross', 'no', 'wrong', 'cancel'),
      e('⚠️', 'warning', 'caution'),
      e('❗', 'exclamation', 'important'),
      e('❓', 'question'),
      e('💯', 'hundred', 'perfect'),
      e('🔥', 'fire', 'hot', 'trending'),
      e('⭐', 'star', 'favourite'),
      e('🌟', 'glowing star'),
      e('✨', 'sparkles', 'new'),
      e('🎉', 'party', 'celebrate', 'congrats'),
      e('🎊', 'confetti', 'celebrate'),
      e('🚀', 'rocket', 'launch', 'fast'),
      e('💡', 'idea', 'lightbulb', 'tip'),
      e('🔔', 'bell', 'reminder', 'notification'),
      e('🔒', 'lock', 'secure', 'private'),
      e('🔑', 'key', 'password', 'access'),
      e('🛠️', 'tools', 'fix', 'repair'),
      e('⏰', 'alarm', 'time', 'deadline'),
      e('⏳', 'hourglass', 'waiting', 'pending'),
      e('📅', 'calendar', 'date', 'schedule'),
      e('📌', 'pin', 'important'),
      e('📎', 'clip', 'attachment'),
      e('🔗', 'link', 'url'),
      e('♻️', 'recycle', 'refresh'),
      e('🆕', 'new'),
      e('🆗', 'ok'),
      e('🔴', 'red circle', 'urgent'),
      e('🟢', 'green circle', 'live', 'online'),
      e('🟡', 'yellow circle', 'pending'),
    ],
  },
  {
    id: 'business',
    label: 'Work & commerce',
    emojis: [
      e('💼', 'briefcase', 'work', 'business'),
      e('📞', 'phone', 'call'),
      e('📱', 'mobile', 'phone'),
      e('💬', 'chat', 'message', 'comment'),
      e('📧', 'email', 'mail'),
      e('📩', 'incoming mail'),
      e('📝', 'note', 'write', 'form'),
      e('📄', 'document', 'page', 'file'),
      e('📊', 'chart', 'report', 'stats'),
      e('📈', 'up', 'growth', 'increase'),
      e('📉', 'down', 'decrease', 'loss'),
      e('🧾', 'receipt', 'invoice', 'bill'),
      e('💳', 'card', 'payment', 'credit'),
      e('💰', 'money', 'payment', 'cash'),
      e('💵', 'dollar', 'money'),
      e('🏦', 'bank'),
      e('🛒', 'cart', 'shopping', 'order'),
      e('🛍️', 'bags', 'shopping', 'purchase'),
      e('📦', 'package', 'parcel', 'delivery', 'shipping'),
      e('🚚', 'truck', 'delivery', 'shipping'),
      e('🏠', 'home', 'house', 'address'),
      e('🏢', 'office', 'building', 'company'),
      e('📍', 'location', 'address', 'map pin'),
      e('🗺️', 'map', 'directions'),
      e('🎁', 'gift', 'offer', 'present'),
      e('🏷️', 'tag', 'label', 'price'),
      e('🎫', 'ticket', 'coupon'),
      e('👨‍💻', 'developer', 'support', 'agent'),
      e('🧑‍🔧', 'technician', 'engineer'),
      e('🆔', 'id', 'identity'),
    ],
  },
  {
    id: 'life',
    label: 'Life & travel',
    emojis: [
      e('❤️', 'heart', 'love', 'red heart'),
      e('🧡', 'orange heart'),
      e('💛', 'yellow heart'),
      e('💚', 'green heart'),
      e('💙', 'blue heart'),
      e('💜', 'purple heart'),
      e('🖤', 'black heart'),
      e('💔', 'broken heart'),
      e('☕', 'coffee', 'tea', 'break'),
      e('🍽️', 'food', 'meal', 'restaurant'),
      e('🍕', 'pizza', 'food'),
      e('🎂', 'birthday cake', 'birthday'),
      e('🍰', 'cake', 'dessert'),
      e('🥳', 'party face', 'celebrate', 'birthday'),
      e('🌞', 'sun', 'morning', 'good morning'),
      e('🌙', 'moon', 'night', 'good night'),
      e('☔', 'rain', 'weather'),
      e('❄️', 'snow', 'cold', 'winter'),
      e('🌳', 'tree', 'nature'),
      e('🌸', 'flower', 'blossom'),
      e('💐', 'bouquet', 'flowers', 'congrats'),
      e('✈️', 'plane', 'flight', 'travel'),
      e('🚗', 'car', 'drive'),
      e('🚕', 'taxi', 'cab'),
      e('🚉', 'train', 'station'),
      e('🏥', 'hospital', 'clinic', 'medical'),
      e('🎓', 'graduation', 'education', 'course'),
      e('🏆', 'trophy', 'win', 'award'),
      e('⚽', 'football', 'soccer', 'sport'),
      e('🎵', 'music', 'song'),
    ],
  },
] as const;

/** Flat index, built once at module load. */
const ALL: readonly EmojiEntry[] = EMOJI_CATEGORIES.flatMap((c) => c.emojis);

/**
 * Search by keyword.
 *
 * Prefix matches rank above substring ones, so "car" offers 🚗 before anything
 * that merely contains those letters. Duplicates are collapsed by character.
 */
export function searchEmoji(query: string, limit = 48): EmojiEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const prefix: EmojiEntry[] = [];
  const contains: EmojiEntry[] = [];
  const seen = new Set<string>();
  for (const entry of ALL) {
    if (seen.has(entry.char)) continue;
    if (entry.keywords.some((k) => k.startsWith(q))) {
      prefix.push(entry);
      seen.add(entry.char);
    } else if (entry.keywords.some((k) => k.includes(q))) {
      contains.push(entry);
      seen.add(entry.char);
    }
  }
  return [...prefix, ...contains].slice(0, limit);
}

/** Accessible name for a character, falling back to the character itself. */
export function emojiLabel(char: string): string {
  return ALL.find((entry) => entry.char === char)?.keywords[0] ?? char;
}

const RECENTS_KEY = 'wa-emoji-recents';
const RECENTS_MAX = 16;

/**
 * Recently used emoji, most recent first.
 *
 * Per-device, like the inbox sound preference (`wa-notify.ts`) — an operator's
 * shortcuts belong to their machine, not to the shared account. Every access is
 * wrapped: a private window with site data blocked throws on `localStorage`, and
 * that must not take down the picker.
 */
export function loadEmojiRecents(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(RECENTS_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((v): v is string => typeof v === 'string').slice(0, RECENTS_MAX);
  } catch {
    return [];
  }
}

/** Record a pick and return the new list, so the caller can render it at once. */
export function pushEmojiRecent(char: string): string[] {
  const next = [char, ...loadEmojiRecents().filter((c) => c !== char)].slice(0, RECENTS_MAX);
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(RECENTS_KEY, JSON.stringify(next));
    } catch {
      /* a device that cannot remember is still a working picker */
    }
  }
  return next;
}
