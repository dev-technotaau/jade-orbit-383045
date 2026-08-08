/**
 * Shared prop contracts for the one-on-one webmail UI. Both the orchestrator
 * page and every leaf component import from here, so the pieces can be built
 * independently without prop drift.
 */
import type {
  MailAccount,
  MailFolder,
  MailSummary,
  MailDetail,
  MailThread,
  MailUploadResult,
  RecipientSuggestion,
} from '@/types/email-mailbox';

export type MailFilter = 'all' | 'unread' | 'flagged';
export type MailView = 'threads' | 'messages';

export interface ComposerInitial {
  mode?: 'new' | 'reply' | 'replyAll' | 'forward' | 'draft';
  to?: string[];
  cc?: string[];
  bcc?: string[];
  subject?: string;
  html?: string;
  inReplyTo?: string | null;
  references?: string[];
  /** When editing an existing draft, the draft's uid so it can be replaced. */
  replaceUid?: number;
  /** Pre-attached files (e.g. a forward re-attaching the original's files). */
  attachments?: MailUploadResult[];
}

export interface MailSidebarProps {
  accounts: MailAccount[];
  activeAccountId: string | null;
  onSelectAccount: (id: string) => void;
  folders: MailFolder[];
  activeFolder: string | null;
  onSelectFolder: (path: string) => void;
  foldersLoading: boolean;
  onCompose: () => void;
  onManageAccounts: () => void;
  onAddAccount: () => void;
  onCreateFolder: () => void;
  onRenameFolder: (path: string) => void;
  onDeleteFolder: (path: string) => void;
  onRefresh: () => void;
}

export interface MailListProps {
  messages: MailSummary[];
  total: number;
  page: number;
  limit: number;
  onPageChange: (page: number) => void;
  activeUid: number | null;
  onOpen: (uid: number) => void;
  selectedUids: number[];
  onToggleSelect: (uid: number) => void;
  onSelectAll: () => void;
  onClearSelect: () => void;
  search: string;
  onSearch: (q: string) => void;
  filter: MailFilter;
  onFilterChange: (f: MailFilter) => void;
  view: MailView;
  onViewChange: (v: MailView) => void;
  loading: boolean;
  folders: MailFolder[];
  folderRole: string | null;
  currentFolderPath: string | null;
  onBulkFlag: (flagged: boolean) => void;
  onBulkSeen: (seen: boolean) => void;
  onBulkDelete: () => void;
  onBulkMove: (target: string) => void;
  onBulkCopy: (target: string) => void;
  onRefresh: () => void;
}

export interface MailThreadListProps {
  threads: MailThread[];
  total: number;
  page: number;
  limit: number;
  onPageChange: (page: number) => void;
  activeThreadId: string | null;
  onOpen: (thread: MailThread) => void;
  selectedThreadIds: string[];
  onToggleSelect: (threadId: string) => void;
  onSelectAll: () => void;
  onClearSelect: () => void;
  search: string;
  onSearch: (q: string) => void;
  filter: MailFilter;
  onFilterChange: (f: MailFilter) => void;
  view: MailView;
  onViewChange: (v: MailView) => void;
  loading: boolean;
  windowed: boolean;
  folders: MailFolder[];
  folderRole: string | null;
  currentFolderPath: string | null;
  onBulkFlag: (flagged: boolean) => void;
  onBulkSeen: (seen: boolean) => void;
  onBulkDelete: () => void;
  onBulkMove: (target: string) => void;
  onBulkCopy: (target: string) => void;
  onRefresh: () => void;
}

export interface MailThreadReaderProps {
  accountId: string;
  subject: string;
  messages: MailDetail[]; // oldest → newest
  loading: boolean;
  folder: string;
  folderRole: string | null;
  folders: MailFolder[];
  flagged: boolean;
  onReply: () => void;
  onReplyAll: () => void;
  onForward: () => void;
  onToggleFlag: () => void;
  onDelete: () => void;
  onMove: (target: string) => void;
  onClose: () => void;
}

export interface RecipientInputProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  fetchSuggestions: (query: string) => Promise<RecipientSuggestion[]>;
  placeholder?: string;
  autoFocus?: boolean;
  disabled?: boolean;
}

export interface MailReaderProps {
  accountId: string;
  detail: MailDetail | null;
  loading: boolean;
  folder: string;
  folderRole: string | null;
  folders: MailFolder[];
  onReply: () => void;
  onReplyAll: () => void;
  onForward: () => void;
  onEditDraft: () => void;
  onToggleFlag: () => void;
  onToggleSeen: () => void;
  onDelete: () => void;
  onMove: (target: string) => void;
  onCopy: (target: string) => void;
  onClose: () => void;
}

export interface MailComposerProps {
  accounts: MailAccount[];
  defaultAccountId: string;
  initial: ComposerInitial;
  onClose: () => void;
  onSent: () => void;
}

export interface MailAccountModalProps {
  account: MailAccount | null; // null = create
  onClose: () => void;
  onSaved: () => void;
  onDeleted?: () => void;
}
