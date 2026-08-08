import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'My Applications',
};

export default function CandidateApplicationsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
