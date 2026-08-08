'use client';

import { ToggleLeft, ToggleRight, Hash, Type, RefreshCw } from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import Card from '@/components/ui/Card';
import Skeleton from '@/components/ui/Skeleton';
import Button from '@/components/ui/Button';
import EmptyState from '@/components/ui/EmptyState';
import Tooltip from '@/components/ui/Tooltip';
import { useAllFeatureFlags } from '@/hooks/use-feature-flags';

function FlagIcon({ value }: { value: boolean | string | number }) {
  if (typeof value === 'boolean') {
    return value ? (
      <ToggleRight className="h-5 w-5 text-green-500" />
    ) : (
      <ToggleLeft className="h-5 w-5 text-[var(--text-muted)]" />
    );
  }
  if (typeof value === 'number') return <Hash className="h-5 w-5 text-blue-500" />;
  return <Type className="h-5 w-5 text-amber-500" />;
}

function FlagValue({ value }: { value: boolean | string | number }) {
  if (typeof value === 'boolean') {
    return (
      <span
        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
          value
            ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
            : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
        }`}
      >
        {value ? 'Enabled' : 'Disabled'}
      </span>
    );
  }
  return <span className="font-mono text-sm text-[var(--text)]">{String(value)}</span>;
}

export default function FeatureFlagsPage() {
  const { data: flags, isLoading, refetch, isFetching } = useAllFeatureFlags();

  if (isLoading) {
    return (
      <DashboardLayout
        requiredRole={['ADMIN', 'SUPER_ADMIN']}
        requiredPermission="platform.feature_flags.view"
      >
        <div className="space-y-6">
          <Skeleton variant="rect" height={60} />
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} variant="rect" height={56} />
          ))}
        </div>
      </DashboardLayout>
    );
  }

  const flagEntries = flags ? Object.entries(flags) : [];

  return (
    <DashboardLayout
      requiredRole={['ADMIN', 'SUPER_ADMIN']}
      requiredPermission="platform.feature_flags.view"
    >
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[var(--text)]">Feature Flags</h1>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              View current feature flag values from Firebase Remote Config. Flags are managed via
              the Firebase console.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            tooltip="Refresh feature flags from Firebase"
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>

        {/* Flags Table */}
        {flagEntries.length === 0 ? (
          <EmptyState
            title="No Feature Flags"
            description="No feature flags are configured. Add flags via the Firebase Remote Config console."
          />
        ) : (
          <Card>
            <div className="divide-y divide-[var(--border)]">
              {/* Table Header */}
              <div className="grid grid-cols-12 gap-4 px-4 py-3 text-xs font-medium tracking-wider text-[var(--text-muted)] uppercase">
                <div className="col-span-1">Type</div>
                <div className="col-span-5">Flag Key</div>
                <div className="col-span-3">Value</div>
                <div className="col-span-3">Status</div>
              </div>

              {/* Table Rows */}
              {flagEntries.map(([key, value]) => (
                <div
                  key={key}
                  className="grid grid-cols-12 items-center gap-4 px-4 py-3 transition-colors hover:bg-[var(--bg-secondary)]"
                >
                  <div className="col-span-1">
                    <FlagIcon value={value} />
                  </div>
                  <div className="col-span-5">
                    <span className="font-mono text-sm text-[var(--text)]">{key}</span>
                  </div>
                  <div className="col-span-3">
                    <FlagValue value={value} />
                  </div>
                  <div className="col-span-3 text-sm text-[var(--text-muted)]">
                    {typeof value === 'boolean'
                      ? value
                        ? 'Active'
                        : 'Inactive'
                      : typeof value === 'number'
                        ? 'Numeric config'
                        : 'String config'}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Info Card */}
        <Card padding="sm">
          <p className="text-sm text-[var(--text-muted)]">
            Feature flags are sourced from Firebase Remote Config and cached for 5 minutes. To
            modify flags, visit the{' '}
            <Tooltip content="Open Firebase Console to manage Remote Config" inline>
              <a
                href="https://console.firebase.google.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary cursor-pointer hover:underline"
              >
                Firebase Console
              </a>
            </Tooltip>{' '}
            and update Remote Config parameters.
          </p>
        </Card>
      </div>
    </DashboardLayout>
  );
}
