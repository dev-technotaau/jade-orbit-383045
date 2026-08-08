'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Textarea from '@/components/ui/Textarea';
import Switch from '@/components/ui/Switch';
import FileUpload from '@/components/ui/FileUpload';
import { showToast } from '@/components/ui/Toast';
import { resumeWatermarkService as svc } from '@/services/super-admin-resume-watermark.service';
import { RW_OFF_KEY, RESUME_ACCEPT, RESUME_MAX_SIZE } from './off-platform-helpers';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  /** Start in "one candidate per file" quick-import mode. */
  quickImport?: boolean;
}

/**
 * Add an off-platform candidate with one or more resume files, OR quick-import
 * many CVs where each file becomes its own candidate. These people have no
 * account or profile — this only stores their CVs for watermarked download.
 */
export default function AddOffPlatformModal({ isOpen, onClose, quickImport = false }: Props) {
  const qc = useQueryClient();
  const [perFile, setPerFile] = useState(quickImport);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [headline, setHeadline] = useState('');
  const [source, setSource] = useState('');
  const [tags, setTags] = useState('');
  const [notes, setNotes] = useState('');
  const [files, setFiles] = useState<File[]>([]);

  const createMutation = useMutation({
    mutationFn: (fd: FormData) => svc.createOffPlatform(fd),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: [RW_OFF_KEY] });
      const d = res.data;
      if (d && 'count' in d) {
        showToast.success(`Imported ${d.count} candidate${d.count === 1 ? '' : 's'}`);
      } else {
        showToast.success('Candidate added');
      }
      onClose();
    },
    onError: () => showToast.error('Could not add candidate'),
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
    if (!perFile && !name.trim()) {
      showToast.error('Name is required');
      return;
    }
    const fd = new FormData();
    if (perFile) {
      fd.append('oneCandidatePerFile', 'true');
    } else {
      fd.append('name', name.trim());
      if (email.trim()) fd.append('email', email.trim());
      if (phone.trim()) fd.append('phone', phone.trim());
      if (headline.trim()) fd.append('headline', headline.trim());
      if (notes.trim()) fd.append('notes', notes.trim());
      if (source.trim()) fd.append('source', source.trim());
      if (tags.trim()) fd.append('tags', tags.trim());
    }
    for (const file of files) fd.append('files', file);
    createMutation.mutate(fd);
  }

  const busy = createMutation.isPending;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={perFile ? 'Quick import CVs' : 'Add off-platform candidate'}
      size="lg"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button isLoading={busy} disabled={files.length === 0} onClick={submit}>
            {perFile ? 'Import CVs' : 'Add candidate'}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2.5">
          <Switch
            label="Create one candidate per file (quick import)"
            description="Each uploaded file becomes its own candidate — no details needed."
            checked={perFile}
            onChange={(e) => setPerFile(e.target.checked)}
          />
        </div>

        {!perFile && (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Input
                label="Name"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Full name"
              />
              <Input
                label="Email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
              />
              <Input
                label="Phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="Optional"
              />
              <Input
                label="Headline"
                value={headline}
                onChange={(e) => setHeadline(e.target.value)}
                placeholder="e.g. Senior React Developer"
              />
              <Input
                label="Source"
                value={source}
                onChange={(e) => setSource(e.target.value)}
                placeholder="e.g. Referral, LinkedIn"
              />
              <Input
                label="Tags (comma-separated)"
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                placeholder="e.g. react, senior"
              />
            </div>
            <Textarea
              label="Notes"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Private notes about this candidate…"
            />
          </>
        )}

        <FileUpload
          label="Resume files"
          accept={RESUME_ACCEPT}
          maxSize={RESUME_MAX_SIZE}
          multiple
          files={files}
          onDrop={addFiles}
          onRemove={removeFile}
        />
        <p className="text-xs text-[var(--text-muted)]">
          {perFile
            ? 'PDF, DOC or DOCX. One candidate is created for every file you upload.'
            : 'PDF, DOC or DOCX, up to 10 MB each. Add one or more resumes for this candidate.'}
        </p>
      </div>
    </Modal>
  );
}
