'use client';

import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Settings,
  ShieldCheck,
  RefreshCw,
  Plus,
  Trash2,
  Save,
  Pencil,
  X,
  Flame,
} from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import LockBanner, { StaleWriteNotice } from '@/components/admin/LockBanner';
import { useResourceLock } from '@/hooks/use-resource-lock';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import DatePicker from '@/components/ui/DatePicker';
import TimePicker from '@/components/ui/TimePicker';
import Tooltip from '@/components/ui/Tooltip';
import { superAdminEmailService as svc } from '@/services/super-admin-email.service';
import { showToast } from '@/components/ui/Toast';
import { confirmDialog, promptDialog } from '@/components/ui/dialog-service';
import type {
  EmailSettings,
  EmailSender,
  EmailSegment,
  EmailRule,
  EmailCannedReply,
  EmailSnippet,
} from '@/types/email';

// Settings may carry a warm-up ramp schedule not yet in the base type.
type WarmupStep = { day: number; cap: number };
type SettingsForm = Partial<EmailSettings> & { warmupSchedule?: WarmupStep[] };

// Segment filter shape the builder assembles.
type SegmentFilter = {
  tags?: string[];
  roles?: string[];
  subscribeStatus?: string;
  onPlatform?: boolean;
  openedSince?: string;
  notEmailedSince?: string;
  maxBounceCount?: number;
};

function Dns({ ok, label }: { ok: boolean; label: string }) {
  return (
    <Badge variant={ok ? 'success' : 'error'} size="sm">
      {label} {ok ? '✓' : '✗'}
    </Badge>
  );
}

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      data-lenis-prevent
    >
      <div className="w-full max-w-lg rounded-xl bg-white p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-semibold text-[var(--text)]">{title}</h3>
          <button
            onClick={onClose}
            className="rounded p-1 text-[var(--text-muted)] hover:bg-[var(--bg-secondary)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export default function SuperAdminEmailSettingsPage() {
  const qc = useQueryClient();
  const { data: settingsData } = useQuery({
    queryKey: ['email-settings'],
    queryFn: () => svc.getSettings(),
  });
  const { data: sendersData } = useQuery({
    queryKey: ['email-senders'],
    queryFn: () => svc.listSenders(),
  });
  const senders = sendersData?.data ?? [];
  const settings = settingsData?.data;

  const [staleConflict, setStaleConflict] = useState(false);

  /**
   * The email settings document is a single shared record every admin with
   * `email.settings.edit` can open, and this form posts ALL of it — so two
   * admins tuning different sections would silently clobber each other. The
   * lock makes the collision visible; `expectedUpdatedAt` makes it safe.
   */
  const lock = useResourceLock('EmailSettings', 'default');
  const editHeld = useRef(false);
  const claimEdit = () => {
    if (lock.isReadOnly) return false;
    if (!editHeld.current) {
      editHeld.current = true;
      void lock.beginEdit().then((ok) => {
        if (!ok) editHeld.current = false;
      });
    }
    return true;
  };

  const [form, setForm] = useState<SettingsForm>({});
  const [editingSender, setEditingSender] = useState<EmailSender | null>(null);
  useEffect(() => {
    // Defer to a microtask so the sync from server state doesn't cascade renders
    // (satisfies react-hooks/set-state-in-effect).
    if (settingsData?.data) {
      const next = settingsData.data as SettingsForm;
      queueMicrotask(() => setForm(next));
    }
  }, [settingsData]);

  const set = <K extends keyof SettingsForm>(k: K, v: SettingsForm[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  // ── Business-hours editor state ──
  const bh = form.businessHours ?? {};
  const bhDays = bh.days ?? [];
  const dayFor = (d: number) => bhDays.find((x) => x.day === d);
  const toggleDay = (d: number, on: boolean) => {
    const others = bhDays.filter((x) => x.day !== d);
    const next = on ? [...others, { day: d, open: '09:00', close: '18:00' }] : others;
    next.sort((a, b) => a.day - b.day);
    set('businessHours', { ...bh, days: next });
  };
  const setDayTime = (d: number, field: 'open' | 'close', val: string) =>
    set('businessHours', {
      ...bh,
      days: bhDays.map((x) => (x.day === d ? { ...x, [field]: val } : x)),
    });

  async function saveSettings(forceOverwrite = false) {
    setStaleConflict(false);
    try {
      await svc.updateSettings({
        ...form,
        defaultFromName: form.defaultFromName?.trim() || null,
        defaultReplyTo: form.defaultReplyTo?.trim() || null,
        // This form posts the WHOLE settings document, so a colleague saving
        // while it was open would otherwise be reverted without a trace.
        ...(forceOverwrite || !settings?.updatedAt
          ? {}
          : { expectedUpdatedAt: settings.updatedAt }),
      } as Partial<EmailSettings> & { expectedUpdatedAt?: string });
      showToast.success('Settings saved');
      editHeld.current = false;
      void lock.endEdit();
      qc.invalidateQueries({ queryKey: ['email-settings'] });
    } catch (e) {
      if ((e as { code?: string }).code === 'STALE_WRITE') setStaleConflict(true);
      else showToast.error('Save failed');
    }
  }

  async function verify(id: string) {
    try {
      await svc.verifySender(id);
      showToast.success('DNS re-checked');
      qc.invalidateQueries({ queryKey: ['email-senders'] });
    } catch {
      showToast.error('Verify failed');
    }
  }

  async function addSender() {
    const fromEmail = await promptDialog({
      title: 'Add sender',
      label: 'From address (e.g. noreply@hireadda.in)',
    });
    if (!fromEmail) return;
    const fromName =
      (await promptDialog({
        title: 'Add sender',
        label: 'From name',
        defaultValue: 'Hire Adda',
      })) || 'Hire Adda';
    const dkimSelector =
      (await promptDialog({
        title: 'Add sender',
        label: 'DKIM selector (optional, e.g. default)',
      })) || undefined;
    try {
      await svc.createSender({ fromEmail, fromName, dkimSelector } as Partial<EmailSender>);
      showToast.success('Sender added — verify DNS');
      qc.invalidateQueries({ queryKey: ['email-senders'] });
    } catch {
      showToast.error('Could not add sender');
    }
  }

  async function deleteSender(id: string) {
    if (
      !(await confirmDialog({
        title: 'Delete sender',
        message: 'Delete this sender? Campaigns using it can no longer send.',
        confirmLabel: 'Delete',
        variant: 'danger',
      }))
    )
      return;
    try {
      await svc.deleteSender(id);
      showToast.success('Sender deleted');
      qc.invalidateQueries({ queryKey: ['email-senders'] });
    } catch {
      showToast.error('Could not delete sender');
    }
  }

  return (
    <DashboardLayout
      requiredRole={['ADMIN', 'SUPER_ADMIN']}
      requiredPermission="email.settings.view"
    >
      <div className="mx-auto max-w-3xl space-y-6" onFocusCapture={() => claimEdit()}>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-[var(--text)]">
          <Settings className="h-6 w-6 text-blue-600" /> Email Settings
        </h1>

        {/* Presence: this document is shared by every admin holding
            email.settings.edit, so show who else has it open. */}
        <LockBanner lock={lock} entityLabel="settings document" />

        {/* Senders / deliverability */}
        <section className="rounded-xl border border-[var(--border)] bg-white p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-2 font-semibold text-[var(--text)]">
              <ShieldCheck className="h-4 w-4 text-emerald-600" /> Sending identities &amp;
              deliverability
            </h2>
            <Button
              size="sm"
              variant="secondary"
              leftIcon={<Plus className="h-4 w-4" />}
              onClick={addSender}
            >
              Add sender
            </Button>
          </div>
          {senders.length === 0 && (
            <p className="text-sm text-[var(--text-muted)]">No senders configured.</p>
          )}
          <div className="space-y-2">
            {senders.map((s) => (
              <div
                key={s.id}
                className="flex flex-wrap items-center gap-2 rounded-lg border border-[var(--border)] p-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium text-[var(--text)]">{s.fromEmail}</span>
                    {s.isDefault && (
                      <Badge variant="info" size="sm">
                        Default
                      </Badge>
                    )}
                    {s.reputationScore != null && (
                      <span className="text-xs text-[var(--text-muted)]">
                        score {s.reputationScore}
                      </span>
                    )}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    <Dns ok={s.spfVerified} label="SPF" />
                    <Dns ok={s.dkimVerified} label="DKIM" />
                    <Dns ok={s.dmarcVerified} label="DMARC" />
                    <Dns ok={s.mtaStsVerified} label="MTA-STS" />
                    <Dns ok={s.tlsRptVerified} label="TLS-RPT" />
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  leftIcon={<RefreshCw className="h-3.5 w-3.5" />}
                  onClick={() => verify(s.id)}
                >
                  Verify DNS
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  leftIcon={<Pencil className="h-3.5 w-3.5" />}
                  onClick={() => setEditingSender(s)}
                >
                  Edit
                </Button>
                <Tooltip content="Delete sender">
                  <button
                    onClick={() => deleteSender(s.id)}
                    className="rounded p-1.5 text-red-500 hover:bg-red-50"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </Tooltip>
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-[var(--text-muted)]">
            A campaign can only launch from a <strong>DKIM-verified</strong> sender.
          </p>
          <div className="mt-3 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] p-3">
            <p className="mb-2 text-xs font-semibold text-[var(--text)]">
              Deliverability checklist (self-hosted MTA)
            </p>
            <ul className="space-y-1 text-xs text-[var(--text-muted)]">
              {(
                [
                  ['SPF', senders[0]?.spfVerified],
                  ['DKIM', senders[0]?.dkimVerified],
                  ['DMARC', senders[0]?.dmarcVerified],
                  ['MTA-STS', senders[0]?.mtaStsVerified],
                  ['TLS-RPT', senders[0]?.tlsRptVerified],
                ] as Array<[string, boolean | undefined]>
              ).map(([label, ok]) => (
                <li key={label} className={ok ? 'text-emerald-600' : ''}>
                  {ok ? '✓' : '✗'} {label} DNS record
                </li>
              ))}
              <li>
                • PTR (reverse DNS) of the sending IP resolves to mail.hireadda.in — verify with
                your host
              </li>
              <li>• HELO/EHLO hostname matches the PTR — configure on Postfix</li>
            </ul>
          </div>
        </section>

        {/* General */}
        <section className="rounded-xl border border-[var(--border)] bg-white p-4">
          <h2 className="mb-3 font-semibold text-[var(--text)]">General</h2>
          <div className="space-y-3">
            <div className="flex gap-4">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={!!form.trackOpens}
                  onChange={(e) => set('trackOpens', e.target.checked)}
                />
                Track opens
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={!!form.trackClicks}
                  onChange={(e) => set('trackClicks', e.target.checked)}
                />
                Track clicks
              </label>
            </div>
            <Input
              label="Marketing frequency cap (per contact / 24h, 0 = unlimited)"
              type="number"
              value={form.marketingCapPer24h ?? 1}
              onChange={(e) => set('marketingCapPer24h', Number(e.target.value))}
            />
            <Input
              label="Retention days (blank = keep forever)"
              type="number"
              value={form.retentionDays ?? ''}
              onChange={(e) => set('retentionDays', e.target.value ? Number(e.target.value) : null)}
            />
            <label className="block text-sm">
              <span className="mb-1.5 block font-medium text-[var(--text)]">
                CAN-SPAM / DPDP physical mailing address (in every marketing footer)
              </span>
              <textarea
                value={form.footerAddress ?? ''}
                onChange={(e) => set('footerAddress', e.target.value)}
                rows={2}
                className="w-full rounded-lg border border-[var(--border)] p-2 text-sm"
              />
            </label>
            <Input
              label="Default from name"
              value={form.defaultFromName ?? ''}
              onChange={(e) => set('defaultFromName', e.target.value)}
            />
            <Input
              label="Default reply-to"
              value={form.defaultReplyTo ?? ''}
              onChange={(e) => set('defaultReplyTo', e.target.value)}
            />
            <Input
              label="Seed / test inboxes (comma-separated)"
              value={(form.seedAddresses ?? []).join(', ')}
              onChange={(e) =>
                set(
                  'seedAddresses',
                  e.target.value
                    .split(',')
                    .map((s) => s.trim())
                    .filter(Boolean),
                )
              }
            />
            <div className="flex gap-4">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={!!form.autoReplyEnabled}
                  onChange={(e) => set('autoReplyEnabled', e.target.checked)}
                />
                Auto-reply enabled
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={!!form.awayMode}
                  onChange={(e) => set('awayMode', e.target.checked)}
                />
                Away mode
              </label>
            </div>
            <label className="block text-sm">
              <span className="mb-1.5 block font-medium text-[var(--text)]">Away message</span>
              <textarea
                value={form.awayMessage ?? ''}
                onChange={(e) => set('awayMessage', e.target.value)}
                rows={2}
                className="w-full rounded-lg border border-[var(--border)] p-2 text-sm"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1.5 block font-medium text-[var(--text)]">Welcome message</span>
              <textarea
                value={form.welcomeMessage ?? ''}
                onChange={(e) => set('welcomeMessage', e.target.value)}
                rows={2}
                className="w-full rounded-lg border border-[var(--border)] p-2 text-sm"
              />
            </label>

            {/* Business hours — auto "away" reply outside these hours */}
            <div className="rounded-lg border border-[var(--border)] p-3">
              <p className="mb-1 text-sm font-medium text-[var(--text)]">Business hours</p>
              <p className="mb-2 text-xs text-[var(--text-muted)]">
                Outside these hours (or when Away mode is on), the away message is auto-sent — only
                while Auto-reply is enabled. Leave all days unchecked to treat the inbox as always
                open.
              </p>
              <Input
                label="Timezone (IANA, e.g. Asia/Kolkata)"
                value={bh.tz ?? ''}
                placeholder="Asia/Kolkata"
                onChange={(e) => set('businessHours', { ...bh, tz: e.target.value })}
              />
              <div className="mt-2 space-y-1">
                {['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map(
                  (name, d) => {
                    const slot = dayFor(d);
                    return (
                      <div key={d} className="flex items-center gap-2 text-sm">
                        <label className="flex w-28 items-center gap-2">
                          <input
                            type="checkbox"
                            checked={!!slot}
                            onChange={(e) => toggleDay(d, e.target.checked)}
                          />
                          {name}
                        </label>
                        {slot ? (
                          <>
                            <div className="w-32">
                              <TimePicker
                                value={slot.open}
                                onChange={(v) => setDayTime(d, 'open', v)}
                                inputSize="sm"
                              />
                            </div>
                            <span className="text-[var(--text-muted)]">–</span>
                            <div className="w-32">
                              <TimePicker
                                value={slot.close}
                                onChange={(v) => setDayTime(d, 'close', v)}
                                inputSize="sm"
                              />
                            </div>
                          </>
                        ) : (
                          <span className="text-xs text-[var(--text-muted)]">Closed</span>
                        )}
                      </div>
                    );
                  },
                )}
              </div>
            </div>
            <Input
              label="Unsubscribe keywords (comma-separated)"
              value={(form.unsubscribeKeywords ?? []).join(', ')}
              onChange={(e) =>
                set(
                  'unsubscribeKeywords',
                  e.target.value
                    .split(',')
                    .map((s) => s.trim())
                    .filter(Boolean),
                )
              }
            />
            <label className="block text-sm">
              <span className="mb-1.5 block font-medium text-[var(--text)]">
                Footer HTML (appended to marketing emails)
              </span>
              <textarea
                value={form.footerHtml ?? ''}
                onChange={(e) => set('footerHtml', e.target.value)}
                rows={3}
                className="w-full rounded-lg border border-[var(--border)] p-2 font-mono text-xs"
              />
            </label>

            {/* Warm-up ramp schedule */}
            <WarmupEditor
              schedule={form.warmupSchedule ?? []}
              onChange={(next) => set('warmupSchedule', next)}
            />

            {staleConflict && (
              <StaleWriteNotice
                entityLabel="settings document"
                onReload={() => window.location.reload()}
                onOverwrite={() => void saveSettings(true)}
              />
            )}
            <Button
              leftIcon={<Save className="h-4 w-4" />}
              onClick={() => void saveSettings()}
              disabled={lock.isReadOnly}
            >
              Save settings
            </Button>
          </div>
        </section>

        <RulesSection />
        <CannedSection />
        <SnippetsSection />
        <SegmentsSection />
      </div>

      {editingSender && (
        <SenderEditModal
          sender={editingSender}
          onClose={() => setEditingSender(null)}
          onSaved={() => {
            setEditingSender(null);
            qc.invalidateQueries({ queryKey: ['email-senders'] });
          }}
        />
      )}
    </DashboardLayout>
  );
}

// ── Warm-up ramp editor (repeatable {day,cap} rows) ──
function WarmupEditor({
  schedule,
  onChange,
}: {
  schedule: WarmupStep[];
  onChange: (next: WarmupStep[]) => void;
}) {
  function update(i: number, patch: Partial<WarmupStep>) {
    onChange(schedule.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  }
  function remove(i: number) {
    onChange(schedule.filter((_, idx) => idx !== i));
  }
  function add() {
    const nextDay = schedule.length ? Math.max(...schedule.map((r) => r.day)) + 1 : 1;
    onChange([...schedule, { day: nextDay, cap: 100 }]);
  }
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] p-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-xs font-semibold text-[var(--text)]">
          <Flame className="h-3.5 w-3.5 text-orange-500" /> IP warm-up schedule (max sends per day)
        </p>
        <Button size="sm" variant="ghost" leftIcon={<Plus className="h-3.5 w-3.5" />} onClick={add}>
          Add day
        </Button>
      </div>
      {schedule.length === 0 && (
        <p className="text-xs text-[var(--text-muted)]">
          No ramp configured — sends are uncapped by warm-up.
        </p>
      )}
      <div className="space-y-2">
        {schedule.map((row, i) => (
          <div key={i} className="flex items-center gap-2">
            <label className="flex items-center gap-1 text-xs text-[var(--text-muted)]">
              Day
              <input
                type="number"
                min={1}
                value={row.day}
                onChange={(e) => update(i, { day: Number(e.target.value) })}
                className="w-16 rounded border border-[var(--border)] bg-white px-2 py-1 text-sm"
              />
            </label>
            <label className="flex items-center gap-1 text-xs text-[var(--text-muted)]">
              Cap
              <input
                type="number"
                min={0}
                value={row.cap}
                onChange={(e) => update(i, { cap: Number(e.target.value) })}
                className="w-24 rounded border border-[var(--border)] bg-white px-2 py-1 text-sm"
              />
            </label>
            <button onClick={() => remove(i)} className="rounded p-1 text-red-500 hover:bg-red-50">
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Sender edit modal ──
function SenderEditModal({
  sender,
  onClose,
  onSaved,
}: {
  sender: EmailSender;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [fromName, setFromName] = useState(sender.fromName ?? '');
  const [replyTo, setReplyTo] = useState(sender.replyTo ?? '');
  const [dkimSelector, setDkimSelector] = useState(sender.dkimSelector ?? '');
  const [hourlyCap, setHourlyCap] = useState<string>(
    sender.hourlyCap != null ? String(sender.hourlyCap) : '',
  );
  const [dailyCap, setDailyCap] = useState<string>(
    sender.dailyCap != null ? String(sender.dailyCap) : '',
  );
  const [isDefault, setIsDefault] = useState(sender.isDefault);
  const [isActive, setIsActive] = useState(sender.isActive);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await svc.updateSender(sender.id, {
        fromName,
        replyTo: replyTo || null,
        dkimSelector: dkimSelector || null,
        hourlyCap: hourlyCap === '' ? null : Number(hourlyCap),
        dailyCap: dailyCap === '' ? null : Number(dailyCap),
        isDefault,
        isActive,
      } as Partial<EmailSender>);
      showToast.success('Sender updated');
      onSaved();
    } catch {
      showToast.error('Update failed');
      setSaving(false);
    }
  }

  async function resetWarmup() {
    setResetting(true);
    try {
      await svc.updateSender(sender.id, { warmupDay: 0 });
      showToast.success('Warm-up reset to day 0');
    } catch {
      showToast.error('Warm-up reset failed');
    } finally {
      setResetting(false);
    }
  }

  return (
    <Modal title={`Edit sender — ${sender.fromEmail}`} onClose={onClose}>
      <div className="space-y-3">
        <Input label="From name" value={fromName} onChange={(e) => setFromName(e.target.value)} />
        <Input label="Reply-to" value={replyTo} onChange={(e) => setReplyTo(e.target.value)} />
        <Input
          label="DKIM selector"
          value={dkimSelector}
          onChange={(e) => setDkimSelector(e.target.value)}
        />
        <div className="flex gap-3">
          <Input
            label="Hourly cap"
            type="number"
            value={hourlyCap}
            onChange={(e) => setHourlyCap(e.target.value)}
          />
          <Input
            label="Daily cap"
            type="number"
            value={dailyCap}
            onChange={(e) => setDailyCap(e.target.value)}
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-[var(--text)]">
          <input
            type="checkbox"
            checked={isDefault}
            onChange={(e) => setIsDefault(e.target.checked)}
          />
          Set as default sender
        </label>
        <label className="flex items-center gap-2 text-sm text-[var(--text)]">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
          />
          Active
        </label>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="secondary"
            leftIcon={<Flame className="h-3.5 w-3.5" />}
            isLoading={resetting}
            onClick={resetWarmup}
          >
            Reset warm-up
          </Button>
          <span className="text-xs text-[var(--text-muted)]">
            Currently day {sender.warmupDay} — sets back to 0
          </span>
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="secondary" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            size="sm"
            leftIcon={<Save className="h-4 w-4" />}
            isLoading={saving}
            onClick={save}
          >
            Save
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function RulesSection() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['email-rules'], queryFn: () => svc.listRules() });
  const rules = data?.data ?? [];
  const [editing, setEditing] = useState<EmailRule | null>(null);
  async function add() {
    const name = await promptDialog({ title: 'New rule', label: 'Rule name' });
    if (!name) return;
    const keywords = (
      (await promptDialog({
        title: 'New rule',
        label: 'Trigger keywords (comma-separated)',
      })) || ''
    )
      .split(',')
      .map((k) => k.trim())
      .filter(Boolean);
    const action =
      (await promptDialog({
        title: 'New rule',
        label: 'Action: auto_reply | label | assign | resolve',
        defaultValue: 'auto_reply',
      })) || 'auto_reply';
    const replyBody =
      action === 'auto_reply'
        ? (await promptDialog({ title: 'New rule', label: 'Auto-reply body', multiline: true })) ||
          undefined
        : undefined;
    if (action === 'auto_reply' && !replyBody?.trim()) {
      showToast.error('Auto-reply rules need a reply body');
      return;
    }
    const label =
      action === 'label'
        ? (await promptDialog({ title: 'New rule', label: 'Label to apply' })) || undefined
        : undefined;
    const assignTo =
      action === 'assign'
        ? (await promptDialog({ title: 'New rule', label: 'Assign to (user id)' })) || undefined
        : undefined;
    try {
      await svc.createRule({ name, keywords, action, replyBody, label, assignTo });
      showToast.success('Rule created');
      qc.invalidateQueries({ queryKey: ['email-rules'] });
    } catch {
      showToast.error('Could not create rule');
    }
  }
  return (
    <section className="rounded-xl border border-[var(--border)] bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-semibold text-[var(--text)]">Inbound rules (auto-responder)</h2>
        <Button size="sm" variant="secondary" leftIcon={<Plus className="h-4 w-4" />} onClick={add}>
          Add rule
        </Button>
      </div>
      {rules.length === 0 && <p className="text-sm text-[var(--text-muted)]">No rules.</p>}
      {rules.map((r) => (
        <div
          key={r.id}
          className="flex items-center gap-2 border-t border-[var(--border)] py-2 text-sm"
        >
          <span className="flex-1 font-medium text-[var(--text)]">{r.name}</span>
          <Badge variant="neutral" size="sm">
            {r.action}
          </Badge>
          <span className="text-xs text-[var(--text-muted)]">{r.keywords.join(', ')}</span>
          <button
            onClick={() => setEditing(r)}
            className="rounded p-1 text-[var(--text-muted)] hover:bg-[var(--bg-secondary)]"
          >
            <Pencil className="h-4 w-4" />
          </button>
          <button
            onClick={async () => {
              await svc.deleteRule(r.id);
              qc.invalidateQueries({ queryKey: ['email-rules'] });
            }}
            className="rounded p-1 text-red-500 hover:bg-red-50"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ))}
      {editing && (
        <RuleEditModal
          rule={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            qc.invalidateQueries({ queryKey: ['email-rules'] });
          }}
        />
      )}
    </section>
  );
}

function RuleEditModal({
  rule,
  onClose,
  onSaved,
}: {
  rule: EmailRule;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(rule.name);
  const [keywords, setKeywords] = useState(rule.keywords.join(', '));
  const [action, setAction] = useState(rule.action);
  const [replyBody, setReplyBody] = useState(rule.replyBody ?? '');
  const [label, setLabel] = useState(rule.label ?? '');
  const [assignTo, setAssignTo] = useState(rule.assignTo ?? '');
  const [enabled, setEnabled] = useState(rule.enabled);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (action === 'auto_reply' && !replyBody.trim()) {
      showToast.error('Auto-reply rules need a reply body');
      return;
    }
    setSaving(true);
    try {
      await svc.updateRule(rule.id, {
        name,
        keywords: keywords
          .split(',')
          .map((k) => k.trim())
          .filter(Boolean),
        action,
        replyBody: action === 'auto_reply' ? replyBody || null : null,
        label: action === 'label' ? label.trim() || null : null,
        assignTo: action === 'assign' ? assignTo.trim() || null : null,
        enabled,
      });
      showToast.success('Rule updated');
      onSaved();
    } catch {
      showToast.error('Update failed');
      setSaving(false);
    }
  }

  return (
    <Modal title="Edit rule" onClose={onClose}>
      <div className="space-y-3">
        <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} />
        <Input
          label="Trigger keywords (comma-separated)"
          value={keywords}
          onChange={(e) => setKeywords(e.target.value)}
        />
        <Select
          label="Action"
          options={['auto_reply', 'label', 'assign', 'resolve'].map((a) => ({
            value: a,
            label: a,
          }))}
          value={action}
          onChange={(v) => setAction(v)}
          clearable={false}
        />
        {action === 'auto_reply' && (
          <label className="block text-sm">
            <span className="mb-1.5 block font-medium text-[var(--text)]">Auto-reply body</span>
            <textarea
              value={replyBody}
              onChange={(e) => setReplyBody(e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-[var(--border)] p-2 text-sm"
            />
          </label>
        )}
        {action === 'label' && (
          <Input label="Label" value={label} onChange={(e) => setLabel(e.target.value)} />
        )}
        {action === 'assign' && (
          <Input
            label="Assign to (user id)"
            value={assignTo}
            onChange={(e) => setAssignTo(e.target.value)}
          />
        )}
        <label className="flex items-center gap-2 text-sm text-[var(--text)]">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          Enabled
        </label>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="secondary" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            size="sm"
            leftIcon={<Save className="h-4 w-4" />}
            isLoading={saving}
            onClick={save}
          >
            Save
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function CannedSection() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['email-canned'], queryFn: () => svc.listCanned() });
  const canned = data?.data ?? [];
  const [editing, setEditing] = useState<EmailCannedReply | null>(null);
  async function add() {
    const title = await promptDialog({ title: 'New canned reply', label: 'Snippet title' });
    if (!title) return;
    const body =
      (await promptDialog({ title: 'New canned reply', label: 'Snippet body', multiline: true })) ||
      '';
    if (!title.trim() || !body.trim()) {
      showToast.error('Title and body are required');
      return;
    }
    try {
      await svc.createCanned({ title, body });
      showToast.success('Canned reply created');
      qc.invalidateQueries({ queryKey: ['email-canned'] });
    } catch {
      showToast.error('Could not create canned reply');
    }
  }
  return (
    <section className="rounded-xl border border-[var(--border)] bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-semibold text-[var(--text)]">Canned replies</h2>
        <Button size="sm" variant="secondary" leftIcon={<Plus className="h-4 w-4" />} onClick={add}>
          Add snippet
        </Button>
      </div>
      {canned.length === 0 && <p className="text-sm text-[var(--text-muted)]">No snippets.</p>}
      {canned.map((c) => (
        <div
          key={c.id}
          className="flex items-center gap-2 border-t border-[var(--border)] py-2 text-sm"
        >
          <span className="flex-1 font-medium text-[var(--text)]">{c.title}</span>
          <button
            onClick={() => setEditing(c)}
            className="rounded p-1 text-[var(--text-muted)] hover:bg-[var(--bg-secondary)]"
          >
            <Pencil className="h-4 w-4" />
          </button>
          <button
            onClick={async () => {
              await svc.deleteCanned(c.id);
              qc.invalidateQueries({ queryKey: ['email-canned'] });
            }}
            className="rounded p-1 text-red-500 hover:bg-red-50"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ))}
      {editing && (
        <CannedEditModal
          canned={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            qc.invalidateQueries({ queryKey: ['email-canned'] });
          }}
        />
      )}
    </section>
  );
}

function CannedEditModal({
  canned,
  onClose,
  onSaved,
}: {
  canned: EmailCannedReply;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(canned.title);
  const [subject, setSubject] = useState(canned.subject ?? '');
  const [body, setBody] = useState(canned.body);
  const [shortcut, setShortcut] = useState(canned.shortcut ?? '');
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!title.trim() || !body.trim()) {
      showToast.error('Title and body are required');
      return;
    }
    setSaving(true);
    try {
      await svc.updateCanned(canned.id, {
        title,
        subject: subject || null,
        body,
        shortcut: shortcut || null,
      });
      showToast.success('Canned reply updated');
      onSaved();
    } catch {
      showToast.error('Update failed');
      setSaving(false);
    }
  }

  return (
    <Modal title="Edit canned reply" onClose={onClose}>
      <div className="space-y-3">
        <Input label="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
        <Input
          label="Subject (optional)"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
        />
        <Input
          label="Shortcut (optional, e.g. /thanks)"
          value={shortcut}
          onChange={(e) => setShortcut(e.target.value)}
        />
        <label className="block text-sm">
          <span className="mb-1.5 block font-medium text-[var(--text)]">Body</span>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={4}
            className="w-full rounded-lg border border-[var(--border)] p-2 text-sm"
          />
        </label>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="secondary" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            size="sm"
            leftIcon={<Save className="h-4 w-4" />}
            isLoading={saving}
            onClick={save}
          >
            Save
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ── Snippets manager (name + category + html) ──
function SnippetsSection() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['email-snippets'], queryFn: () => svc.listSnippets() });
  const snippets = data?.data ?? [];
  const [editing, setEditing] = useState<EmailSnippet | null>(null);
  const [creating, setCreating] = useState(false);

  async function del(id: string) {
    await svc.deleteSnippet(id);
    qc.invalidateQueries({ queryKey: ['email-snippets'] });
  }

  return (
    <section className="rounded-xl border border-[var(--border)] bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-semibold text-[var(--text)]">Reusable HTML snippets</h2>
        <Button
          size="sm"
          variant="secondary"
          leftIcon={<Plus className="h-4 w-4" />}
          onClick={() => setCreating(true)}
        >
          Add snippet
        </Button>
      </div>
      {snippets.length === 0 && <p className="text-sm text-[var(--text-muted)]">No snippets.</p>}
      {snippets.map((sn) => (
        <div
          key={sn.id}
          className="flex items-center gap-2 border-t border-[var(--border)] py-2 text-sm"
        >
          <span className="flex-1 font-medium text-[var(--text)]">{sn.name}</span>
          {sn.category && (
            <Badge variant="secondary" size="sm">
              {sn.category}
            </Badge>
          )}
          <button
            onClick={() => setEditing(sn)}
            className="rounded p-1 text-[var(--text-muted)] hover:bg-[var(--bg-secondary)]"
          >
            <Pencil className="h-4 w-4" />
          </button>
          <button onClick={() => del(sn.id)} className="rounded p-1 text-red-500 hover:bg-red-50">
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ))}
      {(editing || creating) && (
        <SnippetEditModal
          snippet={editing}
          onClose={() => {
            setEditing(null);
            setCreating(false);
          }}
          onSaved={() => {
            setEditing(null);
            setCreating(false);
            qc.invalidateQueries({ queryKey: ['email-snippets'] });
          }}
        />
      )}
    </section>
  );
}

function SnippetEditModal({
  snippet,
  onClose,
  onSaved,
}: {
  snippet: EmailSnippet | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(snippet?.name ?? '');
  const [category, setCategory] = useState(snippet?.category ?? '');
  const [html, setHtml] = useState(snippet?.html ?? '');
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!name.trim()) {
      showToast.error('Name is required');
      return;
    }
    setSaving(true);
    try {
      if (snippet) {
        await svc.updateSnippet(snippet.id, { name, category: category || null, html });
      } else {
        await svc.createSnippet({ name, category: category || null, html });
      }
      showToast.success(snippet ? 'Snippet updated' : 'Snippet created');
      onSaved();
    } catch {
      showToast.error('Save failed');
      setSaving(false);
    }
  }

  return (
    <Modal title={snippet ? 'Edit snippet' : 'New snippet'} onClose={onClose}>
      <div className="space-y-3">
        <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} />
        <Input
          label="Category (optional)"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        />
        <label className="block text-sm">
          <span className="mb-1.5 block font-medium text-[var(--text)]">HTML</span>
          <textarea
            value={html}
            onChange={(e) => setHtml(e.target.value)}
            rows={6}
            className="w-full rounded-lg border border-[var(--border)] p-2 font-mono text-xs"
          />
        </label>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="secondary" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            size="sm"
            leftIcon={<Save className="h-4 w-4" />}
            isLoading={saving}
            onClick={save}
          >
            Save
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function SegmentsSection() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['email-segments'], queryFn: () => svc.listSegments() });
  const segments = data?.data ?? [];
  const [editing, setEditing] = useState<EmailSegment | null>(null);
  const [creating, setCreating] = useState(false);

  return (
    <section className="rounded-xl border border-[var(--border)] bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-semibold text-[var(--text)]">Saved segments</h2>
        <Button
          size="sm"
          variant="secondary"
          leftIcon={<Plus className="h-4 w-4" />}
          onClick={() => setCreating(true)}
        >
          Add segment
        </Button>
      </div>
      {segments.length === 0 && <p className="text-sm text-[var(--text-muted)]">No segments.</p>}
      {segments.map((s) => (
        <div
          key={s.id}
          className="flex items-center gap-2 border-t border-[var(--border)] py-2 text-sm"
        >
          <span className="flex-1 font-medium text-[var(--text)]">{s.name}</span>
          <button
            onClick={() => setEditing(s)}
            className="rounded p-1 text-[var(--text-muted)] hover:bg-[var(--bg-secondary)]"
          >
            <Pencil className="h-4 w-4" />
          </button>
          <button
            onClick={async () => {
              await svc.deleteSegment(s.id);
              qc.invalidateQueries({ queryKey: ['email-segments'] });
            }}
            className="rounded p-1 text-red-500 hover:bg-red-50"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ))}
      {(editing || creating) && (
        <SegmentBuilderModal
          segment={editing}
          onClose={() => {
            setEditing(null);
            setCreating(false);
          }}
          onSaved={() => {
            setEditing(null);
            setCreating(false);
            qc.invalidateQueries({ queryKey: ['email-segments'] });
          }}
        />
      )}
    </section>
  );
}

// ── Segment builder: repeatable condition rows → filter object ──
type ConditionField =
  | 'tag'
  | 'role'
  | 'subscribeStatus'
  | 'onPlatform'
  | 'openedSince'
  | 'notEmailedSince'
  | 'maxBounceCount';
type Condition = { field: ConditionField; value: string };

const FIELD_LABELS: Record<ConditionField, string> = {
  tag: 'Has tag',
  role: 'Role is',
  subscribeStatus: 'Subscribe status',
  onPlatform: 'On platform',
  openedSince: 'Opened since (date)',
  notEmailedSince: 'Not emailed since (date)',
  maxBounceCount: 'Max bounce count',
};

function filterToConditions(filter: SegmentFilter): Condition[] {
  const out: Condition[] = [];
  (filter.tags ?? []).forEach((t) => out.push({ field: 'tag', value: t }));
  (filter.roles ?? []).forEach((r) => out.push({ field: 'role', value: r }));
  if (filter.subscribeStatus) out.push({ field: 'subscribeStatus', value: filter.subscribeStatus });
  if (filter.onPlatform !== undefined)
    out.push({ field: 'onPlatform', value: filter.onPlatform ? 'true' : 'false' });
  if (filter.openedSince) out.push({ field: 'openedSince', value: filter.openedSince });
  if (filter.notEmailedSince) out.push({ field: 'notEmailedSince', value: filter.notEmailedSince });
  if (filter.maxBounceCount !== undefined)
    out.push({ field: 'maxBounceCount', value: String(filter.maxBounceCount) });
  return out;
}

function conditionsToFilter(conditions: Condition[]): SegmentFilter {
  const filter: SegmentFilter = {};
  for (const c of conditions) {
    if (!c.value && c.field !== 'onPlatform') continue;
    if (c.field === 'tag') filter.tags = [...(filter.tags ?? []), c.value];
    else if (c.field === 'role') filter.roles = [...(filter.roles ?? []), c.value.toUpperCase()];
    else if (c.field === 'subscribeStatus') filter.subscribeStatus = c.value;
    else if (c.field === 'onPlatform') filter.onPlatform = (c.value || 'true') === 'true';
    else if (c.field === 'openedSince') filter.openedSince = c.value;
    else if (c.field === 'notEmailedSince') filter.notEmailedSince = c.value;
    else if (c.field === 'maxBounceCount') filter.maxBounceCount = Number(c.value);
  }
  return filter;
}

function ConditionValueInput({
  cond,
  onChange,
}: {
  cond: Condition;
  onChange: (value: string) => void;
}) {
  if (cond.field === 'subscribeStatus') {
    return (
      <Select
        className="flex-1"
        size="sm"
        options={['SUBSCRIBED', 'UNSUBSCRIBED', 'PENDING', 'CLEANED'].map((v) => ({
          value: v,
          label: v,
        }))}
        value={cond.value}
        onChange={(v) => onChange(v)}
        placeholder="— select —"
      />
    );
  }
  if (cond.field === 'role') {
    return (
      <Select
        className="flex-1"
        size="sm"
        options={['CANDIDATE', 'EMPLOYER', 'ADMIN', 'SUPER_ADMIN'].map((v) => ({
          value: v,
          label: v,
        }))}
        value={cond.value}
        onChange={(v) => onChange(v)}
        placeholder="— select —"
      />
    );
  }
  if (cond.field === 'onPlatform') {
    return (
      <Select
        className="flex-1"
        size="sm"
        options={[
          { value: 'true', label: 'Yes' },
          { value: 'false', label: 'No' },
        ]}
        value={cond.value || 'true'}
        onChange={(v) => onChange(v)}
        clearable={false}
      />
    );
  }
  if (cond.field === 'openedSince' || cond.field === 'notEmailedSince') {
    return (
      <DatePicker
        mode="date"
        value={cond.value}
        onChange={(v) => onChange(v)}
        inputSize="sm"
        className="flex-1"
      />
    );
  }
  if (cond.field === 'maxBounceCount') {
    return (
      <input
        type="number"
        min={0}
        value={cond.value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="e.g. 2"
        className="flex-1 rounded-lg border border-[var(--border)] bg-white px-2 py-1.5 text-sm"
      />
    );
  }
  // tag → free text
  return (
    <input
      value={cond.value}
      onChange={(e) => onChange(e.target.value)}
      placeholder="tag name"
      className="flex-1 rounded-lg border border-[var(--border)] bg-white px-2 py-1.5 text-sm"
    />
  );
}

function SegmentBuilderModal({
  segment,
  onClose,
  onSaved,
}: {
  segment: EmailSegment | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(segment?.name ?? '');
  const [description, setDescription] = useState(segment?.description ?? '');
  const [conditions, setConditions] = useState<Condition[]>(
    segment
      ? filterToConditions(segment.filter as SegmentFilter)
      : [{ field: 'subscribeStatus', value: 'SUBSCRIBED' }],
  );
  const [saving, setSaving] = useState(false);
  const [size, setSize] = useState<number | null>(null);

  function updateCond(i: number, patch: Partial<Condition>) {
    setConditions((cs) => cs.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));
  }
  function addCond() {
    setConditions((cs) => [...cs, { field: 'tag', value: '' }]);
  }
  function removeCond(i: number) {
    setConditions((cs) => cs.filter((_, idx) => idx !== i));
  }

  async function save() {
    if (!name.trim()) {
      showToast.error('Name is required');
      return;
    }
    setSaving(true);
    const filter = conditionsToFilter(conditions);
    try {
      let id = segment?.id;
      if (segment) {
        await svc.updateSegment(segment.id, { name, description: description || null, filter });
      } else {
        const created = await svc.createSegment({ name, description: description || null, filter });
        id = created.data?.id;
      }
      showToast.success(segment ? 'Segment updated' : 'Segment created');
      // Live size after save.
      if (id) {
        try {
          const res = await svc.segmentSize(id);
          setSize(res.data?.count ?? null);
        } catch {
          setSize(null);
        }
      }
      onSaved();
    } catch {
      showToast.error('Save failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={segment ? 'Edit segment' : 'New segment'} onClose={onClose}>
      <div className="space-y-3">
        <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} />
        <Input
          label="Description (optional)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-medium text-[var(--text)]">
              Conditions (all must match)
            </span>
            <Button
              size="sm"
              variant="ghost"
              leftIcon={<Plus className="h-3.5 w-3.5" />}
              onClick={addCond}
            >
              Add condition
            </Button>
          </div>
          {conditions.length === 0 && (
            <p className="text-xs text-[var(--text-muted)]">
              No conditions — matches the whole audience.
            </p>
          )}
          <div className="space-y-2">
            {conditions.map((c, i) => (
              <div key={i} className="flex items-center gap-2">
                <div className="w-40 shrink-0">
                  <Select
                    size="sm"
                    options={(Object.keys(FIELD_LABELS) as ConditionField[]).map((f) => ({
                      value: f,
                      label: FIELD_LABELS[f],
                    }))}
                    value={c.field}
                    onChange={(v) => {
                      const field = v as ConditionField;
                      // onPlatform renders "Yes" by default, so its stored value must match.
                      updateCond(i, { field, value: field === 'onPlatform' ? 'true' : '' });
                    }}
                    clearable={false}
                  />
                </div>
                <ConditionValueInput cond={c} onChange={(value) => updateCond(i, { value })} />
                <button
                  onClick={() => removeCond(i)}
                  className="rounded p-1 text-red-500 hover:bg-red-50"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
        {size != null && (
          <p className="text-sm text-[var(--text-secondary)]">
            Live size: <strong className="text-[var(--text)]">{size.toLocaleString()}</strong>{' '}
            contacts
          </p>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="secondary" size="sm" onClick={onClose}>
            Close
          </Button>
          <Button
            size="sm"
            leftIcon={<Save className="h-4 w-4" />}
            isLoading={saving}
            onClick={save}
          >
            Save
          </Button>
        </div>
      </div>
    </Modal>
  );
}
