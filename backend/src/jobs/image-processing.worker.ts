import type { Job } from 'bullmq';
import { Worker } from 'bullmq';
import { redis } from '../config/redis';
import logger from '../config/logger';
import { IMAGE_PROCESSING_QUEUE_NAME, type ImageJobData } from './image-processing.queue';
import { env } from '../config/env';
import sharp from 'sharp';
import { withExtractedContext, SpanKind } from '../utils/trace-propagation';

const VARIANTS = [
  { name: 'thumbnail', width: 100, height: 100 },
  { name: 'small', width: 200, height: 200 },
  { name: 'medium', width: 400, height: 400 },
] as const;

export function createImageProcessingWorker(): Worker<ImageJobData> {
  const worker = new Worker<ImageJobData>(
    IMAGE_PROCESSING_QUEUE_NAME,
    async (job: Job<ImageJobData>) => {
      const traceCtx = (job.data as Record<string, any>)?._traceContext || {};
      return withExtractedContext(
        traceCtx,
        `bullmq.process ${job.name}`,
        SpanKind.CONSUMER,
        async () => {
          const TIMEOUT_MS = 60_000;
          const timeoutId = setTimeout(() => {
            /* safety net */
          }, TIMEOUT_MS);
          try {
            const { entityType, entityId, userId, imageUrl, field } = job.data;
            logger.info(`Processing image for ${entityType}/${entityId} (${field})`);

            // Download the original image
            const response = await Promise.race([
              // eslint-disable-next-line n/no-unsupported-features/node-builtins -- fetch is stable in Node 20.18
              fetch(imageUrl),
              new Promise<never>((_resolve, reject) =>
                setTimeout(() => reject(new Error('Image download timeout after 30s')), 30_000)
              ),
            ]);

            if (!response.ok) {
              throw new Error(`Failed to download image: ${response.status}`);
            }

            const buffer = Buffer.from(await response.arrayBuffer());
            const variants: Record<string, string> = {};

            // Generate variants and upload to Cloudinary
            const { uploadImage, uploadOptions } = await import('../config/cloudinary');

            for (const variant of VARIANTS) {
              const resized = await sharp(buffer)
                .resize(variant.width, variant.height, { fit: 'cover', position: 'center' })
                .webp({ quality: 80 })
                .toBuffer();

              const folder = `${entityType}s/${field}/${variant.name}`;
              const result = await uploadImage(
                `data:image/webp;base64,${resized.toString('base64')}`,
                {
                  ...uploadOptions,
                  folder,
                  public_id: entityId,
                }
              );
              variants[variant.name] = result.secure_url;
            }

            // Update the profile with variant URLs
            const prisma = (await import('../config/prisma')).prisma;
            const variantsJson = {
              thumbnail: variants.thumbnail,
              small: variants.small,
              medium: variants.medium,
              original: imageUrl,
            };

            if (entityType === 'candidate') {
              await prisma.candidateProfile.update({
                where: { userId },
                data: { imageVariants: variantsJson },
              });
            } else if (entityType === 'company') {
              if (field === 'logo') {
                await prisma.companyProfile.update({
                  where: { userId },
                  data: { logoVariants: variantsJson },
                });
              } else if (field === 'cover') {
                await prisma.companyProfile.update({
                  where: { userId },
                  data: { coverVariants: variantsJson },
                });
              }
            }

            logger.info(
              `Image variants generated for ${entityType}/${entityId}: ${Object.keys(variants).join(', ')}`
            );
            return { variants };
          } catch (error) {
            logger.error(`Failed to process image:`, error);
            throw error;
          } finally {
            clearTimeout(timeoutId);
          }
        }
      );
    },
    {
      connection: redis,
      concurrency: parseInt(env.BULLMQ_IMAGE_PROCESSING_CONCURRENCY, 10),
      lockDuration: 120000,
    }
  );

  worker.on('completed', (job) => {
    logger.info(`Image processing job ${job.id} completed`);
  });

  worker.on('failed', (job, err) => {
    logger.error(`Image processing job ${job?.id} failed: ${err.message}`);
  });

  return worker;
}
