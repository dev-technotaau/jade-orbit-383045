import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Applications',
};

export default function AdminApplicationsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
