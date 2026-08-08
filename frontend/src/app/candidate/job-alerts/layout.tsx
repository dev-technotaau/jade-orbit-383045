import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Job Alerts',
};

export default function CandidateJobAlertsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
