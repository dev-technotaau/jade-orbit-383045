import {
  Linkedin,
  Twitter,
  Facebook,
  Instagram,
  Youtube,
  Globe,
  ExternalLink,
  BookOpen,
  Camera,
} from 'lucide-react';
import Input from '@/components/ui/Input';
import type { UpdateCompanyRequest } from '@/types/employer';

interface SocialSectionProps {
  form: UpdateCompanyRequest;
  updateField: <K extends keyof UpdateCompanyRequest>(
    key: K,
    value: UpdateCompanyRequest[K],
  ) => void;
}

export default function SocialSection({ form, updateField }: SocialSectionProps) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          label="LinkedIn"
          placeholder="https://linkedin.com/company/..."
          leftIcon={<Linkedin className="h-4 w-4" />}
          value={form.socialLinks?.linkedin || ''}
          onChange={(e) =>
            updateField('socialLinks', { ...form.socialLinks, linkedin: e.target.value })
          }
        />
        <Input
          label="Twitter / X"
          placeholder="https://twitter.com/..."
          leftIcon={<Twitter className="h-4 w-4" />}
          value={form.socialLinks?.twitter || ''}
          onChange={(e) =>
            updateField('socialLinks', { ...form.socialLinks, twitter: e.target.value })
          }
        />
        <Input
          label="Facebook"
          placeholder="https://facebook.com/..."
          leftIcon={<Facebook className="h-4 w-4" />}
          value={form.socialLinks?.facebook || ''}
          onChange={(e) =>
            updateField('socialLinks', { ...form.socialLinks, facebook: e.target.value })
          }
        />
        <Input
          label="Instagram"
          placeholder="https://instagram.com/..."
          leftIcon={<Instagram className="h-4 w-4" />}
          value={form.socialLinks?.instagram || ''}
          onChange={(e) =>
            updateField('socialLinks', { ...form.socialLinks, instagram: e.target.value })
          }
        />
        <Input
          label="YouTube"
          placeholder="https://youtube.com/..."
          leftIcon={<Youtube className="h-4 w-4" />}
          value={form.socialLinks?.youtube || ''}
          onChange={(e) =>
            updateField('socialLinks', { ...form.socialLinks, youtube: e.target.value })
          }
        />
        <Input
          label="Glassdoor"
          placeholder="https://glassdoor.com/..."
          leftIcon={<Globe className="h-4 w-4" />}
          value={form.socialLinks?.glassdoor || ''}
          onChange={(e) =>
            updateField('socialLinks', { ...form.socialLinks, glassdoor: e.target.value })
          }
        />
      </div>
      <div className="border-t border-[var(--border)] pt-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Careers Page URL"
            placeholder="https://company.com/careers"
            leftIcon={<ExternalLink className="h-4 w-4" />}
            value={form.careersPageUrl || ''}
            onChange={(e) => updateField('careersPageUrl', e.target.value)}
          />
          <Input
            label="Blog URL"
            placeholder="https://company.com/blog"
            leftIcon={<BookOpen className="h-4 w-4" />}
            value={form.blogUrl || ''}
            onChange={(e) => updateField('blogUrl', e.target.value)}
          />
        </div>
      </div>
      <div className="border-t border-[var(--border)] pt-4">
        <Input
          label="Company Video URL"
          type="url"
          placeholder="https://youtube.com/watch?v=..."
          leftIcon={<Camera className="h-4 w-4" />}
          value={form.companyVideoUrl || ''}
          onChange={(e) => updateField('companyVideoUrl', e.target.value)}
          helperText="Intro video, office tour, or culture video"
        />
      </div>
    </div>
  );
}
