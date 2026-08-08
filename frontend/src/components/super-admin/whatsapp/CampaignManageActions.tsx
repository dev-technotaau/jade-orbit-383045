'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { Copy, Save, Send, CalendarClock } from 'lucide-react';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import Input from '@/components/ui/Input';
import DatePicker from '@/components/ui/DatePicker';
import { showToast } from '@/components/ui/Toast';
import { superAdminWhatsappService as svc } from '@/services/super-admin-whatsapp.service';
import type { WaCampaign } from '@/types/whatsapp';
import type { ApiError } from '@/types/api';

/** ISO → value for an <input type="datetime-local"> (in the viewer's local tz). */
function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

/**
 * Per-campaign management actions: Edit/Reschedule (DRAFT/SCHEDULED only),
 * Duplicate (→ editable draft), Save-as-template (reusable blueprint), and
 * Test-send (preview-to-self).
 */
export default function CampaignManageActions({
  campaign,
  onChanged,
}: {
  campaign: WaCampaign;
  onChanged?: () => void;
}) {
  const router = useRouter();
  const editable = campaign.status === 'DRAFT' || campaign.status === 'SCHEDULED';

  const [editOpen, setEditOpen] = useState(false);
  const [name, setName] = useState(campaign.name);
  const [scheduledAt, setScheduledAt] = useState(toLocalInput(campaign.scheduledAt));
  const [throttle, setThrottle] = useState(String(campaign.throttlePerSec ?? 15));
  const [batch, setBatch] = useState(String(campaign.batchSize ?? 100));

  const [tplOpen, setTplOpen] = useState(false);
  const [tplName, setTplName] = useState(campaign.name);

  const [testOpen, setTestOpen] = useState(false);
  const [testPhone, setTestPhone] = useState('');

  const dupMut = useMutation({
    mutationFn: () => svc.duplicateCampaign(campaign.id),
    onSuccess: (res) => {
      showToast.success('Duplicated to a new draft');
      const newId = res.data?.id;
      if (newId) router.push(`/super-admin/whatsapp/campaigns/${newId}`);
      onChanged?.();
    },
    onError: (e) => showToast.error((e as unknown as ApiError).message || 'Duplicate failed'),
  });

  const editMut = useMutation({
    mutationFn: () =>
      svc.updateCampaign(campaign.id, {
        name: name.trim() || undefined,
        scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : null,
        throttlePerSec: Number(throttle) || undefined,
        batchSize: Number(batch) || undefined,
      }),
    onSuccess: () => {
      showToast.success('Campaign updated');
      setEditOpen(false);
      onChanged?.();
    },
    onError: (e) => showToast.error((e as unknown as ApiError).message || 'Update failed'),
  });

  const tplMut = useMutation({
    mutationFn: () => svc.saveCampaignAsTemplate(campaign.id, tplName.trim() || undefined),
    onSuccess: () => {
      showToast.success('Saved as a reusable template');
      setTplOpen(false);
    },
    onError: (e) => showToast.error((e as unknown as ApiError).message || 'Save failed'),
  });

  const testMut = useMutation({
    mutationFn: () => svc.testSendCampaign(campaign.id, testPhone.trim()),
    onSuccess: () => {
      showToast.success('Test message sent');
      setTestOpen(false);
      setTestPhone('');
    },
    onError: (e) => showToast.error((e as unknown as ApiError).message || 'Test send failed'),
  });

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {editable && (
          <Button
            variant="outline"
            size="sm"
            leftIcon={<CalendarClock className="h-4 w-4" />}
            onClick={() => setEditOpen(true)}
          >
            Edit / reschedule
          </Button>
        )}
        <Button
          variant="outline"
          size="sm"
          leftIcon={<Copy className="h-4 w-4" />}
          isLoading={dupMut.isPending}
          onClick={() => dupMut.mutate()}
        >
          Duplicate
        </Button>
        <Button
          variant="outline"
          size="sm"
          leftIcon={<Save className="h-4 w-4" />}
          onClick={() => setTplOpen(true)}
        >
          Save as template
        </Button>
        <Button
          variant="outline"
          size="sm"
          leftIcon={<Send className="h-4 w-4" />}
          onClick={() => setTestOpen(true)}
        >
          Test send
        </Button>
      </div>

      <Modal
        isOpen={editOpen}
        onClose={() => setEditOpen(false)}
        title="Edit campaign"
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setEditOpen(false)}>
              Cancel
            </Button>
            <Button isLoading={editMut.isPending} onClick={() => editMut.mutate()}>
              Save
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} />
          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--text)]">
              Scheduled time (empty = draft / send now)
            </label>
            <DatePicker mode="datetime" value={scheduledAt} onChange={setScheduledAt} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Input
              label="Throttle (msg/sec)"
              type="number"
              value={throttle}
              onChange={(e) => setThrottle(e.target.value)}
            />
            <Input
              label="Batch size"
              type="number"
              value={batch}
              onChange={(e) => setBatch(e.target.value)}
            />
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={tplOpen}
        onClose={() => setTplOpen(false)}
        title="Save as reusable template"
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setTplOpen(false)}>
              Cancel
            </Button>
            <Button isLoading={tplMut.isPending} onClick={() => tplMut.mutate()}>
              Save template
            </Button>
          </div>
        }
      >
        <div className="space-y-2">
          <p className="text-xs text-[var(--text-muted)]">
            Saves this campaign&apos;s message template, audience and settings as a blueprint you
            can re-launch in one click.
          </p>
          <Input
            label="Template name"
            value={tplName}
            onChange={(e) => setTplName(e.target.value)}
          />
        </div>
      </Modal>

      <Modal
        isOpen={testOpen}
        onClose={() => setTestOpen(false)}
        title="Send a test message"
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setTestOpen(false)}>
              Cancel
            </Button>
            <Button
              isLoading={testMut.isPending}
              disabled={!testPhone.trim()}
              onClick={() => testMut.mutate()}
            >
              Send test
            </Button>
          </div>
        }
      >
        <div className="space-y-2">
          <p className="text-xs text-[var(--text-muted)]">
            Sends one message using this campaign&apos;s template to a phone of your choice (E.164,
            e.g. +9198…) so you can preview it before the full send.
          </p>
          <Input
            label="Phone number"
            value={testPhone}
            onChange={(e) => setTestPhone(e.target.value)}
            placeholder="+91…"
          />
        </div>
      </Modal>
    </>
  );
}
