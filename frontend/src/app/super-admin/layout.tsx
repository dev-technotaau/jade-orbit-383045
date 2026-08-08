import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: {
    template: '%s | Super Admin — Hire Adda',
    default: 'Super Admin Dashboard | Hire Adda',
  },
  robots: { index: false, follow: false },
};

export default function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  return children;
}
