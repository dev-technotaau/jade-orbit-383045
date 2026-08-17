'use client';

import { useRef, useState } from 'react';
import { Paperclip, Image as ImageIcon, Music, FileText, Contact, MapPin } from 'lucide-react';
import { assertWaMediaSize } from '@/constants/config';
import { showToast } from '@/components/ui/Toast';

/**
 * Composer attach button + popup menu of attachment categories.
 * Replaces a single generic file input with category-scoped pickers that set
 * the right `accept` filter per option (Photos & Videos / Audio / Document).
 * The chosen files are handed back via `onPickFiles` for the composer to queue
 * and upload.
 */
export default function AttachMenu({
  onPickFiles,
  onContact,
  onLocation,
  disabled,
}: {
  /**
   * Every file the operator selected, in the order they were listed. Sending five
   * photos used to mean five separate trips through this menu because the inputs
   * took one file each.
   */
  onPickFiles: (files: File[]) => void;
  /** Opens the contact composer (sends a WhatsApp contact card). */
  onContact?: () => void;
  /** Opens the location composer (sends a WhatsApp location pin). */
  onLocation?: () => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const mediaInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const documentInputRef = useRef<HTMLInputElement>(null);

  const pick = (ref: React.RefObject<HTMLInputElement | null>) => {
    setOpen(false);
    ref.current?.click();
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (picked.length === 0) return;

    // Check the size HERE, not after a full upload. Without this a 30 MB video
    // uploaded all the way to the BFF and came back as a generic "Something
    // went wrong" — no size mentioned, nothing to act on. The limit is WhatsApp's
    // own, per kind: a document may be 100 MB, an image only 5.
    //
    // One oversized file in a multi-file pick is reported and dropped on its own;
    // refusing the whole selection would make the operator re-pick everything.
    const accepted: File[] = [];
    for (const file of picked) {
      try {
        assertWaMediaSize(file);
        accepted.push(file);
      } catch (err) {
        showToast.error(err instanceof Error ? err.message : 'File is too large');
      }
    }
    if (accepted.length > 0) onPickFiles(accepted);
  };

  const options: Array<{
    label: string;
    icon: typeof Paperclip;
    ref: React.RefObject<HTMLInputElement | null>;
  }> = [
    { label: 'Photos & Videos', icon: ImageIcon, ref: mediaInputRef },
    { label: 'Audio', icon: Music, ref: audioInputRef },
    { label: 'Document', icon: FileText, ref: documentInputRef },
  ];

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        aria-label="Attach"
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex h-10 items-center rounded-lg px-2 text-[var(--text-muted)] hover:bg-[var(--bg-secondary)] hover:text-[var(--text)] disabled:opacity-60"
      >
        <Paperclip className="h-5 w-5" />
      </button>

      {/* Hidden category-scoped file inputs */}
      <input
        ref={mediaInputRef}
        type="file"
        multiple
        accept="image/*,video/mp4,video/3gpp"
        onChange={handleChange}
        className="hidden"
      />
      <input
        ref={audioInputRef}
        type="file"
        multiple
        accept="audio/*"
        onChange={handleChange}
        className="hidden"
      />
      <input
        ref={documentInputRef}
        type="file"
        multiple
        accept="*/*"
        onChange={handleChange}
        className="hidden"
      />

      {open && (
        <>
          {/* Click-away backdrop */}
          <button
            type="button"
            aria-hidden="true"
            tabIndex={-1}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-20 cursor-default"
          />
          <div
            className="absolute bottom-12 left-0 z-30 w-48 overflow-hidden rounded-lg border border-[var(--border)] bg-white py-1 shadow-lg"
            role="menu"
          >
            {options.map(({ label, icon: Icon, ref }) => (
              <button
                key={label}
                type="button"
                role="menuitem"
                onClick={() => pick(ref)}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-[var(--text)] hover:bg-[var(--bg-secondary)]"
              >
                <Icon className="h-4 w-4 text-[var(--text-muted)]" />
                {label}
              </button>
            ))}
            {onContact && (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  onContact();
                }}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-[var(--text)] hover:bg-[var(--bg-secondary)]"
              >
                <Contact className="h-4 w-4 text-[var(--text-muted)]" />
                Contact
              </button>
            )}
            {/* Sending a pin was fully implemented server-side and had no UI at
                all, so an agent could see a customer's location and had no way to
                send the shop's back. */}
            {onLocation && (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  onLocation();
                }}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-[var(--text)] hover:bg-[var(--bg-secondary)]"
              >
                <MapPin className="h-4 w-4 text-[var(--text-muted)]" />
                Location
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
