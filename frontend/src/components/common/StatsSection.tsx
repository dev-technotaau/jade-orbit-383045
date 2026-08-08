'use client';

import { useEffect, useState } from 'react';
import api from '@/lib/api';
import { API } from '@/constants/api';

interface PublicStats {
  activeJobs: number;
  companies: number;
  candidates: number;
  /** Applications submitted — a fully on-platform action, so always accurate. */
  applications: number;
}

const fallbackStats: PublicStats = {
  activeJobs: 0,
  companies: 0,
  candidates: 0,
  applications: 0,
};

function formatNumber(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(/\.0$/, '')}k+`;
  return `${n}+`;
}

export default function StatsSection({ variant = 'inline' }: { variant?: 'inline' | 'card' }) {
  const [stats, setStats] = useState<PublicStats>(fallbackStats);

  useEffect(() => {
    api
      .get(API.PUBLIC_STATS)
      .then((res) => setStats(res.data?.data ?? fallbackStats))
      .catch(() => {});
  }, []);

  const items = [
    { label: 'Active Jobs', value: formatNumber(stats.activeJobs), color: 'text-primary' },
    { label: 'Companies', value: formatNumber(stats.companies), color: 'text-secondary' },
    { label: 'Candidates', value: formatNumber(stats.candidates), color: 'text-accent' },
    {
      // Was "Successful Placements", which counted applications marked HIRED.
      // The final hire happens off-platform so that status is rarely set and
      // the figure was misleading. Applications are created on-platform.
      label: variant === 'card' ? 'Applications Submitted' : 'Applications',
      value: formatNumber(stats.applications),
      color: 'text-primary',
    },
  ];

  if (variant === 'card') {
    return (
      <div className="grid grid-cols-2 gap-8 lg:grid-cols-4">
        {items.map((stat) => (
          <div
            key={stat.label}
            className="rounded-xl border border-[var(--border)] bg-white p-6 text-center"
          >
            <div className={`${stat.color} text-3xl font-bold sm:text-4xl`}>{stat.value}</div>
            <div className="mt-2 text-sm font-medium text-[var(--text-muted)]">{stat.label}</div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-center gap-8 px-4 sm:gap-16">
      {items.map((stat) => (
        <div key={stat.label} className="text-center">
          <div className={`${stat.color} text-2xl font-bold sm:text-3xl`}>{stat.value}</div>
          <div className="mt-1 text-sm text-[var(--text-muted)]">{stat.label}</div>
        </div>
      ))}
    </div>
  );
}
