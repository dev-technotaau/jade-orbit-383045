'use client';

import { useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { BadgeCheck, ImagePlus, Loader2, ShieldCheck, Save, PlugZap } from 'lucide-react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Textarea from '@/components/ui/Textarea';
import Select from '@/components/ui/Select';
import { showToast } from '@/components/ui/Toast';
import { confirmDialog } from '@/components/ui/dialog-service';
import { API } from '@/constants/api';
import { whatsappService as svc } from '@/services/whatsapp.service';
import { WA_PROFILE_VERTICALS, type WaBusinessProfile } from '@/types/whatsapp';
import type { ApiError } from '@/types/api';

const errText = (e: unknown, fallback: string) => (e as unknown as ApiError)?.message || fallback;

/** Meta's raw enum values are shouty; these are what an operator recognises. */
const VERTICAL_LABEL: Record<string, string> = {
  UNDEFINED: 'Not set',
  OTHER: 'Other',
  AUTO: 'Automotive',
  BEAUTY: 'Beauty, spa and salon',
  APPAREL: 'Clothing and apparel',
  EDU: 'Education',
  ENTERTAIN: 'Entertainment',
  EVENT_PLAN: 'Event planning and service',
  FINANCE: 'Finance and banking',
  GROCERY: 'Food and grocery',
  GOVT: 'Public service',
  HOTEL: 'Hotel and lodging',
  HEALTH: 'Medical and health',
  NONPROFIT: 'Non-profit',
  PROF_SERVICES: 'Professional services',
  RETAIL: 'Shopping and retail',
  TRAVEL: 'Travel and transportation',
  RESTAURANT: 'Restaurant',
  NOT_A_BIZ: 'Not a business',
};

/** Meta's own field limits — the same ones the request schema enforces. */
const ABOUT_MAX = 139;
const DESCRIPTION_MAX = 512;
const MAX_WEBSITES = 2;

/**
 * The editable profile.
 *
 * Seeded from a prop rather than synced out of the query in an effect, matching
 * the settings forms: the parent gates on load, so this only ever mounts with
 * real data, and every save writes Meta's normalised answer straight back into
 * state.
 */
function ProfileForm({ initial }: { initial: WaBusinessProfile }) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState<WaBusinessProfile>(initial);

  const applySaved = (saved: WaBusinessProfile | undefined) => {
    // Read back what Meta stored, not what was typed: it trims several of these
    // fields and can silently drop a website, and this form is meant to show
    // what customers will actually see.
    if (saved) setForm(saved);
    qc.invalidateQueries({ queryKey: ['wa-business-profile'] });
  };

  const saveMut = useMutation({
    mutationFn: (patch: Parameters<typeof svc.updateBusinessProfile>[0]) =>
      svc.updateBusinessProfile(patch),
    onSuccess: (res) => {
      showToast.success('Business profile updated');
      applySaved(res.data);
    },
    onError: (e) => showToast.error(errText(e, 'Could not save the profile')),
  });

  const photoMut = useMutation({
    mutationFn: async (file: File) => {
      const uploaded = await svc.uploadProfilePhoto(file);
      const handle = uploaded.data?.handle;
      if (!handle) throw new Error('Upload returned no handle');
      return svc.updateBusinessProfile({ profilePictureHandle: handle });
    },
    onSuccess: (res) => {
      showToast.success('Profile photo updated');
      applySaved(res.data);
    },
    onError: (e) => showToast.error(errText(e, 'Could not upload the photo')),
  });

  const set = <K extends keyof WaBusinessProfile>(key: K, value: WaBusinessProfile[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const save = () =>
    saveMut.mutate({
      about: form.about ?? '',
      address: form.address ?? '',
      description: form.description ?? '',
      // Omit rather than send ''. The request schema is z.string().email()
      // .optional(), so an empty string is a FORMAT error while an absent key
      // passes -- meaning the first 'Save profile' on a newly connected number
      // (which has no email yet) 400'd on a field the operator never touched.
      ...(form.email && form.email.trim() ? { email: form.email.trim() } : {}),
      websites: form.websites.filter((w) => w.trim()),
      vertical: form.vertical ?? 'UNDEFINED',
    });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        {form.profilePictureUrl ? (
          // Loaded through OUR origin, not Meta's CDN: the CSP is
          // `img-src 'self' data: blob:` with no remote host allowed, so pointing
          // straight at the signed CDN URL rendered a broken image. profilePictureUrl
          // still tells us a photo EXISTS; it is just not what the browser fetches.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`/api/proxy${API.SUPER_ADMIN.WA_BUSINESS_PROFILE_PHOTO}`}
            alt="Business profile"
            className="h-16 w-16 rounded-full object-cover"
          />
        ) : (
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--bg-secondary)] text-[var(--text-muted)]">
            <ImagePlus className="h-6 w-6" aria-hidden="true" />
          </div>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) photoMut.mutate(file);
            e.target.value = '';
          }}
        />
        <Button
          size="sm"
          variant="secondary"
          isLoading={photoMut.isPending}
          onClick={() => fileRef.current?.click()}
          leftIcon={<ImagePlus className="h-4 w-4" />}
        >
          Change photo
        </Button>
      </div>

      <Input
        label="About"
        value={form.about ?? ''}
        maxLength={ABOUT_MAX}
        onChange={(e) => set('about', e.target.value)}
        helperText={`The one-line status under your name. ${ABOUT_MAX} characters maximum.`}
      />
      <Textarea
        label="Description"
        value={form.description ?? ''}
        maxLength={DESCRIPTION_MAX}
        showCount
        onChange={(e) => set('description', e.target.value)}
      />
      <div className="grid gap-3 sm:grid-cols-2">
        <Input
          label="Address"
          value={form.address ?? ''}
          onChange={(e) => set('address', e.target.value)}
        />
        <Input
          label="Email"
          type="email"
          value={form.email ?? ''}
          onChange={(e) => set('email', e.target.value)}
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {Array.from({ length: MAX_WEBSITES }, (_, i) => (
          <Input
            key={i}
            label={i === 0 ? 'Website' : 'Second website'}
            value={form.websites[i] ?? ''}
            placeholder="https://example.com"
            onChange={(e) => {
              const next = [...form.websites];
              next[i] = e.target.value;
              set('websites', next);
            }}
          />
        ))}
      </div>
      <Select
        label="Category"
        options={WA_PROFILE_VERTICALS.map((v) => ({ value: v, label: VERTICAL_LABEL[v] ?? v }))}
        value={form.vertical ?? 'UNDEFINED'}
        onChange={(v) => set('vertical', v)}
        clearable={false}
      />

      <div className="flex justify-end">
        <Button
          onClick={save}
          isLoading={saveMut.isPending}
          leftIcon={<Save className="h-4 w-4" />}
        >
          Save profile
        </Button>
      </div>
    </div>
  );
}

/**
 * Registration and the mandatory six-digit two-step PIN.
 *
 * Both used to require Meta Business Manager, so a number migration or a PIN
 * reset meant leaving the console that exists to manage the number.
 */
function RegistrationCard() {
  const qc = useQueryClient();
  const [pin, setPin] = useState('');
  const done = (message: string) => {
    showToast.success(message);
    setPin('');
    qc.invalidateQueries({ queryKey: ['wa-channels'] });
  };

  const registerMut = useMutation({
    mutationFn: () => svc.registerNumber(pin),
    onSuccess: () => done('Number registered with Meta'),
    onError: (e) => showToast.error(errText(e, 'Registration failed')),
  });

  const pinMut = useMutation({
    mutationFn: () => svc.setTwoStepPin(pin),
    onSuccess: () => done('Two-step PIN updated'),
    onError: (e) => showToast.error(errText(e, 'Could not set the PIN')),
  });

  const deregisterMut = useMutation({
    mutationFn: () => svc.deregisterNumber(),
    onSuccess: () => done('Number deregistered'),
    onError: (e) => showToast.error(errText(e, 'Could not deregister')),
  });

  const confirmDeregister = async () => {
    const ok = await confirmDialog({
      title: 'Deregister this number?',
      message:
        'It stops sending and receiving through the Cloud API until it is registered again. Your conversation history is kept.',
      confirmLabel: 'Deregister',
      variant: 'danger',
    });
    if (ok) deregisterMut.mutate();
  };

  const pinValid = /^\d{6}$/.test(pin);

  return (
    <div className="space-y-3 rounded-xl border border-[var(--border)] bg-white p-4">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-[var(--text)]">
        <ShieldCheck className="h-4 w-4 text-emerald-600" aria-hidden="true" /> Registration and
        two-step PIN
      </h3>
      <p className="text-xs text-[var(--text-muted)]">
        Meta requires a six-digit PIN on every Cloud API number. Registering is what brings a newly
        migrated number online; rotating the PIN is what you do after it has been shared. The PIN
        goes straight to Meta and is never stored here.
      </p>
      <div className="flex flex-wrap items-end gap-2">
        <div className="w-40">
          <Input
            label="Six-digit PIN"
            inputMode="numeric"
            maxLength={6}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
            placeholder="123456"
          />
        </div>
        <Button
          size="sm"
          isLoading={registerMut.isPending}
          disabled={!pinValid}
          onClick={() => registerMut.mutate()}
          leftIcon={<PlugZap className="h-4 w-4" />}
        >
          Register number
        </Button>
        <Button
          size="sm"
          variant="secondary"
          isLoading={pinMut.isPending}
          disabled={!pinValid}
          onClick={() => pinMut.mutate()}
        >
          Change PIN only
        </Button>
        <Button
          size="sm"
          variant="ghost"
          isLoading={deregisterMut.isPending}
          onClick={() => void confirmDeregister()}
        >
          Deregister
        </Button>
      </div>
    </div>
  );
}

/**
 * The number's customer-facing identity, and the two operations that used to
 * require Meta Business Manager.
 *
 * Everything here was previously absent: the settings page showed quality and
 * tier and nothing else, so the about line, description, address, email,
 * websites, category and photo a customer actually sees could not be changed
 * from the console at all — nor could the number be registered or its PIN
 * rotated.
 */
export default function BusinessProfileSection() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['wa-business-profile'],
    queryFn: () => svc.getBusinessProfile(),
  });
  const profile = data?.data;

  return (
    <section className="space-y-3">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-[var(--text)]">
        <BadgeCheck className="h-4 w-4 text-emerald-600" aria-hidden="true" /> Business profile
      </h2>
      <p className="text-xs text-[var(--text-muted)]">
        What a customer sees when they tap your business name in WhatsApp. Changes apply to the
        default sending number.
      </p>

      <div className="rounded-xl border border-[var(--border)] bg-white p-4">
        {isLoading && (
          <p className="flex items-center justify-center gap-2 text-sm text-[var(--text-muted)]">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </p>
        )}
        {isError && (
          <p className="text-center text-sm text-red-600">
            Failed to load the business profile from Meta.
          </p>
        )}
        {profile && <ProfileForm initial={profile} />}
      </div>

      <RegistrationCard />
    </section>
  );
}
