import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Support Tickets',
};

export default function SuperAdminTicketsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
