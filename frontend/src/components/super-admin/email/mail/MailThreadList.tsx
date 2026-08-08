'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Search,
  RefreshCw,
  Star,
  StarOff,
  Trash2,
  Paperclip,
  Inbox,
  Mail,
  MailOpen,
} from 'lucide-react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Checkbox from '@/components/ui/Checkbox';
import Badge from '@/components/ui/Badge';
import Select from '@/components/ui/Select';
import Pagination from '@/components/ui/Pagination';
import { cn } from '@/lib/utils';
import type {
  MailThreadListProps,
  MailFilter,
  MailView,
} from '@/components/super-admin/email/mail/props';
import type { MailThread } from '@/types/email-mailbox';

const FILTERS: { value: MailFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'unread', label: 'Unread' },
  { value: 'flagged', label: 'Flagged' },
];

const VIEWS: { value: MailView; label: string }[] = [
  { value: 'threads', label: 'Conversations' },
  { value: 'messages', label: 'Messages' },
];

const AMBER = '#F59E0B';

/** Short, locale-aware date: today -> time, this year -> "DD MMM", else "DD MMM YYYY". */
function formatDate(date: string | null): string {
  if (!date) return '';
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) {
    return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(d);
  }
  if (d.getFullYear() === now.getFullYear()) {
    return new Intl.DateTimeFormat(undefined, { day: '2-digit', month: 'short' }).format(d);
  }
  return new Intl.DateTimeFormat(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(d);
}

/** Participant summary: latest sender's name/address, with " +N" for extra participants. */
function participantSummary(t: MailThread): string {
  const base = t.latestFrom ? t.latestFrom.name || t.latestFrom.address : '(unknown sender)';
  const extra = t.participants.length > 1 ? ` +${t.participants.length - 1}` : '';
  return `${base}${extra}`;
}

export default function MailThreadList({
  threads,
  total,
  page,
  limit,
  onPageChange,
  activeThreadId,
  onOpen,
  selectedThreadIds,
  onToggleSelect,
  onSelectAll,
  onClearSelect,
  search,
  onSearch,
  filter,
  onFilterChange,
  view,
  onViewChange,
  loading,
  windowed,
  folders,
  currentFolderPath,
  onBulkFlag,
  onBulkSeen,
  onBulkDelete,
  onBulkMove,
  onBulkCopy,
  onRefresh,
}: MailThreadListProps) {
  const [searchInput, setSearchInput] = useState<string>(search);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep the local field in sync when the parent changes the search externally
  // (e.g. clearing on folder switch). Only fires when the prop itself changes,
  // so it never clobbers mid-typing (the prop is stable until debounce resolves).
  useEffect(() => {
    setSearchInput(search);
  }, [search]);

  useEffect(
    () => () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    },
    [],
  );

  const handleSearchChange = (value: string) => {
    setSearchInput(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      onSearch(value);
    }, 400);
  };

  const flushSearch = () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    onSearch(searchInput);
  };

  const selectedCount = selectedThreadIds.length;
  const hasSelection = selectedCount > 0;
  const allSelected =
    threads.length > 0 && threads.every((t) => selectedThreadIds.includes(t.threadId));

  // Exclude the active folder (custom folders have role=null, so we must use the
  // real path, not the role) from Move/Copy targets.
  const moveTargets = folders.filter((f) => f.path !== currentFolderPath);

  return (
    <div className="flex h-full min-w-0 flex-col bg-[var(--bg)]">
      {/* Toolbar */}
      <div className="sticky top-0 z-10 border-b border-[var(--border)] bg-[var(--bg)] p-2">
        <div className="flex items-center gap-2">
          <div className="pl-1">
            <Checkbox
              checked={allSelected}
              onChange={(e) => (e.target.checked ? onSelectAll() : onClearSelect())}
              aria-label="Select all conversations"
            />
          </div>

          {hasSelection ? (
            <div className="flex min-w-0 flex-1 items-center gap-1.5">
              <Badge variant="info" size="sm">
                {selectedCount} selected
              </Badge>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                tooltip="Mark read"
                aria-label="Mark read"
                onClick={() => onBulkSeen(true)}
              >
                <MailOpen className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                tooltip="Mark unread"
                aria-label="Mark unread"
                onClick={() => onBulkSeen(false)}
              >
                <Mail className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                tooltip="Flag"
                aria-label="Flag"
                onClick={() => onBulkFlag(true)}
              >
                <Star className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                tooltip="Unflag"
                aria-label="Unflag"
                onClick={() => onBulkFlag(false)}
              >
                <StarOff className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="text-error h-8 w-8"
                tooltip="Delete"
                aria-label="Delete"
                onClick={onBulkDelete}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
              <div className="ml-auto w-40">
                <Select
                  size="sm"
                  options={moveTargets.map((f) => ({ value: f.path, label: f.name }))}
                  value=""
                  onChange={(v) => {
                    if (v) onBulkMove(v);
                  }}
                  placeholder="Move to…"
                />
              </div>
              <div className="w-40">
                <Select
                  size="sm"
                  options={moveTargets.map((f) => ({ value: f.path, label: f.name }))}
                  value=""
                  onChange={(v) => {
                    if (v) onBulkCopy(v);
                  }}
                  placeholder="Copy to…"
                />
              </div>
            </div>
          ) : (
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <div className="inline-flex overflow-hidden rounded-md border border-[var(--border)]">
                {FILTERS.map((f) => (
                  <button
                    key={f.value}
                    type="button"
                    onClick={() => onFilterChange(f.value)}
                    className={cn(
                      'h-8 px-3 text-sm transition-colors',
                      filter === f.value
                        ? 'bg-primary text-white'
                        : 'text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)]',
                    )}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              <div className="inline-flex overflow-hidden rounded-md border border-[var(--border)]">
                {VIEWS.map((v) => (
                  <button
                    key={v.value}
                    type="button"
                    onClick={() => onViewChange(v.value)}
                    className={cn(
                      'h-8 px-3 text-sm transition-colors',
                      view === v.value
                        ? 'bg-primary text-white'
                        : 'text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)]',
                    )}
                  >
                    {v.label}
                  </button>
                ))}
              </div>

              <Button
                variant="ghost"
                size="icon"
                className="ml-auto h-8 w-8"
                tooltip="Refresh"
                aria-label="Refresh"
                onClick={onRefresh}
              >
                <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
              </Button>
            </div>
          )}
        </div>

        {/* Search */}
        <form
          className="mt-2"
          onSubmit={(e) => {
            e.preventDefault();
            flushSearch();
          }}
        >
          <Input
            inputSize="sm"
            type="search"
            placeholder="Search mail…"
            value={searchInput}
            onChange={(e) => handleSearchChange(e.target.value)}
            leftIcon={<Search className="h-4 w-4" />}
            aria-label="Search mail"
          />
        </form>
      </div>

      {/* Conversation list */}
      <div className="flex-1 overflow-y-auto">
        {windowed && (
          <p className="px-3 py-1 text-xs text-[var(--text-tertiary)]">
            Showing recent conversations — older messages aren&apos;t grouped.
          </p>
        )}
        {loading ? (
          <div>
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="flex items-start gap-3 border-b border-[var(--border)] px-3 py-2.5"
              >
                <div className="mt-0.5 h-[18px] w-[18px] shrink-0 animate-pulse rounded bg-[var(--bg-tertiary)]" />
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="h-3 w-1/3 animate-pulse rounded bg-[var(--bg-tertiary)]" />
                  <div className="h-3 w-2/3 animate-pulse rounded bg-[var(--bg-tertiary)]" />
                </div>
              </div>
            ))}
          </div>
        ) : threads.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center">
            <Inbox className="h-10 w-10 text-[var(--text-tertiary)]" />
            <p className="text-sm text-[var(--text-secondary)]">No conversations</p>
          </div>
        ) : (
          <ul>
            {threads.map((t) => {
              const isActive = activeThreadId === t.threadId;
              const isSelected = selectedThreadIds.includes(t.threadId);
              const isUnread = t.unreadCount > 0 || !t.seen;
              return (
                <li key={t.threadId}>
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => onOpen(t)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onOpen(t);
                      }
                    }}
                    className={cn(
                      'flex w-full cursor-pointer items-start gap-2 border-b border-[var(--border)] px-3 py-2 text-left transition-colors',
                      isActive ? 'bg-[var(--bg-secondary)]' : 'hover:bg-[var(--bg-secondary)]',
                    )}
                  >
                    <div
                      className="pt-0.5"
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => e.stopPropagation()}
                    >
                      <Checkbox
                        checked={isSelected}
                        onChange={() => onToggleSelect(t.threadId)}
                        aria-label={`Select conversation: ${t.subject || '(no subject)'}`}
                      />
                    </div>

                    <Star
                      aria-hidden
                      fill={t.flagged ? AMBER : 'none'}
                      style={t.flagged ? { color: AMBER } : undefined}
                      className={cn(
                        'mt-0.5 h-4 w-4 shrink-0',
                        !t.flagged && 'text-[var(--text-tertiary)]',
                      )}
                    />

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span
                          className={cn(
                            'truncate text-sm',
                            isUnread
                              ? 'font-semibold text-[var(--text)]'
                              : 'font-medium text-[var(--text-secondary)]',
                          )}
                        >
                          {participantSummary(t)}
                        </span>
                        {t.messageCount > 1 && (
                          <span className="shrink-0 rounded bg-[var(--bg-tertiary)] px-1.5 text-xs text-[var(--text-secondary)]">
                            {t.messageCount}
                          </span>
                        )}
                        <span className="ml-auto shrink-0 text-xs text-[var(--text-tertiary)]">
                          {formatDate(t.latestDate)}
                        </span>
                      </div>
                      <div className="mt-0.5 flex items-center gap-1.5">
                        <span
                          className={cn(
                            'truncate text-sm',
                            isUnread
                              ? 'font-medium text-[var(--text-secondary)]'
                              : 'text-[var(--text-tertiary)]',
                          )}
                        >
                          {t.subject || '(no subject)'}
                        </span>
                        {t.hasAttachments && (
                          <Paperclip className="h-3.5 w-3.5 shrink-0 text-[var(--text-tertiary)]" />
                        )}
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Footer / pagination */}
      <div className="flex items-center justify-between gap-2 border-t border-[var(--border)] p-2 text-sm text-[var(--text-secondary)]">
        <span className="truncate">
          {total} conversation{total === 1 ? '' : 's'}
        </span>
        <Pagination
          currentPage={page}
          totalPages={Math.max(1, Math.ceil(total / limit))}
          onPageChange={onPageChange}
        />
      </div>
    </div>
  );
}
