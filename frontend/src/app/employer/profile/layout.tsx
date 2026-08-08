import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Company Profile',
};

export default function EmployerProfileLayout({ children }: { children: React.ReactNode }) {
  return children;
}
