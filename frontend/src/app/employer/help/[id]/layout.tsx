import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Help Article',
};

export default function EmployerHelpArticleLayout({ children }: { children: React.ReactNode }) {
  return children;
}
