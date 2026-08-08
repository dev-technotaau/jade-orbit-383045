import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Search Candidates',
};

export default function EmployerCandidatesLayout({ children }: { children: React.ReactNode }) {
  return children;
}
