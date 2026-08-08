'use client';

import { useMemo, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  X,
  Plus,
  Trash2,
  Bold,
  Italic,
  Strikethrough,
  Code,
  Braces,
  Image as ImageIcon,
  Video as VideoIcon,
  FileText,
  MapPin,
  Type as TypeIcon,
  Ban,
  Loader2,
  MessageSquareReply,
  ExternalLink,
  Phone,
  Ticket,
  Workflow,
  PhoneCall,
  ChevronUp,
  ChevronDown,
} from 'lucide-react';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';
import Select from '@/components/ui/Select';
import Textarea from '@/components/ui/Textarea';
import PhoneInput from '@/components/ui/PhoneInput';
import { showToast } from '@/components/ui/Toast';
import { cn } from '@/lib/utils';
import { useClickOutside } from '@/hooks/use-click-outside';
import { whatsappService as svc } from '@/services/whatsapp.service';
import MarketingTemplateAddOns, {
  useMarketingAddOnState,
  buildMarketingAddOnComponents,
} from '@/components/whatsapp/MarketingTemplateAddOns';
import type { ApiError } from '@/types/api';

const CATEGORY_OPTIONS = [
  { value: 'UTILITY', label: 'Utility (transactional)' },
  { value: 'MARKETING', label: 'Marketing (promotional)' },
  { value: 'AUTHENTICATION', label: 'Authentication (OTP)' },
];

const LANGUAGE_OPTIONS = [
  { value: 'en_US', label: 'English (US)' },
  { value: 'en_GB', label: 'English (UK)' },
  { value: 'en', label: 'English' },
  { value: 'hi', label: 'Hindi' },
  { value: 'bn', label: 'Bengali' },
  { value: 'ta', label: 'Tamil' },
  { value: 'te', label: 'Telugu' },
  { value: 'mr', label: 'Marathi' },
  { value: 'gu', label: 'Gujarati' },
  { value: 'kn', label: 'Kannada' },
  { value: 'ml', label: 'Malayalam' },
  { value: 'pa', label: 'Punjabi' },
  { value: 'ur', label: 'Urdu' },
  { value: 'ar', label: 'Arabic' },
  { value: 'es', label: 'Spanish' },
  { value: 'es_ES', label: 'Spanish (Spain)' },
  { value: 'pt_BR', label: 'Portuguese (Brazil)' },
  { value: 'fr', label: 'French' },
  { value: 'de', label: 'German' },
  { value: 'id', label: 'Indonesian' },
  { value: 'zh_CN', label: 'Chinese (Simplified)' },
];

const HEADER_FORMATS = ['NONE', 'TEXT', 'IMAGE', 'VIDEO', 'DOCUMENT', 'LOCATION'] as const;
type HeaderFormat = (typeof HEADER_FORMATS)[number];

const HEADER_META: Record<
  Exclude<HeaderFormat, 'NONE'>,
  { label: string; icon: React.ReactNode; accept?: string }
> = {
  TEXT: { label: 'Text', icon: <TypeIcon className="h-4 w-4" /> },
  IMAGE: { label: 'Image', icon: <ImageIcon className="h-4 w-4" />, accept: 'image/*' },
  VIDEO: { label: 'Video', icon: <VideoIcon className="h-4 w-4" />, accept: 'video/mp4' },
  DOCUMENT: {
    label: 'Document',
    icon: <FileText className="h-4 w-4" />,
    accept: '.pdf,.doc,.docx,application/pdf,application/msword',
  },
  LOCATION: { label: 'Location', icon: <MapPin className="h-4 w-4" /> },
};

const HEADER_OPTIONS = HEADER_FORMATS.map((f) => ({
  value: f,
  label: f === 'NONE' ? 'None' : HEADER_META[f].label,
}));

// ── Button types ─────────────────────────────────────────────────────────────
type ButtonKind = 'QUICK_REPLY' | 'URL' | 'PHONE_NUMBER' | 'COPY_CODE' | 'FLOW' | 'VOICE_CALL';

interface ButtonDraft {
  /** Stable client key for list rendering. */
  key: string;
  kind: ButtonKind;
  text: string;
  url: string;
  urlExample: string;
  phoneNumber: string;
  copyExample: string;
  flowId: string;
  flowAction: 'navigate' | 'data_exchange';
  navigateScreen: string;
}

const BUTTON_KIND_META: Record<ButtonKind, { label: string; icon: React.ReactNode; hint: string }> =
  {
    QUICK_REPLY: {
      label: 'Quick reply',
      icon: <MessageSquareReply className="h-4 w-4 text-emerald-600" />,
      hint: 'Sends the button text back as a reply.',
    },
    URL: {
      label: 'Visit website',
      icon: <ExternalLink className="h-4 w-4 text-blue-600" />,
      hint: 'Opens a link. A {{1}} in the URL becomes a per-send variable.',
    },
    PHONE_NUMBER: {
      label: 'Call phone number',
      icon: <Phone className="h-4 w-4 text-indigo-600" />,
      hint: 'Dials the configured number.',
    },
    COPY_CODE: {
      label: 'Copy offer code',
      icon: <Ticket className="h-4 w-4 text-amber-600" />,
      hint: 'Recipients tap to copy a promo code.',
    },
    FLOW: {
      label: 'Complete flow',
      icon: <Workflow className="h-4 w-4 text-fuchsia-600" />,
      hint: 'Launches a WhatsApp Flow by id.',
    },
    VOICE_CALL: {
      label: 'Call on WhatsApp',
      icon: <PhoneCall className="h-4 w-4 text-green-600" />,
      hint: 'Starts a WhatsApp voice call.',
    },
  };

const MAX_BUTTONS = 10;

let buttonKeySeq = 0;
function newButton(kind: ButtonKind): ButtonDraft {
  buttonKeySeq += 1;
  return {
    key: `btn_${buttonKeySeq}`,
    kind,
    text: kind === 'COPY_CODE' ? '' : BUTTON_KIND_META[kind].label,
    url: '',
    urlExample: '',
    phoneNumber: '',
    copyExample: '',
    flowId: '',
    flowAction: 'navigate',
    navigateScreen: '',
  };
}

/** Extract distinct {{n}} placeholders from text, sorted ascending. */
function extractVars(text: string): number[] {
  const nums = [...text.matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1]));
  return Array.from(new Set(nums)).sort((a, b) => a - b);
}

// ── WhatsApp markdown → React preview ────────────────────────────────────────
/**
 * Render WhatsApp's lightweight markdown (*bold*, _italic_, ~strike~,
 * ```mono```) and {{n}} placeholders into React nodes for the live preview.
 * Intentionally simple — non-overlapping, single-pass — Meta itself renders the
 * canonical version on-device.
 */
function renderWaMarkdown(text: string): React.ReactNode[] {
  const tokens: React.ReactNode[] = [];
  // Order matters: monospace fences first (greedy ```), then single-char marks,
  // then variable chips. Each regex captures its inner content.
  const pattern = /```([\s\S]+?)```|\*([^*\n]+?)\*|_([^_\n]+?)_|~([^~\n]+?)~|\{\{(\d+)\}\}/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = pattern.exec(text)) !== null) {
    if (m.index > last) tokens.push(text.slice(last, m.index));
    if (m[1] !== undefined) {
      tokens.push(
        <code key={i++} className="rounded bg-black/5 px-1 font-mono text-[0.92em]">
          {m[1]}
        </code>,
      );
    } else if (m[2] !== undefined) {
      tokens.push(<strong key={i++}>{m[2]}</strong>);
    } else if (m[3] !== undefined) {
      tokens.push(<em key={i++}>{m[3]}</em>);
    } else if (m[4] !== undefined) {
      tokens.push(<s key={i++}>{m[4]}</s>);
    } else if (m[5] !== undefined) {
      tokens.push(
        <span
          key={i++}
          className="mx-0.5 rounded bg-emerald-100 px-1 text-[0.85em] font-medium text-emerald-700"
        >
          {`{{${m[5]}}}`}
        </span>,
      );
    }
    last = pattern.lastIndex;
  }
  if (last < text.length) tokens.push(text.slice(last));
  return tokens;
}

// ── Body formatting toolbar ──────────────────────────────────────────────────
function FormatBtn({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className="rounded-md border border-[var(--border)] bg-white p-1.5 text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-secondary)] hover:text-[var(--text)]"
    >
      {icon}
    </button>
  );
}

interface TemplateBuilderProps {
  onClose: () => void;
}

export default function TemplateBuilder({ onClose }: TemplateBuilderProps) {
  const qc = useQueryClient();

  // ── Shared fields ──
  const [name, setName] = useState('');
  const [language, setLanguage] = useState('en_US');
  const [category, setCategory] = useState('UTILITY');

  // ── Header ──
  const [headerFormat, setHeaderFormat] = useState<HeaderFormat>('NONE');
  const [headerText, setHeaderText] = useState('');
  const [headerTextExample, setHeaderTextExample] = useState('');
  const [headerHandle, setHeaderHandle] = useState('');
  const [headerFileName, setHeaderFileName] = useState('');
  const [headerPreviewUrl, setHeaderPreviewUrl] = useState('');
  const [uploadingHeader, setUploadingHeader] = useState(false);

  // ── Body ──
  const [body, setBody] = useState('');
  const [bodyExamples, setBodyExamples] = useState<Record<number, string>>({});
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  // ── Footer ──
  const [footer, setFooter] = useState('');

  // ── Buttons ──
  const [buttons, setButtons] = useState<ButtonDraft[]>([]);
  const [buttonMenuOpen, setButtonMenuOpen] = useState(false);
  const buttonMenuRef = useRef<HTMLDivElement>(null);
  useClickOutside(buttonMenuRef, () => setButtonMenuOpen(false), buttonMenuOpen);

  // ── Authentication-only options (ported verbatim from the page) ──
  const [addSecurityNote, setAddSecurityNote] = useState(true);
  const [codeExpiryMinutes, setCodeExpiryMinutes] = useState('10');
  const [otpButtonText, setOtpButtonText] = useState('Copy code');

  // ── Marketing add-ons (ported verbatim) ──
  const marketingAddOns = useMarketingAddOnState();

  const isAuth = category === 'AUTHENTICATION';
  const isMarketing = category === 'MARKETING';
  const bodyVars = extractVars(body);
  const headerHasVar = /\{\{1\}\}/.test(headerText);

  // ── Body toolbar: wrap the current selection with WhatsApp markers ──
  const wrapSelection = (marker: string, endMarker = marker) => {
    const ta = bodyRef.current;
    if (!ta) return;
    const start = ta.selectionStart ?? 0;
    const end = ta.selectionEnd ?? 0;
    const selected = body.slice(start, end) || 'text';
    const next = body.slice(0, start) + marker + selected + endMarker + body.slice(end);
    setBody(next);
    // Restore selection around the wrapped text on the next frame.
    requestAnimationFrame(() => {
      ta.focus();
      const selStart = start + marker.length;
      ta.setSelectionRange(selStart, selStart + selected.length);
    });
  };

  const addBodyVariable = () => {
    const next = bodyVars.length ? Math.max(...bodyVars) + 1 : 1;
    const ta = bodyRef.current;
    if (!ta) {
      setBody((b) => `${b}{{${next}}}`);
      return;
    }
    const pos = ta.selectionStart ?? body.length;
    const placeholder = `{{${next}}}`;
    const updated = body.slice(0, pos) + placeholder + body.slice(pos);
    setBody(updated);
    requestAnimationFrame(() => {
      ta.focus();
      const caret = pos + placeholder.length;
      ta.setSelectionRange(caret, caret);
    });
  };

  // ── Header media upload ──
  const onHeaderFile = async (file: File | undefined) => {
    if (!file) return;
    setUploadingHeader(true);
    try {
      const handle = await svc.uploadHeaderSample(file);
      setHeaderHandle(handle);
      setHeaderFileName(file.name);
      // Local object URL preview for images only; revoke prior one if present.
      setHeaderPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return file.type.startsWith('image/') ? URL.createObjectURL(file) : '';
      });
    } catch (err) {
      showToast.error((err as unknown as ApiError).message || 'Failed to upload sample');
    } finally {
      setUploadingHeader(false);
    }
  };

  const clearHeaderMedia = () => {
    setHeaderHandle('');
    setHeaderFileName('');
    setHeaderPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return '';
    });
  };

  // ── Buttons mutation helpers ──
  const addButton = (kind: ButtonKind) => {
    setButtons((b) => [...b, newButton(kind)]);
    setButtonMenuOpen(false);
  };
  const updateButton = (key: string, patch: Partial<ButtonDraft>) =>
    setButtons((b) => b.map((btn) => (btn.key === key ? { ...btn, ...patch } : btn)));
  const removeButton = (key: string) => setButtons((b) => b.filter((btn) => btn.key !== key));
  const moveButton = (key: string, dir: -1 | 1) =>
    setButtons((b) => {
      const idx = b.findIndex((btn) => btn.key === key);
      const swap = idx + dir;
      if (idx < 0 || swap < 0 || swap >= b.length) return b;
      const next = [...b];
      [next[idx], next[swap]] = [next[swap], next[idx]];
      return next;
    });

  /**
   * Convert a button draft into the Meta button component shape. Returns a
   * validation error string instead of throwing so the wizard can surface it.
   */
  const buildButtonComponents = (): { buttons: unknown[]; error?: string } => {
    const out: unknown[] = [];
    for (const b of buttons) {
      const text = b.text.trim();
      switch (b.kind) {
        case 'QUICK_REPLY':
          if (!text) return { buttons: [], error: 'Quick-reply buttons need text' };
          out.push({ type: 'QUICK_REPLY', text });
          break;
        case 'URL': {
          if (!text) return { buttons: [], error: 'Website buttons need a label' };
          const url = b.url.trim();
          if (!url) return { buttons: [], error: 'Website buttons need a URL' };
          const urlBtn: Record<string, unknown> = { type: 'URL', text, url };
          if (/\{\{1\}\}/.test(url)) {
            const ex = b.urlExample.trim();
            if (!ex)
              return {
                buttons: [],
                error: 'Provide an example URL for the dynamic website button',
              };
            urlBtn.example = [ex];
          }
          out.push(urlBtn);
          break;
        }
        case 'PHONE_NUMBER': {
          if (!text) return { buttons: [], error: 'Call buttons need a label' };
          const phone = b.phoneNumber.trim();
          if (!phone) return { buttons: [], error: 'Call buttons need a phone number' };
          out.push({ type: 'PHONE_NUMBER', text, phone_number: phone });
          break;
        }
        case 'COPY_CODE': {
          const code = b.copyExample.trim();
          if (!code) return { buttons: [], error: 'Copy-code buttons need a sample code' };
          out.push({ type: 'COPY_CODE', example: code });
          break;
        }
        case 'FLOW': {
          if (!text) return { buttons: [], error: 'Flow buttons need a label' };
          const flowId = b.flowId.trim();
          if (!flowId) return { buttons: [], error: 'Flow buttons need a flow id' };
          const flowBtn: Record<string, unknown> = {
            type: 'FLOW',
            text,
            flow_id: flowId,
            flow_action: b.flowAction,
          };
          if (b.flowAction === 'navigate' && b.navigateScreen.trim()) {
            flowBtn.navigate_screen = b.navigateScreen.trim();
          }
          out.push(flowBtn);
          break;
        }
        case 'VOICE_CALL':
          if (!text) return { buttons: [], error: 'WhatsApp-call buttons need a label' };
          out.push({ type: 'VOICE_CALL', text });
          break;
      }
    }
    return { buttons: out };
  };

  // ── Assemble the components array in Meta's order ──
  const buildStandardComponents = (): {
    components: unknown[];
    variableSample?: unknown;
    error?: string;
  } => {
    const components: unknown[] = [];
    const collectedExamples: Record<string, unknown> = {};

    // HEADER (optional)
    if (headerFormat === 'TEXT') {
      const text = headerText.trim();
      if (!text) return { components: [], error: 'Header text is required when Header = Text' };
      const header: Record<string, unknown> = { type: 'HEADER', format: 'TEXT', text };
      if (/\{\{1\}\}/.test(text)) {
        const sample = headerTextExample.trim();
        if (!sample) return { components: [], error: 'Provide an example for the header variable' };
        header.example = { header_text: [sample] };
        collectedExamples.header_text = [sample];
      }
      components.push(header);
    } else if (
      headerFormat === 'IMAGE' ||
      headerFormat === 'VIDEO' ||
      headerFormat === 'DOCUMENT'
    ) {
      if (!headerHandle)
        return {
          components: [],
          error: `Upload a sample ${headerFormat.toLowerCase()} for the header`,
        };
      components.push({
        type: 'HEADER',
        format: headerFormat,
        example: { header_handle: [headerHandle] },
      });
      collectedExamples.header_handle = [headerHandle];
    } else if (headerFormat === 'LOCATION') {
      components.push({ type: 'HEADER', format: 'LOCATION' });
    }

    // BODY (required)
    const bodyText = body.trim();
    if (!bodyText) return { components: [], error: 'Body text is required' };
    const bodyComp: Record<string, unknown> = { type: 'BODY', text: bodyText };
    if (bodyVars.length) {
      const samples = bodyVars.map((n) => bodyExamples[n]?.trim() || `Sample ${n}`);
      bodyComp.example = { body_text: [samples] };
      collectedExamples.body_text = [samples];
    }
    components.push(bodyComp);

    // FOOTER (optional)
    if (footer.trim()) components.push({ type: 'FOOTER', text: footer.trim() });

    // BUTTONS (optional) — our own builder, then the marketing add-ons append
    // onto the same single BUTTONS component (Meta caps it at 10).
    const built = buildButtonComponents();
    if (built.error) return { components: [], error: built.error };
    const buttonEntries = [...built.buttons];

    if (isMarketing) {
      // Coupon copy-code button / catalog button live in the same BUTTONS list,
      // while LIMITED_TIME_OFFER is its own component. buildMarketingAddOnComponents
      // validates the catalog-sole-button and 10-button rules against our count.
      const addOns = buildMarketingAddOnComponents(marketingAddOns, buttonEntries.length);
      if (addOns.error) return { components: [], error: addOns.error };
      for (const comp of addOns.components) {
        if (comp && typeof comp === 'object' && (comp as { type?: string }).type === 'BUTTONS') {
          buttonEntries.push(...((comp as { buttons: unknown[] }).buttons ?? []));
        } else {
          components.push(comp);
        }
      }
    }

    if (buttonEntries.length > MAX_BUTTONS) {
      return { components: [], error: `A template can have at most ${MAX_BUTTONS} buttons` };
    }
    if (buttonEntries.length) {
      components.push({ type: 'BUTTONS', buttons: buttonEntries });
    }

    const variableSample = Object.keys(collectedExamples).length ? collectedExamples : undefined;
    return { components, variableSample };
  };

  const mutation = useMutation({
    mutationFn: () => {
      // ── Authentication (OTP) templates — preserved exactly ──────────────
      if (isAuth) {
        const expiry = Number(codeExpiryMinutes);
        const authComponents: unknown[] = [
          { type: 'BODY', add_security_recommendation: addSecurityNote },
        ];
        if (Number.isFinite(expiry) && expiry > 0) {
          authComponents.push({ type: 'FOOTER', code_expiration_minutes: expiry });
        }
        authComponents.push({
          type: 'BUTTONS',
          buttons: [
            { type: 'OTP', otp_type: 'COPY_CODE', text: otpButtonText.trim() || 'Copy code' },
          ],
        });
        return svc.createTemplate({
          name: name.trim(),
          language: language.trim(),
          category,
          components: authComponents,
        });
      }

      // ── Marketing / Utility templates ───────────────────────────────────
      const built = buildStandardComponents();
      // submit() validated already; defensively re-check.
      if (built.error) return Promise.reject(new Error(built.error));
      return svc.createTemplate({
        name: name.trim(),
        language: language.trim(),
        category,
        components: built.components,
        variableSample: built.variableSample,
      });
    },
    onSuccess: () => {
      showToast.success('Template submitted to Meta for review');
      qc.invalidateQueries({ queryKey: ['wa-templates'] });
      onClose();
    },
    onError: (e) =>
      showToast.error((e as unknown as ApiError).message || 'Failed to create template'),
  });

  const submit = () => {
    if (!/^[a-z0-9_]+$/.test(name)) {
      showToast.error('Name must be lowercase letters, numbers and underscores');
      return;
    }
    if (isAuth) {
      if (!otpButtonText.trim()) return showToast.error('OTP button text is required');
      return mutation.mutate();
    }
    const built = buildStandardComponents();
    if (built.error) return showToast.error(built.error);
    mutation.mutate();
  };

  // ── Live preview button rows ──
  const previewButtons = useMemo(() => {
    const rows: { label: string; icon: React.ReactNode }[] = [];
    for (const b of buttons) {
      const label =
        b.kind === 'COPY_CODE' ? 'Copy code' : b.text.trim() || BUTTON_KIND_META[b.kind].label;
      rows.push({ label, icon: BUTTON_KIND_META[b.kind].icon });
    }
    if (isMarketing) {
      if (marketingAddOns.couponEnabled && !marketingAddOns.catalogEnabled) {
        rows.push({
          label: marketingAddOns.couponButtonText.trim() || 'Copy offer code',
          icon: BUTTON_KIND_META.COPY_CODE.icon,
        });
      }
      if (marketingAddOns.catalogEnabled) {
        rows.push({ label: 'View catalog', icon: <Ticket className="h-4 w-4 text-blue-600" /> });
      }
    }
    return rows;
  }, [buttons, isMarketing, marketingAddOns]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl bg-white shadow-xl">
        <div className="flex shrink-0 items-center justify-between border-b border-[var(--border)] px-6 py-4">
          <h2 className="text-lg font-bold text-[var(--text)]">New Template</h2>
          <button onClick={onClose} className="rounded p-1 hover:bg-[var(--bg-secondary)]">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden lg:grid-cols-[1fr_320px]">
          {/* ── Form column (scrolls independently) ── */}
          <div className="min-h-0 space-y-4 overflow-y-auto p-6">
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Name"
                value={name}
                onChange={(e) => setName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'))}
                placeholder="order_update"
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
            <Select
              label="Category"
              options={CATEGORY_OPTIONS}
              value={category}
              onChange={setCategory}
              clearable={false}
            />

            {isAuth ? (
              // ── Authentication (OTP) builder — preserved verbatim ──
              <>
                <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] p-3">
                  <p className="text-xs font-semibold text-[var(--text-muted)]">
                    Verification code body
                  </p>
                  <p className="mt-1 rounded-md border border-dashed border-[var(--border)] bg-white px-3 py-2 text-sm text-[var(--text-secondary)]">
                    {'{{1}}'} is your verification code.
                    {addSecurityNote && ' For your security, do not share this code.'}
                  </p>
                  <p className="mt-1.5 text-[11px] text-[var(--text-muted)]">
                    Meta supplies the body and auto-fills the one-time code. You only choose the
                    security note, code expiry and the OTP button below.
                  </p>
                </div>

                <label className="flex items-start gap-2 text-sm text-[var(--text-secondary)]">
                  <input
                    type="checkbox"
                    checked={addSecurityNote}
                    onChange={(e) => setAddSecurityNote(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-[var(--border)]"
                  />
                  <span>
                    Add security recommendation
                    <span className="block text-[11px] text-[var(--text-muted)]">
                      Appends “For your security, do not share this code.”
                    </span>
                  </span>
                </label>

                <Input
                  label="Code expiry (minutes, optional)"
                  type="number"
                  min={1}
                  max={90}
                  value={codeExpiryMinutes}
                  onChange={(e) => setCodeExpiryMinutes(e.target.value)}
                  placeholder="10"
                />
                <Input
                  label="OTP button text"
                  value={otpButtonText}
                  onChange={(e) => setOtpButtonText(e.target.value)}
                  placeholder="Copy code"
                />
              </>
            ) : (
              // ── Marketing / Utility rich builder ──
              <>
                {/* HEADER */}
                <div className="rounded-lg border border-[var(--border)] p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-xs font-semibold text-[var(--text-muted)]">
                      Header (optional)
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {HEADER_OPTIONS.map((opt) => {
                      const active = headerFormat === opt.value;
                      const icon =
                        opt.value === 'NONE' ? (
                          <Ban className="h-4 w-4" />
                        ) : (
                          HEADER_META[opt.value as Exclude<HeaderFormat, 'NONE'>].icon
                        );
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => {
                            setHeaderFormat(opt.value);
                            if (opt.value !== 'TEXT') {
                              setHeaderText('');
                              setHeaderTextExample('');
                            }
                            if (
                              opt.value !== 'IMAGE' &&
                              opt.value !== 'VIDEO' &&
                              opt.value !== 'DOCUMENT'
                            ) {
                              clearHeaderMedia();
                            }
                          }}
                          className={cn(
                            'flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors',
                            active
                              ? 'border-primary text-primary bg-[var(--primary-light)]'
                              : 'border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)]',
                          )}
                        >
                          {icon}
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>

                  {headerFormat === 'TEXT' && (
                    <div className="mt-3 space-y-2">
                      <Input
                        label="Header text"
                        value={headerText}
                        onChange={(e) => setHeaderText(e.target.value)}
                        maxLength={60}
                        placeholder="Order {{1}} update"
                        helperText="Up to 60 characters. One {{1}} variable allowed."
                      />
                      {headerHasVar && (
                        <Input
                          label="Header variable example {{1}}"
                          value={headerTextExample}
                          onChange={(e) => setHeaderTextExample(e.target.value)}
                          placeholder="#A1234"
                        />
                      )}
                    </div>
                  )}

                  {(headerFormat === 'IMAGE' ||
                    headerFormat === 'VIDEO' ||
                    headerFormat === 'DOCUMENT') && (
                    <div className="mt-3">
                      {!headerHandle ? (
                        <label
                          className={cn(
                            'flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-[var(--border)] px-3 py-4 text-sm text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-secondary)]',
                            uploadingHeader && 'pointer-events-none opacity-70',
                          )}
                        >
                          {uploadingHeader ? (
                            <>
                              <Loader2 className="h-4 w-4 animate-spin" /> Uploading sample…
                            </>
                          ) : (
                            <>
                              {HEADER_META[headerFormat].icon}
                              Upload a sample {HEADER_META[headerFormat].label.toLowerCase()}
                            </>
                          )}
                          <input
                            type="file"
                            className="hidden"
                            accept={HEADER_META[headerFormat].accept}
                            disabled={uploadingHeader}
                            onChange={(e) => onHeaderFile(e.target.files?.[0])}
                          />
                        </label>
                      ) : (
                        <div className="flex items-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] p-2.5">
                          {headerPreviewUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={headerPreviewUrl}
                              alt="Header sample"
                              className="h-12 w-12 shrink-0 rounded-md object-cover"
                            />
                          ) : (
                            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-white text-[var(--text-muted)]">
                              {HEADER_META[headerFormat].icon}
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-[var(--text)]">
                              {headerFileName}
                            </p>
                            <p className="text-[11px] text-emerald-600">Sample uploaded to Meta</p>
                          </div>
                          <button
                            type="button"
                            onClick={clearHeaderMedia}
                            className="rounded p-1 text-[var(--text-muted)] hover:bg-white hover:text-red-600"
                            aria-label="Remove header media"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {headerFormat === 'LOCATION' && (
                    <p className="mt-3 flex items-center gap-1.5 rounded-md bg-[var(--bg-secondary)] px-3 py-2 text-[11px] text-[var(--text-muted)]">
                      <MapPin className="h-3.5 w-3.5" /> The location pin is filled in per send — no
                      configuration needed here.
                    </p>
                  )}
                </div>

                {/* BODY */}
                <div>
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="text-sm font-medium text-[var(--text)]">
                      Body<span className="text-error ml-0.5">*</span>
                    </span>
                    <div className="flex items-center gap-1">
                      <FormatBtn
                        icon={<Bold className="h-4 w-4" />}
                        label="Bold"
                        onClick={() => wrapSelection('*')}
                      />
                      <FormatBtn
                        icon={<Italic className="h-4 w-4" />}
                        label="Italic"
                        onClick={() => wrapSelection('_')}
                      />
                      <FormatBtn
                        icon={<Strikethrough className="h-4 w-4" />}
                        label="Strikethrough"
                        onClick={() => wrapSelection('~')}
                      />
                      <FormatBtn
                        icon={<Code className="h-4 w-4" />}
                        label="Monospace"
                        onClick={() => wrapSelection('```')}
                      />
                      <FormatBtn
                        icon={<Braces className="h-4 w-4" />}
                        label="Add variable"
                        onClick={addBodyVariable}
                      />
                    </div>
                  </div>
                  <Textarea
                    ref={bodyRef}
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    placeholder="Hi {{1}}, your order {{2}} has shipped."
                    rows={5}
                    maxLength={1024}
                    showCount
                  />
                  {bodyVars.length > 0 && (
                    <div className="mt-2 space-y-2 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] p-3">
                      <p className="text-xs font-semibold text-[var(--text-muted)]">
                        Example values
                      </p>
                      {bodyVars.map((n) => (
                        <Input
                          key={n}
                          label={`{{${n}}}`}
                          value={bodyExamples[n] ?? ''}
                          onChange={(e) => setBodyExamples((p) => ({ ...p, [n]: e.target.value }))}
                          placeholder={`Sample ${n}`}
                        />
                      ))}
                    </div>
                  )}
                </div>

                {/* FOOTER */}
                <Input
                  label="Footer (optional)"
                  value={footer}
                  onChange={(e) => setFooter(e.target.value)}
                  maxLength={60}
                  placeholder="Reply STOP to opt out"
                  helperText="Up to 60 characters. No variables or formatting."
                />

                {/* BUTTONS */}
                <div className="rounded-lg border border-[var(--border)] p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-xs font-semibold text-[var(--text-muted)]">
                      Buttons (optional)
                    </p>
                    <div ref={buttonMenuRef} className="relative">
                      <Button
                        size="sm"
                        variant="outline"
                        leftIcon={<Plus className="h-3.5 w-3.5" />}
                        onClick={() => setButtonMenuOpen((o) => !o)}
                      >
                        Add button
                      </Button>
                      {buttonMenuOpen && (
                        <div className="absolute right-0 z-20 mt-1 w-56 overflow-hidden rounded-lg border border-[var(--border)] bg-white py-1 shadow-lg">
                          {(Object.keys(BUTTON_KIND_META) as ButtonKind[]).map((kind) => (
                            <button
                              key={kind}
                              type="button"
                              onClick={() => addButton(kind)}
                              className="flex w-full items-start gap-2.5 px-3 py-2 text-left transition-colors hover:bg-[var(--bg-secondary)]"
                            >
                              <span className="mt-0.5 shrink-0">{BUTTON_KIND_META[kind].icon}</span>
                              <span className="min-w-0">
                                <span className="block text-sm font-medium text-[var(--text)]">
                                  {BUTTON_KIND_META[kind].label}
                                </span>
                                <span className="block text-[11px] text-[var(--text-muted)]">
                                  {BUTTON_KIND_META[kind].hint}
                                </span>
                              </span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {buttons.length === 0 ? (
                    <p className="text-[11px] text-[var(--text-muted)]">
                      Add up to {MAX_BUTTONS} buttons. Some types have limits (e.g. one call & one
                      copy-code) — Meta enforces the exact rules on submit.
                    </p>
                  ) : (
                    <div className="space-y-2.5">
                      {buttons.map((b, idx) => (
                        <div
                          key={b.key}
                          className="rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] p-2.5"
                        >
                          <div className="mb-2 flex items-center justify-between gap-2">
                            <span className="flex items-center gap-1.5 text-xs font-semibold text-[var(--text)]">
                              {BUTTON_KIND_META[b.kind].icon}
                              {BUTTON_KIND_META[b.kind].label}
                            </span>
                            <div className="flex items-center gap-0.5">
                              <button
                                type="button"
                                onClick={() => moveButton(b.key, -1)}
                                disabled={idx === 0}
                                className="rounded p-1 text-[var(--text-muted)] hover:bg-white disabled:opacity-30"
                                aria-label="Move up"
                              >
                                <ChevronUp className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => moveButton(b.key, 1)}
                                disabled={idx === buttons.length - 1}
                                className="rounded p-1 text-[var(--text-muted)] hover:bg-white disabled:opacity-30"
                                aria-label="Move down"
                              >
                                <ChevronDown className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => removeButton(b.key)}
                                className="rounded p-1 text-[var(--text-muted)] hover:bg-white hover:text-red-600"
                                aria-label="Remove button"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>

                          <div className="space-y-2">
                            {b.kind !== 'COPY_CODE' && (
                              <Input
                                label="Button text"
                                inputSize="sm"
                                value={b.text}
                                onChange={(e) => updateButton(b.key, { text: e.target.value })}
                                maxLength={25}
                                placeholder={BUTTON_KIND_META[b.kind].label}
                              />
                            )}

                            {b.kind === 'URL' && (
                              <>
                                <Input
                                  label="URL"
                                  inputSize="sm"
                                  value={b.url}
                                  onChange={(e) => updateButton(b.key, { url: e.target.value })}
                                  placeholder="https://hireadda.in/order/{{1}}"
                                />
                                {/\{\{1\}\}/.test(b.url) && (
                                  <Input
                                    label="Example full URL"
                                    inputSize="sm"
                                    value={b.urlExample}
                                    onChange={(e) =>
                                      updateButton(b.key, { urlExample: e.target.value })
                                    }
                                    placeholder="https://hireadda.in/order/A1234"
                                  />
                                )}
                              </>
                            )}

                            {b.kind === 'PHONE_NUMBER' && (
                              <PhoneInput
                                label="Phone number"
                                inputSize="sm"
                                value={b.phoneNumber}
                                onValueChange={(v) => updateButton(b.key, { phoneNumber: v })}
                              />
                            )}

                            {b.kind === 'COPY_CODE' && (
                              <Input
                                label="Sample code (for Meta review)"
                                inputSize="sm"
                                value={b.copyExample}
                                onChange={(e) =>
                                  updateButton(b.key, { copyExample: e.target.value })
                                }
                                maxLength={15}
                                placeholder="SAVE20"
                              />
                            )}

                            {b.kind === 'FLOW' && (
                              <>
                                <Input
                                  label="Flow id"
                                  inputSize="sm"
                                  value={b.flowId}
                                  onChange={(e) => updateButton(b.key, { flowId: e.target.value })}
                                  placeholder="1234567890"
                                />
                                <Select
                                  label="Flow action"
                                  size="sm"
                                  clearable={false}
                                  value={b.flowAction}
                                  onChange={(v) =>
                                    updateButton(b.key, {
                                      flowAction: v as ButtonDraft['flowAction'],
                                    })
                                  }
                                  options={[
                                    { value: 'navigate', label: 'Navigate' },
                                    { value: 'data_exchange', label: 'Data exchange' },
                                  ]}
                                />
                                {b.flowAction === 'navigate' && (
                                  <Input
                                    label="Navigate screen (optional)"
                                    inputSize="sm"
                                    value={b.navigateScreen}
                                    onChange={(e) =>
                                      updateButton(b.key, { navigateScreen: e.target.value })
                                    }
                                    placeholder="WELCOME"
                                  />
                                )}
                              </>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {isMarketing && <MarketingTemplateAddOns state={marketingAddOns} />}
              </>
            )}
          </div>

          {/* ── Live preview column ── */}
          <div className="hidden min-h-0 flex-col border-l border-[var(--border)] bg-[var(--bg-secondary)] lg:flex">
            <p className="border-b border-[var(--border)] px-4 py-3 text-xs font-semibold text-[var(--text-muted)]">
              Preview
            </p>
            <div className="flex-1 overflow-y-auto p-4">
              <div className="rounded-xl bg-[#e5ddd5] p-3">
                <div className="ml-auto max-w-[260px] rounded-lg rounded-tr-none bg-white p-2.5 shadow-sm">
                  {isAuth ? (
                    <p className="text-sm whitespace-pre-wrap text-[var(--text)]">
                      <span className="rounded bg-emerald-100 px-1 text-emerald-700">
                        {'{{1}}'}
                      </span>{' '}
                      is your verification code.
                      {addSecurityNote && ' For your security, do not share this code.'}
                    </p>
                  ) : (
                    <>
                      {/* Header preview */}
                      {headerFormat === 'TEXT' && headerText.trim() && (
                        <p className="mb-1 text-sm font-semibold text-[var(--text)]">
                          {renderWaMarkdown(headerText)}
                        </p>
                      )}
                      {(headerFormat === 'IMAGE' ||
                        headerFormat === 'VIDEO' ||
                        headerFormat === 'DOCUMENT') && (
                        <div className="mb-1.5 flex h-28 items-center justify-center rounded-md bg-black/5 text-[var(--text-muted)]">
                          {headerPreviewUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={headerPreviewUrl}
                              alt="Header preview"
                              className="h-full w-full rounded-md object-cover"
                            />
                          ) : (
                            <div className="flex flex-col items-center gap-1 text-xs">
                              {HEADER_META[headerFormat].icon}
                              {HEADER_META[headerFormat].label}
                            </div>
                          )}
                        </div>
                      )}
                      {headerFormat === 'LOCATION' && (
                        <div className="mb-1.5 flex h-24 items-center justify-center rounded-md bg-black/5 text-xs text-[var(--text-muted)]">
                          <MapPin className="mr-1 h-4 w-4" /> Location
                        </div>
                      )}

                      {/* Body preview */}
                      <p className="text-sm whitespace-pre-wrap text-[var(--text)]">
                        {body.trim() ? (
                          renderWaMarkdown(body)
                        ) : (
                          <span className="text-[var(--text-muted)]">Your message body…</span>
                        )}
                      </p>

                      {/* Footer preview */}
                      {footer.trim() && (
                        <p className="mt-1 text-[11px] text-[var(--text-muted)]">{footer}</p>
                      )}

                      <p className="mt-1 text-right text-[10px] text-[var(--text-muted)]">
                        12:00 PM
                      </p>
                    </>
                  )}
                </div>

                {/* Button rows */}
                {!isAuth && previewButtons.length > 0 && (
                  <div className="mt-1 ml-auto max-w-[260px] space-y-0.5">
                    {previewButtons.map((row, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-center gap-1.5 rounded-lg bg-white py-2 text-sm font-medium text-[#00a5f4] shadow-sm"
                      >
                        {row.icon}
                        <span className="truncate">{row.label}</span>
                      </div>
                    ))}
                  </div>
                )}

                {isAuth && (
                  <div className="mt-1 ml-auto max-w-[260px]">
                    <div className="flex items-center justify-center gap-1.5 rounded-lg bg-white py-2 text-sm font-medium text-[#00a5f4] shadow-sm">
                      <Ticket className="h-4 w-4" />
                      <span className="truncate">{otpButtonText.trim() || 'Copy code'}</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="flex shrink-0 justify-end gap-2 border-t border-[var(--border)] px-6 py-4">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} isLoading={mutation.isPending}>
            Submit for review
          </Button>
        </div>
      </div>
    </div>
  );
}
