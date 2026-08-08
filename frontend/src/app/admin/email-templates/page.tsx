'use client';

import { useMemo, useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Mail, Eye, Send, Loader2, CheckCircle2, Search } from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Tooltip from '@/components/ui/Tooltip';
import api from '@/lib/api';
import { API } from '@/constants/api';

interface EmailTemplate {
  key: string;
  description: string;
}

interface PreviewData {
  subject: string;
  html: string;
  text: string;
}

export default function EmailTemplatesPage() {
  const [selectedTemplate, setSelectedTemplate] = useState<string>('');
  const [testEmail, setTestEmail] = useState('');
  const [testSent, setTestSent] = useState(false);
  const [filter, setFilter] = useState('');

  const { data: templatesData, isLoading } = useQuery({
    queryKey: ['admin', 'email-templates'],
    queryFn: async () => {
      const res = await api.get(API.ADMIN.EMAIL_TEMPLATES);
      return res.data as { status: string; data: EmailTemplate[] };
    },
  });

  const templates = templatesData?.data ?? [];

  /**
   * Grouped by the key's namespace ("billing.planExpired" → "billing").
   *
   * The list was a flat scroll, which was workable at ~39 templates and is
   * not at 77: finding one meant scrolling past every unrelated domain. The
   * key prefix is already the de-facto grouping in the registry, so it needs
   * no extra metadata to become a heading.
   */
  const grouped = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const matched = q
      ? templates.filter(
          (t) => t.key.toLowerCase().includes(q) || (t.description ?? '').toLowerCase().includes(q),
        )
      : templates;

    const map = new Map<string, EmailTemplate[]>();
    for (const t of matched) {
      const group = t.key.includes('.') ? t.key.split('.')[0]! : 'other';
      const list = map.get(group);
      if (list) list.push(t);
      else map.set(group, [t]);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [templates, filter]);

  const matchCount = grouped.reduce((n, [, list]) => n + list.length, 0);

  const { data: previewData, isFetching: isPreviewLoading } = useQuery({
    queryKey: ['admin', 'email-preview', selectedTemplate],
    queryFn: async () => {
      const res = await api.post(API.ADMIN.EMAIL_TEMPLATES_PREVIEW, {
        templateName: selectedTemplate,
      });
      return res.data as { status: string; data: PreviewData };
    },
    enabled: !!selectedTemplate,
  });

  const preview = previewData?.data;

  const sendTestMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post(API.ADMIN.EMAIL_TEMPLATES_TEST, {
        templateName: selectedTemplate,
        toEmail: testEmail,
      });
      return res.data;
    },
    onSuccess: () => {
      setTestSent(true);
      setTimeout(() => setTestSent(false), 3000);
    },
  });

  return (
    <DashboardLayout
      requiredRole={['ADMIN', 'SUPER_ADMIN']}
      requiredPermission="platform.email_templates.view"
    >
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text)]">Email Templates</h1>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            Preview and test email templates used across the platform.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Template List */}
          <Card header={<h2 className="text-lg font-semibold text-[var(--text)]">Templates</h2>}>
            {isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="h-12 animate-pulse rounded-lg bg-[var(--bg-secondary)]" />
                ))}
              </div>
            ) : (
              <>
                <div className="relative mb-3">
                  <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
                  <input
                    type="text"
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                    placeholder="Search templates…"
                    aria-label="Search email templates"
                    className="focus:border-primary focus:ring-primary/20 w-full rounded-lg border border-[var(--border)] bg-white py-2 pr-3 pl-9 text-sm focus:ring-2 focus:outline-none"
                  />
                </div>
                <p className="mb-2 text-xs text-[var(--text-muted)]">
                  {matchCount} of {templates.length} templates
                </p>
                <div
                  data-lenis-prevent
                  className="max-h-[calc(100vh-20rem)] space-y-3 overflow-y-auto"
                >
                  {grouped.length === 0 && (
                    <p className="px-3 py-6 text-center text-sm text-[var(--text-muted)]">
                      No template matches “{filter}”.
                    </p>
                  )}
                  {grouped.map(([group, list]) => (
                    <div key={group}>
                      <p className="px-1 pb-1 text-[11px] font-semibold tracking-wide text-[var(--text-muted)] uppercase">
                        {group} <span className="font-normal">({list.length})</span>
                      </p>
                      <div className="space-y-1">
                        {list.map((tpl) => (
                          <Tooltip key={tpl.key} content={`Preview ${tpl.key} template`}>
                            <button
                              onClick={() => setSelectedTemplate(tpl.key)}
                              className={`w-full cursor-pointer rounded-lg px-3 py-2.5 text-left transition-colors ${
                                selectedTemplate === tpl.key
                                  ? 'bg-primary/10 text-primary'
                                  : 'text-[var(--text)] hover:bg-[var(--bg-secondary)]'
                              }`}
                            >
                              <div className="flex items-center gap-2">
                                <Mail className="h-4 w-4 shrink-0" />
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-medium">{tpl.key}</p>
                                  <p className="text-xs text-[var(--text-muted)]">
                                    {tpl.description}
                                  </p>
                                </div>
                              </div>
                            </button>
                          </Tooltip>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </Card>

          {/* Preview + Test */}
          <div className="space-y-6 lg:col-span-2">
            {selectedTemplate ? (
              <>
                <Card
                  header={
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Eye className="text-primary h-5 w-5" />
                        <h2 className="text-lg font-semibold text-[var(--text)]">Preview</h2>
                      </div>
                      {preview && (
                        <span className="text-sm text-[var(--text-muted)]">
                          Subject: {preview.subject}
                        </span>
                      )}
                    </div>
                  }
                >
                  {isPreviewLoading ? (
                    <div className="flex h-64 items-center justify-center">
                      <Loader2 className="text-primary h-6 w-6 animate-spin" />
                    </div>
                  ) : preview ? (
                    <div className="rounded-lg border border-[var(--border)] bg-white">
                      <iframe
                        srcDoc={preview.html}
                        title="Email Preview"
                        className="h-96 w-full rounded-lg"
                        sandbox=""
                      />
                    </div>
                  ) : null}
                </Card>

                <Card
                  header={
                    <div className="flex items-center gap-2">
                      <Send className="text-primary h-5 w-5" />
                      <h2 className="text-lg font-semibold text-[var(--text)]">Send Test Email</h2>
                    </div>
                  }
                >
                  <div className="flex items-end gap-3">
                    <div className="flex-1">
                      <Input
                        type="email"
                        placeholder="recipient@example.com"
                        value={testEmail}
                        onChange={(e) => setTestEmail(e.target.value)}
                      />
                    </div>
                    <Button
                      tooltip="Send a test email to the specified address"
                      onClick={() => sendTestMutation.mutate()}
                      isLoading={sendTestMutation.isPending}
                      disabled={!testEmail || !selectedTemplate}
                    >
                      {testSent ? (
                        <span className="flex items-center gap-1.5">
                          <CheckCircle2 className="h-4 w-4" />
                          Sent
                        </span>
                      ) : (
                        'Send Test'
                      )}
                    </Button>
                  </div>
                </Card>
              </>
            ) : (
              <Card>
                <div className="flex h-64 flex-col items-center justify-center text-[var(--text-muted)]">
                  <Mail className="mb-3 h-12 w-12 opacity-30" />
                  <p className="text-sm">Select a template to preview</p>
                </div>
              </Card>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
