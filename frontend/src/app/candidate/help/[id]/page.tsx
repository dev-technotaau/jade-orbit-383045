'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Send,
  Lock,
  RotateCcw,
  ThumbsUp,
  Minus,
  ThumbsDown,
  User,
  Shield,
  Bot,
} from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Textarea from '@/components/ui/Textarea';
import Tooltip from '@/components/ui/Tooltip';
import Spinner from '@/components/ui/Spinner';
import { showToast } from '@/components/ui/Toast';
import { ticketService } from '@/services/ticket.service';
import { QUERY_KEYS } from '@/constants/config';
import { ROUTES } from '@/constants/routes';
import { formatDate, formatRelativeDate } from '@/lib/utils';
import type { SupportTicket, TicketMessage, TicketSatisfaction } from '@/types/ticket';
import type { ApiError } from '@/types/api';
import {
  TICKET_STATUS_LABELS,
  TICKET_STATUS_COLORS,
  TICKET_PRIORITY_LABELS,
  TICKET_PRIORITY_COLORS,
  TICKET_CATEGORY_LABELS,
} from '@/types/ticket';

// ---------------------------------------------------------------------------
// Page Component
// ---------------------------------------------------------------------------

export default function CandidateTicketDetailPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const id = params.id as string;

  // ── Reply state ──
  const [replyBody, setReplyBody] = useState('');

  // ── Satisfaction state ──
  const [satisfactionRating, setSatisfactionRating] = useState<TicketSatisfaction | null>(null);
  const [satisfactionComment, setSatisfactionComment] = useState('');
  const [showSatisfactionComment, setShowSatisfactionComment] = useState(false);

  // ── Fetch ticket ──
  const { data, isLoading } = useQuery({
    queryKey: QUERY_KEYS.TICKETS.DETAIL(id),
    queryFn: () => ticketService.getTicket(id),
    enabled: !!id,
  });

  const ticket: SupportTicket | undefined = data?.data;

  // ── Reply mutation ──
  const replyMutation = useMutation({
    mutationFn: () => ticketService.addMessage(id, replyBody.trim()),
    onSuccess: () => {
      showToast.success('Reply sent');
      setReplyBody('');
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.TICKETS.DETAIL(id) });
    },
    onError: (err) => {
      const error = err as unknown as ApiError;
      showToast.error(error.message || 'Failed to send reply');
    },
  });

  // ── Close ticket mutation ──
  const closeMutation = useMutation({
    mutationFn: () => ticketService.closeTicket(id),
    onSuccess: () => {
      showToast.success('Ticket closed');
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.TICKETS.DETAIL(id) });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.TICKETS.MY_LIST });
    },
    onError: (err) => {
      const error = err as unknown as ApiError;
      showToast.error(error.message || 'Failed to close ticket');
    },
  });

  // ── Reopen ticket mutation ──
  const reopenMutation = useMutation({
    mutationFn: () => ticketService.reopenTicket(id),
    onSuccess: () => {
      showToast.success('Ticket reopened');
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.TICKETS.DETAIL(id) });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.TICKETS.MY_LIST });
    },
    onError: (err) => {
      const error = err as unknown as ApiError;
      showToast.error(error.message || 'Failed to reopen ticket');
    },
  });

  // ── Satisfaction mutation ──
  const satisfactionMutation = useMutation({
    mutationFn: () =>
      ticketService.submitSatisfaction(
        id,
        satisfactionRating!,
        satisfactionComment.trim() || undefined,
      ),
    onSuccess: () => {
      showToast.success('Thank you for your feedback');
      setSatisfactionRating(null);
      setSatisfactionComment('');
      setShowSatisfactionComment(false);
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.TICKETS.DETAIL(id) });
    },
    onError: (err) => {
      const error = err as unknown as ApiError;
      showToast.error(error.message || 'Failed to submit feedback');
    },
  });

  // ── Handlers ──

  const handleSendReply = (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyBody.trim()) {
      showToast.error('Reply cannot be empty');
      return;
    }
    replyMutation.mutate();
  };

  const handleSatisfactionSelect = (rating: TicketSatisfaction) => {
    setSatisfactionRating(rating);
    setShowSatisfactionComment(true);
  };

  const handleSubmitSatisfaction = () => {
    if (!satisfactionRating) return;
    satisfactionMutation.mutate();
  };

  // ── Derived ──

  const canClose =
    ticket?.status === 'OPEN' ||
    ticket?.status === 'IN_PROGRESS' ||
    ticket?.status === 'AWAITING_REPLY';
  const canReopen = ticket?.status === 'CLOSED';
  const isClosed = ticket?.status === 'CLOSED';
  const isResolved = ticket?.status === 'RESOLVED';
  const canRate = isResolved && !ticket?.satisfaction;

  // ── Loading ──
  if (isLoading) {
    return (
      <DashboardLayout requiredRole={['CANDIDATE']}>
        <div className="flex items-center justify-center py-32">
          <Spinner size="lg" />
        </div>
      </DashboardLayout>
    );
  }

  // ── Not found ──
  if (!ticket) {
    return (
      <DashboardLayout requiredRole={['CANDIDATE']}>
        <div className="py-32 text-center">
          <p className="text-[var(--text-muted)]">Ticket not found.</p>
          <Button
            variant="link"
            className="mt-4"
            onClick={() => router.push(ROUTES.CANDIDATE.HELP)}
            tooltip="Return to help center"
          >
            Back to Help
          </Button>
        </div>
      </DashboardLayout>
    );
  }

  // Filter out internal notes
  const visibleMessages = (ticket.messages ?? []).filter((m) => !m.isInternal);

  return (
    <DashboardLayout requiredRole={['CANDIDATE']}>
      <div className="space-y-6">
        {/* ─────────────────────────────────────────────────── */}
        {/* Header                                              */}
        {/* ─────────────────────────────────────────────────── */}
        <div>
          {/* Back link */}
          <Tooltip content="Back to help center">
            <button
              type="button"
              onClick={() => router.push(ROUTES.CANDIDATE.HELP)}
              className="hover:text-primary mb-4 inline-flex cursor-pointer items-center gap-1.5 text-sm text-[var(--text-muted)] transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Help
            </button>
          </Tooltip>

          {/* Title row */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-2">
              <p className="font-mono text-xs text-[var(--text-muted)]">{ticket.ticketNumber}</p>
              <h1 className="text-xl font-bold text-[var(--text)]">{ticket.subject}</h1>
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${TICKET_STATUS_COLORS[ticket.status]}`}
                >
                  {TICKET_STATUS_LABELS[ticket.status]}
                </span>
                <span
                  className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${TICKET_PRIORITY_COLORS[ticket.priority]}`}
                >
                  {TICKET_PRIORITY_LABELS[ticket.priority]}
                </span>
                <span className="inline-flex items-center rounded-full bg-[var(--bg-secondary)] px-2.5 py-1 text-xs font-medium text-[var(--text-secondary)]">
                  {TICKET_CATEGORY_LABELS[ticket.category]}
                </span>
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex shrink-0 gap-2">
              {canClose && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => closeMutation.mutate()}
                  isLoading={closeMutation.isPending}
                  leftIcon={<Lock className="h-4 w-4" />}
                  tooltip="Close this ticket"
                >
                  Close Ticket
                </Button>
              )}
              {canReopen && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => reopenMutation.mutate()}
                  isLoading={reopenMutation.isPending}
                  leftIcon={<RotateCcw className="h-4 w-4" />}
                  tooltip="Reopen this ticket"
                >
                  Reopen Ticket
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* ─────────────────────────────────────────────────── */}
        {/* Info bar                                            */}
        {/* ─────────────────────────────────────────────────── */}
        <div className="flex flex-wrap gap-x-6 gap-y-2 rounded-lg bg-[var(--bg-secondary)] px-4 py-3 text-sm text-[var(--text-secondary)]">
          <span>
            <strong className="text-[var(--text)]">Created:</strong>{' '}
            {formatDate(ticket.createdAt, "MMM dd, yyyy 'at' h:mm a")}
          </span>
          <span>
            <strong className="text-[var(--text)]">Last updated:</strong>{' '}
            {formatRelativeDate(ticket.updatedAt)}
          </span>
          {ticket.assignedTo && (
            <span>
              <strong className="text-[var(--text)]">Assigned to:</strong>{' '}
              {ticket.assignedTo.firstName} {ticket.assignedTo.lastName}
            </span>
          )}
        </div>

        {/* ─────────────────────────────────────────────────── */}
        {/* Conversation thread                                 */}
        {/* ─────────────────────────────────────────────────── */}
        <Card variant="bordered">
          <h2 className="mb-4 text-base font-semibold text-[var(--text)]">Conversation</h2>

          {visibleMessages.length === 0 ? (
            <p className="py-8 text-center text-sm text-[var(--text-muted)]">No messages yet.</p>
          ) : (
            <div className="space-y-4">
              {visibleMessages.map((msg) => (
                <MessageBubble key={msg.id} message={msg} />
              ))}
            </div>
          )}
        </Card>

        {/* ─────────────────────────────────────────────────── */}
        {/* Reply box                                           */}
        {/* ─────────────────────────────────────────────────── */}
        <Card variant="bordered">
          <form onSubmit={handleSendReply} className="space-y-3">
            <Textarea
              label="Reply"
              placeholder={
                isClosed ? 'This ticket is closed. Reopen it to reply.' : 'Type your reply...'
              }
              value={replyBody}
              onChange={(e) => setReplyBody(e.target.value)}
              rows={4}
              disabled={isClosed}
            />
            <div className="flex justify-end">
              <Button
                type="submit"
                size="sm"
                isLoading={replyMutation.isPending}
                disabled={isClosed || !replyBody.trim()}
                leftIcon={<Send className="h-4 w-4" />}
                tooltip="Send your reply"
              >
                Send Reply
              </Button>
            </div>
          </form>
        </Card>

        {/* ─────────────────────────────────────────────────── */}
        {/* Satisfaction widget (only when RESOLVED)            */}
        {/* ─────────────────────────────────────────────────── */}
        {canRate && (
          <Card variant="bordered">
            <h3 className="mb-2 text-base font-semibold text-[var(--text)]">
              How was your experience?
            </h3>
            <p className="mb-4 text-sm text-[var(--text-secondary)]">
              Your feedback helps us improve our support.
            </p>

            <div className="mb-4 flex items-center gap-3">
              <Tooltip content="Satisfied">
                <button
                  type="button"
                  onClick={() => handleSatisfactionSelect('SATISFIED')}
                  className={`flex h-12 w-12 cursor-pointer items-center justify-center rounded-full border-2 transition-colors ${
                    satisfactionRating === 'SATISFIED'
                      ? 'border-[var(--success)] bg-[var(--success-light)] text-[var(--success)]'
                      : 'border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--success)] hover:text-[var(--success)]'
                  }`}
                  aria-label="Satisfied"
                  aria-pressed={satisfactionRating === 'SATISFIED'}
                >
                  <ThumbsUp className="h-5 w-5" />
                </button>
              </Tooltip>
              <Tooltip content="Neutral">
                <button
                  type="button"
                  onClick={() => handleSatisfactionSelect('NEUTRAL')}
                  className={`flex h-12 w-12 cursor-pointer items-center justify-center rounded-full border-2 transition-colors ${
                    satisfactionRating === 'NEUTRAL'
                      ? 'border-[var(--warning)] bg-[var(--warning-light)] text-[var(--warning)]'
                      : 'border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--warning)] hover:text-[var(--warning)]'
                  }`}
                  aria-label="Neutral"
                  aria-pressed={satisfactionRating === 'NEUTRAL'}
                >
                  <Minus className="h-5 w-5" />
                </button>
              </Tooltip>
              <Tooltip content="Not satisfied">
                <button
                  type="button"
                  onClick={() => handleSatisfactionSelect('NOT_SATISFIED')}
                  className={`flex h-12 w-12 cursor-pointer items-center justify-center rounded-full border-2 transition-colors ${
                    satisfactionRating === 'NOT_SATISFIED'
                      ? 'border-[var(--error)] bg-[var(--error-light)] text-[var(--error)]'
                      : 'border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--error)] hover:text-[var(--error)]'
                  }`}
                  aria-label="Not satisfied"
                  aria-pressed={satisfactionRating === 'NOT_SATISFIED'}
                >
                  <ThumbsDown className="h-5 w-5" />
                </button>
              </Tooltip>
            </div>

            {showSatisfactionComment && (
              <div className="space-y-3">
                <Textarea
                  label="Additional comments (optional)"
                  placeholder="Tell us more about your experience..."
                  value={satisfactionComment}
                  onChange={(e) => setSatisfactionComment(e.target.value)}
                  rows={3}
                />
                <div className="flex justify-end">
                  <Button
                    size="sm"
                    onClick={handleSubmitSatisfaction}
                    isLoading={satisfactionMutation.isPending}
                    disabled={!satisfactionRating}
                    tooltip="Submit your feedback"
                  >
                    Submit Feedback
                  </Button>
                </div>
              </div>
            )}

            {ticket.satisfaction && (
              <div className="mt-4 rounded-lg bg-[var(--bg-secondary)] px-4 py-3">
                <p className="text-sm text-[var(--text-secondary)]">
                  You rated this ticket as{' '}
                  <strong className="text-[var(--text)]">
                    {ticket.satisfaction === 'SATISFIED'
                      ? 'Satisfied'
                      : ticket.satisfaction === 'NEUTRAL'
                        ? 'Neutral'
                        : 'Not Satisfied'}
                  </strong>
                  {ticket.satisfactionComment && (
                    <> &mdash; &quot;{ticket.satisfactionComment}&quot;</>
                  )}
                </p>
              </div>
            )}
          </Card>
        )}

        {/* Show existing satisfaction if already rated and not in RESOLVED state */}
        {ticket.satisfaction && !isResolved && (
          <Card variant="bordered">
            <div className="rounded-lg bg-[var(--bg-secondary)] px-4 py-3">
              <p className="text-sm text-[var(--text-secondary)]">
                You rated this ticket as{' '}
                <strong className="text-[var(--text)]">
                  {ticket.satisfaction === 'SATISFIED'
                    ? 'Satisfied'
                    : ticket.satisfaction === 'NEUTRAL'
                      ? 'Neutral'
                      : 'Not Satisfied'}
                </strong>
                {ticket.satisfactionComment && (
                  <> &mdash; &quot;{ticket.satisfactionComment}&quot;</>
                )}
              </p>
            </div>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}

// ---------------------------------------------------------------------------
// Message Bubble Component
// ---------------------------------------------------------------------------

function MessageBubble({ message }: { message: TicketMessage }) {
  const isUser = message.senderType === 'USER' || message.senderType === 'GUEST';
  const isAdmin = message.senderType === 'ADMIN';
  const isSystem = message.senderType === 'SYSTEM';

  // System messages
  if (isSystem) {
    return (
      <div className="flex justify-center">
        <p className="rounded-full bg-[var(--bg-secondary)] px-4 py-1.5 text-xs text-[var(--text-muted)] italic">
          {message.body}
        </p>
      </div>
    );
  }

  // User (right-aligned) and Admin (left-aligned) messages
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[75%] rounded-xl px-4 py-3 ${
          isUser ? 'bg-primary/10 rounded-br-sm' : 'rounded-bl-sm bg-[var(--bg-secondary)]'
        }`}
      >
        {/* Sender info */}
        <div className={`mb-1 flex items-center gap-2 ${isUser ? 'justify-end' : 'justify-start'}`}>
          {isAdmin && <Shield className="text-primary h-3.5 w-3.5" />}
          {isUser && <User className="h-3.5 w-3.5 text-[var(--text-muted)]" />}
          <span className="text-xs font-medium text-[var(--text-secondary)]">
            {message.senderName}
          </span>
        </div>

        {/* Body */}
        <p className="text-sm leading-relaxed whitespace-pre-wrap text-[var(--text)]">
          {message.body}
        </p>

        {/* Timestamp */}
        <p
          className={`mt-1.5 text-[10px] text-[var(--text-muted)] ${isUser ? 'text-right' : 'text-left'}`}
        >
          {formatDate(message.createdAt, "MMM dd, yyyy 'at' h:mm a")}
        </p>
      </div>
    </div>
  );
}
