import type { Metadata } from 'next';

/**
 * Employment verification is a signed-token one-off flow — the URL only
 * means anything when the token is valid, and the content is specific to
 * the verifier who received the link. No SEO value + privacy-sensitive =
 * explicit noindex, no-follow, no-cache, no-image-index.
 */
export const metadata: Metadata = {
  title: 'Verify Employment',
  description: 'Employment verification page — access requires a signed token.',
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: {
      index: false,
      follow: false,
      noimageindex: true,
    },
  },
};

export default function VerifyEmploymentLayout({ children }: { children: React.ReactNode }) {
  return children;
}
