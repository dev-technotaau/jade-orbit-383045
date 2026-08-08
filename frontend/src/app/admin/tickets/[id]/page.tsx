'use client';

import { useState, useRef, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import {
  Send,
  Lock,
  User,
  Calendar,
  Clock,
  CheckCircle,
  XCircle,
  ExternalLink,
  Tag,
  Shield,
  MessageSquare,
  ThumbsUp,
  ThumbsDown,
  Minus,
} from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { PERM } from '@/constants/permissions';
import { usePermissions } from '@/hooks/use-permissions';
import LockBanner from '@/components/admin/LockBanner';
import { useResourceLock } from '@/hooks/use-resource-lock';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import Select from '@/components/ui/Select';
import Spinner from '@/components/ui/Spinner';
import Checkbox from '@/components/ui/Checkbox';
import RichTextEditor from '@/components/ui/RichTextEditor';
import Tooltip from '@/components/ui/Tooltip';
import { showToast } from '@/components/ui/Toast';
import { ticketService } from '@/services/ticket.service';
import { adminService } from '@/services/admin.service';
import { QUERY_KEYS } from '@/constants/config';
import { ROUTES } from '@/constants/routes';
import { formatDate, formatRelativeDate } from '@/lib/utils';
import type { TicketMessage, TicketStatus } from '@/types/ticket';
import type { ApiError } from '@/types/api';
import {
  TICKET_STATUS_LABELS,
  TICKET_STATUS_COLORS,
  TICKET_PRIORITY_LABELS,
  TICKET_PRIORITY_COLORS,
  TICKET_CATEGORY_LABELS,
} from '@/types/ticket';

type BadgeVariant = 'success' | 'warning' | 'error' | 'info' | 'neutral';

const statusOptions = Object.entries(TICKET_STATUS_LABELS).map(([value, label]) => ({
  value,
  label,
}));

function getRoleBadgeVariant(role: string): BadgeVariant {
  switch (role) {
    case 'SUPER_ADMIN':
      return 'error';
    case 'ADMIN':
      return 'warning';
    case 'EMPLOYER':
      return 'info';
    case 'CANDIDATE':
      return 'success';
    default:
      return 'neutral';
  }
}

export default function AdminTicketDetailPage() {
  const params = useParams();
  const id = params.id as string;

  // Presence for the shared help-desk queue — see the LockBanner comment in
  // the render for why this never escalates to an edit lock.
  const presence = useResourceLock('SupportTicket', id);
  const { can } = usePermissions();
  const queryClient = useQueryClient();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const [replyBody, setReplyBody] = useState('');
  const [replySubject, setReplySubject] = useState('');
  const [isInternal, setIsInternal] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState('');
  const [assigneeId, setAssigneeId] = useState('');

  // ── Fetch ticket detail ──
  const { data: ticketData, isLoading } = useQuery({
    queryKey: QUERY_KEYS.TICKETS.DETAIL(id),
    queryFn: () => ticketService.getTicket(id),
    enabled: !!id,
  });
  const ticket = ticketData?.data;

  /**
   * Assignee options.
   *
   * Sourced from the purpose-built `/tickets/agents` endpoint, NOT from
   * `/admin/users?role=ADMIN` — that route deliberately refuses to enumerate
   * admin accounts, which left this dropdown containing only "Unassigned"
   * and made `support.tickets.assign` unusable for every role.
   *
   * Only fetched when the caller can actually assign; otherwise the query
   * would 403 on every ticket open for agents who merely read the queue.
   */
  const canAssign = can(PERM.SUPPORT_TICKETS_ASSIGN);
  const { data: agentsData } = useQuery({
    queryKey: ['tickets', 'agents'],
    queryFn: () => ticketService.listAgents(),
    enabled: canAssign,
    staleTime: 5 * 60 * 1000,
  });
  const agents = agentsData?.data ?? [];
  const assigneeOptions = [
    { value: '', label: 'Unassigned' },
    ...agents.map((a) => ({
      value: a.id,
      label: `${a.firstName || ''} ${a.lastName || ''}`.trim() || a.email,
    })),
  ];

  // Sync status + assignee + subject when ticket loads
  useEffect(() => {
    if (ticket) {
      setSelectedStatus(ticket.status);
      setAssigneeId(ticket.assignedToId || '');
      // Auto-generate subject for replies
      if (!replySubject) {
        setReplySubject(`Re: ${ticket.subject}`);
      }
    }
  }, [ticket, replySubject]);

  // Scroll to bottom of messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [ticket?.messages]);

  // ── Mutations ──
  const addMessageMutation = useMutation({
    mutationFn: () =>
      ticketService.addMessage(id, replyBody, isInternal, isInternal ? undefined : replySubject),
    onSuccess: () => {
      showToast.success(isInternal ? 'Internal note added' : 'Reply sent');
      setReplyBody('');
      setIsInternal(false);
      // Re-generate subject for next reply
      if (ticket) {
        setReplySubject(`Re: ${ticket.subject}`);
      }
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.TICKETS.DETAIL(id) });
    },
    onError: (err) => {
      const error = err as unknown as ApiError;
      showToast.error(error.message || 'Failed to send message');
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: (status: TicketStatus) => ticketService.updateStatus(id, status),
    onSuccess: () => {
      showToast.success('Status updated');
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.TICKETS.DETAIL(id) });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.TICKETS.ALL_LIST });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.TICKETS.STATS });
    },
    onError: (err) => {
      const error = err as unknown as ApiError;
      showToast.error(error.message || 'Failed to update status');
    },
  });

  const assignMutation = useMutation({
    mutationFn: (assignedToId: string) => ticketService.assignTicket(id, assignedToId),
    onSuccess: () => {
      showToast.success('Ticket reassigned');
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.TICKETS.DETAIL(id) });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.TICKETS.ALL_LIST });
    },
    onError: (err) => {
      const error = err as unknown as ApiError;
      showToast.error(error.message || 'Failed to assign ticket');
    },
  });

  const handleSendReply = () => {
    if (!replyBody.trim()) return;
    addMessageMutation.mutate();
  };

  const handleStatusChange = (newStatus: string) => {
    setSelectedStatus(newStatus);
    if (newStatus !== ticket?.status) {
      updateStatusMutation.mutate(newStatus as TicketStatus);
    }
  };

  const handleAssigneeChange = (newAssigneeId: string) => {
    setAssigneeId(newAssigneeId);
    if (newAssigneeId !== (ticket?.assignedToId || '')) {
      assignMutation.mutate(newAssigneeId);
    }
  };

  const handleResolve = () => updateStatusMutation.mutate('RESOLVED');
  const handleClose = () => updateStatusMutation.mutate('CLOSED');

  // ── Render message bubble ──
  const renderMessage = (msg: TicketMessage) => {
    if (msg.senderType === 'SYSTEM') {
      return (
        <div key={msg.id} className="flex justify-center py-2">
          <div className="rounded-full bg-[var(--bg-secondary)] px-4 py-1.5 text-xs text-[var(--text-muted)]">
            {msg.body}
          </div>
        </div>
      );
    }

    if (msg.isInternal) {
      return (
        <div key={msg.id} className="flex justify-end py-2">
          <div className="max-w-[75%] space-y-1">
            <div className="flex items-center justify-end gap-2">
              <Badge variant="warning" size="sm">
                Internal
              </Badge>
              <span className="text-xs text-[var(--text-muted)]">{msg.senderName}</span>
            </div>
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-[var(--text)]">
              <div className="flex items-start gap-2">
                <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
                <div
                  className="prose prose-sm max-w-none"
                  dangerouslySetInnerHTML={{ __html: msg.body }}
                />
              </div>
            </div>
            <p className="text-right text-xs text-[var(--text-muted)]">
              {formatRelativeDate(msg.createdAt)}
            </p>
          </div>
        </div>
      );
    }

    const isAdmin = msg.senderType === 'ADMIN';

    return (
      <div key={msg.id} className={`flex py-2 ${isAdmin ? 'justify-end' : 'justify-start'}`}>
        <div className="max-w-[75%] space-y-1">
          <div className={`flex items-center gap-2 ${isAdmin ? 'justify-end' : 'justify-start'}`}>
            <span className="text-xs font-medium text-[var(--text-secondary)]">
              {msg.senderName}
            </span>
            {msg.senderType === 'GUEST' && (
              <Badge variant="neutral" size="sm">
                Guest
              </Badge>
            )}
          </div>
          <div
            className={`rounded-lg px-4 py-3 text-sm ${
              isAdmin ? 'bg-primary text-white' : 'bg-[var(--bg-secondary)] text-[var(--text)]'
            }`}
          >
            {msg.subject && (
              <p className="mb-2 text-xs font-semibold opacity-80">Re: {msg.subject}</p>
            )}
            <div
              className="prose prose-sm max-w-none [&_ol]:my-1 [&_p]:my-1 [&_ul]:my-1"
              dangerouslySetInnerHTML={{ __html: msg.body }}
            />
          </div>
          <p className={`text-xs text-[var(--text-muted)] ${isAdmin ? 'text-right' : 'text-left'}`}>
            {formatRelativeDate(msg.createdAt)}
          </p>
        </div>
      </div>
    );
  };

  // ── Satisfaction display ──
  const renderSatisfaction = () => {
    if (!ticket?.satisfaction) {
      return <span className="text-[var(--text-muted)]">Not submitted</span>;
    }
    const icons = {
      SATISFIED: <ThumbsUp className="h-4 w-4 text-[var(--success)]" />,
      NEUTRAL: <Minus className="h-4 w-4 text-[var(--warning)]" />,
      NOT_SATISFIED: <ThumbsDown className="h-4 w-4 text-[var(--error)]" />,
    };
    const labels = {
      SATISFIED: 'Satisfied',
      NEUTRAL: 'Neutral',
      NOT_SATISFIED: 'Not Satisfied',
    };
    return (
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          {icons[ticket.satisfaction]}
          <span className="text-sm text-[var(--text)]">{labels[ticket.satisfaction]}</span>
        </div>
        {ticket.satisfactionComment && (
          <p className="text-xs text-[var(--text-muted)] italic">
            &quot;{ticket.satisfactionComment}&quot;
          </p>
        )}
      </div>
    );
  };

  if (isLoading) {
    return (
      <DashboardLayout
        requiredRole={['ADMIN', 'SUPER_ADMIN']}
        requiredAnyPermission={[PERM.SUPPORT_TICKETS_VIEW, PERM.SUPPORT_TICKETS_VIEW_ALL]}
      >
        <div className="flex items-center justify-center py-20">
          <Spinner size="lg" />
        </div>
      </DashboardLayout>
    );
  }

  if (!ticket) {
    return (
      <DashboardLayout
        requiredRole={['ADMIN', 'SUPER_ADMIN']}
        requiredAnyPermission={[PERM.SUPPORT_TICKETS_VIEW, PERM.SUPPORT_TICKETS_VIEW_ALL]}
      >
        <div className="py-20 text-center">
          <p className="text-[var(--text-muted)]">Ticket not found.</p>
          <Tooltip content="Return to tickets list">
            <Link
              href={ROUTES.ADMIN.TICKETS}
              className="text-primary mt-4 inline-block hover:underline"
            >
              Back to tickets
            </Link>
          </Tooltip>
        </div>
      </DashboardLayout>
    );
  }

  const messages = ticket.messages || [];

  return (
    <DashboardLayout
      requiredRole={['ADMIN', 'SUPER_ADMIN']}
      requiredAnyPermission={[PERM.SUPPORT_TICKETS_VIEW, PERM.SUPPORT_TICKETS_VIEW_ALL]}
    >
      <div className="space-y-6">
        {/* The classic help-desk collision: two agents open the same ticket
            and both reply. Presence makes that visible before either starts
            typing. Deliberately presence-only — replies are append-only, so
            there is no overwrite to prevent and an edit lock would just
            stop a legitimate second responder. */}
        <LockBanner lock={presence} entityLabel="ticket" />

        {/* Header */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-[var(--text)]">{ticket.ticketNumber}</h1>
              <span
                className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${TICKET_STATUS_COLORS[ticket.status]}`}
              >
                {TICKET_STATUS_LABELS[ticket.status]}
              </span>
              <span
                className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${TICKET_PRIORITY_COLORS[ticket.priority]}`}
              >
                {TICKET_PRIORITY_LABELS[ticket.priority]}
              </span>
            </div>
            <p className="mt-1 text-lg text-[var(--text-secondary)]">{ticket.subject}</p>
          </div>
          <Tooltip content="Return to tickets list">
            <Link
              href={ROUTES.ADMIN.TICKETS}
              className="text-primary text-sm whitespace-nowrap hover:underline"
            >
              Back to all tickets
            </Link>
          </Tooltip>
        </div>

        {/* Two-column layout */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Left column — Conversation */}
          <div className="space-y-4 lg:col-span-2">
            {/* Original description */}
            <Card>
              <div className="space-y-2">
                <h3 className="text-sm font-medium text-[var(--text-secondary)]">Description</h3>
                <p className="text-sm whitespace-pre-wrap text-[var(--text)]">
                  {ticket.description}
                </p>
              </div>
            </Card>

            {/* Messages thread */}
            <Card>
              <div className="mb-3 flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-[var(--text-muted)]" />
                <h3 className="text-sm font-medium text-[var(--text-secondary)]">
                  Conversation ({messages.length})
                </h3>
              </div>
              <div data-lenis-prevent className="max-h-[500px] space-y-1 overflow-y-auto pr-1">
                {messages.length === 0 ? (
                  <p className="py-8 text-center text-sm text-[var(--text-muted)]">
                    No messages yet. Send the first reply below.
                  </p>
                ) : (
                  messages.map(renderMessage)
                )}
                <div ref={messagesEndRef} />
              </div>
            </Card>

            {/* Reply box */}
            <Card>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-medium text-[var(--text)]">
                    {isInternal ? 'Add Internal Note' : 'Send Reply'}
                  </h3>
                  <Checkbox
                    label="Internal Note"
                    description="Not visible to the user"
                    checked={isInternal}
                    onChange={(e) => setIsInternal(e.target.checked)}
                  />
                </div>
                {isInternal && (
                  <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-stone-900">
                    <Lock className="h-3.5 w-3.5 shrink-0" />
                    This note will only be visible to admin staff.
                  </div>
                )}
                {!isInternal && (
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-[var(--text)]">
                      Subject
                    </label>
                    <input
                      type="text"
                      value={replySubject}
                      onChange={(e) => setReplySubject(e.target.value)}
                      placeholder="Email subject line"
                      className="focus:border-primary focus:ring-primary/20 w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm text-[var(--text)] transition-colors duration-200 placeholder:text-[var(--text-muted)] focus:ring-2 focus:outline-none"
                    />
                  </div>
                )}
                <RichTextEditor
                  value={replyBody}
                  onChange={setReplyBody}
                  placeholder={isInternal ? 'Write an internal note...' : 'Type your reply...'}
                />
                <div className="flex justify-end">
                  <Button
                    tooltip={isInternal ? 'Add internal note' : 'Send reply to user'}
                    onClick={handleSendReply}
                    isLoading={addMessageMutation.isPending}
                    disabled={!replyBody.trim()}
                  >
                    <Send className="mr-2 h-4 w-4" />
                    {isInternal ? 'Add Note' : 'Send Reply'}
                  </Button>
                </div>
              </div>
            </Card>
          </div>

          {/* Right column — Sidebar */}
          <div className="space-y-4">
            {/* Submitter Info */}
            <Card>
              <h3 className="mb-3 text-sm font-medium text-[var(--text-secondary)]">Submitter</h3>
              {ticket.user ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--bg-secondary)]">
                      <User className="h-5 w-5 text-[var(--text-muted)]" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-[var(--text)]">
                        {[ticket.user.firstName, ticket.user.lastName].filter(Boolean).join(' ') ||
                          'N/A'}
                      </p>
                      <p className="text-xs text-[var(--text-muted)]">{ticket.user.email}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={getRoleBadgeVariant(ticket.user.role)} size="sm">
                      {ticket.user.role}
                    </Badge>
                  </div>
                  <Tooltip content="View user profile details">
                    <Link
                      href={ROUTES.ADMIN.USER_DETAIL(ticket.user.id)}
                      className="text-primary inline-flex items-center gap-1 text-xs hover:underline"
                    >
                      View user profile
                      <ExternalLink className="h-3 w-3" />
                    </Link>
                  </Tooltip>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--bg-secondary)]">
                      <User className="h-5 w-5 text-[var(--text-muted)]" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-[var(--text)]">
                        {ticket.guestName || 'Unknown'}
                      </p>
                      <p className="text-xs text-[var(--text-muted)]">{ticket.guestEmail}</p>
                    </div>
                  </div>
                  <Badge variant="neutral" size="sm">
                    Guest
                  </Badge>
                </div>
              )}
            </Card>

            {/* Assigned Admin — hidden without `support.tickets.assign`,
                which is also what enables the agent list query above. */}
            {canAssign && (
              <Card>
                <h3 className="mb-3 text-sm font-medium text-[var(--text-secondary)]">
                  Assigned To
                </h3>
                <Select
                  options={assigneeOptions}
                  value={assigneeId}
                  onChange={handleAssigneeChange}
                  placeholder="Select admin..."
                  disabled={assignMutation.isPending}
                />
              </Card>
            )}

            {/* Status */}
            <Card>
              <h3 className="mb-3 text-sm font-medium text-[var(--text-secondary)]">Status</h3>
              <Select
                options={statusOptions}
                value={selectedStatus}
                onChange={handleStatusChange}
                disabled={updateStatusMutation.isPending}
              />
            </Card>

            {/* Priority & Category */}
            <Card>
              <div className="space-y-3">
                <div>
                  <h3 className="mb-1.5 text-sm font-medium text-[var(--text-secondary)]">
                    Priority
                  </h3>
                  <span
                    className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${TICKET_PRIORITY_COLORS[ticket.priority]}`}
                  >
                    {TICKET_PRIORITY_LABELS[ticket.priority]}
                  </span>
                </div>
                <div>
                  <h3 className="mb-1.5 text-sm font-medium text-[var(--text-secondary)]">
                    Category
                  </h3>
                  <div className="flex items-center gap-1.5">
                    <Tag className="h-3.5 w-3.5 text-[var(--text-muted)]" />
                    <span className="text-sm text-[var(--text)]">
                      {TICKET_CATEGORY_LABELS[ticket.category]}
                    </span>
                  </div>
                </div>
              </div>
            </Card>

            {/* Timestamps */}
            <Card>
              <h3 className="mb-3 text-sm font-medium text-[var(--text-secondary)]">Timestamps</h3>
              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-[var(--text-muted)]">
                    <Calendar className="h-3.5 w-3.5" /> Created
                  </span>
                  <span className="text-[var(--text)]">
                    {formatDate(ticket.createdAt, 'MMM dd, yyyy HH:mm')}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-[var(--text-muted)]">
                    <Clock className="h-3.5 w-3.5" /> First Response
                  </span>
                  <span className="text-[var(--text)]">
                    {ticket.firstResponseAt
                      ? formatDate(ticket.firstResponseAt, 'MMM dd, yyyy HH:mm')
                      : '--'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-[var(--text-muted)]">
                    <CheckCircle className="h-3.5 w-3.5" /> Resolved
                  </span>
                  <span className="text-[var(--text)]">
                    {ticket.resolvedAt ? formatDate(ticket.resolvedAt, 'MMM dd, yyyy HH:mm') : '--'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-[var(--text-muted)]">
                    <XCircle className="h-3.5 w-3.5" /> Closed
                  </span>
                  <span className="text-[var(--text)]">
                    {ticket.closedAt ? formatDate(ticket.closedAt, 'MMM dd, yyyy HH:mm') : '--'}
                  </span>
                </div>
              </div>
            </Card>

            {/* Satisfaction */}
            <Card>
              <h3 className="mb-3 text-sm font-medium text-[var(--text-secondary)]">
                Satisfaction
              </h3>
              {renderSatisfaction()}
            </Card>

            {/* Quick Actions */}
            <Card>
              <h3 className="mb-3 text-sm font-medium text-[var(--text-secondary)]">
                Quick Actions
              </h3>
              <div className="flex flex-col gap-2">
                <Button
                  variant="outline"
                  tooltip="Mark this ticket as resolved"
                  onClick={handleResolve}
                  isLoading={updateStatusMutation.isPending && selectedStatus === 'RESOLVED'}
                  disabled={ticket.status === 'RESOLVED' || ticket.status === 'CLOSED'}
                  className="w-full justify-center"
                >
                  <CheckCircle className="mr-2 h-4 w-4" />
                  Resolve
                </Button>
                <Button
                  variant="outline"
                  tooltip="Close this ticket"
                  onClick={handleClose}
                  isLoading={updateStatusMutation.isPending && selectedStatus === 'CLOSED'}
                  disabled={ticket.status === 'CLOSED'}
                  className="w-full justify-center"
                >
                  <XCircle className="mr-2 h-4 w-4" />
                  Close
                </Button>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
