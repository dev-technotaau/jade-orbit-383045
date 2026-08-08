import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'System Configuration',
};

export default function SuperAdminConfigLayout({ children }: { children: React.ReactNode }) {
  return children;
}
