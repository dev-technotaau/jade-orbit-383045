// Types for the super-admin Resume Watermark Toolkit.

export type WatermarkPosition =
  | 'background'
  | 'tiled'
  | 'diagonal'
  | 'center'
  | 'top-left'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-right'
  | 'top-center'
  | 'bottom-center';

export interface WatermarkConfig {
  enabled: boolean;
  position: WatermarkPosition;
  /** 0..1 */
  opacity: number;
  /** logo width as a fraction of page width, 0.05..1 */
  scale: number;
  /** degrees, -90..90 */
  rotation: number;
}

export type OnPlatformResumeType = 'uploaded' | 'generated' | 'any';

export interface OnPlatformCandidate {
  profileId: string;
  userId: string;
  name: string;
  email: string;
  phone: string | null;
  hasUploaded: boolean;
  hasGenerated: boolean;
  uploadedName: string | null;
  uploadedMime: string | null;
  uploadedSize: number | null;
  uploadedAt: string | null;
  generatedAt: string | null;
}

export interface OffPlatformResume {
  id: string;
  candidateId: string;
  url: string;
  r2Key: string;
  originalName: string;
  mimeType: string;
  size: number;
  isPrimary: boolean;
  uploadedBy: string;
  createdAt: string;
}

export interface OffPlatformCandidate {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  headline: string | null;
  notes: string | null;
  tags: string[];
  source: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  resumes: OffPlatformResume[];
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface OffPlatformInput {
  name?: string;
  email?: string;
  phone?: string;
  headline?: string;
  notes?: string;
  source?: string;
  tags?: string[];
}
