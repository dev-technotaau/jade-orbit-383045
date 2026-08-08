import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Job Applications',
};

export default function EmployerJobApplicationsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
