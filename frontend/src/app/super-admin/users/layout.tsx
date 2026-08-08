import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'User Management',
};

export default function SuperAdminUsersLayout({ children }: { children: React.ReactNode }) {
  return children;
}
