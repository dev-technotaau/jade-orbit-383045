'use client';

import { useState, useRef, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Send,
  Lock,
  Unlock,
  ThumbsUp,
  Minus,
  ThumbsDown,
  MessageSquare,
  Clock,
} from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Spinner from '@/components/ui/Spinner';
import Tooltip from '@/components/ui/Tooltip';
import { showToast } from '@/components/ui/Toast';
import { useAuthStore } from '@/store/auth.store';
import { ticketService } from '@/services/ticket.service';
import { QUERY_KEYS } from '@/constants/config';
import { ROUTES } from '@/constants/routes';
import { formatRelativeDate } from '@/lib/utils';
import type { ApiError } from '@/types/api';
import type { TicketSatisfaction } from '@/types/ticket';
import {
  TICKET_STATUS_LABELS,
  TICKET_STATUS_COLORS,
  TICKET_PRIORITY_LABELS,
  TICKET_PRIORITY_COLORS,
  TICKET_CATEGORY_LABELS,
} from '@/types/ticket';

export default function EmployerTicketDetailPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);

  const ticketId = params.id as string;

  const [replyBody, setReplyBody] = useState('');
  const [satisfactionComment, setSatisfactionComment] = useState('');
  const [showSatisfaction, setShowSatisfaction] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // ── Fetch ticket ──

  const { data, isLoading, isError } = useQuery({
    queryKey: QUERY_KEYS.TICKETS.DETAIL(ticketId),
    queryFn: () => ticketService.getTicket(ticketId),
    enabled: !!ticketId,
  });

  const ticket = data?.data;
  const messages = ticket?.messages?.filter((m) => !m.isInternal) ?? [];

  // Scroll to bottom when messages change
  useEffect(() => {
    if (messages.length > 0) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages.length]);

  // ── Reply mutation ──

  const replyMutation = useMutation({
    mutationFn: (body: string) => ticketService.addMessage(ticketId, body),
    onSuccess: () => {
      showToast.success('Reply sent');
      setReplyBody('');
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.TICKETS.DETAIL(ticketId) });
    },
    onError: (err) => {
      const error = err as unknown as ApiError;
      showToast.error(error.message || 'Failed to send reply');
    },
  });

  // ── Close mutation ──

  const closeMutation = useMutation({
    mutationFn: () => ticketService.closeTicket(ticketId),
    onSuccess: () => {
      showToast.success('Ticket closed');
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.TICKETS.DETAIL(ticketId) });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.TICKETS.MY_LIST });
    },
    onError: (err) => {
      const error = err as unknown as ApiError;
      showToast.error(error.message || 'Failed to close ticket');
    },
  });

  // ── Reopen mutation ──

  const reopenMutation = useMutation({
    mutationFn: () => ticketService.reopenTicket(ticketId),
    onSuccess: () => {
      showToast.success('Ticket reopened');
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.TICKETS.DETAIL(ticketId) });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.TICKETS.MY_LIST });
    },
    onError: (err) => {
      const error = err as unknown as ApiError;
      showToast.error(error.message || 'Failed to reopen ticket');
    },
  });

  // ── Satisfaction mutation ──

  const satisfactionMutation = useMutation({
    mutationFn: ({
      satisfaction,
      comment,
    }: {
      satisfaction: TicketSatisfaction;
      comment?: string;
    }) => ticketService.submitSatisfaction(ticketId, satisfaction, comment),
    onSuccess: () => {
      showToast.success('Thank you for your feedback!');
      setShowSatisfaction(false);
      setSatisfactionComment('');
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.TICKETS.DETAIL(ticketId) });
    },
    onError: (err) => {
      const error = err as unknown as ApiError;
      showToast.error(error.message || 'Failed to submit feedback');
    },
  });

  const handleReply = (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyBody.trim()) return;
    replyMutation.mutate(replyBody.trim());
  };

  const handleSatisfaction = (satisfaction: TicketSatisfaction) => {
    satisfactionMutation.mutate({
      satisfaction,
      comment: satisfactionComment.trim() || undefined,
    });
  };

  // ── Loading / Error states ──

  if (isLoading) {
    return (
      <DashboardLayout requiredRole={['EMPLOYER']}>
        <div className="flex items-center justify-center py-24">
          <Spinner size="lg" />
        </div>
      </DashboardLayout>
    );
  }

  if (isError || !ticket) {
    return (
      <DashboardLayout requiredRole={['EMPLOYER']}>
        <div className="space-y-4">
          <Tooltip content="Back to Help">
            <button
              type="button"
              onClick={() => router.push(ROUTES.EMPLOYER.HELP)}
              className="hover:text-primary inline-flex cursor-pointer items-center gap-1.5 text-sm text-[var(--text-muted)] transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Help
            </button>
          </Tooltip>
          <Card>
            <div className="py-12 text-center">
              <p className="text-[var(--text-muted)]">Ticket not found or an error occurred.</p>
              <Button
                variant="primary"
                size="sm"
                className="mt-4"
                onClick={() => router.push(ROUTES.EMPLOYER.HELP)}
                tooltip="Return to Help"
              >
                Return to Help
              </Button>
            </div>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  const isClosed = ticket.status === 'CLOSED';
  const isResolved = ticket.status === 'RESOLVED';
  const hasSatisfaction = ticket.satisfaction !== null;

  return (
    <DashboardLayout requiredRole={['EMPLOYER']}>
      <div className="space-y-6">
        {/* Back Link */}
        <Tooltip content="Back to Help">
          <button
            type="button"
            onClick={() => router.push(ROUTES.EMPLOYER.HELP)}
            className="hover:text-primary inline-flex cursor-pointer items-center gap-1.5 text-sm text-[var(--text-muted)] transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Help
          </button>
        </Tooltip>

        {/* Header */}
        <Card>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-2">
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
                <span
                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                    TICKET_PRIORITY_COLORS[ticket.priority]
                  }`}
                >
                  {TICKET_PRIORITY_LABELS[ticket.priority]}
                </span>
                <span className="inline-flex items-center rounded-full bg-[var(--bg-tertiary)] px-2 py-0.5 text-xs font-medium text-[var(--text-secondary)]">
                  {TICKET_CATEGORY_LABELS[ticket.category]}
                </span>
              </div>
              <h1 className="text-xl font-bold text-[var(--text)]">{ticket.subject}</h1>
              <div className="flex items-center gap-3 text-xs text-[var(--text-muted)]">
                <span className="flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" />
                  Created {formatRelativeDate(ticket.createdAt)}
                </span>
                {ticket.assignedTo && (
                  <span>
                    Assigned to {ticket.assignedTo.firstName} {ticket.assignedTo.lastName}
                  </span>
                )}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex shrink-0 items-center gap-2">
              {isClosed ? (
                <Button
                  variant="outline"
                  size="sm"
                  leftIcon={<Unlock className="h-4 w-4" />}
                  onClick={() => reopenMutation.mutate()}
                  isLoading={reopenMutation.isPending}
                  tooltip="Reopen this ticket"
                >
                  Reopen Ticket
                </Button>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  leftIcon={<Lock className="h-4 w-4" />}
                  onClick={() => closeMutation.mutate()}
                  isLoading={closeMutation.isPending}
                  tooltip="Close this ticket"
                >
                  Close Ticket
                </Button>
              )}
            </div>
          </div>
        </Card>

        {/* Satisfaction Widget (when resolved and no feedback yet) */}
        {isResolved && !hasSatisfaction && (
          <Card className="border-primary/30">
            <div className="space-y-4 text-center">
              <p className="text-sm font-medium text-[var(--text)]">
                This ticket has been resolved. How was your experience?
              </p>
              {showSatisfaction ? (
                <div className="mx-auto max-w-md space-y-4">
                  <textarea
                    value={satisfactionComment}
                    onChange={(e) => setSatisfactionComment(e.target.value)}
                    placeholder="Any additional comments? (optional)"
                    rows={3}
                    className="focus:border-primary focus:ring-primary/20 resize-vertical w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--text-muted)] focus:ring-2 focus:outline-none"
                  />
                  <div className="flex items-center justify-center gap-3">
                    <Button
                      variant="outline"
                      size="sm"
                      leftIcon={<ThumbsUp className="h-4 w-4" />}
                      onClick={() => handleSatisfaction('SATISFIED')}
                      isLoading={satisfactionMutation.isPending}
                      className="border-[var(--success)]/30 text-[var(--success)] hover:bg-[var(--success-light)]"
                      tooltip="Rate as satisfied"
                    >
                      Satisfied
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      leftIcon={<Minus className="h-4 w-4" />}
                      onClick={() => handleSatisfaction('NEUTRAL')}
                      isLoading={satisfactionMutation.isPending}
                      className="border-[var(--warning)]/30 text-[var(--warning)] hover:bg-[var(--warning-light)]"
                      tooltip="Rate as neutral"
                    >
                      Neutral
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      leftIcon={<ThumbsDown className="h-4 w-4" />}
                      onClick={() => handleSatisfaction('NOT_SATISFIED')}
                      isLoading={satisfactionMutation.isPending}
                      className="border-[var(--error)]/30 text-[var(--error)] hover:bg-[var(--error-light)]"
                      tooltip="Rate as not satisfied"
                    >
                      Not Satisfied
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => setShowSatisfaction(true)}
                  tooltip="Provide feedback"
                >
                  Rate Your Experience
                </Button>
              )}
            </div>
          </Card>
        )}

        {/* Already submitted satisfaction */}
        {hasSatisfaction && (
          <Card className="border-[var(--success)]/30">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--success-light)]">
                {ticket.satisfaction === 'SATISFIED' && (
                  <ThumbsUp className="h-5 w-5 text-[var(--success)]" />
                )}
                {ticket.satisfaction === 'NEUTRAL' && (
                  <Minus className="h-5 w-5 text-[var(--warning)]" />
                )}
                {ticket.satisfaction === 'NOT_SATISFIED' && (
                  <ThumbsDown className="h-5 w-5 text-[var(--error)]" />
                )}
              </div>
              <div>
                <p className="text-sm font-medium text-[var(--text)]">
                  You rated this experience as {ticket.satisfaction === 'SATISFIED' && 'Satisfied'}
                  {ticket.satisfaction === 'NEUTRAL' && 'Neutral'}
                  {ticket.satisfaction === 'NOT_SATISFIED' && 'Not Satisfied'}
                </p>
                {ticket.satisfactionComment && (
                  <p className="mt-0.5 text-sm text-[var(--text-secondary)]">
                    &ldquo;{ticket.satisfactionComment}&rdquo;
                  </p>
                )}
              </div>
            </div>
          </Card>
        )}

        {/* Conversation Thread */}
        <Card>
          <div className="mb-6 flex items-center gap-3">
            <div className="bg-primary-light flex h-10 w-10 items-center justify-center rounded-lg">
              <MessageSquare className="text-primary h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-[var(--text)]">Conversation</h2>
              <p className="text-sm text-[var(--text-secondary)]">
                {messages.length} message{messages.length !== 1 ? 's' : ''}
              </p>
            </div>
          </div>

          <div data-lenis-prevent className="max-h-[600px] space-y-4 overflow-y-auto pr-1">
            {messages.map((message) => {
              const isUserMessage = message.senderType === 'USER' && message.senderId === user?.id;
              const isSystem = message.senderType === 'SYSTEM';

              if (isSystem) {
                return (
                  <div key={message.id} className="flex justify-center">
                    <div className="max-w-md rounded-full bg-[var(--bg-secondary)] px-4 py-1.5 text-center text-xs text-[var(--text-muted)]">
                      {message.body}
                      <span className="ml-2 text-[var(--text-muted)]">
                        {formatRelativeDate(message.createdAt)}
                      </span>
                    </div>
                  </div>
                );
              }

              return (
                <div
                  key={message.id}
                  className={`flex ${isUserMessage ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[75%] rounded-xl px-4 py-3 ${
                      isUserMessage
                        ? 'bg-primary rounded-br-sm text-white'
                        : 'rounded-bl-sm bg-[var(--bg-secondary)] text-[var(--text)]'
                    }`}
                  >
                    <div className="mb-1 flex items-center gap-2">
                      <span
                        className={`text-xs font-medium ${
                          isUserMessage ? 'text-white/80' : 'text-[var(--text-secondary)]'
                        }`}
                      >
                        {message.senderName}
                      </span>
                      <span
                        className={`text-xs ${
                          isUserMessage ? 'text-white/60' : 'text-[var(--text-muted)]'
                        }`}
                      >
                        {formatRelativeDate(message.createdAt)}
                      </span>
                    </div>
                    <p className="text-sm leading-relaxed break-words whitespace-pre-wrap">
                      {message.body}
                    </p>
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>
        </Card>

        {/* Reply Box */}
        <Card>
          {isClosed ? (
            <div className="flex items-center justify-center gap-2 py-4 text-sm text-[var(--text-muted)]">
              <Lock className="h-4 w-4" />
              <span>This ticket is closed. Reopen it to send a reply.</span>
            </div>
          ) : (
            <form onSubmit={handleReply} className="space-y-3">
              <label className="block text-sm font-medium text-[var(--text)]">Reply</label>
              <textarea
                value={replyBody}
                onChange={(e) => setReplyBody(e.target.value)}
                placeholder="Type your reply..."
                rows={3}
                className="focus:border-primary focus:ring-primary/20 resize-vertical w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--text-muted)] focus:ring-2 focus:outline-none"
                disabled={isClosed}
              />
              <div className="flex justify-end">
                <Button
                  type="submit"
                  size="sm"
                  leftIcon={<Send className="h-4 w-4" />}
                  isLoading={replyMutation.isPending}
                  disabled={!replyBody.trim()}
                  tooltip="Send reply"
                >
                  Send Reply
                </Button>
              </div>
            </form>
          )}
        </Card>
      </div>
    </DashboardLayout>
  );
}
