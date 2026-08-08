import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Job Management',
};

export default function AdminJobsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
