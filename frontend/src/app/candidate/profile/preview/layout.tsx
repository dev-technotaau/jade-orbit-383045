import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Profile Preview',
};

export default function CandidateProfilePreviewLayout({ children }: { children: React.ReactNode }) {
  return children;
}
