import type { Metadata } from 'next';
import { generateMetadata as buildMetadata } from '@/components/common/SEO';

export const metadata: Metadata = buildMetadata({
  title: 'Help Center',
  description:
    'Find answers to common questions about using Hire Adda. Browse FAQs and get support.',
  keywords: ['help', 'FAQ', 'support', 'hire adda help center'],
  url: '/help',
});

export default function HelpLayout({ children }: { children: React.ReactNode }) {
  return children;
}
