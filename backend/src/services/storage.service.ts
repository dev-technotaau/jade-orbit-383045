import { randomUUID } from 'crypto';
import { r2Client, R2_BUCKET_NAME } from '../config/r2';
import logger from '../config/logger';
import { DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
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
 * @returns The public URL or key of the uploaded file
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

    // Generate public URL
    let url = `/${key}`;

    if (process.env.R2_PUBLIC_URL) {
      const baseUrl = process.env.R2_PUBLIC_URL.replace(/\/$/, '');
      const cleanKey = key.replace(/^\//, '');
      url = `${baseUrl}/${cleanKey}`;
    }

    return { key, url };
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
 * Generates a full URL for a stored file key
 */
export const getFileUrl = (key: string): string => {
  if (process.env.R2_PUBLIC_URL) {
    const baseUrl = process.env.R2_PUBLIC_URL.replace(/\/$/, '');
    const cleanKey = key.replace(/^\//, '');
    return `${baseUrl}/${cleanKey}`;
  }
  return `/${key}`;
};

/**
 * Extracts the R2 key from a full public URL.
 * e.g. "https://r2.example.com/resumes/abc.pdf" → "resumes/abc.pdf"
 * Returns null if the URL doesn't match the R2 public URL pattern.
 */
export const extractR2KeyFromUrl = (url: string): string | null => {
  if (!process.env.R2_PUBLIC_URL) return null;
  const baseUrl = process.env.R2_PUBLIC_URL.replace(/\/$/, '');
  if (!url.startsWith(baseUrl)) return null;
  return url.slice(baseUrl.length + 1); // +1 for the "/"
};

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
