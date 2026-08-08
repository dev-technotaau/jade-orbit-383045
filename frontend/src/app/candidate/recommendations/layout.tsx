import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Recommendations',
};

export default function CandidateRecommendationsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
