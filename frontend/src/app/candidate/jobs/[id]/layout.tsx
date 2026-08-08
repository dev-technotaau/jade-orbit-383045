import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Job Details',
};

export default function CandidateJobDetailsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
