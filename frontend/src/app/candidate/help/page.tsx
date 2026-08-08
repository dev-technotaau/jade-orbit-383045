'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  HelpCircle,
  ChevronDown,
  ChevronUp,
  Plus,
  Send,
  MessageSquare,
  Clock,
  Tag,
  X,
} from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import Card from '@/components/ui/Card';
import PriorityWhatsappBanner from '@/components/billing/PriorityWhatsappBanner';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Textarea from '@/components/ui/Textarea';
import Pagination from '@/components/ui/Pagination';
import Spinner from '@/components/ui/Spinner';
import EmptyState from '@/components/ui/EmptyState';
import Tooltip from '@/components/ui/Tooltip';
import { showToast } from '@/components/ui/Toast';
import { ticketService } from '@/services/ticket.service';
import { QUERY_KEYS, PAGINATION } from '@/constants/config';
import { ROUTES } from '@/constants/routes';
import { formatRelativeDate } from '@/lib/utils';
import type { TicketStatus, TicketCategory, SupportTicket } from '@/types/ticket';
import type { ApiError } from '@/types/api';
import { TICKET_STATUS_LABELS, TICKET_STATUS_COLORS, TICKET_CATEGORY_LABELS } from '@/types/ticket';

// ---------------------------------------------------------------------------
// FAQ Data
// ---------------------------------------------------------------------------

const FAQ_ITEMS = [
  {
    question: 'How does the application process work?',
    answer:
      'Once you find a job you are interested in, click "Apply" on the job listing. You will be prompted to review your profile and submit any required documents. After applying, you can track the status of your application from the Applications page. Employers will review your application and may reach out for interviews through the platform.',
  },
  {
    question: 'How can I improve my profile to attract more employers?',
    answer:
      'Complete all sections of your profile, including a professional headline, summary, work experience, education, and skills. Upload a professional photo and keep your resume up to date. A profile completeness score above 80% significantly increases your visibility in employer searches. Adding relevant certifications and portfolio links also helps.',
  },
  {
    question: 'What file formats are supported for resume uploads?',
    answer:
      'We accept resumes in PDF, DOC, and DOCX formats. The maximum file size is 5 MB. We recommend uploading a PDF to ensure formatting is preserved. Once uploaded, our AI-powered resume parser will extract key information to enhance your profile automatically.',
  },
  {
    question: 'How do I search and filter jobs effectively?',
    answer:
      'Use the search bar on the Jobs page to enter keywords, job titles, or company names. You can refine results using filters for location, experience level, salary range, job type (full-time, part-time, remote), and industry. Save your frequently used search filters as Saved Searches to get notified when new matching jobs are posted.',
  },
  {
    question: 'How do notifications work?',
    answer:
      'You can receive notifications via email, SMS, WhatsApp, and in-app push notifications. Configure your preferences from Settings > Notifications. You will be notified about new job matches, application status updates, messages from employers, and profile views. Real-time in-app notifications appear in the bell icon at the top of the page.',
  },
  {
    question: 'How do I keep my account secure?',
    answer:
      'We recommend enabling Two-Factor Authentication (MFA) from Settings > Security. You can also register passkeys for passwordless sign-in. Regularly review your active sessions and revoke any you do not recognise. Use a strong, unique password and never share your login credentials. If you suspect unauthorised access, change your password immediately and contact support.',
  },
];

// ---------------------------------------------------------------------------
// Tab filter definitions
// ---------------------------------------------------------------------------

type TabKey = 'all' | 'open' | 'resolved' | 'closed';

const TABS: { key: TabKey; label: string; status?: TicketStatus }[] = [
  { key: 'all', label: 'All' },
  { key: 'open', label: 'Open', status: 'OPEN' },
  { key: 'resolved', label: 'Resolved', status: 'RESOLVED' },
  { key: 'closed', label: 'Closed', status: 'CLOSED' },
];

const CATEGORY_OPTIONS = (Object.keys(TICKET_CATEGORY_LABELS) as TicketCategory[]).map((cat) => ({
  value: cat,
  label: TICKET_CATEGORY_LABELS[cat],
}));

const TICKETS_PER_PAGE = PAGINATION.DEFAULT_LIMIT;

// ---------------------------------------------------------------------------
// Page Component
// ---------------------------------------------------------------------------

export default function CandidateHelpPage() {
  const router = useRouter();
  const queryClient = useQueryClient();

  // ── Tabs / pagination state ──
  const [activeTab, setActiveTab] = useState<TabKey>('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(TICKETS_PER_PAGE);

  // ── New ticket form state ──
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<string>('GENERAL');

  // ── FAQ accordion state ──
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  // ── Derived status filter ──
  const statusFilter = TABS.find((t) => t.key === activeTab)?.status;

  // ── Fetch tickets ──
  const { data, isLoading } = useQuery({
    queryKey: [...QUERY_KEYS.TICKETS.MY_LIST, activeTab, page, pageSize],
    queryFn: () => ticketService.getMyTickets(page, pageSize, statusFilter),
  });

  const tickets: SupportTicket[] = data?.data?.items ?? [];
  const totalPages = data?.data?.totalPages ?? 1;
  const totalItems = data?.data?.total ?? 0;

  // ── Create ticket mutation ──
  const createMutation = useMutation({
    mutationFn: () =>
      ticketService.createTicket({
        subject: subject.trim(),
        description: description.trim(),
        category: category as TicketCategory,
      }),
    onSuccess: () => {
      showToast.success('Ticket created successfully');
      setShowCreateForm(false);
      setSubject('');
      setDescription('');
      setCategory('GENERAL');
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.TICKETS.MY_LIST });
    },
    onError: (err) => {
      const error = err as unknown as ApiError;
      showToast.error(error.message || 'Failed to create ticket');
    },
  });

  const handleCreateTicket = (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject.trim()) {
      showToast.error('Subject is required');
      return;
    }
    if (!description.trim()) {
      showToast.error('Description is required');
      return;
    }
    createMutation.mutate();
  };

  const handleTabChange = (tab: TabKey) => {
    setActiveTab(tab);
    setPage(1);
  };

  return (
    <DashboardLayout requiredRole={['CANDIDATE']}>
      <div className="space-y-8">
        {/* ── Page header ── */}
        <div>
          <h1 className="text-2xl font-bold text-[var(--text)]">Help &amp; Support</h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            Find answers to common questions or create a support ticket
          </p>
        </div>

        <PriorityWhatsappBanner role="candidate" />

        {/* ─────────────────────────────────────────────────────── */}
        {/* FAQ Section                                            */}
        {/* ─────────────────────────────────────────────────────── */}
        <section>
          <h2 className="mb-4 text-lg font-semibold text-[var(--text)]">
            Frequently Asked Questions
          </h2>
          <div className="space-y-3">
            {FAQ_ITEMS.map((faq, idx) => (
              <Card key={idx} variant="bordered" padding="sm">
                <button
                  type="button"
                  className="flex w-full cursor-pointer items-center justify-between text-left"
                  onClick={() => setOpenFaq(openFaq === idx ? null : idx)}
                >
                  <span className="pr-4 text-sm font-medium text-[var(--text)]">
                    {faq.question}
                  </span>
                  {openFaq === idx ? (
                    <ChevronUp className="h-4 w-4 shrink-0 text-[var(--text-muted)]" />
                  ) : (
                    <ChevronDown className="h-4 w-4 shrink-0 text-[var(--text-muted)]" />
                  )}
                </button>
                {openFaq === idx && (
                  <p className="mt-3 text-sm leading-relaxed text-[var(--text-secondary)]">
                    {faq.answer}
                  </p>
                )}
              </Card>
            ))}
          </div>
        </section>

        {/* ─────────────────────────────────────────────────────── */}
        {/* My Tickets Section                                     */}
        {/* ─────────────────────────────────────────────────────── */}
        <section>
          {/* Header + Create button */}
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-[var(--text)]">My Tickets</h2>
            <Button
              size="sm"
              leftIcon={showCreateForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
              variant={showCreateForm ? 'outline' : 'primary'}
              onClick={() => setShowCreateForm(!showCreateForm)}
              tooltip={showCreateForm ? 'Cancel creating ticket' : 'Create a new support ticket'}
            >
              {showCreateForm ? 'Cancel' : 'Create New Ticket'}
            </Button>
          </div>

          {/* ── Inline create ticket form ── */}
          {showCreateForm && (
            <Card variant="bordered" className="mb-6">
              <form onSubmit={handleCreateTicket} className="space-y-4">
                <h3 className="text-base font-semibold text-[var(--text)]">New Support Ticket</h3>

                <Input
                  label="Subject"
                  placeholder="Brief summary of your issue"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  required
                />

                <Textarea
                  label="Description"
                  placeholder="Describe your issue in detail..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={5}
                  required
                />

                <Select
                  label="Category"
                  options={CATEGORY_OPTIONS}
                  value={category}
                  onChange={(val) => setCategory(val)}
                  placeholder="Select a category"
                />

                <div className="flex justify-end">
                  <Button
                    type="submit"
                    isLoading={createMutation.isPending}
                    leftIcon={<Send className="h-4 w-4" />}
                    tooltip="Submit your support ticket"
                  >
                    Submit Ticket
                  </Button>
                </div>
              </form>
            </Card>
          )}

          {/* ── Tab bar (state-driven, not Tabs component) ── */}
          <div className="mb-4 flex gap-1 border-b border-[var(--border)]">
            {TABS.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => handleTabChange(tab.key)}
                className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors duration-200 ${
                  activeTab === tab.key
                    ? 'border-primary text-primary'
                    : 'border-transparent text-[var(--text-muted)] hover:border-[var(--border)] hover:text-[var(--text)]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* ── Ticket list ── */}
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Spinner size="lg" />
            </div>
          ) : tickets.length === 0 ? (
            <EmptyState
              icon={MessageSquare}
              title="No tickets found"
              description={
                activeTab === 'all'
                  ? 'You have not created any support tickets yet.'
                  : `No ${TABS.find((t) => t.key === activeTab)?.label.toLowerCase()} tickets found.`
              }
              action={
                !showCreateForm ? (
                  <Button
                    size="sm"
                    leftIcon={<Plus className="h-4 w-4" />}
                    onClick={() => setShowCreateForm(true)}
                    tooltip="Create a new support ticket"
                  >
                    Create New Ticket
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <div className="space-y-3">
              {tickets.map((ticket) => (
                <Card
                  key={ticket.id}
                  variant="bordered"
                  padding="sm"
                  onClick={() => router.push(ROUTES.CANDIDATE.TICKET_DETAIL(ticket.id))}
                  className="hover:border-primary/40 cursor-pointer"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    {/* Left: ticket info */}
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs text-[var(--text-muted)]">
                          {ticket.ticketNumber}
                        </span>
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${TICKET_STATUS_COLORS[ticket.status]}`}
                        >
                          {TICKET_STATUS_LABELS[ticket.status]}
                        </span>
                        <span className="inline-flex items-center rounded-full bg-[var(--bg-secondary)] px-2 py-0.5 text-xs font-medium text-[var(--text-secondary)]">
                          <Tag className="mr-1 h-3 w-3" />
                          {TICKET_CATEGORY_LABELS[ticket.category]}
                        </span>
                      </div>
                      <p className="truncate text-sm font-medium text-[var(--text)]">
                        {ticket.subject}
                      </p>
                    </div>

                    {/* Right: meta */}
                    <div className="flex shrink-0 items-center gap-4 text-xs text-[var(--text-muted)]">
                      {ticket._count?.messages !== undefined && (
                        <span className="flex items-center gap-1">
                          <MessageSquare className="h-3.5 w-3.5" />
                          {ticket._count.messages}
                        </span>
                      )}
                      <span className="flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5" />
                        {formatRelativeDate(ticket.updatedAt)}
                      </span>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}

          {/* ── Pagination ── */}
          {totalItems > 0 && (
            <div className="mt-6">
              <Pagination
                currentPage={page}
                totalPages={totalPages}
                onPageChange={setPage}
                totalItems={totalItems}
                pageSize={pageSize}
                onPageSizeChange={(s) => {
                  setPageSize(s);
                  setPage(1);
                }}
              />
            </div>
          )}
        </section>
      </div>
    </DashboardLayout>
  );
}
