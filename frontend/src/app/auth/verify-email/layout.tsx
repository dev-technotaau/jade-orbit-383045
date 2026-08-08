import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Verify Email',
  description: 'Verify your email address to activate your Hire Adda account.',
};

export default function VerifyEmailLayout({ children }: { children: React.ReactNode }) {
  return children;
}
