import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Notifications | Hire Adda',
  description: 'View and manage your notifications on Hire Adda.',
  robots: { index: false, follow: false },
};

export default function NotificationsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
