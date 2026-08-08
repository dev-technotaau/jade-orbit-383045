'use client';

import { useState } from 'react';
import { Stamp, Settings } from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import Tabs from '@/components/ui/Tabs';
import Button from '@/components/ui/Button';
import OnPlatformTab from '@/components/super-admin/resume-watermark/OnPlatformTab';
import OffPlatformTab from '@/components/super-admin/resume-watermark/OffPlatformTab';
import WatermarkConfigModal from '@/components/super-admin/resume-watermark/WatermarkConfigModal';

const TABS = [
  { key: 'on', label: 'On-platform candidates' },
  { key: 'off', label: 'Off-platform candidates' },
];

export default function ResumeWatermarkPage() {
  const [tab, setTab] = useState('on');
  const [configOpen, setConfigOpen] = useState(false);

  return (
    <DashboardLayout
      requiredRole={['ADMIN', 'SUPER_ADMIN']}
      requiredAnyPermission={[
        'resume_watermark.on_platform.view',
        'resume_watermark.off_platform.view',
        'resume_watermark.config.view',
      ]}
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="flex items-center gap-2 text-2xl font-bold text-[var(--text)]">
            <Stamp className="h-6 w-6 text-blue-600" /> Resume Watermark Toolkit
          </h1>
          <Button
            variant="secondary"
            size="sm"
            leftIcon={<Settings className="h-4 w-4" />}
            onClick={() => setConfigOpen(true)}
          >
            Watermark settings
          </Button>
        </div>
        <p className="max-w-3xl text-sm text-[var(--text-muted)]">
          Attach the Hire Adda watermark to candidate resumes on download. Manage on-platform
          candidates&rsquo; resumes, or upload off-platform CVs (kept completely separate — no
          account or profile is ever created for them). The watermark position and strength are
          configurable under <span className="font-medium">Watermark settings</span>.
        </p>

        <Tabs tabs={TABS} activeTab={tab} onChange={setTab} />

        {tab === 'on' ? <OnPlatformTab /> : <OffPlatformTab />}

        <WatermarkConfigModal isOpen={configOpen} onClose={() => setConfigOpen(false)} />
      </div>
    </DashboardLayout>
  );
}
