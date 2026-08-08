import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Profile Preview',
};

export default function EmployerProfilePreviewLayout({ children }: { children: React.ReactNode }) {
  return children;
}
