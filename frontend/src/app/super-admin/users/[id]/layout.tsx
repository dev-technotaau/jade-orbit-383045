import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'User Details',
};

export default function SuperAdminUserDetailsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
