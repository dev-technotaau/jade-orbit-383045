import api from '@/lib/api';
import { API } from '@/constants/api';
import type { ApiResponse } from '@/types/api';
import type {
  MailAccount,
  MailAccountInput,
  MailFolder,
  MailListResult,
  MailDetail,
  MailComposePayload,
  MailSendResult,
  MailDraftResult,
  MailSpecialFolders,
  MailConnectivityResult,
  MailUploadResult,
  MailMessageQuery,
  MailThreadListResult,
  RecipientSuggestion,
  MailStagedAttachment,
} from '@/types/email-mailbox';

const A = API.SUPER_ADMIN;

/** Trigger a browser download for a Blob. */
function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/**
 * One-on-one webmail API. Targets `/super-admin/email/mailbox/*` (SUPER_ADMIN +
 * MFA). Binary endpoints (attachment/raw) stream through the BFF proxy as blobs.
 */
export const mailboxService = {
  // ── Accounts ──
  async listAccounts(): Promise<ApiResponse<MailAccount[]>> {
    return (await api.get(A.EMAIL_MAIL_ACCOUNTS)).data;
  },
  async getAccount(id: string): Promise<ApiResponse<MailAccount>> {
    return (await api.get(A.EMAIL_MAIL_ACCOUNT(id))).data;
  },
  async createAccount(body: MailAccountInput): Promise<ApiResponse<MailAccount>> {
    return (await api.post(A.EMAIL_MAIL_ACCOUNTS, body)).data;
  },
  async updateAccount(
    id: string,
    body: Partial<MailAccountInput>,
  ): Promise<ApiResponse<MailAccount>> {
    return (await api.put(A.EMAIL_MAIL_ACCOUNT(id), body)).data;
  },
  async deleteAccount(id: string): Promise<ApiResponse<{ deleted: boolean }>> {
    return (await api.delete(A.EMAIL_MAIL_ACCOUNT(id))).data;
  },
  async testNewAccount(
    body: Partial<MailAccountInput>,
  ): Promise<ApiResponse<MailConnectivityResult>> {
    return (await api.post(A.EMAIL_MAIL_ACCOUNT_TEST, body)).data;
  },
  async testAccount(
    id: string,
    body: Partial<MailAccountInput> = {},
  ): Promise<ApiResponse<MailConnectivityResult>> {
    return (await api.post(A.EMAIL_MAIL_ACCOUNT_TEST_ID(id), body)).data;
  },

  // ── Folders ──
  async listFolders(id: string): Promise<ApiResponse<MailFolder[]>> {
    return (await api.get(A.EMAIL_MAIL_FOLDERS(id))).data;
  },
  async specialFolders(id: string): Promise<ApiResponse<MailSpecialFolders>> {
    return (await api.get(A.EMAIL_MAIL_SPECIAL(id))).data;
  },
  async createFolder(id: string, path: string): Promise<ApiResponse<{ created: boolean }>> {
    return (await api.post(A.EMAIL_MAIL_FOLDERS(id), { path })).data;
  },
  async renameFolder(
    id: string,
    path: string,
    newPath: string,
  ): Promise<ApiResponse<{ renamed: boolean }>> {
    return (await api.put(A.EMAIL_MAIL_FOLDERS(id), { path, newPath })).data;
  },
  async deleteFolder(id: string, path: string): Promise<ApiResponse<{ deleted: boolean }>> {
    return (await api.delete(A.EMAIL_MAIL_FOLDERS(id), { data: { path } })).data;
  },

  // ── Messages ──
  async listMessages(id: string, query: MailMessageQuery): Promise<ApiResponse<MailListResult>> {
    return (await api.get(A.EMAIL_MAIL_MESSAGES(id), { params: query })).data;
  },
  async listThreads(
    id: string,
    query: MailMessageQuery,
  ): Promise<ApiResponse<MailThreadListResult>> {
    return (await api.get(A.EMAIL_MAIL_THREADS(id), { params: query })).data;
  },
  async getThread(
    id: string,
    folder: string,
    uids: number[],
    peek = false,
  ): Promise<ApiResponse<MailDetail[]>> {
    return (
      await api.get(A.EMAIL_MAIL_THREAD(id), { params: { folder, uids: uids.join(','), peek } })
    ).data;
  },
  async suggestRecipients(
    id: string,
    q: string,
    limit = 8,
  ): Promise<ApiResponse<RecipientSuggestion[]>> {
    return (await api.get(A.EMAIL_MAIL_SUGGEST(id), { params: { q, limit } })).data;
  },
  async forwardAttachments(
    id: string,
    folder: string,
    uid: number,
  ): Promise<ApiResponse<MailStagedAttachment[]>> {
    return (await api.post(A.EMAIL_MAIL_FORWARD_ATTACH(id), { folder, uid })).data;
  },
  async getMessage(
    id: string,
    folder: string,
    uid: number,
    peek = false,
  ): Promise<ApiResponse<MailDetail>> {
    return (await api.get(A.EMAIL_MAIL_MESSAGE(id), { params: { folder, uid, peek } })).data;
  },
  async setFlags(
    id: string,
    folder: string,
    uids: number[],
    add: string[] = [],
    remove: string[] = [],
  ): Promise<ApiResponse<{ ok: boolean }>> {
    return (await api.post(A.EMAIL_MAIL_FLAGS(id), { folder, uids, add, remove })).data;
  },
  async moveMessages(
    id: string,
    folder: string,
    uids: number[],
    target: string,
  ): Promise<ApiResponse<{ moved: boolean }>> {
    return (await api.post(A.EMAIL_MAIL_MOVE(id), { folder, uids, target })).data;
  },
  async copyMessages(
    id: string,
    folder: string,
    uids: number[],
    target: string,
  ): Promise<ApiResponse<{ copied: boolean }>> {
    return (await api.post(A.EMAIL_MAIL_COPY(id), { folder, uids, target })).data;
  },
  async deleteMessages(
    id: string,
    folder: string,
    uids: number[],
    permanent = false,
  ): Promise<ApiResponse<{ trashed: boolean }>> {
    return (await api.post(A.EMAIL_MAIL_DELETE(id), { folder, uids, permanent })).data;
  },

  // ── Compose ──
  async send(id: string, payload: MailComposePayload): Promise<ApiResponse<MailSendResult>> {
    return (await api.post(A.EMAIL_MAIL_SEND(id), payload)).data;
  },
  async saveDraft(id: string, payload: MailComposePayload): Promise<ApiResponse<MailDraftResult>> {
    return (await api.post(A.EMAIL_MAIL_DRAFT(id), payload)).data;
  },
  async uploadAttachment(id: string, file: File): Promise<ApiResponse<MailUploadResult>> {
    const fd = new FormData();
    fd.append('file', file);
    return (
      await api.post(A.EMAIL_MAIL_UPLOAD(id), fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
    ).data;
  },

  // ── Binary downloads (blob via BFF proxy) ──
  async downloadAttachment(
    id: string,
    folder: string,
    uid: number,
    index: number,
    filename: string,
  ): Promise<void> {
    const res = await api.get(A.EMAIL_MAIL_ATTACHMENT(id), {
      params: { folder, uid, index },
      responseType: 'blob',
    });
    saveBlob(res.data as Blob, filename);
  },
  async downloadRaw(id: string, folder: string, uid: number): Promise<void> {
    const res = await api.get(A.EMAIL_MAIL_RAW(id), {
      params: { folder, uid },
      responseType: 'blob',
    });
    saveBlob(res.data as Blob, `message-${uid}.eml`);
  },
};
