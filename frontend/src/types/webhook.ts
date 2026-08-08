export interface WebhookEndpoint {
  id: string;
  url: string;
  secret?: string;
  events: string[];
  isActive: boolean;
  description: string | null;
  failureCount: number;
  lastTriggeredAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WebhookDelivery {
  id: string;
  webhookId: string;
  event: string;
  payload: Record<string, unknown>;
  statusCode: number | null;
  response: string | null;
  success: boolean;
  attempt: number;
  error: string | null;
  createdAt: string;
}

export interface CreateWebhookRequest {
  url: string;
  events: string[];
  description?: string;
}

export interface UpdateWebhookRequest {
  url?: string;
  events?: string[];
  description?: string;
  isActive?: boolean;
}

export const WEBHOOK_EVENTS = [
  { value: 'job.posted', label: 'Job Posted' },
  { value: 'job.updated', label: 'Job Updated' },
  { value: 'job.closed', label: 'Job Closed' },
  { value: 'application.submitted', label: 'Application Submitted' },
  { value: 'application.status_changed', label: 'Application Status Changed' },
  { value: 'candidate.profile_updated', label: 'Candidate Profile Updated' },
] as const;
