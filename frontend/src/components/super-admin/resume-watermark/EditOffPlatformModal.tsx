'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Textarea from '@/components/ui/Textarea';
import { showToast } from '@/components/ui/Toast';
import { resumeWatermarkService as svc } from '@/services/super-admin-resume-watermark.service';
import type { OffPlatformCandidate, OffPlatformInput } from '@/types/resume-watermark';
import { RW_OFF_KEY, parseTags } from './off-platform-helpers';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  candidate: OffPlatformCandidate;
}

/** Edit an off-platform candidate's details (not their resume files). */
export default function EditOffPlatformModal({ isOpen, onClose, candidate }: Props) {
  const qc = useQueryClient();
  const [name, setName] = useState(candidate.name ?? '');
  const [email, setEmail] = useState(candidate.email ?? '');
  const [phone, setPhone] = useState(candidate.phone ?? '');
  const [headline, setHeadline] = useState(candidate.headline ?? '');
  const [source, setSource] = useState(candidate.source ?? '');
  const [tags, setTags] = useState(candidate.tags.join(', '));
  const [notes, setNotes] = useState(candidate.notes ?? '');

  const updateMutation = useMutation({
    mutationFn: (body: OffPlatformInput) => svc.updateOffPlatform(candidate.id, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [RW_OFF_KEY] });
      showToast.success('Candidate updated');
      onClose();
    },
    onError: () => showToast.error('Could not update candidate'),
  });

  function submit() {
    if (!name.trim()) {
      showToast.error('Name is required');
      return;
    }
    updateMutation.mutate({
      name: name.trim(),
      email: email.trim() || undefined,
      phone: phone.trim() || undefined,
      headline: headline.trim() || undefined,
      source: source.trim() || undefined,
      notes: notes.trim() || undefined,
      tags: parseTags(tags),
    });
  }

  const busy = updateMutation.isPending;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Edit candidate"
      size="lg"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button isLoading={busy} onClick={submit}>
            Save changes
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Input label="Name" required value={name} onChange={(e) => setName(e.target.value)} />
          <Input
            label="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@example.com"
          />
          <Input label="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
          <Input label="Headline" value={headline} onChange={(e) => setHeadline(e.target.value)} />
          <Input label="Source" value={source} onChange={(e) => setSource(e.target.value)} />
          <Input
            label="Tags (comma-separated)"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
          />
        </div>
        <Textarea label="Notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
    </Modal>
  );
}
