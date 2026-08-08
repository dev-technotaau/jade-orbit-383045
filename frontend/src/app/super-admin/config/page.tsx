'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Settings, Save, RefreshCw, Search } from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Skeleton from '@/components/ui/Skeleton';
import EmptyState from '@/components/ui/EmptyState';
import Tooltip from '@/components/ui/Tooltip';
import { showToast } from '@/components/ui/Toast';
import { adminService } from '@/services/admin.service';
import type { SystemConfig } from '@/types/admin';
import type { ApiError } from '@/types/api';

export default function SystemConfigPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [editedConfigs, setEditedConfigs] = useState<Record<string, string>>({});

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'system-config'],
    queryFn: () => adminService.getSystemConfig(),
  });

  const configs: SystemConfig[] = data?.data || [];

  const filtered = search
    ? configs.filter(
        (c) =>
          c.key.toLowerCase().includes(search.toLowerCase()) ||
          c.description?.toLowerCase().includes(search.toLowerCase()),
      )
    : configs;

  const updateMutation = useMutation({
    mutationFn: ({ key, value }: { key: string; value: string }) =>
      adminService.updateSystemConfig(key, value),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'system-config'] });
      showToast.success(`Config "${variables.key}" updated`);
      setEditedConfigs((prev) => {
        const next = { ...prev };
        delete next[variables.key];
        return next;
      });
    },
    onError: (err) => {
      const error = err as unknown as ApiError;
      showToast.error(error.message || 'Failed to update config');
    },
  });

  return (
    <DashboardLayout
      requiredRole={['ADMIN', 'SUPER_ADMIN']}
      requiredPermission="platform.system_config.view"
    >
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[var(--text)]">System Configuration</h1>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              Manage system-wide settings and parameters
            </p>
          </div>
          <Button
            variant="outline"
            leftIcon={<RefreshCw className="h-4 w-4" />}
            onClick={() => queryClient.invalidateQueries({ queryKey: ['admin', 'system-config'] })}
            tooltip="Reload configuration from server"
          >
            Refresh
          </Button>
        </div>

        <div className="relative max-w-md">
          <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
          <input
            type="text"
            placeholder="Search config keys..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="focus:border-primary focus:ring-primary/20 h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] pr-4 pl-10 text-sm text-[var(--text)] placeholder:text-[var(--text-muted)] focus:ring-2 focus:outline-none"
          />
        </div>

        <Card variant="bordered">
          {isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                <div key={i} className="h-20 animate-pulse rounded-lg bg-[var(--bg-secondary)]" />
              ))}
            </div>
          ) : filtered.length > 0 ? (
            <div className="divide-y divide-[var(--border)]">
              {filtered.map((config) => (
                <div key={config.key} className="py-4 first:pt-0 last:pb-0">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                    <div className="flex-1">
                      <label className="mb-1 block text-sm font-medium text-[var(--text)]">
                        {config.key}
                      </label>
                      {config.description && (
                        <p className="mb-2 text-xs text-[var(--text-muted)]">
                          {config.description}
                        </p>
                      )}
                      <input
                        type="text"
                        value={editedConfigs[config.key] ?? config.value}
                        onChange={(e) =>
                          setEditedConfigs((prev) => ({
                            ...prev,
                            [config.key]: e.target.value,
                          }))
                        }
                        className="focus:border-primary focus:ring-primary/20 h-9 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 text-sm text-[var(--text)] focus:ring-2 focus:outline-none"
                      />
                    </div>
                    {editedConfigs[config.key] !== undefined &&
                      editedConfigs[config.key] !== config.value && (
                        <Button
                          size="sm"
                          leftIcon={<Save className="h-3.5 w-3.5" />}
                          onClick={() =>
                            updateMutation.mutate({
                              key: config.key,
                              value: editedConfigs[config.key],
                            })
                          }
                          isLoading={updateMutation.isPending}
                          className="shrink-0"
                          tooltip="Save this configuration value"
                        >
                          Save
                        </Button>
                      )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={Settings}
              title="No configurations"
              description={
                search ? 'No configs match your search.' : 'No system configurations found.'
              }
            />
          )}
        </Card>
      </div>
    </DashboardLayout>
  );
}
