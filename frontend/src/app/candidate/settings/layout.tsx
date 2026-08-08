import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Settings',
};

export default function CandidateSettingsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
