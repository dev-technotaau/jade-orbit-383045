'use client';

import { useRef, useState } from 'react';
import { Paperclip, Image as ImageIcon, Music, FileText, Contact } from 'lucide-react';
import { assertUploadSize } from '@/constants/config';
import { showToast } from '@/components/ui/Toast';

/**
 * Composer attach button + popup menu of attachment categories.
 * Replaces a single generic file input with category-scoped pickers that set
 * the right `accept` filter per option (Photos & Videos / Audio / Document).
 * The chosen file is handed back via `onPickFile` for the composer to upload.
 */
export default function AttachMenu({
  onPickFile,
  onContact,
  disabled,
}: {
  onPickFile: (file: File) => void;
  /** Opens the contact composer (sends a WhatsApp contact card). */
  onContact?: () => void;
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
    const file = e.target.files?.[0];
    // Check the size HERE, not after a full upload. Without this a 30 MB video
    // uploaded all the way to the BFF and came back as a generic "Something
    // went wrong" — no size mentioned, nothing to act on.
    if (file) {
      try {
        assertUploadSize(file);
        onPickFile(file);
      } catch (err) {
        showToast.error(err instanceof Error ? err.message : 'File is too large');
      }
    }
    e.target.value = '';
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
        accept="image/*,video/mp4,video/3gpp"
        onChange={handleChange}
        className="hidden"
      />
      <input
        ref={audioInputRef}
        type="file"
        accept="audio/*"
        onChange={handleChange}
        className="hidden"
      />
      <input
        ref={documentInputRef}
        type="file"
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
          </div>
        </>
      )}
    </div>
  );
}
