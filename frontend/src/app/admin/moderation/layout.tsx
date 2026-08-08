import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Content Moderation',
};

export default function AdminModerationLayout({ children }: { children: React.ReactNode }) {
  return children;
}
