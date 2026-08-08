'use client';

import { Mail, Phone, UserCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Renders a WhatsApp 'CONTACTS' message inside a chat bubble.
 *
 * The WhatsApp contacts payload is an ARRAY of contact objects with all fields
 * optional. We never trust its shape — `parseContacts` defensively narrows the
 * `unknown` payload (Array.isArray + object/string guards) into a flat, typed
 * list before render. If nothing usable survives parsing we show a minimal
 * "Shared a contact" fallback.
 */

type ParsedContact = {
  name: string;
  phones: string[];
  emails: string[];
  org?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/** Extract a list of trimmed string values from `key` across an array of objects. */
function collectStrings(input: unknown, key: string): string[] {
  if (!Array.isArray(input)) return [];
  const out: string[] = [];
  for (const item of input) {
    if (!isRecord(item)) continue;
    const value = asString(item[key]);
    if (value) out.push(value);
  }
  // De-duplicate while preserving order.
  return Array.from(new Set(out));
}

function parseName(raw: unknown, fallbackPhone?: string): string {
  if (isRecord(raw)) {
    const formatted = asString(raw.formatted_name);
    if (formatted) return formatted;
    const first = asString(raw.first_name);
    const last = asString(raw.last_name);
    const joined = [first, last].filter(Boolean).join(' ').trim();
    if (joined) return joined;
  }
  return fallbackPhone || 'Contact';
}

function parseOrg(raw: unknown): string | undefined {
  if (!isRecord(raw)) return undefined;
  const company = asString(raw.company);
  const title = asString(raw.title);
  if (company && title) return `${title} at ${company}`;
  return title || company || undefined;
}

function parseContacts(payload: unknown): ParsedContact[] {
  if (!Array.isArray(payload)) return [];
  const contacts: ParsedContact[] = [];

  for (const entry of payload) {
    if (!isRecord(entry)) continue;

    const phones = collectStrings(entry.phones, 'phone');
    const emails = collectStrings(entry.emails, 'email');
    const name = parseName(entry.name, phones[0]);
    const org = parseOrg(entry.org);

    // Skip entries that carry no usable information at all.
    if (name === 'Contact' && phones.length === 0 && emails.length === 0 && !org) {
      continue;
    }

    contacts.push({ name, phones, emails, org });
  }

  return contacts;
}

export default function MessageContact({ payload }: { payload: unknown }) {
  const contacts = parseContacts(payload);

  if (contacts.length === 0) {
    return (
      <div className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
        <UserCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span>Shared a contact</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {contacts.map((contact, i) => (
        <div
          key={`${contact.name}-${i}`}
          className={cn(
            'flex items-start gap-2.5 rounded-lg border border-[var(--border)]',
            'bg-[var(--bg-secondary)] p-2.5',
          )}
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--bg)] text-[var(--text-muted)]">
            <UserCircle2 className="h-6 w-6" aria-hidden="true" />
          </div>

          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-[var(--text)]">{contact.name}</p>

            {contact.org && (
              <p className="truncate text-xs text-[var(--text-muted)]">{contact.org}</p>
            )}

            {(contact.phones.length > 0 || contact.emails.length > 0) && (
              <div className="mt-1.5 space-y-1">
                {contact.phones.map((phone, pi) => (
                  <a
                    key={`phone-${pi}`}
                    href={`tel:${phone}`}
                    className="flex items-center gap-1.5 text-xs text-[var(--text)] hover:underline"
                  >
                    <Phone
                      className="h-3 w-3 shrink-0 text-[var(--text-muted)]"
                      aria-hidden="true"
                    />
                    <span className="truncate">{phone}</span>
                  </a>
                ))}

                {contact.emails.map((email, ei) => (
                  <a
                    key={`email-${ei}`}
                    href={`mailto:${email}`}
                    className="flex items-center gap-1.5 text-xs text-[var(--text)] hover:underline"
                  >
                    <Mail
                      className="h-3 w-3 shrink-0 text-[var(--text-muted)]"
                      aria-hidden="true"
                    />
                    <span className="truncate">{email}</span>
                  </a>
                ))}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
