'use client';

import { useCallback } from 'react';
import { useDropzone, type Accept } from 'react-dropzone';
import { cn } from '@/lib/utils';
import { formatFileSize } from '@/lib/utils';
import { Upload, File, X } from 'lucide-react';
import Tooltip from './Tooltip';

interface FileUploadProps {
  accept?: Accept;
  maxSize?: number;
  onDrop: (files: File[]) => void;
  multiple?: boolean;
  label?: string;
  error?: string;
  disabled?: boolean;
  files?: File[];
  onRemove?: (index: number) => void;
  className?: string;
}

function FileUpload({
  accept,
  maxSize,
  onDrop,
  multiple = false,
  label,
  error,
  disabled = false,
  files = [],
  onRemove,
  className,
}: FileUploadProps) {
  const handleDrop = useCallback(
    (acceptedFiles: File[]) => {
      onDrop(acceptedFiles);
    },
    [onDrop],
  );

  const { getRootProps, getInputProps, isDragActive, isDragReject } = useDropzone({
    onDrop: handleDrop,
    accept,
    maxSize,
    multiple,
    disabled,
  });

  return (
    <div className={cn('w-full', className)}>
      {label && (
        <label className="mb-1.5 block text-sm font-medium text-[var(--text)]">{label}</label>
      )}
      <div
        {...getRootProps()}
        className={cn(
          'flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-6 py-8 text-center transition-colors duration-200',
          'border-[var(--border)] bg-[var(--bg-secondary)]',
          'hover:border-[var(--border-hover)] hover:bg-[var(--bg-tertiary)]',
          isDragActive && !isDragReject && 'border-primary bg-[var(--primary-light)]',
          isDragReject && 'border-error bg-[var(--error-light)]',
          disabled && 'cursor-not-allowed opacity-60',
          error && 'border-error',
        )}
      >
        <input {...getInputProps()} />
        <div
          className={cn(
            'mb-3 flex h-10 w-10 items-center justify-center rounded-full',
            isDragActive ? 'bg-primary/10' : 'bg-[var(--bg-tertiary)]',
          )}
        >
          <Upload
            className={cn('h-5 w-5', isDragActive ? 'text-primary' : 'text-[var(--text-muted)]')}
          />
        </div>
        {isDragActive ? (
          <p className="text-primary text-sm font-medium">Drop files here</p>
        ) : (
          <>
            <p className="text-sm text-[var(--text)]">
              <span className="text-primary font-medium">Click to upload</span> or drag and drop
            </p>
            {maxSize && (
              <p className="mt-1 text-xs text-[var(--text-muted)]">
                Max file size: {formatFileSize(maxSize)}
              </p>
            )}
          </>
        )}
      </div>

      {files.length > 0 && (
        <div className="mt-3 space-y-2">
          {files.map((file, index) => (
            <div
              key={`${file.name}-${index}`}
              className="flex items-center gap-3 rounded-lg border border-[var(--border)] bg-white px-3 py-2"
            >
              <File className="h-4 w-4 shrink-0 text-[var(--text-muted)]" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-[var(--text)]">{file.name}</p>
                <p className="text-xs text-[var(--text-muted)]">{formatFileSize(file.size)}</p>
              </div>
              {onRemove && (
                <Tooltip content="Remove file">
                  <button
                    type="button"
                    onClick={() => onRemove(index)}
                    aria-label="Remove file"
                    className="shrink-0 rounded-md p-1 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-secondary)] hover:text-[var(--text)]"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </Tooltip>
              )}
            </div>
          ))}
        </div>
      )}

      {error && <p className="text-error mt-1 text-sm">{error}</p>}
    </div>
  );
}

FileUpload.displayName = 'FileUpload';

export default FileUpload;
