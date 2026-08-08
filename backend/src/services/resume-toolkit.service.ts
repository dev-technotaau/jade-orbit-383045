/**
 * Data layer for the super-admin Resume Watermark Toolkit.
 *
 *  - On-platform: reads existing CandidateProfile/User rows (never mutates them)
 *    to list candidates who have a resume (uploaded and/or platform-generated).
 *  - Off-platform: fully separate OffPlatformCandidate/OffPlatformResume records
 *    (no User account, never mixed with on-platform candidates). Files go to R2
 *    under the `off-platform-resumes/` prefix, exactly like on-platform resumes.
 *
 * Watermarking itself lives in resume-watermark.service.ts; this module only
 * resolves the source file descriptors (url + mime + name) for the controller.
 */
import { prisma } from '../config/prisma';
import { AppError } from '../middleware/error';
import { uploadFileToR2, deleteFileFromR2 } from './storage.service';

const OFF_FOLDER = 'off-platform-resumes';
const MIME_PDF = 'application/pdf';
const ALLOWED_RESUME_TYPES = [
  MIME_PDF,
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

export interface UploadFile {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
}

/** A resolved, downloadable resume source (before watermarking). */
export interface ResumeDescriptor {
  url: string;
  mimeType: string;
  originalName: string;
  /** Human label used for the downloaded filename / zip entry. */
  label: string;
}

export type OnPlatformResumeType = 'uploaded' | 'generated' | 'any';

// ─────────────────────────────────────────────────────────────────────────────
// On-platform
// ─────────────────────────────────────────────────────────────────────────────
export async function listOnPlatform(params: {
  q?: string;
  resumeType?: OnPlatformResumeType;
  page?: number;
  limit?: number;
}) {
  const page = Math.max(1, params.page ?? 1);
  const limit = Math.min(100, Math.max(1, params.limit ?? 20));
  const resumeType = params.resumeType ?? 'any';

  const resumeFilter =
    resumeType === 'uploaded'
      ? { resume: { not: null } }
      : resumeType === 'generated'
        ? { generatedResumeUrl: { not: null } }
        : { OR: [{ resume: { not: null } }, { generatedResumeUrl: { not: null } }] };

  const q = params.q?.trim();
  const searchFilter = q
    ? {
        user: {
          OR: [
            { firstName: { contains: q, mode: 'insensitive' as const } },
            { lastName: { contains: q, mode: 'insensitive' as const } },
            { email: { contains: q, mode: 'insensitive' as const } },
          ],
        },
      }
    : {};

  const where = { AND: [resumeFilter, searchFilter] };

  const [rows, total] = await prisma.$transaction([
    prisma.candidateProfile.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        userId: true,
        resume: true,
        resumeOriginalName: true,
        resumeMimeType: true,
        resumeSize: true,
        resumeUploadedAt: true,
        generatedResumeUrl: true,
        generatedResumeAt: true,
        user: { select: { firstName: true, lastName: true, email: true, mobileNumber: true } },
      },
    }),
    prisma.candidateProfile.count({ where }),
  ]);

  const items = rows.map((r) => {
    const hasGenerated = !!r.generatedResumeUrl;
    // "uploaded" = an active resume that isn't just the promoted generated PDF
    const hasUploaded = !!r.resume && r.resume !== r.generatedResumeUrl;
    return {
      profileId: r.id,
      userId: r.userId,
      name: [r.user.firstName, r.user.lastName].filter(Boolean).join(' ') || '—',
      email: r.user.email,
      phone: r.user.mobileNumber,
      hasUploaded,
      hasGenerated,
      uploadedName: r.resumeOriginalName,
      uploadedMime: r.resumeMimeType,
      uploadedSize: r.resumeSize,
      uploadedAt: r.resumeUploadedAt,
      generatedAt: r.generatedResumeAt,
    };
  });

  return { items, total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) };
}

/** Resolve the file to download for one on-platform candidate. */
export async function resolveOnPlatformResume(
  idOrUserId: string,
  type: OnPlatformResumeType = 'any'
): Promise<ResumeDescriptor> {
  const profile = await prisma.candidateProfile.findFirst({
    where: { OR: [{ userId: idOrUserId }, { id: idOrUserId }] },
    select: {
      resume: true,
      resumeOriginalName: true,
      resumeMimeType: true,
      generatedResumeUrl: true,
      user: { select: { firstName: true, lastName: true } },
    },
  });
  if (!profile) throw new AppError('Candidate not found', 404, 'NOT_FOUND');

  const candidateName =
    [profile.user.firstName, profile.user.lastName].filter(Boolean).join(' ') || 'candidate';

  const uploaded = profile.resume
    ? {
        url: profile.resume,
        mimeType: profile.resumeMimeType || MIME_PDF,
        originalName: profile.resumeOriginalName || 'resume',
        label: candidateName,
      }
    : null;
  const generated = profile.generatedResumeUrl
    ? {
        url: profile.generatedResumeUrl,
        mimeType: MIME_PDF,
        originalName: 'resume.pdf',
        label: `${candidateName} (generated)`,
      }
    : null;

  if (type === 'uploaded') {
    if (!uploaded) throw new AppError('This candidate has no uploaded resume', 404, 'NO_RESUME');
    return uploaded;
  }
  if (type === 'generated') {
    if (!generated) throw new AppError('This candidate has no generated resume', 404, 'NO_RESUME');
    return generated;
  }
  const descriptor = uploaded ?? generated;
  if (!descriptor) throw new AppError('This candidate has no resume', 404, 'NO_RESUME');
  return descriptor;
}

/** Resolve download descriptors for many on-platform candidates (bulk zip). */
export async function resolveOnPlatformBulk(
  userIds: string[],
  type: OnPlatformResumeType = 'any'
): Promise<{ descriptors: ResumeDescriptor[]; skipped: number }> {
  const descriptors: ResumeDescriptor[] = [];
  let skipped = 0;
  for (const id of userIds) {
    try {
      descriptors.push(await resolveOnPlatformResume(id, type));
    } catch {
      skipped += 1; // candidate lacks the requested resume type — skip in bulk
    }
  }
  return { descriptors, skipped };
}

// ─────────────────────────────────────────────────────────────────────────────
// Off-platform (separate records — no User account)
// ─────────────────────────────────────────────────────────────────────────────
function assertAllowed(file: UploadFile): void {
  if (!ALLOWED_RESUME_TYPES.includes(file.mimetype)) {
    throw new AppError(
      `Invalid file type for "${file.originalname}". Allowed: PDF, DOC, DOCX.`,
      400,
      'INVALID_FILE_TYPE'
    );
  }
}

function nameFromFilename(filename: string): string {
  return (
    filename
      .replace(/\.(pdf|docx?|PDF|DOCX?)$/i, '')
      .replace(/[_]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim() || 'Unnamed candidate'
  );
}

async function storeResume(
  candidateId: string,
  file: UploadFile,
  adminId: string,
  isPrimary = false
) {
  assertAllowed(file);
  const { url, key } = await uploadFileToR2(
    file.buffer,
    file.originalname,
    OFF_FOLDER,
    file.mimetype
  );
  return prisma.offPlatformResume.create({
    data: {
      candidateId,
      url,
      r2Key: key,
      originalName: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
      isPrimary,
      uploadedBy: adminId,
    },
  });
}

export interface OffPlatformInput {
  name?: string;
  email?: string;
  phone?: string;
  headline?: string;
  notes?: string;
  tags?: string[];
  source?: string;
}

export async function listOffPlatform(params: { q?: string; page?: number; limit?: number }) {
  const page = Math.max(1, params.page ?? 1);
  const limit = Math.min(100, Math.max(1, params.limit ?? 20));
  const q = params.q?.trim();
  const where = q
    ? {
        OR: [
          { name: { contains: q, mode: 'insensitive' as const } },
          { email: { contains: q, mode: 'insensitive' as const } },
          { phone: { contains: q } },
          { headline: { contains: q, mode: 'insensitive' as const } },
        ],
      }
    : {};

  const [items, total] = await prisma.$transaction([
    prisma.offPlatformCandidate.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      include: { resumes: { orderBy: { createdAt: 'desc' } } },
    }),
    prisma.offPlatformCandidate.count({ where }),
  ]);

  return { items, total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) };
}

export async function getOffPlatform(id: string) {
  const row = await prisma.offPlatformCandidate.findUnique({
    where: { id },
    include: { resumes: { orderBy: { createdAt: 'desc' } } },
  });
  if (!row) throw new AppError('Off-platform candidate not found', 404, 'NOT_FOUND');
  return row;
}

/** Create ONE candidate holding all uploaded files as their resumes. */
export async function createOffPlatform(
  input: OffPlatformInput,
  files: UploadFile[],
  adminId: string
) {
  files.forEach(assertAllowed);
  const name = input.name?.trim() || (files[0] ? nameFromFilename(files[0].originalname) : '');
  if (!name) throw new AppError('A name is required', 400, 'NAME_REQUIRED');

  const candidate = await prisma.offPlatformCandidate.create({
    data: {
      name,
      email: input.email || null,
      phone: input.phone || null,
      headline: input.headline || null,
      notes: input.notes || null,
      tags: input.tags ?? [],
      source: input.source || null,
      createdBy: adminId,
    },
  });
  for (let i = 0; i < files.length; i += 1) {
    await storeResume(candidate.id, files[i], adminId, i === 0);
  }
  return getOffPlatform(candidate.id);
}

/** Quick import: one candidate per file (name derived from the filename). */
export async function importOffPlatformPerFile(files: UploadFile[], adminId: string) {
  files.forEach(assertAllowed);
  const ids: string[] = [];
  for (const file of files) {
    const candidate = await prisma.offPlatformCandidate.create({
      data: {
        name: nameFromFilename(file.originalname),
        source: 'bulk-import',
        createdBy: adminId,
      },
    });
    await storeResume(candidate.id, file, adminId, true);
    ids.push(candidate.id);
  }
  return { count: ids.length, ids };
}

export async function addResumesToOffPlatform(id: string, files: UploadFile[], adminId: string) {
  await getOffPlatform(id);
  files.forEach(assertAllowed);
  for (const file of files) await storeResume(id, file, adminId);
  return getOffPlatform(id);
}

export async function updateOffPlatform(id: string, patch: OffPlatformInput) {
  await getOffPlatform(id);
  return prisma.offPlatformCandidate.update({
    where: { id },
    data: {
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.email !== undefined ? { email: patch.email || null } : {}),
      ...(patch.phone !== undefined ? { phone: patch.phone || null } : {}),
      ...(patch.headline !== undefined ? { headline: patch.headline || null } : {}),
      ...(patch.notes !== undefined ? { notes: patch.notes || null } : {}),
      ...(patch.tags !== undefined ? { tags: patch.tags } : {}),
      ...(patch.source !== undefined ? { source: patch.source || null } : {}),
    },
    include: { resumes: { orderBy: { createdAt: 'desc' } } },
  });
}

export async function deleteOffPlatform(id: string) {
  const row = await getOffPlatform(id);
  await Promise.all(row.resumes.map((r) => deleteFileFromR2(r.r2Key).catch(() => {})));
  await prisma.offPlatformCandidate.delete({ where: { id } }); // cascades resumes
  return { id };
}

export async function deleteOffPlatformResume(candidateId: string, resumeId: string) {
  const resume = await prisma.offPlatformResume.findFirst({
    where: { id: resumeId, candidateId },
  });
  if (!resume) throw new AppError('Resume not found', 404, 'NOT_FOUND');
  await deleteFileFromR2(resume.r2Key).catch(() => {});
  await prisma.offPlatformResume.delete({ where: { id: resumeId } });
  return { id: resumeId };
}

export async function bulkDeleteOffPlatform(ids: string[]) {
  const rows = await prisma.offPlatformCandidate.findMany({
    where: { id: { in: ids } },
    include: { resumes: true },
  });
  await Promise.all(
    rows.flatMap((c) => c.resumes).map((r) => deleteFileFromR2(r.r2Key).catch(() => {}))
  );
  const res = await prisma.offPlatformCandidate.deleteMany({ where: { id: { in: ids } } });
  return { count: res.count };
}

export async function getOffPlatformResume(candidateId: string, resumeId: string) {
  const resume = await prisma.offPlatformResume.findFirst({
    where: { id: resumeId, candidateId },
    include: { candidate: { select: { name: true } } },
  });
  if (!resume) throw new AppError('Resume not found', 404, 'NOT_FOUND');
  return resume;
}

/** Resolve every resume descriptor for a set of off-platform candidates (bulk zip). */
export async function resolveOffPlatformBulk(ids: string[]): Promise<ResumeDescriptor[]> {
  const rows = await prisma.offPlatformCandidate.findMany({
    where: { id: { in: ids } },
    include: { resumes: { orderBy: { createdAt: 'desc' } } },
  });
  const descriptors: ResumeDescriptor[] = [];
  for (const candidate of rows) {
    candidate.resumes.forEach((resume, idx) => {
      descriptors.push({
        url: resume.url,
        mimeType: resume.mimeType,
        originalName: resume.originalName,
        label: candidate.resumes.length > 1 ? `${candidate.name} (${idx + 1})` : candidate.name,
      });
    });
  }
  return descriptors;
}
