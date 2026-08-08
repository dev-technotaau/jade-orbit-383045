'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { HelpCircle, ChevronDown, Plus, MessageSquare, Clock, Send, Ticket } from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import Card from '@/components/ui/Card';
import PriorityWhatsappBanner from '@/components/billing/PriorityWhatsappBanner';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Textarea from '@/components/ui/Textarea';
import Select from '@/components/ui/Select';
import Tabs from '@/components/ui/Tabs';
import Spinner from '@/components/ui/Spinner';
import Pagination from '@/components/ui/Pagination';
import EmptyState from '@/components/ui/EmptyState';
import Tooltip from '@/components/ui/Tooltip';
import { showToast } from '@/components/ui/Toast';
import { ticketService } from '@/services/ticket.service';
import { QUERY_KEYS, PAGINATION } from '@/constants/config';
import { ROUTES } from '@/constants/routes';
import { formatRelativeDate } from '@/lib/utils';
import type { ApiError } from '@/types/api';
import type { TicketStatus, TicketCategory, CreateTicketRequest } from '@/types/ticket';
import { TICKET_STATUS_LABELS, TICKET_STATUS_COLORS, TICKET_CATEGORY_LABELS } from '@/types/ticket';

// ── FAQ Data ──

interface FaqItem {
  question: string;
  answer: string;
}

const FAQS: FaqItem[] = [
  {
    question: 'How do I post a new job?',
    answer:
      'Navigate to "My Jobs" from the sidebar and click "Post New Job". Fill in the job title, description, requirements, location, salary range, and other details. You can save as a draft or publish immediately. Published jobs will be visible to candidates within minutes.',
  },
  {
    question: 'How do I manage applications for my job postings?',
    answer:
      'Go to "My Jobs", click on a specific job posting, and select "View Applications". You can filter applications by status (New, Reviewed, Shortlisted, Rejected), view candidate profiles, download resumes, and update application statuses. You can also leave internal notes on each application.',
  },
  {
    question: 'How do I search for and find candidates?',
    answer:
      'Use the "Candidates" section in the sidebar to access our candidate search. Filter by skills, experience, location, education, and more. You can save searches for later use, bookmark promising candidates, and send them messages or invitations to apply for your open positions.',
  },
  {
    question: 'How does company verification work?',
    answer:
      'Go to "Verification" in the sidebar to start the process. Upload your business registration documents (GST certificate, PAN, incorporation certificate). Our team reviews submissions within 2-3 business days. Verified companies receive a badge on their profile and job postings, which increases candidate trust and application rates.',
  },
  {
    question: 'How does billing and subscription work?',
    answer:
      'Hire Adda offers flexible plans for employers. Visit your account settings to view your current plan, usage, and upgrade options. You can manage payment methods, download invoices, and set up auto-renewal. Contact our support team if you need a custom enterprise plan.',
  },
  {
    question: 'How do I use webhooks and the API?',
    answer:
      'Go to Settings > Webhooks to configure HTTP endpoints that receive real-time notifications for events like new applications, status changes, and messages. Each webhook is secured with HMAC signatures. You can test webhooks, view delivery history, and retry failed deliveries. For API access, refer to our developer documentation.',
  },
];

// ── Tab Config ──

const STATUS_TABS = [
  { key: 'all', label: 'All' },
  { key: 'OPEN', label: 'Open' },
  { key: 'RESOLVED', label: 'Resolved' },
  { key: 'CLOSED', label: 'Closed' },
];

// ── Category Options ──

const CATEGORY_OPTIONS = [
  { value: 'GENERAL', label: 'General' },
  { value: 'TECHNICAL', label: 'Technical' },
  { value: 'BILLING', label: 'Billing' },
  { value: 'JOB_POSTING', label: 'Job Posting' },
  { value: 'VERIFICATION', label: 'Verification' },
  { value: 'OTHER', label: 'Other' },
];

// ── Main Page ──

export default function EmployerHelpPage() {
  return (
    <DashboardLayout requiredRole={['EMPLOYER']}>
      <div className="space-y-8">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text)]">Help & Support</h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            Find answers to common questions or contact our support team
          </p>
        </div>

        <PriorityWhatsappBanner role="employer" />

        <FaqSection />
        <TicketsSection />
      </div>
    </DashboardLayout>
  );
}

// ── FAQ Section ──

function FaqSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const toggle = (index: number) => {
    setOpenIndex((prev) => (prev === index ? null : index));
  };

  return (
    <Card>
      <div className="mb-6 flex items-center gap-3">
        <div className="bg-primary-light flex h-10 w-10 items-center justify-center rounded-lg">
          <HelpCircle className="text-primary h-5 w-5" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-[var(--text)]">Frequently Asked Questions</h2>
          <p className="text-sm text-[var(--text-secondary)]">
            Quick answers to common employer questions
          </p>
        </div>
      </div>

      <div className="divide-y divide-[var(--border)]">
        {FAQS.map((faq, index) => (
          <div key={index}>
            <Tooltip content="Toggle answer" className="w-full">
              <button
                type="button"
                onClick={() => toggle(index)}
                className="hover:text-primary flex w-full cursor-pointer items-center justify-between py-4 text-left transition-colors"
              >
                <span className="pr-4 text-sm font-medium text-[var(--text)]">{faq.question}</span>
                <ChevronDown
                  className={`h-4 w-4 shrink-0 text-[var(--text-muted)] transition-transform duration-200 ${
                    openIndex === index ? 'rotate-180' : ''
                  }`}
                />
              </button>
            </Tooltip>
            {openIndex === index && (
              <p className="pb-4 text-sm leading-relaxed text-[var(--text-secondary)]">
                {faq.answer}
              </p>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}

// ── Tickets Section ──

function TicketsSection() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(PAGINATION.DEFAULT_LIMIT);
  const [showCreateForm, setShowCreateForm] = useState(false);

  // ── Create ticket form state ──
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<TicketCategory>('GENERAL');

  const statusFilter = activeTab === 'all' ? undefined : (activeTab as TicketStatus);

  const { data, isLoading } = useQuery({
    queryKey: [...QUERY_KEYS.TICKETS.MY_LIST, statusFilter, page, pageSize],
    queryFn: () => ticketService.getMyTickets(page, pageSize, statusFilter),
  });

  const tickets = data?.data?.items ?? [];
  const totalPages = data?.data?.totalPages ?? 1;
  const totalItems = data?.data?.total ?? 0;

  const createMutation = useMutation({
    mutationFn: (payload: CreateTicketRequest) => ticketService.createTicket(payload),
    onSuccess: () => {
      showToast.success('Ticket created successfully');
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.TICKETS.MY_LIST });
      setShowCreateForm(false);
      setSubject('');
      setDescription('');
      setCategory('GENERAL');
    },
    onError: (err) => {
      const error = err as unknown as ApiError;
      showToast.error(error.message || 'Failed to create ticket');
    },
  });

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject.trim() || !description.trim()) {
      showToast.error('Please fill in all required fields');
      return;
    }
    createMutation.mutate({ subject: subject.trim(), description: description.trim(), category });
  };

  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    setPage(1);
  };

  return (
    <Card>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-primary-light flex h-10 w-10 items-center justify-center rounded-lg">
            <Ticket className="text-primary h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-[var(--text)]">My Tickets</h2>
            <p className="text-sm text-[var(--text-secondary)]">
              Track and manage your support requests
            </p>
          </div>
        </div>
        <Button
          variant={showCreateForm ? 'outline' : 'primary'}
          size="sm"
          leftIcon={<Plus className="h-4 w-4" />}
          onClick={() => setShowCreateForm(!showCreateForm)}
          tooltip={showCreateForm ? 'Cancel creation' : 'Create new ticket'}
        >
          {showCreateForm ? 'Cancel' : 'Create New Ticket'}
        </Button>
      </div>

      {/* Create Ticket Form */}
      {showCreateForm && (
        <form
          onSubmit={handleCreate}
          className="mb-6 space-y-4 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] p-5"
        >
          <h3 className="text-sm font-semibold text-[var(--text)]">New Support Ticket</h3>
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
            rows={4}
            required
          />
          <Select
            label="Category"
            options={CATEGORY_OPTIONS}
            value={category}
            onChange={(val) => setCategory(val as TicketCategory)}
            placeholder="Select a category"
          />
          <div className="flex justify-end pt-1">
            <Button
              type="submit"
              isLoading={createMutation.isPending}
              leftIcon={<Send className="h-4 w-4" />}
              tooltip="Submit support ticket"
            >
              Submit Ticket
            </Button>
          </div>
        </form>
      )}

      {/* Tabs */}
      <Tabs tabs={STATUS_TABS} activeTab={activeTab} onChange={handleTabChange} />

      {/* Ticket List */}
      <div className="mt-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Spinner size="lg" />
          </div>
        ) : tickets.length === 0 ? (
          <EmptyState
            icon={MessageSquare}
            title="No tickets found"
            description={
              activeTab === 'all'
                ? 'You have not created any support tickets yet.'
                : `No ${STATUS_TABS.find((t) => t.key === activeTab)?.label.toLowerCase()} tickets found.`
            }
            action={
              !showCreateForm ? (
                <Button
                  variant="primary"
                  size="sm"
                  leftIcon={<Plus className="h-4 w-4" />}
                  onClick={() => setShowCreateForm(true)}
                  tooltip="Create new ticket"
                >
                  Create New Ticket
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="space-y-3">
            {tickets.map((ticket) => (
              <div
                key={ticket.id}
                onClick={() => router.push(ROUTES.EMPLOYER.TICKET_DETAIL(ticket.id))}
                className="flex cursor-pointer items-center justify-between rounded-lg border border-[var(--border)] p-4 transition-all duration-200 hover:border-[var(--border-hover)] hover:shadow-[var(--shadow-md)]"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs text-[var(--text-muted)]">
                      {ticket.ticketNumber}
                    </span>
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                        TICKET_STATUS_COLORS[ticket.status]
                      }`}
                    >
                      {TICKET_STATUS_LABELS[ticket.status]}
                    </span>
                    <span className="inline-flex items-center rounded-full bg-[var(--bg-tertiary)] px-2 py-0.5 text-xs font-medium text-[var(--text-secondary)]">
                      {TICKET_CATEGORY_LABELS[ticket.category]}
                    </span>
                  </div>
                  <p className="mt-1 truncate text-sm font-medium text-[var(--text)]">
                    {ticket.subject}
                  </p>
                </div>
                <div className="ml-4 flex shrink-0 items-center gap-4">
                  {ticket._count?.messages !== undefined && (
                    <Tooltip content="Messages">
                      <div
                        className="flex items-center gap-1 text-[var(--text-muted)]"
                        aria-label="Messages"
                      >
                        <MessageSquare className="h-3.5 w-3.5" />
                        <span className="text-xs">{ticket._count.messages}</span>
                      </div>
                    </Tooltip>
                  )}
                  <Tooltip content="Last updated">
                    <div
                      className="flex items-center gap-1 text-[var(--text-muted)]"
                      aria-label="Last updated"
                    >
                      <Clock className="h-3.5 w-3.5" />
                      <span className="text-xs whitespace-nowrap">
                        {formatRelativeDate(ticket.updatedAt)}
                      </span>
                    </div>
                  </Tooltip>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Pagination */}
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
    </Card>
  );
}
