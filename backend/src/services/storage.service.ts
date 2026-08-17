import { randomUUID } from 'crypto';
import { r2Client, R2_BUCKET_NAME } from '../config/r2';
import logger from '../config/logger';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Upload } from '@aws-sdk/lib-storage';
import path from 'path';
import { scanFile } from '../utils/file-scan';
import { AppError } from '../middleware/error';

/**
 * Uploads a file to Cloudflare R2
 * @param fileBuffer The file buffer
 * @param originalFilename The original filename
 * @param folder The folder in the bucket (e.g. 'resumes', 'avatars')
 * @returns The key of the uploaded file, plus its app-relative path
 */
export const uploadFileToR2 = async (
  fileBuffer: Buffer,
  originalFilename: string,
  folder: string = 'uploads',
  mimetype: string
): Promise<{ key: string; url: string }> => {
  // Security scan before upload
  const scanResult = scanFile(fileBuffer, originalFilename, mimetype);
  if (!scanResult.safe) {
    throw new AppError(scanResult.reason || 'File rejected by security scan', 400, 'FILE_REJECTED');
  }

  const ext = path.extname(originalFilename);
  const key = `${folder}/${randomUUID()}${ext}`;

  if (!r2Client) throw new Error('R2 storage is not configured');

  try {
    const upload = new Upload({
      client: r2Client,
      params: {
        Bucket: R2_BUCKET_NAME,
        Key: key,
        Body: fileBuffer,
        ContentType: mimetype,
      },
    });

    await upload.done();

    return { key, url: getFileUrl(key) };
  } catch (error) {
    logger.error('R2 Upload Error:', error);
    throw new Error('Failed to upload file to storage');
  }
};

/**
 * Low-level R2 put WITHOUT the inbound security scan — for trusted,
 * server-generated/archival content (e.g. mirroring WhatsApp inbound media for
 * long-term access). Do NOT use for user uploads (those must go through
 * uploadFileToR2 which scans).
 */
export const putBufferToR2 = async (
  buffer: Buffer,
  key: string,
  mimetype: string
): Promise<{ key: string; url: string }> => {
  if (!r2Client) throw new Error('R2 storage is not configured');
  const upload = new Upload({
    client: r2Client,
    params: { Bucket: R2_BUCKET_NAME, Key: key, Body: buffer, ContentType: mimetype },
  });
  await upload.done();
  return { key, url: getFileUrl(key) };
};

/**
 * The app-relative path for a stored file key.
 *
 * Deliberately NOT a URL onto the bucket itself. This used to prefix the key
 * with R2_PUBLIC_URL, which on this deployment was Cloudflare's `*.r2.dev`
 * development domain — a host that serves the whole bucket anonymously. The
 * same bucket holds every archived inbound WhatsApp attachment, so that domain
 * was a credential-free way around the app password, the media enumeration
 * guard in `streamMedia` and the audit log all at once. Everything that reads a
 * stored object goes through this process (`getObjectStream` /
 * `downloadFileFromR2`); anything that genuinely needs a direct browser fetch
 * should mint a short-lived `getSignedDownloadUrl` rather than lean on a public
 * bucket.
 */
export const getFileUrl = (key: string): string => `/${key.replace(/^\//, '')}`;

/**
 * Deletes a file from Cloudflare R2
 * @param key The file key in the bucket
 */
export const deleteFileFromR2 = async (key: string): Promise<void> => {
  if (!r2Client) throw new Error('R2 storage is not configured');
  try {
    await r2Client.send(
      new DeleteObjectCommand({
        Bucket: R2_BUCKET_NAME,
        Key: key,
      })
    );
  } catch (error) {
    logger.error('R2 Delete Error:', error);
    throw new Error('Failed to delete file from storage');
  }
};

/**
 * Is a bucket configured at all?
 *
 * Every other entry point here throws when it isn't, which is right for a caller
 * that was asked to store or fetch one specific file. A background sweeper has
 * no such user waiting on it and running without R2 is a supported setup, so it
 * should quietly do nothing instead of erroring once per tick forever.
 */
export const isR2Configured = (): boolean => Boolean(r2Client);

/** One page of a prefix listing, plus the token that continues it. */
export interface R2ObjectPage {
  objects: { key: string; lastModified?: Date }[];
  /** Undefined once the listing is exhausted. */
  nextToken?: string;
}

/**
 * Lists object keys under a prefix, one page at a time.
 *
 * Paged rather than "give me the whole prefix": S3/R2 caps a single
 * ListObjectsV2 response at 1000 keys and signals the truncation only through
 * `IsTruncated`, so a caller that ignores the continuation token sees the first
 * 1000 objects and believes that is the entire bucket. Loop until `nextToken`
 * comes back undefined.
 */
export const listObjectKeys = async (
  prefix: string,
  continuationToken?: string,
  maxKeys: number = 1000
): Promise<R2ObjectPage> => {
  if (!r2Client) throw new Error('R2 storage is not configured');
  try {
    const response = await r2Client.send(
      new ListObjectsV2Command({
        Bucket: R2_BUCKET_NAME,
        Prefix: prefix,
        ContinuationToken: continuationToken,
        MaxKeys: maxKeys,
      })
    );
    return {
      objects: (response.Contents ?? [])
        .filter((o): o is typeof o & { Key: string } => typeof o.Key === 'string')
        .map((o) => ({ key: o.Key, lastModified: o.LastModified })),
      nextToken: response.IsTruncated ? response.NextContinuationToken : undefined,
    };
  } catch (error) {
    logger.error('R2 List Error:', error);
    throw new Error('Failed to list objects in storage');
  }
};

/**
 * Generates a signed URL for temporary access to a private file
 * @param key The file key in the bucket
 * @param expiresInSeconds Duration in seconds (default 3600 = 1 hour)
 */
export const getSignedDownloadUrl = async (
  key: string,
  expiresInSeconds: number = 3600
): Promise<string> => {
  if (!r2Client) throw new Error('R2 storage is not configured');
  try {
    const command = new GetObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
    });

    // Generate signed URL
    const url = await getSignedUrl(r2Client, command, { expiresIn: expiresInSeconds });
    return url;
  } catch (error) {
    logger.error('R2 Signed URL Error:', error);
    throw new Error('Failed to generate signed URL');
  }
};

/**
 * Signed URL a BROWSER can PUT straight to, bypassing our own servers.
 *
 * The download twin above has always existed; this is the upload half. It is
 * what lets a large WhatsApp attachment reach storage at all: every request the
 * console makes is buffered whole by the Next.js BFF proxy, and serverless
 * platforms cap that buffer (Vercel at ~4.5 MB), so a 40 MB document could never
 * be sent no matter what the backend or Meta allowed. Uploading direct to R2
 * takes both out of the path.
 *
 * NOTE: the bucket needs a CORS rule allowing PUT from the console's origin, or
 * the browser blocks the request before it is even sent. See R2_UPLOAD_CORS in
 * .env.example.
 *
 * `contentType` is signed into the URL, so the PUT must send exactly the same
 * Content-Type header or R2 rejects the signature.
 */
export const getSignedUploadUrl = async (
  key: string,
  contentType: string,
  expiresInSeconds: number = 900
): Promise<string> => {
  if (!r2Client) throw new Error('R2 storage is not configured');
  try {
    const command = new PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
      ContentType: contentType,
    });
    return await getSignedUrl(r2Client, command, { expiresIn: expiresInSeconds });
  } catch (error) {
    logger.error('R2 Signed Upload URL Error:', error);
    throw new Error('Failed to generate signed upload URL');
  }
};

/**
 * Downloads a file from R2 and returns its contents as a Buffer.
 * Used by background workers (e.g. bulk resume ZIP export).
 */
export const downloadFileFromR2 = async (key: string): Promise<Buffer> => {
  if (!r2Client) throw new Error('R2 storage is not configured');
  try {
    const command = new GetObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
    });
    const response = await r2Client.send(command);
    const stream = response.Body as NodeJS.ReadableStream;
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.from(chunk as Uint8Array));
    }
    return Buffer.concat(chunks);
  } catch (error) {
    logger.error('R2 Download Error:', error);
    throw new Error('Failed to download file from storage');
  }
};

/**
 * A `Range` the caller asked for that the object cannot satisfy (e.g. a seek
 * past the end). Distinguished from a genuine R2 failure so the media proxy can
 * answer 416 rather than silently falling back and serving the whole file — a
 * player that receives 200 + a full body in reply to a seek restarts playback
 * from zero instead of jumping.
 */
export class R2RangeNotSatisfiableError extends Error {
  constructor() {
    super('Requested range not satisfiable');
    this.name = 'R2RangeNotSatisfiableError';
  }
}

export interface R2ObjectStream {
  /** Raw object body — pipe it, do not buffer it. */
  body: NodeJS.ReadableStream;
  /** Bytes in THIS response: the slice length when a range was honoured. */
  contentLength?: number;
  /** `bytes <start>-<end>/<total>`; present only when R2 honoured the range. */
  contentRange?: string;
  contentType?: string;
  status: 200 | 206;
}

/**
 * Opens an R2 object as a stream, optionally only the bytes named by an HTTP
 * `Range` header.
 *
 * `downloadFileFromR2` reads the whole object into a Buffer before the caller
 * sees a single byte — fine for a worker assembling a ZIP, but serving a 100 MB
 * attachment that way pins the entire file in the Node heap once per concurrent
 * viewer, and leaves the browser no way to seek.
 */
export const getObjectStream = async (key: string, range?: string): Promise<R2ObjectStream> => {
  if (!r2Client) throw new Error('R2 storage is not configured');
  try {
    const response = await r2Client.send(
      new GetObjectCommand({
        Bucket: R2_BUCKET_NAME,
        Key: key,
        Range: range,
      })
    );
    return {
      body: response.Body as NodeJS.ReadableStream,
      contentLength: response.ContentLength,
      contentRange: response.ContentRange,
      contentType: response.ContentType,
      // R2 echoes Content-Range only when it actually applied the range; an
      // ignored/absent one comes back as an ordinary full-body 200.
      status: response.ContentRange ? 206 : 200,
    };
  } catch (error) {
    const httpStatus = (error as { $metadata?: { httpStatusCode?: number } })?.$metadata
      ?.httpStatusCode;
    if (httpStatus === 416) throw new R2RangeNotSatisfiableError();
    logger.error('R2 Stream Error:', error);
    throw new Error('Failed to stream file from storage');
  }
};
