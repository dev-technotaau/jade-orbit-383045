'use client';

/**
 * MailSidebar — the left rail of the super-admin one-on-one webmail client.
 * Pure presentational component: account switcher, folder list, and the
 * Compose / New folder / Refresh actions. All behaviour flows through the
 * callbacks defined on MailSidebarProps.
 */

import {
  Pencil,
  Settings,
  Plus,
  Inbox,
  Send,
  File,
  Trash2,
  ShieldAlert,
  Archive,
  Folder,
  FolderPlus,
  RefreshCw,
  Mail,
  type LucideIcon,
} from 'lucide-react';

import Button from '@/components/ui/Button';
import Spinner from '@/components/ui/Spinner';
import Select from '@/components/ui/Select';
import Tooltip from '@/components/ui/Tooltip';
import { cn } from '@/lib/utils';
import type { MailFolder, MailFolderRole } from '@/types/email-mailbox';
import type { MailSidebarProps } from '@/components/super-admin/email/mail/props';

/** Friendly lucide icon for each special-use folder role. */
function folderIcon(role: MailFolderRole): LucideIcon {
  switch (role) {
    case 'inbox':
      return Inbox;
    case 'sent':
      return Send;
    case 'drafts':
      return File;
    case 'trash':
      return Trash2;
    case 'junk':
      return ShieldAlert;
    case 'archive':
      return Archive;
    default:
      return Folder;
  }
}

/** Clamp an unread count to a compact pill label. */
function unreadLabel(n: number): string {
  return n > 99 ? '99+' : String(n);
}

export default function MailSidebar({
  accounts,
  activeAccountId,
  onSelectAccount,
  folders,
  activeFolder,
  onSelectFolder,
  foldersLoading,
  onCompose,
  onManageAccounts,
  onAddAccount,
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
  onRefresh,
}: MailSidebarProps) {
  const activeAccount = accounts.find((a) => a.id === activeAccountId) ?? null;

  return (
    <aside className="flex h-full w-64 shrink-0 flex-col border-r border-[var(--border)] bg-[var(--bg)]">
      {/* Compose */}
      <div className="p-3">
        <Button
          variant="primary"
          fullWidth
          leftIcon={<Pencil className="h-4 w-4" />}
          onClick={onCompose}
        >
          Compose
        </Button>
      </div>

      {/* Account selector */}
      <div className="px-3 pb-2">
        {accounts.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-[var(--border)] px-3 py-5 text-center">
            <Mail className="h-6 w-6 text-[var(--text-tertiary)]" />
            <p className="text-xs text-[var(--text-secondary)]">No mail accounts connected yet.</p>
            <Button
              variant="primary"
              size="sm"
              fullWidth
              leftIcon={<Plus className="h-4 w-4" />}
              onClick={onAddAccount}
            >
              Add mail account
            </Button>
          </div>
        ) : (
          <div className="space-y-1.5">
            {accounts.length > 1 ? (
              <div className="relative">
                <span
                  className="pointer-events-none absolute top-1/2 left-2.5 z-10 h-2.5 w-2.5 -translate-y-1/2 rounded-full ring-1 ring-[var(--border)]"
                  style={{ backgroundColor: activeAccount?.color ?? 'var(--primary)' }}
                  aria-hidden
                />
                <Select
                  size="sm"
                  className="[&_button]:pl-7"
                  options={accounts.map((a) => ({
                    value: a.id,
                    label: `${a.name} (${a.email})`,
                  }))}
                  value={activeAccountId ?? ''}
                  onChange={onSelectAccount}
                  clearable={false}
                />
              </div>
            ) : (
              <div className="flex items-center gap-2 rounded-md bg-[var(--bg-secondary)] px-2.5 py-1.5">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-[var(--border)]"
                  style={{ backgroundColor: activeAccount?.color ?? 'var(--primary)' }}
                  aria-hidden
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-[var(--text)]">
                    {activeAccount?.name ?? accounts[0].name}
                  </p>
                  <p className="truncate text-xs text-[var(--text-tertiary)]">
                    {activeAccount?.email ?? accounts[0].email}
                  </p>
                </div>
              </div>
            )}

            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                fullWidth
                leftIcon={<Settings className="h-3.5 w-3.5" />}
                onClick={onManageAccounts}
                className="justify-start text-[var(--text-secondary)]"
              >
                Manage accounts
              </Button>
              <Button
                variant="ghost"
                size="sm"
                leftIcon={<Plus className="h-4 w-4" />}
                onClick={onAddAccount}
                tooltip="Add account"
                className="shrink-0 text-[var(--text-secondary)]"
              />
            </div>
          </div>
        )}
      </div>

      {/* Folder list */}
      <nav className="flex-1 overflow-y-auto px-2 py-1">
        {foldersLoading ? (
          <div className="space-y-1 p-1">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center gap-2.5 rounded-md px-2.5 py-1.5">
                <div className="h-4 w-4 shrink-0 animate-pulse rounded bg-[var(--bg-tertiary)]" />
                <div
                  className="h-3 animate-pulse rounded bg-[var(--bg-tertiary)]"
                  style={{ width: `${55 + ((i * 13) % 30)}%` }}
                />
              </div>
            ))}
          </div>
        ) : folders.length === 0 ? (
          <div className="flex items-center justify-center gap-2 px-3 py-6 text-xs text-[var(--text-tertiary)]">
            {accounts.length === 0 ? (
              'Connect an account to see folders.'
            ) : (
              <>
                <Spinner size="sm" />
                <span>No folders found.</span>
              </>
            )}
          </div>
        ) : (
          <ul className="space-y-0.5">
            {folders.map((folder: MailFolder) => {
              const Icon = folderIcon(folder.role);
              const isActive = activeFolder === folder.path;
              const isCustom = folder.role === null;
              return (
                <li key={folder.path} className="group relative">
                  <Tooltip content={folder.name}>
                    <button
                      type="button"
                      onClick={() => onSelectFolder(folder.path)}
                      aria-current={isActive ? 'true' : undefined}
                      className={cn(
                        'flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-sm transition-colors',
                        isActive
                          ? 'text-primary bg-[var(--bg-secondary)] font-medium'
                          : 'text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)]',
                      )}
                    >
                      <Icon
                        className={cn(
                          'h-4 w-4 shrink-0',
                          isActive ? 'text-primary' : 'text-[var(--text-tertiary)]',
                        )}
                      />
                      <span className="flex-1 truncate">{folder.name}</span>
                      {folder.unseen > 0 && (
                        <span
                          className={cn(
                            'ml-auto shrink-0 rounded-full px-1.5 py-0.5 text-center text-[11px] leading-none font-medium',
                            isActive ? 'bg-primary text-white' : 'bg-primary/10 text-primary',
                            isCustom && 'group-hover:invisible',
                          )}
                        >
                          {unreadLabel(folder.unseen)}
                        </span>
                      )}
                    </button>
                  </Tooltip>
                  {isCustom && (
                    <div className="absolute top-1/2 right-1 hidden -translate-y-1/2 items-center gap-0.5 group-hover:flex">
                      <Tooltip content="Rename folder">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onRenameFolder(folder.path);
                          }}
                          aria-label={`Rename ${folder.name}`}
                          className="rounded p-1 text-[var(--text-tertiary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text)]"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                      </Tooltip>
                      <Tooltip content="Delete folder">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteFolder(folder.path);
                          }}
                          aria-label={`Delete ${folder.name}`}
                          className="hover:text-error rounded p-1 text-[var(--text-tertiary)] hover:bg-[var(--bg-tertiary)]"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </Tooltip>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </nav>

      {/* Footer actions */}
      <div className="flex items-center justify-between gap-1 border-t border-[var(--border)] px-2 py-2">
        <Button
          variant="ghost"
          size="sm"
          leftIcon={<FolderPlus className="h-4 w-4" />}
          onClick={onCreateFolder}
          disabled={accounts.length === 0}
          className="text-[var(--text-secondary)]"
        >
          New folder
        </Button>
        <Button
          variant="ghost"
          size="sm"
          leftIcon={<RefreshCw className="h-4 w-4" />}
          onClick={onRefresh}
          tooltip="Refresh"
          className="shrink-0 text-[var(--text-secondary)]"
        />
      </div>
    </aside>
  );
}
