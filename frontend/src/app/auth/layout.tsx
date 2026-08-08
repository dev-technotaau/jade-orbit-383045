import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: {
    template: '%s | Hire Adda',
    default: 'Authentication | Hire Adda',
  },
  description: 'Sign in or create your account on Hire Adda to find jobs or hire talent.',
  robots: { index: false, follow: false },
};

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return children;
}
