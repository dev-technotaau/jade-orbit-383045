'use client';

import { useState, useRef, useCallback } from 'react';
import ReactCrop, { type Crop, type PixelCrop, centerCrop, makeAspectCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import { Crop as CropIcon, ZoomIn, ZoomOut } from 'lucide-react';
import Tooltip from './Tooltip';

interface ImageCropperProps {
  isOpen: boolean;
  onClose: () => void;
  imageSrc: string;
  onCropComplete: (croppedBlob: Blob) => void;
  aspectRatio?: number;
  circularCrop?: boolean;
  outputWidth?: number;
  outputHeight?: number;
}

function centerAspectCrop(mediaWidth: number, mediaHeight: number, aspect: number): Crop {
  return centerCrop(
    makeAspectCrop({ unit: '%', width: 90 }, aspect, mediaWidth, mediaHeight),
    mediaWidth,
    mediaHeight,
  );
}

export default function ImageCropper({
  isOpen,
  onClose,
  imageSrc,
  onCropComplete,
  aspectRatio = 1,
  circularCrop = true,
  outputWidth,
  outputHeight,
}: ImageCropperProps) {
  const [crop, setCrop] = useState<Crop>();
  const [completedCrop, setCompletedCrop] = useState<PixelCrop>();
  const [scale, setScale] = useState(1);
  const imgRef = useRef<HTMLImageElement>(null);

  const onImageLoad = useCallback(
    (e: React.SyntheticEvent<HTMLImageElement>) => {
      const { naturalWidth: width, naturalHeight: height } = e.currentTarget;
      setCrop(centerAspectCrop(width, height, aspectRatio));
    },
    [aspectRatio],
  );

  const handleCrop = useCallback(async () => {
    if (!imgRef.current || !completedCrop) return;

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const scaleX = imgRef.current.naturalWidth / imgRef.current.width;
    const scaleY = imgRef.current.naturalHeight / imgRef.current.height;

    // Use provided output dimensions or calculate based on aspect ratio
    const finalWidth = outputWidth || 400;
    const finalHeight = outputHeight || (outputWidth ? outputWidth / aspectRatio : 400);
    canvas.width = finalWidth;
    canvas.height = finalHeight;

    ctx.imageSmoothingQuality = 'high';

    ctx.drawImage(
      imgRef.current,
      completedCrop.x * scaleX,
      completedCrop.y * scaleY,
      completedCrop.width * scaleX,
      completedCrop.height * scaleY,
      0,
      0,
      finalWidth,
      finalHeight,
    );

    canvas.toBlob(
      (blob) => {
        if (blob) {
          onCropComplete(blob);
          onClose();
        }
      },
      'image/jpeg',
      0.9,
    );
  }, [completedCrop, onCropComplete, onClose, outputWidth, outputHeight, aspectRatio]);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Crop Image"
      size="lg"
      footer={
        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={onClose} tooltip="Cancel cropping">
            Cancel
          </Button>
          <Button onClick={handleCrop} disabled={!completedCrop} tooltip="Apply crop selection">
            <CropIcon className="mr-1.5 h-4 w-4" /> Apply Crop
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="flex items-center justify-center gap-4">
          <Tooltip content="Zoom out">
            <button
              onClick={() => setScale((s) => Math.max(0.5, s - 0.1))}
              className="cursor-pointer rounded-lg border border-[var(--border)] p-2 text-[var(--text-muted)] hover:bg-[var(--bg-secondary)]"
            >
              <ZoomOut className="h-4 w-4" />
            </button>
          </Tooltip>
          <span className="text-sm text-[var(--text-muted)]">{Math.round(scale * 100)}%</span>
          <Tooltip content="Zoom in">
            <button
              onClick={() => setScale((s) => Math.min(3, s + 0.1))}
              className="cursor-pointer rounded-lg border border-[var(--border)] p-2 text-[var(--text-muted)] hover:bg-[var(--bg-secondary)]"
            >
              <ZoomIn className="h-4 w-4" />
            </button>
          </Tooltip>
        </div>
        <div className="flex items-center justify-center overflow-hidden rounded-lg bg-[var(--bg-secondary)]">
          <ReactCrop
            crop={crop}
            onChange={(_, percentCrop) => setCrop(percentCrop)}
            onComplete={(c) => setCompletedCrop(c)}
            aspect={aspectRatio}
            circularCrop={circularCrop}
          >
            <img
              ref={imgRef}
              alt="Crop preview"
              src={imageSrc}
              style={{ transform: `scale(${scale})`, maxHeight: '60vh' }}
              onLoad={onImageLoad}
            />
          </ReactCrop>
        </div>
      </div>
    </Modal>
  );
}
