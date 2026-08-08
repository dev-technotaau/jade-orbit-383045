import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Login',
  description: 'Sign in to your Hire Adda account to find jobs or hire talent.',
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
