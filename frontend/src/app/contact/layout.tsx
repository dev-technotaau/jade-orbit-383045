import type { Metadata } from 'next';
import { generateMetadata as buildMetadata } from '@/components/common/SEO';

export const metadata: Metadata = buildMetadata({
  title: 'Contact Us',
  description:
    "Get in touch with the Hire Adda team. We're here to help with your job search or hiring needs.",
  keywords: ['contact hire adda', 'support', 'help', 'customer service'],
  url: '/contact',
});

export default function ContactLayout({ children }: { children: React.ReactNode }) {
  return children;
}
