import type { UploadApiOptions, UploadApiResponse } from 'cloudinary';
import { v2 as cloudinary } from 'cloudinary';
import { env } from './env';

// Configure Cloudinary
cloudinary.config({
  cloud_name: env.CLOUDINARY_CLOUD_NAME,
  api_key: env.CLOUDINARY_API_KEY,
  api_secret: env.CLOUDINARY_API_SECRET,
  secure: true,
});

// Upload options for different use cases
export const uploadOptions = {
  profileImage: {
    folder: 'hire_adda/profiles',
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
    transformation: [
      { width: 400, height: 400, crop: 'fill', gravity: 'face' },
      { quality: 'auto', fetch_format: 'auto' },
    ],
  } as UploadApiOptions,

  companyLogo: {
    folder: 'hire_adda/companies',
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp', 'svg'],
    transformation: [
      { width: 400, height: 400, crop: 'fit' },
      { quality: 'auto', fetch_format: 'auto' },
    ],
  } as UploadApiOptions,

  companyCover: {
    folder: 'hire_adda/companies/covers',
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
    transformation: [
      { width: 1920, height: 640, crop: 'fill' },
      { quality: 'auto', fetch_format: 'auto' },
    ],
  } as UploadApiOptions,

  resume: {
    folder: 'hire_adda/resumes',
    allowed_formats: ['pdf'],
    resource_type: 'raw',
  } as UploadApiOptions,
};

// Upload image from buffer or base64
export const uploadImage = async (
  file: string | Buffer,
  options: UploadApiOptions = uploadOptions.profileImage,
  originalFilename?: string
): Promise<UploadApiResponse> => {
  // Security scan for buffer uploads
  if (typeof file !== 'string' && originalFilename) {
    const { scanFile } = await import('../utils/file-scan');
    const mimetype = options.resource_type === 'raw' ? 'application/pdf' : 'image/jpeg';
    const result = scanFile(file, originalFilename, mimetype);
    if (!result.safe) {
      throw new Error(result.reason || 'File rejected by security scan');
    }
  }

  return new Promise((resolve, reject) => {
    const uploadCallback = (error: any, result: UploadApiResponse | undefined) => {
      if (error) return reject(error);
      if (!result) return reject(new Error('Upload failed - no result'));
      resolve(result);
    };

    if (typeof file === 'string') {
      // Base64 or URL
      cloudinary.uploader.upload(file, options, uploadCallback);
    } else {
      // Buffer
      cloudinary.uploader.upload_stream(options, uploadCallback).end(file);
    }
  });
};

// Delete image by public ID
export const deleteImage = async (publicId: string): Promise<void> => {
  await cloudinary.uploader.destroy(publicId);
};

/**
 * Extracts the Cloudinary public ID from a secure_url.
 * e.g. "https://res.cloudinary.com/xxx/image/upload/v123/hire_adda/profiles/abc.jpg"
 *    → "hire_adda/profiles/abc"
 * Returns null if the URL doesn't look like a Cloudinary URL.
 */
export const extractPublicId = (url: string): string | null => {
  const match = url.match(/\/upload\/(?:v\d+\/)?(.+)\.\w+$/);
  return match ? match[1] : null;
};

// Generate optimized URL with transformations
export const getOptimizedUrl = (
  publicId: string,
  options: {
    width?: number;
    height?: number;
    crop?: string;
    quality?: string;
    format?: string;
  } = {}
): string => {
  return cloudinary.url(publicId, {
    transformation: [
      {
        width: options.width,
        height: options.height,
        crop: options.crop || 'fill',
        gravity: 'auto',
      },
      {
        quality: options.quality || 'auto',
        fetch_format: options.format || 'auto',
      },
    ],
    secure: true,
  });
};

// Generate thumbnail URL
export const getThumbnailUrl = (publicId: string, size: number = 150): string => {
  return getOptimizedUrl(publicId, { width: size, height: size, crop: 'thumb' });
};

// Generate responsive image srcset
export const getResponsiveSrcset = (
  publicId: string,
  widths: number[] = [320, 640, 960, 1280]
): string => {
  return widths.map((w) => `${getOptimizedUrl(publicId, { width: w })} ${w}w`).join(', ');
};

export default cloudinary;
