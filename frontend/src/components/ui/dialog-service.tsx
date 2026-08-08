'use client';

/**
 * Imperative confirm / prompt dialogs backed by the custom ConfirmDialog + Modal
 * — a branded, consistent replacement for the browser's native
 * `window.confirm()` / `window.prompt()`.
 *
 * Usage (mirrors the native APIs, but async):
 *   if (!(await confirmDialog('Delete this?'))) return;
 *   const name = await promptDialog({ title: 'Rename', defaultValue: current });
 *   if (name === null) return; // cancelled
 *
 * Mount <DialogHost /> exactly once near the app root (next to the Toaster).
 */
import { useSyncExternalStore, useState } from 'react';
import ConfirmDialog from './ConfirmDialog';
import Modal from './Modal';
import Button from './Button';
import Input from './Input';
import Textarea from './Textarea';

// ── Confirm ───────────────────────────────────────────────────────────────────
export interface ConfirmOptions {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'warning';
}
interface ConfirmRequest extends ConfirmOptions {
  id: number;
  resolve: (value: boolean) => void;
}

// ── Prompt ────────────────────────────────────────────────────────────────────
export interface PromptOptions {
  title?: string;
  /** Label shown above the input. */
  label?: string;
  /** Optional explanatory text above the input. */
  message?: string;
  placeholder?: string;
  defaultValue?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Render a multi-line textarea instead of a single-line input. */
  multiline?: boolean;
  /** Disable the confirm button until a non-empty value is entered. */
  required?: boolean;
}
interface PromptRequest extends PromptOptions {
  id: number;
  resolve: (value: string | null) => void;
}

let confirmRequest: ConfirmRequest | null = null;
let promptRequest: PromptRequest | null = null;
let seq = 0;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}
function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/** Ask the user to confirm an action. Resolves true (confirmed) / false (cancelled). */
export function confirmDialog(options: ConfirmOptions | string): Promise<boolean> {
  const opts: ConfirmOptions = typeof options === 'string' ? { message: options } : options;
  return new Promise<boolean>((resolve) => {
    if (confirmRequest) confirmRequest.resolve(false); // supersede any open confirm
    seq += 1;
    confirmRequest = { id: seq, ...opts, resolve };
    emit();
  });
}

function resolveConfirm(value: boolean) {
  const req = confirmRequest;
  confirmRequest = null;
  emit();
  req?.resolve(value);
}

/** Ask the user for a text value. Resolves the string, or null if cancelled. */
export function promptDialog(options: PromptOptions | string): Promise<string | null> {
  const opts: PromptOptions = typeof options === 'string' ? { message: options } : options;
  return new Promise<string | null>((resolve) => {
    if (promptRequest) promptRequest.resolve(null);
    seq += 1;
    promptRequest = { id: seq, ...opts, resolve };
    emit();
  });
}

function resolvePrompt(value: string | null) {
  const req = promptRequest;
  promptRequest = null;
  emit();
  req?.resolve(value);
}

function getConfirmSnapshot() {
  return confirmRequest;
}
function getPromptSnapshot() {
  return promptRequest;
}

function ConfirmSlot() {
  const req = useSyncExternalStore(subscribe, getConfirmSnapshot, getConfirmSnapshot);
  return (
    <ConfirmDialog
      isOpen={!!req}
      onClose={() => resolveConfirm(false)}
      onConfirm={() => resolveConfirm(true)}
      title={req?.title ?? 'Are you sure?'}
      message={req?.message ?? ''}
      confirmLabel={req?.confirmLabel}
      cancelLabel={req?.cancelLabel}
      variant={req?.variant ?? 'danger'}
    />
  );
}

function PromptSlot() {
  const req = useSyncExternalStore(subscribe, getPromptSnapshot, getPromptSnapshot);
  const [value, setValue] = useState('');
  // Seed the field from defaultValue when a new prompt opens (render-phase sync,
  // React's "adjust state when a prop changes" pattern — no effect needed).
  const [syncedId, setSyncedId] = useState<number | null>(null);
  const activeId = req?.id ?? null;
  if (activeId !== syncedId) {
    setSyncedId(activeId);
    if (req) setValue(req.defaultValue ?? '');
  }

  const canSubmit = !req?.required || value.trim().length > 0;
  const submit = () => {
    if (!canSubmit) return;
    resolvePrompt(value);
  };

  return (
    <Modal
      isOpen={!!req}
      onClose={() => resolvePrompt(null)}
      title={req?.title ?? 'Enter a value'}
      size="sm"
      footer={
        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={() => resolvePrompt(null)}>
            {req?.cancelLabel ?? 'Cancel'}
          </Button>
          <Button variant="primary" onClick={submit} disabled={!canSubmit}>
            {req?.confirmLabel ?? 'OK'}
          </Button>
        </div>
      }
    >
      <div className="space-y-2">
        {req?.message && <p className="text-sm text-[var(--text-secondary)]">{req.message}</p>}
        {req?.multiline ? (
          <Textarea
            label={req?.label}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            rows={4}
            placeholder={req?.placeholder}
          />
        ) : (
          <Input
            label={req?.label}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={req?.placeholder}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit();
            }}
          />
        )}
      </div>
    </Modal>
  );
}

/** Mount once near the app root — renders the active confirm/prompt dialog. */
export function DialogHost() {
  return (
    <>
      <ConfirmSlot />
      <PromptSlot />
    </>
  );
}
