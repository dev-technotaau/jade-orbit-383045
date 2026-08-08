'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { User, MapPin, Mail, Camera, X, Loader2 } from 'lucide-react';
import Card from '@/components/ui/Card';
import Tooltip from '@/components/ui/Tooltip';
import Input from '@/components/ui/Input';
import PhoneInput from '@/components/ui/PhoneInput';
import Textarea from '@/components/ui/Textarea';
import ServerSuggestionInput from '@/components/ui/ServerSuggestionInput';
import Select, { type SelectOption } from '@/components/ui/Select';
import DatePicker from '@/components/ui/DatePicker';
import ImageCropper from '@/components/ui/ImageCropper';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { showToast } from '@/components/ui/Toast';
import { candidateService } from '@/services/candidate.service';
import { useAuthStore } from '@/store/auth.store';
import { QUERY_KEYS, FILE_LIMITS } from '@/constants/config';
import {
  GENDER_LABELS,
  MARITAL_STATUS_LABELS,
  PRONOUN_OPTIONS,
  RESERVATION_CATEGORY_LABELS,
} from '@/constants/enums';
import { INDIAN_STATES } from '@/constants/suggestions';
import type { ProfileSectionProps } from './types';
import type { CandidateProfile, UpdateCandidateRequest } from '@/types/candidate';
import type { ApiError } from '@/types/api';

function toSelectOptions(labels: Record<string, string>): SelectOption[] {
  return Object.entries(labels).map(([value, label]) => ({ value, label }));
}

interface PersonalSectionProps extends ProfileSectionProps {
  profile?: CandidateProfile;
}

function ProfileImageSection({ profile }: { profile: CandidateProfile | undefined }) {
  const queryClient = useQueryClient();
  const [cropperOpen, setCropperOpen] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false);

  const avatarUrl = profile?.user?.avatar || profile?.profileImage;

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!(FILE_LIMITS.IMAGE_TYPES as readonly string[]).includes(file.type)) {
      showToast.error('Please select a JPG, PNG, or WebP image');
      return;
    }
    if (file.size > FILE_LIMITS.AVATAR_MAX_SIZE) {
      showToast.error('Image must be under 5MB');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setSelectedImage(reader.result as string);
      setCropperOpen(true);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleCropComplete = async (blob: Blob) => {
    setIsUploading(true);
    try {
      const file = new File([blob], 'avatar.jpg', { type: 'image/jpeg' });
      const res = await candidateService.uploadAvatar(file);
      const newUrl = res.data?.url;
      if (newUrl) {
        const { user, setUser } = useAuthStore.getState();
        if (user) setUser({ ...user, avatar: newUrl });
      }
      showToast.success('Profile photo updated');
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.CANDIDATES.PROFILE });
    } catch (err) {
      const error = err as unknown as ApiError;
      showToast.error(error.message || 'Failed to upload photo');
    } finally {
      setIsUploading(false);
      setSelectedImage(null);
    }
  };

  return (
    <Card header={<h2 className="text-lg font-semibold text-[var(--text)]">Profile Photo</h2>}>
      <div className="flex items-center gap-6">
        <div className="relative">
          <div className="h-24 w-24 overflow-hidden rounded-full border-2 border-[var(--border)] bg-[var(--bg-secondary)]">
            {avatarUrl ? (
              <img src={avatarUrl} alt="Profile" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center">
                <User className="h-10 w-10 text-[var(--text-muted)]" />
              </div>
            )}
          </div>
          {isUploading && (
            <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50">
              <Loader2 className="h-6 w-6 animate-spin text-white" />
            </div>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <Tooltip content={avatarUrl ? 'Change your profile photo' : 'Upload a profile photo'}>
            <label className="cursor-pointer">
              <input
                type="file"
                accept=".jpg,.jpeg,.png,.webp"
                onChange={handleFileSelect}
                className="sr-only"
                disabled={isUploading}
              />
              <span className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-1.5 text-sm font-medium text-[var(--text)] transition-colors hover:bg-[var(--bg-secondary)]">
                <Camera className="h-4 w-4" />
                {avatarUrl ? 'Change Photo' : 'Upload Photo'}
              </span>
            </label>
          </Tooltip>
          {avatarUrl && (
            <Tooltip content="Remove your profile photo">
              <button
                onClick={() => setShowRemoveConfirm(true)}
                disabled={isUploading}
                className="inline-flex w-fit cursor-pointer items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-1.5 text-sm font-medium text-[var(--error)] transition-colors hover:bg-[var(--bg-secondary)] disabled:opacity-50"
              >
                <X className="h-4 w-4" />
                Remove Photo
              </button>
            </Tooltip>
          )}
          <p className="text-xs text-[var(--text-muted)]">
            JPG, PNG, or WebP. Max 5MB. Will be cropped to 1:1 aspect ratio (400x400px).
          </p>
        </div>
      </div>

      {selectedImage && (
        <ImageCropper
          isOpen={cropperOpen}
          onClose={() => {
            setCropperOpen(false);
            setSelectedImage(null);
          }}
          imageSrc={selectedImage}
          onCropComplete={handleCropComplete}
          aspectRatio={1}
          circularCrop={true}
        />
      )}

      <ConfirmDialog
        isOpen={showRemoveConfirm}
        onClose={() => setShowRemoveConfirm(false)}
        onConfirm={async () => {
          try {
            setIsUploading(true);
            setShowRemoveConfirm(false);
            await candidateService.removeAvatar();
            const { user, setUser } = useAuthStore.getState();
            if (user) setUser({ ...user, avatar: '' });
            showToast.success('Profile photo removed');
            queryClient.invalidateQueries({ queryKey: QUERY_KEYS.CANDIDATES.PROFILE });
          } catch (err) {
            const error = err as unknown as ApiError;
            showToast.error(error?.message || 'Failed to remove photo');
          } finally {
            setIsUploading(false);
          }
        }}
        title="Remove Profile Photo"
        message="Are you sure you want to remove your profile photo? This action cannot be undone."
        confirmLabel="Remove"
        isLoading={isUploading}
      />
    </Card>
  );
}

export default function PersonalSection({ form, updateField, profile }: PersonalSectionProps) {
  const { user } = useAuthStore();

  return (
    <>
      <ProfileImageSection profile={profile} />
      <Card
        header={<h2 className="text-lg font-semibold text-[var(--text)]">Personal Information</h2>}
      >
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="First Name"
              placeholder="Enter your first name"
              value={form.firstName ?? user?.firstName ?? ''}
              onChange={(e) => updateField('firstName', e.target.value)}
              required
            />
            <Input
              label="Last Name"
              placeholder="Enter your last name"
              value={form.lastName ?? user?.lastName ?? ''}
              onChange={(e) => updateField('lastName', e.target.value)}
              required
            />
          </div>
          <Input
            label="Headline"
            placeholder="e.g. Senior React Developer with 5+ years"
            value={form.headline || ''}
            onChange={(e) => updateField('headline', e.target.value)}
            helperText="A short professional headline"
          />
          <Textarea
            label="Bio"
            placeholder="Tell employers about yourself..."
            value={form.bio || ''}
            onChange={(e) => updateField('bio', e.target.value)}
            rows={4}
            maxLength={1000}
            showCount
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <PhoneInput
              label="Phone"
              placeholder="9876xxxxxx"
              value={form.phone || ''}
              onValueChange={(val) => updateField('phone', val)}
            />
            <DatePicker
              label="Date of Birth"
              value={form.dob || ''}
              onChange={(val) => updateField('dob', val)}
              maxDate={new Date()}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Select
              label="Gender"
              options={toSelectOptions(GENDER_LABELS)}
              value={form.gender || ''}
              onChange={(v) => updateField('gender', v as UpdateCandidateRequest['gender'])}
              placeholder="Select gender"
            />
            <Select
              label="Marital Status"
              options={toSelectOptions(MARITAL_STATUS_LABELS)}
              value={form.maritalStatus || ''}
              onChange={(v) =>
                updateField('maritalStatus', v as UpdateCandidateRequest['maritalStatus'])
              }
              placeholder="Select status"
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <ServerSuggestionInput
              category="nationality"
              label="Nationality"
              placeholder="e.g. Indian"
              value={form.nationality || ''}
              onChange={(val) => updateField('nationality', val)}
            />
            <ServerSuggestionInput
              category="location"
              label="Current Location"
              placeholder="e.g. Bangalore, Karnataka"
              leftIcon={<MapPin className="h-4 w-4" />}
              value={form.currentLocation || ''}
              onChange={(val) => updateField('currentLocation', val)}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Select
              label="Pronouns"
              options={toSelectOptions(PRONOUN_OPTIONS)}
              value={form.pronouns || ''}
              onChange={(v) => updateField('pronouns', v)}
              placeholder="Select pronouns"
            />
            <Select
              label="Category"
              options={toSelectOptions(RESERVATION_CATEGORY_LABELS)}
              value={form.category || ''}
              onChange={(v) => updateField('category', v as UpdateCandidateRequest['category'])}
              placeholder="Select category"
            />
          </div>
          <ServerSuggestionInput
            category="location"
            label="Hometown"
            placeholder="e.g. Jaipur, Rajasthan"
            value={form.hometown || ''}
            onChange={(val) => updateField('hometown', val)}
          />

          {/* Address */}
          <div className="border-t border-[var(--border)] pt-4">
            <h3 className="mb-3 text-sm font-semibold text-[var(--text)]">Address</h3>
            <div className="space-y-4">
              <Input
                label="Address Line 1"
                placeholder="Street address"
                value={form.addressLine1 || ''}
                onChange={(e) => updateField('addressLine1', e.target.value)}
              />
              <Input
                label="Address Line 2"
                placeholder="Apartment, suite, etc."
                value={form.addressLine2 || ''}
                onChange={(e) => updateField('addressLine2', e.target.value)}
              />
              <div className="grid gap-4 sm:grid-cols-3">
                <ServerSuggestionInput
                  category="location"
                  label="City"
                  placeholder="e.g. Mumbai"
                  value={form.city || ''}
                  onChange={(val) => updateField('city', val)}
                />
                <Select
                  label="State"
                  options={INDIAN_STATES.map((s) => ({ value: s, label: s }))}
                  value={form.state || ''}
                  onChange={(v) => updateField('state', v)}
                  placeholder="Select state"
                />
                <Input
                  label="Pincode"
                  placeholder="e.g. 400001"
                  value={form.pincode || ''}
                  onChange={(e) => updateField('pincode', e.target.value)}
                />
              </div>
              <ServerSuggestionInput
                category="country"
                label="Country"
                placeholder="e.g. India"
                value={form.country || ''}
                onChange={(val) => updateField('country', val)}
              />
            </div>
          </div>

          {/* Additional Contact */}
          <div className="border-t border-[var(--border)] pt-4">
            <h3 className="mb-3 text-sm font-semibold text-[var(--text)]">Additional Contact</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <PhoneInput
                label="Alternate Phone"
                placeholder="9876xxxxxx"
                value={form.alternatePhone || ''}
                onValueChange={(val) => updateField('alternatePhone', val)}
              />
              <Input
                label="Alternate Email"
                type="email"
                placeholder="alternate@example.com"
                leftIcon={<Mail className="h-4 w-4" />}
                value={form.alternateEmail || ''}
                onChange={(e) => updateField('alternateEmail', e.target.value)}
              />
            </div>
          </div>
        </div>
      </Card>
    </>
  );
}
