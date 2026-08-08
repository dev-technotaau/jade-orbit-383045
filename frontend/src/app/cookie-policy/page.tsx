import PublicLayout from '@/components/layout/PublicLayout';
import Breadcrumbs from '@/components/common/Breadcrumbs';
import JsonLd from '@/components/seo/JsonLd';
import { generateMetadata as buildMetadata } from '@/components/common/SEO';
import { breadcrumbSchema, graph, webPageSchema } from '@/lib/json-ld';
import type { Metadata } from 'next';

export const metadata: Metadata = buildMetadata({
  title: 'Cookie Policy',
  description:
    'Learn how Hire Adda uses cookies and similar technologies to improve your experience on our job portal platform.',
  url: '/cookie-policy',
});

const cookieJsonLd = graph(
  webPageSchema({
    url: '/cookie-policy',
    name: 'Cookie Policy',
    description:
      'How Hire Adda uses cookies — essential, functional, analytical, and marketing categories — and how you can manage them.',
    dateModified: '2026-02-01',
    speakableCssSelectors: ['h1'],
  }),
  breadcrumbSchema([
    { name: 'Home', url: '/' },
    { name: 'Cookie Policy', url: '/cookie-policy' },
  ]),
);

const sections = [
  {
    title: 'What Are Cookies',
    content:
      'Cookies are small text files that are placed on your device (computer, tablet, or mobile phone) when you visit a website. They are widely used to make websites work more efficiently, provide a better browsing experience, and supply information to website owners. Cookies can be "persistent" (remaining on your device until they expire or you delete them) or "session" cookies (deleted when you close your browser). First-party cookies are set by the website you are visiting, while third-party cookies are set by a domain other than the one you are visiting.',
  },
  {
    title: 'How We Use Cookies',
    content:
      'Hire Adda uses cookies and similar technologies for several purposes: to keep you signed in to your account, to remember your preferences and settings, to understand how you use our platform so we can improve it, to deliver relevant job recommendations, to measure the effectiveness of our communications, and to protect against fraudulent or unauthorized activity. We also use cookies to provide analytics that help us understand platform usage patterns and optimize performance.',
  },
  {
    title: 'Types of Cookies We Use',
    content:
      'We use the following categories of cookies: (a) Strictly Necessary Cookies — essential for you to navigate our platform and use its features, such as accessing secure areas and maintaining your session. These cannot be disabled. (b) Functional Cookies — remember your preferences (such as language, location, and display settings) to provide a personalized experience. (c) Analytics Cookies — help us understand how visitors interact with our platform by collecting and reporting information anonymously using tools such as Google Analytics 4. (d) Marketing Cookies — used to deliver advertisements relevant to you and measure the effectiveness of our advertising campaigns. These may be set by our advertising partners.',
  },
  {
    title: 'Cookie Consent and Management',
    content:
      'When you first visit Hire Adda, you will see a cookie consent banner that allows you to accept or customize your cookie preferences. You can change your preferences at any time through the cookie settings accessible from the footer of our website. You can also control cookies through your browser settings. Most browsers allow you to block or delete cookies, but doing so may affect the functionality of our platform. Note that strictly necessary cookies cannot be disabled as they are required for the platform to function properly.',
  },
  {
    title: 'Third-Party Cookies',
    content:
      'Some cookies on our platform are set by third-party services that appear on our pages. We use services from Google (Analytics, reCAPTCHA), Cloudflare (security and performance), Firebase (authentication and push notifications), and social media platforms (for login and sharing features). These third parties may use cookies to collect information about your online activities across different websites. We do not control these third-party cookies. Please refer to the respective privacy policies of these third parties for more information about their cookie practices.',
  },
  {
    title: 'Local Storage and Similar Technologies',
    content:
      'In addition to cookies, we use similar technologies such as local storage, session storage, and IndexedDB to store data on your device. These technologies are used to save your authentication tokens, cache application data for faster loading, store your theme preferences, and maintain your feature flag configurations. Like cookies, you can clear this data through your browser settings, but doing so will require you to log in again and may reset your preferences.',
  },
  {
    title: 'Data Collected Through Cookies',
    content:
      'The information collected through cookies may include your IP address, browser type and version, operating system, referring URL, pages visited on our platform, time and date of your visit, time spent on each page, and other diagnostic data. This information is used in aggregate form to analyze trends, administer the platform, and gather demographic information. We do not use cookies to collect personally identifiable information unless you have consented to it. All data collected through cookies is handled in accordance with our Privacy Policy.',
  },
  {
    title: 'Updates to This Policy',
    content:
      'We may update this Cookie Policy from time to time to reflect changes in technology, legislation, or our data practices. When we make material changes, we will notify you by updating the "Last updated" date at the top of this page and, where appropriate, through a notification on our platform. We encourage you to review this policy periodically to stay informed about how we use cookies.',
  },
  {
    title: 'Contact Us',
    content:
      'If you have any questions about our use of cookies or this Cookie Policy, please contact us at privacy@hireadda.in. You may also write to our Data Protection Officer at Opportunity Makers Group, Tricity Plaza, Peer Muchalla, Chandigarh, India 160104. For general support, reach out to support@hireadda.in or call +91 1762469136.',
  },
];

export default function CookiePolicyPage() {
  return (
    <PublicLayout>
      <JsonLd id="jsonld-cookie-policy" data={cookieJsonLd} />
      {/* Hero Section */}
      <section className="from-primary-50 under-public-header relative overflow-hidden bg-gradient-to-br via-white to-[var(--accent-light)]">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
          <div className="mx-auto max-w-3xl text-center">
            <h1 className="text-4xl font-bold tracking-tight text-[var(--text)] sm:text-5xl">
              Cookie Policy
            </h1>
            <p className="mt-4 text-[var(--text-secondary)]">
              Last updated:{' '}
              <time dateTime="2026-02-01" className="font-medium">
                February 2026
              </time>
            </p>
            <p className="mt-2 text-sm text-[var(--text-muted)]">
              Authored by Hire Adda Legal · Reviewed by Privacy &amp; Compliance team
            </p>
          </div>
        </div>
      </section>

      {/* Content */}
      <section className="bg-white py-12 sm:py-16">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
          <div className="rounded-xl border border-[var(--border)] bg-white p-6 sm:p-10">
            <p className="leading-relaxed text-[var(--text-secondary)]">
              This Cookie Policy explains how Opportunity Makers Group (&quot;Hire Adda,&quot;
              &quot;we,&quot; &quot;us,&quot; or &quot;our&quot;) uses cookies and similar tracking
              technologies when you visit our platform. This policy should be read alongside our
              Privacy Policy, which provides further details on how we process your personal data.
            </p>

            <div className="mt-10 space-y-10">
              {sections.map((section, index) => (
                <div key={section.title}>
                  <h2 className="text-xl font-semibold text-[var(--text)]">
                    {index + 1}. {section.title}
                  </h2>
                  <p className="mt-3 leading-relaxed text-[var(--text-secondary)]">
                    {section.content}
                  </p>
                </div>
              ))}
            </div>

            <div className="mt-10 border-t border-[var(--border)] pt-6">
              <p className="text-sm text-[var(--text-muted)]">
                This Cookie Policy is effective as of February 1, 2026. Opportunity Makers Group is
                a sole proprietorship (proprietor: Harpreet Kaur) registered under the laws of India
                with its registered office in Chandigarh. By continuing to use our platform, you
                consent to the use of cookies as described in this policy.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Breadcrumbs — bottom placement, narrow rail. */}
      <div className="border-t border-[var(--border)] bg-white">
        <div className="mx-auto max-w-4xl px-4 py-4 sm:px-6 lg:px-8">
          <Breadcrumbs items={[{ name: 'Cookie Policy' }]} withSchema={false} />
        </div>
      </div>
    </PublicLayout>
  );
}
