import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Post New Job',
};

export default function EmployerNewJobLayout({ children }: { children: React.ReactNode }) {
  return children;
}
