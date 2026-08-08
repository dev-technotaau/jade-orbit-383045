import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Register',
  description: 'Create your Hire Adda account to start finding jobs or hiring talent.',
};

export default function RegisterLayout({ children }: { children: React.ReactNode }) {
  return children;
}
