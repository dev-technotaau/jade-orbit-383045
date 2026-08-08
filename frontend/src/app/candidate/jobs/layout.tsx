import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Browse Jobs',
};

export default function CandidateJobsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
