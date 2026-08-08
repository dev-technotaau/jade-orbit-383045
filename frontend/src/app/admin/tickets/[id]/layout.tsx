import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Ticket Details',
};

export default function AdminTicketDetailsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
