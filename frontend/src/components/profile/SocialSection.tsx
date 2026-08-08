'use client';

import { Globe, FileText } from 'lucide-react';
import Card from '@/components/ui/Card';
import Input from '@/components/ui/Input';
import BrandIcon from '@/components/common/BrandIcon';
import type { ProfileSectionProps } from './types';

export default function SocialSection({ form, updateField }: ProfileSectionProps) {
  return (
    <Card
      header={
        <h2 className="text-lg font-semibold text-[var(--text)]">Social & Portfolio Links</h2>
      }
    >
      <div className="space-y-4">
        <Input
          label="LinkedIn Profile"
          placeholder="https://linkedin.com/in/username"
          leftIcon={<BrandIcon name="linkedin" className="h-4 w-4" />}
          value={form.linkedinProfile || ''}
          onChange={(e) => updateField('linkedinProfile', e.target.value)}
        />
        <Input
          label="GitHub Profile"
          placeholder="https://github.com/username"
          leftIcon={<BrandIcon name="github" className="h-4 w-4" />}
          value={form.githubProfile || ''}
          onChange={(e) => updateField('githubProfile', e.target.value)}
        />
        <Input
          label="Portfolio / Website"
          placeholder="https://yourportfolio.com"
          leftIcon={<Globe className="h-4 w-4" />}
          value={form.portfolioUrl || ''}
          onChange={(e) => updateField('portfolioUrl', e.target.value)}
        />
        <Input
          label="Stack Overflow"
          placeholder="https://stackoverflow.com/users/..."
          leftIcon={<BrandIcon name="stackoverflow" className="h-4 w-4" />}
          value={form.stackOverflowProfile || ''}
          onChange={(e) => updateField('stackOverflowProfile', e.target.value)}
        />
        <Input
          label="X (Twitter)"
          placeholder="https://x.com/username"
          leftIcon={<BrandIcon name="x" className="h-4 w-4" />}
          value={form.twitterProfile || ''}
          onChange={(e) => updateField('twitterProfile', e.target.value)}
        />
        <Input
          label="Personal Blog"
          placeholder="https://yourblog.com"
          leftIcon={<FileText className="h-4 w-4" />}
          value={form.personalBlogUrl || ''}
          onChange={(e) => updateField('personalBlogUrl', e.target.value)}
        />
        <Input
          label="Dribbble"
          placeholder="https://dribbble.com/username"
          leftIcon={<BrandIcon name="dribbble" className="h-4 w-4" />}
          value={form.dribbbleProfile || ''}
          onChange={(e) => updateField('dribbbleProfile', e.target.value)}
        />
        <Input
          label="Behance"
          placeholder="https://behance.net/username"
          leftIcon={<BrandIcon name="behance" className="h-4 w-4" />}
          value={form.behanceProfile || ''}
          onChange={(e) => updateField('behanceProfile', e.target.value)}
        />
        <Input
          label="Medium"
          placeholder="https://medium.com/@username"
          leftIcon={<BrandIcon name="medium" className="h-4 w-4" />}
          value={form.mediumProfile || ''}
          onChange={(e) => updateField('mediumProfile', e.target.value)}
        />
        <Input
          label="YouTube Channel"
          placeholder="https://youtube.com/@channel"
          leftIcon={<BrandIcon name="youtube" className="h-4 w-4" />}
          value={form.youtubeChannel || ''}
          onChange={(e) => updateField('youtubeChannel', e.target.value)}
        />
      </div>
    </Card>
  );
}
