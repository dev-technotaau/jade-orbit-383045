import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Support Tickets',
};

export default function AdminTicketsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
