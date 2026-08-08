import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: {
    template: '%s | Admin — Hire Adda',
    default: 'Admin Dashboard | Hire Adda',
  },
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return children;
}
