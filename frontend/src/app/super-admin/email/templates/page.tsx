'use client';

import { useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  FileText,
  Plus,
  Eye,
  Send,
  Save,
  Trash2,
  Search,
  Copy,
  Monitor,
  Smartphone,
  ImagePlus,
  Braces,
  CheckCircle2,
  AlignLeft,
  Puzzle,
  History,
  RotateCcw,
} from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import Input from '@/components/ui/Input';
import RichTextEditor from '@/components/ui/RichTextEditor';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import Select from '@/components/ui/Select';
import Tooltip from '@/components/ui/Tooltip';
import { superAdminEmailService as svc } from '@/services/super-admin-email.service';
import { showToast } from '@/components/ui/Toast';
import { confirmDialog, promptDialog } from '@/components/ui/dialog-service';
import { handleBulkResult } from '@/lib/email-bulk';
import { useBulkSelect } from '@/hooks/use-bulk-select';
import {
  BulkBar,
  BulkButton,
  HeaderCheckbox,
  RowCheckbox,
} from '@/components/super-admin/email/bulk-ui';
import type {
  EmailTemplate,
  EmailTemplateCategory,
  EmailTemplateStatus,
  EmailTemplateVersion,
  EmailSnippet,
} from '@/types/email';

const CATEGORIES: EmailTemplateCategory[] = [
  'MARKETING',
  'TRANSACTIONAL',
  'NOTIFICATION',
  'NEWSLETTER',
  'ANNOUNCEMENT',
  'OTHER',
];

const STATUSES: EmailTemplateStatus[] = ['DRAFT', 'ACTIVE', 'ARCHIVED'];

const BUILTIN_TOKENS = [
  'first_name',
  'name',
  'email',
  'unsubscribe_url',
  'preferences_url',
  'brand_name',
  'year',
];

/** True when the markup contains structures tiptap's StarterKit schema would strip. */
const isComplexHtml = (h: string) => /<table|<img|<!doctype|<html[\s>]|style=/i.test(h);

export default function SuperAdminEmailTemplatesPage() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Partial<EmailTemplate> | null>(null);
  const [q, setQ] = useState('');
  const [category, setCategory] = useState<'' | EmailTemplateCategory>('');
  const [status, setStatus] = useState<'' | EmailTemplateStatus>('');
  const [cloningId, setCloningId] = useState<string | null>(null);
  const sel = useBulkSelect();
  const [confirmDelete, setConfirmDelete] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['email-templates', q, category, status],
    queryFn: () =>
      svc.listTemplates({
        q: q || undefined,
        category: category || undefined,
        status: status || undefined,
      }),
  });
  const templates = data?.data ?? [];
  const pageIds = templates.map((t) => t.id);

  function clearAndRefresh() {
    sel.clear();
    qc.invalidateQueries({ queryKey: ['email-templates'] });
  }

  async function bulkStatus(s: EmailTemplateStatus) {
    try {
      const res = await svc.bulkTemplateStatus(sel.ids, s);
      handleBulkResult(res.data, { qc, label: 'Templates updated' });
      clearAndRefresh();
    } catch {
      showToast.error('Could not update status');
    }
  }

  async function bulkDuplicate() {
    try {
      const res = await svc.bulkDuplicateTemplates(sel.ids);
      handleBulkResult(res.data, { qc, label: 'Duplicated templates' });
      clearAndRefresh();
    } catch {
      showToast.error('Duplicate failed');
    }
  }

  async function bulkDelete() {
    try {
      const res = await svc.bulkDeleteTemplates(sel.ids);
      handleBulkResult(res.data, { qc, label: 'Deleted templates' });
      clearAndRefresh();
    } catch {
      showToast.error('Delete failed');
    } finally {
      setConfirmDelete(false);
    }
  }

  async function clone(id: string) {
    setCloningId(id);
    try {
      await svc.duplicateTemplate(id);
      showToast.success('Template cloned');
      qc.invalidateQueries({ queryKey: ['email-templates'] });
    } catch {
      showToast.error('Clone failed');
    } finally {
      setCloningId(null);
    }
  }

  return (
    <DashboardLayout
      requiredRole={['ADMIN', 'SUPER_ADMIN']}
      requiredPermission="email.templates.view"
    >
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="flex items-center gap-2 text-2xl font-bold text-[var(--text)]">
            <FileText className="h-6 w-6 text-blue-600" /> Email Templates
          </h1>
          <Button
            leftIcon={<Plus className="h-4 w-4" />}
            onClick={() => setEditing({ category: 'MARKETING' })}
          >
            New template
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="absolute top-2.5 left-2.5 h-4 w-4 text-[var(--text-muted)]" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search templates…"
              className="w-56 rounded-lg border border-[var(--border)] bg-white py-2 pr-3 pl-8 text-sm"
            />
          </div>
          <div className="w-44">
            <Select
              options={CATEGORIES.map((c) => ({ value: c, label: c }))}
              value={category}
              onChange={(v) => setCategory(v as '' | EmailTemplateCategory)}
              placeholder="All categories"
            />
          </div>
          <div className="w-40">
            <Select
              options={STATUSES.map((s) => ({ value: s, label: s }))}
              value={status}
              onChange={(v) => setStatus(v as '' | EmailTemplateStatus)}
              placeholder="All statuses"
            />
          </div>
          {templates.length > 0 && (
            <label className="ml-auto flex cursor-pointer items-center gap-2 text-sm text-[var(--text-secondary)]">
              <HeaderCheckbox
                checked={sel.allOnPage(pageIds)}
                indeterminate={sel.someOnPage(pageIds)}
                onChange={(on) => sel.setPage(pageIds, on)}
                title="Select all templates"
              />
              Select all
            </label>
          )}
        </div>

        {sel.active && (
          <BulkBar
            count={sel.count}
            allMatching={false}
            totalMatching={templates.length}
            allOnPage={sel.allOnPage(pageIds)}
            entity="templates"
            onSelectAllMatching={sel.selectAllMatching}
            onClear={sel.clear}
            allowSelectAll={false}
          >
            <div className="w-36">
              <Select
                options={STATUSES.map((s) => ({ value: s, label: s }))}
                value=""
                onChange={(v) => {
                  if (v) bulkStatus(v as EmailTemplateStatus);
                }}
                placeholder="Set status…"
                size="sm"
                clearable={false}
              />
            </div>
            <BulkButton icon={Copy} onClick={bulkDuplicate}>
              Duplicate
            </BulkButton>
            <BulkButton icon={Trash2} danger onClick={() => setConfirmDelete(true)}>
              Delete
            </BulkButton>
          </BulkBar>
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {isLoading && <p className="p-6 text-sm text-[var(--text-muted)]">Loading…</p>}
          {!isLoading && templates.length === 0 && (
            <p className="col-span-full p-8 text-center text-sm text-[var(--text-muted)]">
              No templates match. Create one to use in a campaign.
            </p>
          )}
          {templates.map((t) => (
            <div
              key={t.id}
              className="relative rounded-xl border border-[var(--border)] bg-white p-4 hover:border-blue-300"
            >
              <div className="absolute top-4 left-3 z-10">
                <RowCheckbox
                  checked={sel.isSelected(t.id)}
                  onChange={() => sel.toggle(t.id)}
                  onClick={(e) => e.stopPropagation()}
                />
              </div>
              <button onClick={() => setEditing(t)} className="w-full pl-7 text-left">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="truncate font-semibold text-[var(--text)]">{t.name}</span>
                  <Badge
                    variant={
                      t.status === 'ACTIVE'
                        ? 'success'
                        : t.status === 'ARCHIVED'
                          ? 'neutral'
                          : 'warning'
                    }
                    size="sm"
                  >
                    {t.status}
                  </Badge>
                </div>
                <p className="mb-2 truncate text-xs text-[var(--text-muted)]">{t.subject}</p>
                <Badge variant="info" size="sm">
                  {t.category}
                </Badge>
              </button>
              <div className="mt-3 flex justify-end border-t border-[var(--border)] pt-2">
                <Button
                  size="sm"
                  variant="ghost"
                  leftIcon={<Copy className="h-3.5 w-3.5" />}
                  isLoading={cloningId === t.id}
                  onClick={() => clone(t.id)}
                >
                  Clone
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {editing && (
        <TemplateBuilder
          template={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            qc.invalidateQueries({ queryKey: ['email-templates'] });
          }}
        />
      )}

      <ConfirmDialog
        isOpen={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={bulkDelete}
        title="Delete templates"
        message={`Permanently delete ${sel.count} template${sel.count === 1 ? '' : 's'}? Templates referenced by a campaign can't be deleted and will be kept.`}
        confirmLabel="Delete"
      />
    </DashboardLayout>
  );
}

function TemplateBuilder({
  template,
  onClose,
  onSaved,
}: {
  template: Partial<EmailTemplate>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(template.name ?? '');
  const [subject, setSubject] = useState(template.subject ?? '');
  const [preheader, setPreheader] = useState(template.preheader ?? '');
  const [category, setCategory] = useState<EmailTemplateCategory>(template.category ?? 'MARKETING');
  const [status, setStatus] = useState(template.status ?? 'DRAFT');
  const [htmlBody, setHtmlBody] = useState(template.htmlBody ?? '');
  const [textBody, setTextBody] = useState(template.textBody ?? '');
  const [previewHtml, setPreviewHtml] = useState('');
  const [previewMobile, setPreviewMobile] = useState(false);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [linting, setLinting] = useState(false);
  const [lint, setLint] = useState<{ warnings: string[]; score: number } | null>(null);
  const [showVersions, setShowVersions] = useState(false);
  const [sampleVars, setSampleVars] = useState<Record<string, string>>(
    (template.variableSample as Record<string, string>) ?? {},
  );
  const [footerSnippetId, setFooterSnippetId] = useState(template.footerSnippetId ?? '');
  const [showFooterModal, setShowFooterModal] = useState(false);
  const [editorMode, setEditorMode] = useState<'visual' | 'html'>(() =>
    isComplexHtml(template.htmlBody ?? '') ? 'html' : 'visual',
  );
  // tiptap only reads `value` at mount; bump this key to remount the visual
  // editor whenever htmlBody changes programmatically (not via typing).
  const [editorKey, setEditorKey] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();

  /** Apply a programmatic htmlBody update AND remount the visual editor so it picks up the fresh content. */
  function applyExternalHtml(updater: (h: string) => string) {
    setHtmlBody(updater);
    setEditorKey((k) => k + 1);
  }

  // Reusable footers (footer-category snippets) attachable to this template.
  const { data: footersData } = useQuery({
    queryKey: ['email-snippets', 'footer'],
    queryFn: () => svc.listSnippets('footer'),
  });
  const footers = footersData?.data ?? [];

  // Variables the author referenced via {{token}} (built-ins excluded).
  const detectedVars = useMemo(() => {
    const re = /\{\{\s*([\w.]+)\s*\}\}/g;
    const builtins = new Set([
      'email',
      'name',
      'first_name',
      'unsubscribe_url',
      'preferences_url',
      'brand_name',
      'year',
    ]);
    const found = new Set<string>();
    for (const src of [subject, htmlBody, textBody]) {
      let m: RegExpExecArray | null;
      while ((m = re.exec(src || '')) !== null) {
        const k = m[1].toLowerCase();
        if (!builtins.has(k)) found.add(k);
      }
    }
    return Array.from(found);
  }, [subject, htmlBody, textBody]);

  const tokenOptions = useMemo(() => {
    const seen = new Set(BUILTIN_TOKENS);
    const extras: string[] = [];
    for (const v of detectedVars) {
      if (!seen.has(v)) {
        seen.add(v);
        extras.push(v);
      }
    }
    return [...BUILTIN_TOKENS, ...extras];
  }, [detectedVars]);

  async function preview() {
    try {
      const res = await svc.previewTemplate({
        subject,
        htmlBody,
        textBody,
        preheader,
        category,
        sampleVars,
        footerSnippetId: footerSnippetId || null,
      });
      setPreviewHtml(res.data?.html ?? '');
    } catch {
      showToast.error('Preview failed');
    }
  }

  async function testSend() {
    const to = await promptDialog({ title: 'Send test', label: 'Send a test to which address?' });
    if (!to) return;
    try {
      await svc.testSendTemplate({
        to,
        subject,
        htmlBody,
        textBody,
        preheader,
        category,
        sampleVars,
        footerSnippetId: footerSnippetId || null,
      });
      showToast.success(`Test sent to ${to}`);
    } catch {
      showToast.error('Test send failed (check sender config)');
    }
  }

  async function insertImage(file: File) {
    setUploading(true);
    try {
      const res = await svc.uploadAsset(file);
      const url = res.data?.url;
      if (!url) {
        showToast.error('Upload returned no URL');
        return;
      }
      applyExternalHtml((h) => `${h}\n<img src="${url}" alt="" style="max-width:100%"/>`);
      showToast.success('Image inserted');
    } catch {
      showToast.error('Image upload failed');
    } finally {
      setUploading(false);
    }
  }

  function insertToken(token: string) {
    if (!token) return;
    applyExternalHtml((h) => `${h}{{${token}}}`);
  }

  async function runLint() {
    setLinting(true);
    try {
      const res = await svc.lintTemplate({ subject, htmlBody, textBody });
      setLint(res.data ?? { warnings: [], score: 0 });
    } catch {
      showToast.error('Lint failed');
    } finally {
      setLinting(false);
    }
  }

  async function genPlainText() {
    try {
      const res = await svc.generatePlainText(htmlBody);
      setTextBody(res.data?.text ?? '');
      showToast.success('Plain-text generated');
    } catch {
      showToast.error('Could not generate plain-text');
    }
  }

  async function appendSnippet(snippet: EmailSnippet) {
    applyExternalHtml((h) => `${h}\n${snippet.html}`);
    showToast.success(`Inserted "${snippet.name}"`);
  }

  async function save() {
    if (!name || !subject || !htmlBody) {
      showToast.error('Name, subject and body are required');
      return;
    }
    setBusy(true);
    try {
      const body = {
        name,
        subject,
        preheader,
        category,
        status,
        htmlBody,
        textBody,
        variableSample: sampleVars,
        footerSnippetId: footerSnippetId || null,
      };
      if (template.id) await svc.updateTemplate(template.id, body);
      else await svc.createTemplate(body);
      showToast.success('Template saved');
      onSaved();
    } catch {
      showToast.error('Save failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      data-lenis-prevent
    >
      <div className="flex h-[90vh] w-full max-w-5xl flex-col rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-3">
          <h2 className="text-lg font-bold text-[var(--text)]">
            {template.id ? 'Edit' : 'New'} template
          </h2>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="secondary"
              leftIcon={<Eye className="h-4 w-4" />}
              onClick={preview}
            >
              Preview
            </Button>
            <Button
              size="sm"
              variant="secondary"
              leftIcon={<Send className="h-4 w-4" />}
              onClick={testSend}
            >
              Test
            </Button>
            <Button
              size="sm"
              leftIcon={<Save className="h-4 w-4" />}
              isLoading={busy}
              onClick={save}
            >
              Save
            </Button>
            {template.id && (
              <>
                <Button
                  size="sm"
                  variant="secondary"
                  leftIcon={<History className="h-4 w-4" />}
                  onClick={() => setShowVersions((v) => !v)}
                >
                  History
                </Button>
                <Tooltip content="Delete">
                  <button
                    onClick={async () => {
                      if (
                        !(await confirmDialog({
                          title: 'Delete template',
                          message: 'Delete template?',
                          confirmLabel: 'Delete',
                          variant: 'danger',
                        }))
                      )
                        return;
                      await svc.deleteTemplate(template.id!);
                      onSaved();
                    }}
                    className="rounded p-1.5 text-red-500 hover:bg-red-50"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </Tooltip>
              </>
            )}
            <Button size="sm" variant="ghost" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
        <div className="grid flex-1 grid-cols-2 gap-4 overflow-hidden p-4">
          <div className="space-y-3 overflow-y-auto pr-1" data-lenis-prevent>
            <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} />
            <Input label="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
            <Input
              label="Preheader"
              value={preheader}
              onChange={(e) => setPreheader(e.target.value)}
            />
            <div className="flex gap-2">
              <div className="flex-1">
                <Select
                  label="Category"
                  options={CATEGORIES.map((c) => ({ value: c, label: c }))}
                  value={category}
                  onChange={(v) => setCategory(v as EmailTemplateCategory)}
                  clearable={false}
                />
              </div>
              <div className="flex-1">
                <Select
                  label="Status"
                  options={STATUSES.map((s) => ({ value: s, label: s }))}
                  value={status}
                  onChange={(v) => setStatus(v as EmailTemplate['status'])}
                  clearable={false}
                />
              </div>
            </div>

            {/* Reusable footer — attached footers render at the bottom of every
                send (above the compliance footer) and can be shared across templates. */}
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <Select
                  label="Footer (reusable)"
                  options={[
                    { value: '', label: 'No footer' },
                    ...footers.map((f) => ({ value: f.id, label: f.name })),
                  ]}
                  value={footerSnippetId}
                  onChange={(v) => setFooterSnippetId(v)}
                  clearable={false}
                />
              </div>
              <Button
                size="sm"
                variant="secondary"
                leftIcon={<Plus className="h-3.5 w-3.5" />}
                onClick={() => setShowFooterModal(true)}
              >
                New footer
              </Button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void insertImage(f);
                  e.target.value = '';
                }}
              />
              <Button
                size="sm"
                variant="secondary"
                leftIcon={<ImagePlus className="h-4 w-4" />}
                isLoading={uploading}
                onClick={() => fileRef.current?.click()}
              >
                Insert image
              </Button>
              <div className="flex items-center gap-1.5">
                <Braces className="h-4 w-4 shrink-0 text-[var(--text-muted)]" />
                <div className="w-36">
                  <Select
                    options={tokenOptions.map((tk) => ({ value: tk, label: `{{${tk}}}` }))}
                    value=""
                    onChange={(v) => insertToken(v)}
                    placeholder="Insert token…"
                    size="sm"
                    clearable={false}
                  />
                </div>
              </div>
              <SnippetPicker onPick={appendSnippet} />
              <Button
                size="sm"
                variant="secondary"
                leftIcon={<CheckCircle2 className="h-4 w-4" />}
                isLoading={linting}
                onClick={runLint}
              >
                Lint
              </Button>
              <Button
                size="sm"
                variant="secondary"
                leftIcon={<AlignLeft className="h-4 w-4" />}
                onClick={genPlainText}
              >
                Plain-text
              </Button>
            </div>

            {lint && (
              <div className="rounded-lg border border-[var(--border)] p-3">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-xs font-semibold text-[var(--text)]">Lint results</p>
                  <Badge
                    variant={lint.score >= 80 ? 'success' : lint.score >= 50 ? 'warning' : 'error'}
                    size="sm"
                  >
                    Score {lint.score}
                  </Badge>
                </div>
                {lint.warnings.length === 0 ? (
                  <p className="text-xs text-[var(--text-muted)]">No warnings — looks good.</p>
                ) : (
                  <ul className="list-disc space-y-1 pl-4 text-xs text-[var(--text-secondary)]">
                    {lint.warnings.map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            <div className="block text-sm">
              <div className="mb-1.5 flex items-center justify-between">
                <span className="font-medium text-[var(--text)]">Body</span>
                <div className="flex overflow-hidden rounded-lg border border-[var(--border)] text-xs">
                  <button
                    type="button"
                    onClick={async () => {
                      if (
                        editorMode !== 'visual' &&
                        isComplexHtml(htmlBody) &&
                        !(await confirmDialog({
                          title: 'Switch to visual editor',
                          message:
                            'This template contains tables/images/inline styles that the visual editor may simplify. Switch anyway?',
                          confirmLabel: 'Switch',
                          variant: 'warning',
                        }))
                      ) {
                        return;
                      }
                      setEditorMode('visual');
                    }}
                    className={`px-2.5 py-1 ${editorMode === 'visual' ? 'bg-blue-50 font-semibold text-blue-700' : 'text-[var(--text-muted)]'}`}
                  >
                    Visual
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditorMode('html')}
                    className={`px-2.5 py-1 ${editorMode === 'html' ? 'bg-blue-50 font-semibold text-blue-700' : 'text-[var(--text-muted)]'}`}
                  >
                    HTML
                  </button>
                </div>
              </div>
              <p className="mb-1.5 text-xs text-[var(--text-muted)]">
                Visual mode suits simple content; use HTML mode for tables/images/full documents.
              </p>
              {editorMode === 'visual' ? (
                <RichTextEditor
                  key={editorKey}
                  value={htmlBody}
                  onChange={setHtmlBody}
                  placeholder="Write your email… use {{variable}} tokens; a branded layout + footer + unsubscribe are added automatically."
                />
              ) : (
                <textarea
                  value={htmlBody}
                  onChange={(e) => setHtmlBody(e.target.value)}
                  rows={14}
                  placeholder="<h1>Hi {{first_name}}</h1><p>…</p>  — use {{variable}} tokens; a branded layout + footer + unsubscribe are added automatically."
                  className="w-full rounded-lg border border-[var(--border)] p-2 font-mono text-xs"
                />
              )}
            </div>
            <label className="block text-sm">
              <span className="mb-1.5 block font-medium text-[var(--text)]">
                Plain-text (optional)
              </span>
              <textarea
                value={textBody}
                onChange={(e) => setTextBody(e.target.value)}
                rows={4}
                className="w-full rounded-lg border border-[var(--border)] p-2 font-mono text-xs"
              />
            </label>
            {detectedVars.length > 0 && (
              <div className="rounded-lg border border-[var(--border)] p-3">
                <p className="mb-2 text-xs font-semibold text-[var(--text)]">
                  Variables — sample values for preview &amp; test
                </p>
                <div className="space-y-1.5">
                  {detectedVars.map((k) => (
                    <div key={k} className="flex items-center gap-2">
                      <code className="w-32 shrink-0 truncate text-xs text-[var(--text-muted)]">{`{{${k}}}`}</code>
                      <input
                        value={sampleVars[k] ?? ''}
                        onChange={(e) => setSampleVars((s) => ({ ...s, [k]: e.target.value }))}
                        placeholder={`sample ${k}`}
                        className="flex-1 rounded border border-[var(--border)] px-2 py-1 text-xs"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {template.id && showVersions && (
              <VersionHistory
                templateId={template.id}
                onRestored={(restored) => {
                  // Sync the open builder with the restored version and remount
                  // the visual editor so tiptap shows the fresh content.
                  setSubject(restored.subject);
                  setPreheader(restored.preheader ?? '');
                  setTextBody(restored.textBody ?? '');
                  applyExternalHtml(() => restored.htmlBody);
                  qc.invalidateQueries({ queryKey: ['email-templates'] });
                }}
              />
            )}
          </div>
          <div className="flex flex-col overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)]">
            <div className="flex items-center justify-end gap-1 border-b border-[var(--border)] px-2 py-1.5">
              <Tooltip content="Desktop">
                <button
                  onClick={() => setPreviewMobile(false)}
                  className={`rounded p-1.5 ${!previewMobile ? 'bg-white text-blue-600' : 'text-[var(--text-muted)]'}`}
                >
                  <Monitor className="h-4 w-4" />
                </button>
              </Tooltip>
              <Tooltip content="Mobile">
                <button
                  onClick={() => setPreviewMobile(true)}
                  className={`rounded p-1.5 ${previewMobile ? 'bg-white text-blue-600' : 'text-[var(--text-muted)]'}`}
                >
                  <Smartphone className="h-4 w-4" />
                </button>
              </Tooltip>
            </div>
            <div className="flex flex-1 justify-center overflow-hidden">
              {previewHtml ? (
                <iframe
                  title="preview"
                  srcDoc={previewHtml}
                  style={{ width: previewMobile ? '375px' : '100%' }}
                  className="h-full bg-white"
                />
              ) : (
                <div className="flex h-full items-center justify-center p-6 text-center text-sm text-[var(--text-muted)]">
                  Click <strong className="mx-1">Preview</strong> to render with sample variables.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      {showFooterModal && (
        <FooterCreateModal
          onClose={() => setShowFooterModal(false)}
          onCreated={(id) => {
            setShowFooterModal(false);
            setFooterSnippetId(id);
            qc.invalidateQueries({ queryKey: ['email-snippets'] });
          }}
        />
      )}
    </div>
  );
}

/** Create a reusable footer (footer-category snippet) shareable across templates. */
function FooterCreateModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const [name, setName] = useState('');
  const [html, setHtml] = useState('');
  const [saving, setSaving] = useState(false);

  async function create() {
    if (!name.trim() || !html.trim()) {
      showToast.error('Name and HTML are required');
      return;
    }
    setSaving(true);
    try {
      const res = await svc.createSnippet({ name: name.trim(), category: 'footer', html });
      const id = res.data?.id;
      showToast.success('Footer saved for reuse');
      if (id) onCreated(id);
      else onClose();
    } catch {
      showToast.error('Could not save footer');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
      data-lenis-prevent
    >
      <div className="w-full max-w-lg rounded-xl bg-white p-5 shadow-xl">
        <h3 className="mb-1 text-lg font-bold text-[var(--text)]">New reusable footer</h3>
        <p className="mb-3 text-xs text-[var(--text-muted)]">
          Saved footers can be attached to any template and render at the bottom of every send
          (above the unsubscribe/compliance footer). {'{{tokens}}'} work here too.
        </p>
        <Input
          label="Footer name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Standard brand footer"
        />
        <label className="mt-2 block text-sm">
          <span className="mb-1.5 block font-medium text-[var(--text)]">Footer HTML</span>
          <textarea
            value={html}
            onChange={(e) => setHtml(e.target.value)}
            rows={8}
            placeholder={
              '<table width="100%"><tr><td style="text-align:center;color:#6b7280;font-size:12px">\n  Follow us · <a href="https://hireadda.in">hireadda.in</a>\n</td></tr></table>'
            }
            className="w-full rounded-lg border border-[var(--border)] p-2 font-mono text-xs"
          />
        </label>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button isLoading={saving} onClick={create}>
            Save footer
          </Button>
        </div>
      </div>
    </div>
  );
}

function SnippetPicker({ onPick }: { onPick: (s: EmailSnippet) => void }) {
  const { data } = useQuery({
    queryKey: ['email-snippets'],
    queryFn: () => svc.listSnippets(),
  });
  const snippets = data?.data ?? [];

  return (
    <div className="flex items-center gap-1.5">
      <Puzzle className="h-4 w-4 shrink-0 text-[var(--text-muted)]" />
      <div className="w-32">
        <Select
          options={snippets.map((s) => ({ value: s.id, label: s.name }))}
          value=""
          onChange={(v) => {
            const s = snippets.find((x) => x.id === v);
            if (s) onPick(s);
          }}
          placeholder="Snippets…"
          size="sm"
          clearable={false}
        />
      </div>
    </div>
  );
}

function VersionHistory({
  templateId,
  onRestored,
}: {
  templateId: string;
  onRestored: (restored: EmailTemplate) => void;
}) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['email-template-versions', templateId],
    queryFn: () => svc.templateVersions(templateId),
  });
  const versions: EmailTemplateVersion[] = data?.data ?? [];
  const [restoring, setRestoring] = useState<number | null>(null);

  async function restore(version: number) {
    if (
      !(await confirmDialog({
        title: 'Restore version',
        message: `Restore version ${version}? Current content will be replaced.`,
        confirmLabel: 'Restore',
        variant: 'danger',
      }))
    )
      return;
    setRestoring(version);
    try {
      const res = await svc.restoreTemplate(templateId, version);
      showToast.success(`Restored version ${version}`);
      qc.invalidateQueries({ queryKey: ['email-template-versions', templateId] });
      onRestored(res.data);
    } catch {
      showToast.error('Restore failed');
    } finally {
      setRestoring(null);
    }
  }

  return (
    <div className="rounded-lg border border-[var(--border)] p-3">
      <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-[var(--text)]">
        <History className="h-4 w-4" /> Version history
      </p>
      {isLoading && <p className="text-xs text-[var(--text-muted)]">Loading…</p>}
      {!isLoading && versions.length === 0 && (
        <p className="text-xs text-[var(--text-muted)]">No previous versions.</p>
      )}
      <div className="space-y-1.5">
        {versions.map((v) => (
          <div key={v.id} className="flex items-center gap-2 text-xs">
            <Badge variant="secondary" size="sm">
              v{v.version}
            </Badge>
            <span className="flex-1 truncate text-[var(--text-secondary)]">{v.subject}</span>
            <span className="shrink-0 text-[var(--text-muted)]">
              {new Date(v.createdAt).toLocaleDateString()}
            </span>
            <Button
              size="sm"
              variant="ghost"
              leftIcon={<RotateCcw className="h-3.5 w-3.5" />}
              isLoading={restoring === v.version}
              onClick={() => restore(v.version)}
            >
              Restore
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
