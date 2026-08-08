import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Manage Jobs',
};

export default function EmployerJobsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
