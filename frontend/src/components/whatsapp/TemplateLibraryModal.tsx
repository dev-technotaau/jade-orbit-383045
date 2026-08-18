'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BookOpen, ChevronLeft, Loader2, Search, X } from 'lucide-react';
import DialogShell from '@/components/ui/DialogShell';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';
import Select from '@/components/ui/Select';
import { showToast } from '@/components/ui/Toast';
import { cn } from '@/lib/utils';
import { whatsappService as svc } from '@/services/whatsapp.service';
import { LANGUAGE_OPTIONS } from '@/components/whatsapp/TemplateBuilder';
import type { WaLibraryTemplate } from '@/types/whatsapp';
import type { ApiError } from '@/types/api';

const CATEGORY_OPTIONS = [
  { value: '', label: 'All categories' },
  { value: 'UTILITY', label: 'Utility (transactional)' },
  { value: 'MARKETING', label: 'Marketing (promotional)' },
  { value: 'AUTHENTICATION', label: 'Authentication (OTP)' },
];

/** Meta's own category strings, mapped onto ours (they are the same three). */
const asCategory = (raw: string | undefined): string => {
  const up = (raw ?? '').toUpperCase();
  return ['MARKETING', 'UTILITY', 'AUTHENTICATION'].includes(up) ? up : 'UTILITY';
};

/** A library button the operator has to fill in before the template can be created. */
interface ButtonInputDraft {
  type: string;
  label: string;
  /** URL buttons: the link, with {{1}} where the per-send suffix goes. */
  baseUrl: string;
  /** URL buttons: a complete example link, which Meta reviews. */
  urlExample: string;
  /** PHONE_NUMBER buttons: the number to dial. */
  phoneNumber: string;
}

/**
 * Browse and instantiate one of Meta's pre-approved library templates.
 *
 * A library template is approved INSTANTLY — no review queue, no rejection with
 * the name spent — which is the fastest route to a working template on a new
 * WABA, and was not reachable from this console at all. The content is Meta's
 * and cannot be edited here, so there is no component editor: only the name, the
 * language and the button inputs the library entry leaves blank.
 */
export default function TemplateLibraryModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [selected, setSelected] = useState<WaLibraryTemplate | null>(null);

  // Fill-in state for the selected entry.
  const [name, setName] = useState('');
  const [language, setLanguage] = useState('en_US');
  const [buttonInputs, setButtonInputs] = useState<ButtonInputDraft[]>([]);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['wa-template-library', search, category],
    queryFn: () =>
      svc.listLibraryTemplates({ search: search || undefined, category: category || undefined }),
  });
  const items = data?.data?.items ?? [];
  /** Meta does not expose the library edge to this WABA — a capability answer, not a failure. */
  const unavailable = data?.data?.unavailable === true;

  /** Move to the fill-in step, prefilled from the library entry. */
  const pick = (entry: WaLibraryTemplate) => {
    setSelected(entry);
    // Meta's library names are already lowercase snake_case, which is exactly
    // the shape a template name has to be.
    setName(entry.name.toLowerCase().replace(/[^a-z0-9_]/g, '_'));
    setLanguage(entry.language || 'en_US');
    setButtonInputs(
      (entry.buttons ?? [])
        .filter((b) => ['URL', 'PHONE_NUMBER'].includes((b.type ?? '').toUpperCase()))
        .map((b) => ({
          type: (b.type ?? '').toUpperCase(),
          label: b.text ?? b.type ?? '',
          baseUrl: b.url ?? '',
          urlExample: '',
          phoneNumber: b.phone_number ?? '',
        })),
    );
  };

  const updateInput = (index: number, patch: Partial<ButtonInputDraft>) =>
    setButtonInputs((prev) => prev.map((b, i) => (i === index ? { ...b, ...patch } : b)));

  const createMut = useMutation({
    mutationFn: () =>
      svc.createTemplateFromLibrary({
        name: name.trim(),
        language: language.trim(),
        category: asCategory(selected?.category),
        libraryTemplateName: selected!.name,
        // Forwarded verbatim: the payload shape is Meta's, and it validates it.
        buttonInputs: buttonInputs.map((b) =>
          b.type === 'URL'
            ? {
                type: 'URL',
                url: { base_url: b.baseUrl.trim(), url_suffix_example: b.urlExample.trim() },
              }
            : { type: 'PHONE_NUMBER', phone_number: b.phoneNumber.trim() },
        ),
      }),
    onSuccess: () => {
      showToast.success('Template created from Meta’s library');
      qc.invalidateQueries({ queryKey: ['wa-templates'] });
      onClose();
    },
    onError: (e) =>
      showToast.error((e as unknown as ApiError).message || 'Failed to create from library'),
  });

  const submit = () => {
    if (!/^[a-z0-9_]+$/.test(name)) {
      return showToast.error('Name must be lowercase letters, numbers and underscores');
    }
    if (!language.trim()) return showToast.error('Choose a language');
    for (const b of buttonInputs) {
      if (b.type === 'URL') {
        // Meta reviews the example link, and rejects the create outright when it
        // is missing — with an error that names no button.
        if (!b.baseUrl.trim()) return showToast.error(`Enter the link for "${b.label}"`);
        if (!b.urlExample.trim()) return showToast.error(`Enter an example link for "${b.label}"`);
      } else if (!b.phoneNumber.trim()) {
        return showToast.error(`Enter the phone number for "${b.label}"`);
      }
    }
    createMut.mutate();
  };

  return (
    <DialogShell onClose={onClose} label="Template library">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl bg-white shadow-xl">
        <div className="flex shrink-0 items-center justify-between border-b border-[var(--border)] px-6 py-4">
          <div className="flex items-center gap-2">
            {selected && (
              <button
                onClick={() => setSelected(null)}
                className="rounded p-1 hover:bg-[var(--bg-secondary)]"
                aria-label="Back to the library"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
            )}
            <h2 className="flex items-center gap-2 text-lg font-bold text-[var(--text)]">
              <BookOpen className="h-5 w-5 text-emerald-600" />
              {selected ? selected.name : 'Meta template library'}
            </h2>
          </div>
          <button onClick={onClose} className="rounded p-1 hover:bg-[var(--bg-secondary)]">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-6">
          {!selected ? (
            <>
              <p className="text-xs text-[var(--text-muted)]">
                These templates are written and pre-approved by Meta, so one created from here is
                usable immediately instead of waiting on a review that can come back rejected with
                the name already spent.
              </p>
              <div className="flex flex-wrap items-end gap-3">
                <div className="relative min-w-[12rem] flex-1">
                  <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search the library…"
                    className="pl-9"
                  />
                </div>
                <div className="w-48">
                  <Select value={category} onChange={setCategory} options={CATEGORY_OPTIONS} />
                </div>
              </div>

              {isLoading && (
                <div className="flex items-center justify-center gap-2 py-10 text-sm text-[var(--text-muted)]">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading Meta’s library…
                </div>
              )}
              {/* `unavailable` is the normal answer when Meta does not expose the
                  library edge to this WABA — it now arrives as a 200 rather than a
                  502, so the dialog explains it without a console full of errors.
                  isError stays for genuine failures (timeout, token, outage). */}
              {!isLoading && (isError || unavailable) && (
                <p className="py-10 text-center text-sm text-[var(--text-muted)]">
                  Meta’s template library could not be loaded. It is only available to WhatsApp
                  Business Accounts Meta has enabled it for.
                </p>
              )}
              {!isLoading && !isError && !unavailable && items.length === 0 && (
                <p className="py-10 text-center text-sm text-[var(--text-muted)]">
                  No library templates matched.
                </p>
              )}

              <div className="space-y-2">
                {items.map((entry) => (
                  <button
                    key={entry.id ?? `${entry.name}-${entry.language}`}
                    type="button"
                    onClick={() => pick(entry)}
                    className="w-full rounded-lg border border-[var(--border)] p-3 text-left transition-colors hover:bg-[var(--bg-secondary)]"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-[var(--text)]">{entry.name}</span>
                      {entry.language && (
                        <span className="rounded bg-[var(--bg-secondary)] px-1.5 py-0.5 text-[10px] text-[var(--text-muted)]">
                          {entry.language}
                        </span>
                      )}
                      {entry.category && (
                        <span className="rounded bg-[var(--bg-secondary)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--text-secondary)]">
                          {entry.category}
                        </span>
                      )}
                    </div>
                    {entry.body && (
                      <p className="mt-1 line-clamp-2 text-xs text-[var(--text-muted)]">
                        {entry.body}
                      </p>
                    )}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <>
              {/* Read-only: the content belongs to Meta, which is exactly why it
                  is approved on the spot. */}
              <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] p-3">
                <p className="text-xs font-semibold text-[var(--text-muted)]">Meta’s content</p>
                {selected.header && (
                  <p className="mt-1.5 text-sm font-semibold text-[var(--text)]">
                    {selected.header}
                  </p>
                )}
                <p className="mt-1 text-sm whitespace-pre-wrap text-[var(--text-secondary)]">
                  {selected.body || 'This library template has no body text.'}
                </p>
                {selected.footer && (
                  <p className="mt-1 text-[11px] text-[var(--text-muted)]">{selected.footer}</p>
                )}
                {(selected.buttons ?? []).length > 0 && (
                  <div className="mt-2 space-y-1 border-t border-[var(--border)] pt-2">
                    {(selected.buttons ?? []).map((b, i) => (
                      <p key={i} className="text-[11px] text-[var(--text-muted)]">
                        {b.text || b.type} · {b.type}
                      </p>
                    ))}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Input
                  label="Name"
                  value={name}
                  onChange={(e) =>
                    setName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'))
                  }
                  helperText="Claimed permanently at Meta once created."
                />
                <Select
                  label="Language"
                  options={LANGUAGE_OPTIONS}
                  value={language}
                  onChange={setLanguage}
                  searchable
                  clearable={false}
                />
              </div>

              {buttonInputs.length > 0 && (
                <div className="space-y-3 rounded-lg border border-[var(--border)] p-3">
                  <p className="text-xs font-semibold text-[var(--text-muted)]">
                    Button details — the only part of a library template that is yours to fill in
                  </p>
                  {buttonInputs.map((b, i) => (
                    <div key={i} className="space-y-2">
                      <p className="text-xs font-medium text-[var(--text)]">
                        {b.label}{' '}
                        <span className="font-normal text-[var(--text-muted)]">({b.type})</span>
                      </p>
                      {b.type === 'URL' ? (
                        <>
                          <Input
                            label="Link"
                            value={b.baseUrl}
                            onChange={(e) => updateInput(i, { baseUrl: e.target.value })}
                            placeholder="https://example.com/orders/{{1}}"
                          />
                          <Input
                            label="Example link"
                            value={b.urlExample}
                            onChange={(e) => updateInput(i, { urlExample: e.target.value })}
                            placeholder="https://example.com/orders/12345"
                            helperText="Meta reviews this example; the create fails without it."
                          />
                        </>
                      ) : (
                        <Input
                          label="Phone number"
                          value={b.phoneNumber}
                          onChange={(e) => updateInput(i, { phoneNumber: e.target.value })}
                          placeholder="+919876543210"
                        />
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        <div
          className={cn(
            'flex shrink-0 justify-end gap-2 border-t border-[var(--border)] px-6 py-4',
          )}
        >
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          {selected && (
            <Button onClick={submit} isLoading={createMut.isPending}>
              Create template
            </Button>
          )}
        </div>
      </div>
    </DialogShell>
  );
}
