import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Email Templates',
};

export default function AdminEmailTemplatesLayout({ children }: { children: React.ReactNode }) {
  return children;
}
