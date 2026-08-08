import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: {
    template: '%s | Employer Portal — Hire Adda',
    default: 'Employer Dashboard | Hire Adda',
  },
  description: 'Post jobs, manage applications, and find top candidates on Hire Adda.',
  robots: { index: false, follow: false },
};

export default function EmployerLayout({ children }: { children: React.ReactNode }) {
  return children;
}
