import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Platform Analytics',
};

export default function SuperAdminAnalyticsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
