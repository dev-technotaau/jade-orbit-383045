import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: {
    template: '%s | Candidate Portal — Hire Adda',
    default: 'Candidate Dashboard | Hire Adda',
  },
  description: 'Manage your job applications, profile, and career opportunities on Hire Adda.',
  robots: { index: false, follow: false },
};

export default function CandidateLayout({ children }: { children: React.ReactNode }) {
  return children;
}
