'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import FileUpload from '@/components/ui/FileUpload';
import { showToast } from '@/components/ui/Toast';
import { resumeWatermarkService as svc } from '@/services/super-admin-resume-watermark.service';
import type { OffPlatformCandidate } from '@/types/resume-watermark';
import { RW_OFF_KEY, RESUME_ACCEPT, RESUME_MAX_SIZE } from './off-platform-helpers';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  candidate: OffPlatformCandidate;
}

/** Add one or more resume files to an existing off-platform candidate. */
export default function AddResumesModal({ isOpen, onClose, candidate }: Props) {
  const qc = useQueryClient();
  const [files, setFiles] = useState<File[]>([]);

  const addMutation = useMutation({
    mutationFn: (fd: FormData) => svc.addResumes(candidate.id, fd),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [RW_OFF_KEY] });
      showToast.success('Resumes added');
      onClose();
    },
    onError: () => showToast.error('Could not add resumes'),
  });

  function addFiles(dropped: File[]) {
    setFiles((prev) => {
      const seen = new Set(prev.map((f) => `${f.name}:${f.size}`));
      return [...prev, ...dropped.filter((f) => !seen.has(`${f.name}:${f.size}`))];
    });
  }

  function removeFile(index: number) {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }

  function submit() {
    if (files.length === 0) {
      showToast.error('Add at least one resume file');
      return;
    }
    const fd = new FormData();
    for (const file of files) fd.append('files', file);
    addMutation.mutate(fd);
  }

  const busy = addMutation.isPending;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Add resumes"
      size="md"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button isLoading={busy} disabled={files.length === 0} onClick={submit}>
            Add resumes
          </Button>
        </div>
      }
    >
      <div className="space-y-3">
        <p className="text-sm text-[var(--text-muted)]">
          Uploading to <span className="font-medium text-[var(--text)]">{candidate.name}</span>.
        </p>
        <FileUpload
          accept={RESUME_ACCEPT}
          maxSize={RESUME_MAX_SIZE}
          multiple
          files={files}
          onDrop={addFiles}
          onRemove={removeFile}
        />
        <p className="text-xs text-[var(--text-muted)]">PDF, DOC or DOCX, up to 10 MB each.</p>
      </div>
    </Modal>
  );
}
