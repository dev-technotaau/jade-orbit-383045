import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Saved Candidates',
};

export default function EmployerSavedCandidatesLayout({ children }: { children: React.ReactNode }) {
  return children;
}
