import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Help Article',
};

export default function CandidateHelpArticleLayout({ children }: { children: React.ReactNode }) {
  return children;
}
