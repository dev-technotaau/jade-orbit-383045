import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'User Details',
};

export default function AdminUserDetailsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
