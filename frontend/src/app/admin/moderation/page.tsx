'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Shield, Plus, X, AlertTriangle } from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import Can from '@/components/common/Can';
import { PERM } from '@/constants/permissions';
import Card from '@/components/ui/Card';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import Tooltip from '@/components/ui/Tooltip';
import Skeleton from '@/components/ui/Skeleton';
import { adminService } from '@/services/admin.service';
import { showToast } from '@/components/ui/Toast';

export default function ModerationPage() {
  const [newKeyword, setNewKeyword] = useState('');
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'moderation-keywords'],
    queryFn: () => adminService.getModerationKeywords(),
  });

  const keywords = data?.data || [];

  const addMutation = useMutation({
    mutationFn: (keyword: string) => adminService.addModerationKeyword(keyword),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'moderation-keywords'] });
      setNewKeyword('');
      showToast.success('Keyword added');
    },
    onError: () => showToast.error('Failed to add keyword'),
  });

  const removeMutation = useMutation({
    mutationFn: (keyword: string) => adminService.removeModerationKeyword(keyword),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'moderation-keywords'] });
      showToast.success('Keyword removed');
    },
    onError: () => showToast.error('Failed to remove keyword'),
  });

  const handleAdd = () => {
    const kw = newKeyword.trim().toLowerCase();
    if (!kw) return;
    if (keywords.includes(kw)) {
      showToast.error('Keyword already exists');
      return;
    }
    addMutation.mutate(kw);
  };

  return (
    <DashboardLayout
      requiredRole={['ADMIN', 'SUPER_ADMIN']}
      requiredPermission="moderation.keywords.view"
    >
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-[var(--text)]">Content Moderation</h1>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            Manage blocked keywords for automated content screening. Job postings and candidate
            profiles are screened against these keywords.
          </p>
        </div>

        {/* Info banner */}
        <Card className="border-[var(--warning-light)] bg-[var(--warning-light)]/10">
          <div className="flex items-start gap-3 p-4">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-[var(--warning-dark)]" />
            <div className="text-sm text-[var(--text-secondary)]">
              <p className="font-medium text-[var(--text)]">How moderation works</p>
              <p className="mt-1">
                When a job posting or candidate profile is created or updated, the content is
                screened against the keyword list below. If prohibited terms are found with medium
                or high severity, the submission is blocked and the user is asked to revise their
                content.
              </p>
            </div>
          </div>
        </Card>

        {/* Add keyword — hidden entirely without `moderation.keywords.add`,
            which the read-only auditor role deliberately lacks. */}
        <Can permission={PERM.MODERATION_KEYWORDS_ADD}>
          <Card>
            <div className="p-6">
              <h2 className="text-lg font-semibold text-[var(--text)]">Add Keyword</h2>
              <div className="mt-4 flex gap-3">
                <Input
                  placeholder="Enter keyword or phrase..."
                  value={newKeyword}
                  onChange={(e) => setNewKeyword(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
                  className="max-w-md"
                />
                <Button
                  tooltip="Add keyword to block list"
                  onClick={handleAdd}
                  disabled={!newKeyword.trim() || addMutation.isPending}
                  isLoading={addMutation.isPending}
                >
                  <Plus className="mr-1.5 h-4 w-4" />
                  Add
                </Button>
              </div>
            </div>
          </Card>
        </Can>

        {/* Keyword list */}
        <Card>
          <div className="p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-[var(--text)]">
                <Shield className="text-primary mr-2 inline-block h-5 w-5" />
                Blocked Keywords
              </h2>
              <Badge variant="info">{keywords.length} keywords</Badge>
            </div>

            {isLoading ? (
              <div className="mt-4 flex flex-wrap gap-2">
                {Array.from({ length: 8 }).map((_, i) => (
                  <Skeleton key={i} className="h-8 w-24 rounded-full" />
                ))}
              </div>
            ) : keywords.length === 0 ? (
              <p className="mt-4 text-sm text-[var(--text-muted)]">
                No blocked keywords configured. Add keywords above to enable content screening.
              </p>
            ) : (
              <div className="mt-4 flex flex-wrap gap-2">
                {keywords.map((keyword) => (
                  <span
                    key={keyword}
                    className="inline-flex items-center gap-1.5 rounded-full bg-[var(--bg-secondary)] px-3 py-1.5 text-sm font-medium text-[var(--text)]"
                  >
                    {keyword}
                    <Can permission={PERM.MODERATION_KEYWORDS_REMOVE}>
                      <Tooltip content={`Remove "${keyword}"`}>
                        <button
                          onClick={() => removeMutation.mutate(keyword)}
                          disabled={removeMutation.isPending}
                          className="ml-0.5 rounded-full p-0.5 transition-colors hover:bg-[var(--error-light)] hover:text-[var(--error-dark)]"
                          aria-label={`Remove "${keyword}"`}
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </Tooltip>
                    </Can>
                  </span>
                ))}
              </div>
            )}
          </div>
        </Card>
      </div>
    </DashboardLayout>
  );
}
