import PublicLayout from '@/components/layout/PublicLayout';
import Breadcrumbs from '@/components/common/Breadcrumbs';
import JsonLd from '@/components/seo/JsonLd';
import { generateMetadata as buildMetadata } from '@/components/common/SEO';
import { breadcrumbSchema, graph, webPageSchema } from '@/lib/json-ld';
import type { Metadata } from 'next';

export const metadata: Metadata = buildMetadata({
  title: 'Privacy Policy',
  description:
    'Read the Hire Adda privacy policy. Learn how we collect, use, and protect your personal information.',
  url: '/privacy',
});

const privacyJsonLd = graph(
  webPageSchema({
    url: '/privacy',
    name: 'Privacy Policy',
    description:
      'How Hire Adda collects, uses, stores, and protects personal information, and your rights as a data subject.',
    dateModified: '2026-02-01',
    speakableCssSelectors: ['h1'],
  }),
  breadcrumbSchema([
    { name: 'Home', url: '/' },
    { name: 'Privacy Policy', url: '/privacy' },
  ]),
);

const sections = [
  {
    title: 'Information We Collect',
    content:
      'We collect information you provide directly to us when you create an account, complete your profile, apply for jobs, post job listings, or contact our support team. This includes your name, email address, phone number, postal address, resume, work experience, educational background, skills, salary expectations, and any other information you choose to provide. We also automatically collect certain technical information when you use our platform, including your IP address, browser type, operating system, device identifiers, pages visited, time spent on pages, and referring URLs. If you use our mobile-optimized website, we may collect information about your device model and operating system version.',
  },
  {
    title: 'How We Use Your Information',
    content:
      'We use the information we collect to provide, maintain, and improve our services, including matching candidates with job opportunities, facilitating the application process, and enabling employers to find suitable candidates. Your information helps us personalize your experience, recommend relevant jobs or candidates, send notifications about application status updates, and communicate important platform changes. We also use aggregated and anonymized data for analytics, research, and to understand usage trends. We may use your email address or phone number to send service-related communications, promotional offers, and marketing materials, which you can opt out of at any time through your notification preferences.',
  },
  {
    title: 'Information Sharing',
    content:
      'When you apply for a job, your profile information and resume are shared with the employer who posted the listing. Employers who post jobs may have their company information visible to all platform users. We do not sell your personal information to third parties. We may share your information with trusted service providers who assist us in operating our platform, such as cloud hosting providers, email delivery services, payment processors, and analytics tools. These providers are bound by contractual obligations to keep your information confidential and use it only for the purposes we specify. We may also disclose your information if required by law, in response to legal process, or to protect the rights, property, or safety of Hire Adda, our users, or the public.',
  },
  {
    title: 'Data Security',
    content:
      'We implement industry-standard security measures to protect your personal information from unauthorized access, alteration, disclosure, or destruction. These measures include encryption of data in transit using TLS/SSL, encryption of sensitive data at rest, regular security audits and vulnerability assessments, access controls and authentication mechanisms, and secure data backup procedures. While we strive to protect your personal information, no method of transmission over the Internet or electronic storage is completely secure. We cannot guarantee absolute security, but we continuously monitor and update our security practices to address emerging threats.',
  },
  {
    title: 'Cookies',
    content:
      'Hire Adda uses cookies and similar tracking technologies to enhance your browsing experience, analyze platform usage, and deliver personalized content. Essential cookies are required for the platform to function properly, including session management, authentication, and security features. Analytics cookies help us understand how users interact with our platform, which pages are most popular, and where users encounter issues. Preference cookies remember your settings and choices, such as language preference and notification settings. You can manage your cookie preferences through your browser settings. Please note that disabling certain cookies may affect the functionality of our platform.',
  },
  {
    title: 'Your Rights',
    content:
      'You have the right to access, update, or delete your personal information at any time through your account settings. You may request a copy of all personal data we hold about you by contacting our support team. You have the right to withdraw consent for data processing where consent is the legal basis for processing. You may object to the processing of your personal information for direct marketing purposes. You have the right to data portability, allowing you to receive your data in a structured, commonly used format. If you are located in the European Economic Area, you have additional rights under the GDPR, including the right to lodge a complaint with a supervisory authority. Indian residents have rights under the Digital Personal Data Protection Act, 2023, which we fully comply with.',
  },
  {
    title: 'Data Retention',
    content:
      'We retain your personal information for as long as your account is active or as needed to provide you with our services. If you request account deletion, we will delete or anonymize your personal data within 30 days, except where we are required to retain certain information for legal, regulatory, or legitimate business purposes. Job application records are retained for up to 2 years after the associated job posting is closed, unless you request earlier deletion. Anonymized and aggregated data that cannot be used to identify you may be retained indefinitely for analytics and research purposes. We periodically review our data retention practices to ensure we are not holding data longer than necessary.',
  },
  {
    title: "Children's Privacy",
    content:
      'Hire Adda is not intended for use by individuals under the age of 18. We do not knowingly collect personal information from children under 18 years of age. If we discover that we have inadvertently collected information from a child under 18, we will take immediate steps to delete that information from our servers. If you are a parent or guardian and believe your child has provided us with personal information, please contact us immediately at privacy@hireadda.in so we can take appropriate action.',
  },
  {
    title: 'Changes to This Policy',
    content:
      'We may update this Privacy Policy from time to time to reflect changes in our practices, technologies, legal requirements, or other factors. When we make material changes, we will notify you through a prominent notice on our platform, via email to the address associated with your account, or through other appropriate communication channels. We encourage you to review this Privacy Policy periodically to stay informed about how we protect your information. Your continued use of Hire Adda after the effective date of any changes constitutes your acceptance of the updated policy.',
  },
  {
    title: 'Contact Us',
    content:
      'If you have questions, concerns, or requests regarding this Privacy Policy or our data practices, please contact our Data Protection Officer at privacy@hireadda.in. You can also reach us by mail at Opportunity Makers Group, Tricity Plaza, Peer Muchalla, Chandigarh, India 160104. For general support inquiries, contact support@hireadda.in or call our toll-free number at +91 1762469136. We aim to respond to all privacy-related inquiries within 7 business days.',
  },
];

export default function PrivacyPage() {
  return (
    <PublicLayout>
      <JsonLd id="jsonld-privacy" data={privacyJsonLd} />
      {/* Hero Section */}
      <section className="from-primary-50 under-public-header relative overflow-hidden bg-gradient-to-br via-white to-[var(--accent-light)]">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
          <div className="mx-auto max-w-3xl text-center">
            <h1 className="text-4xl font-bold tracking-tight text-[var(--text)] sm:text-5xl">
              Privacy Policy
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
              At Opportunity Makers Group (&quot;Hire Adda,&quot; &quot;we,&quot; &quot;us,&quot; or
              &quot;our&quot;), we are committed to protecting the privacy and security of your
              personal information. This Privacy Policy describes how we collect, use, share, and
              protect information when you use our website, mobile applications, and related
              services (collectively, the &quot;Platform&quot;). By using Hire Adda, you agree to
              the collection and use of information in accordance with this policy.
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
                This Privacy Policy is effective as of February 1, 2026. Opportunity Makers Group is
                a sole proprietorship (proprietor: Harpreet Kaur) registered under the laws of India
                with its registered office in Chandigarh.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Breadcrumbs — bottom placement, narrow rail matches the
          policy's max-w-4xl content column above. */}
      <div className="border-t border-[var(--border)] bg-white">
        <div className="mx-auto max-w-4xl px-4 py-4 sm:px-6 lg:px-8">
          <Breadcrumbs items={[{ name: 'Privacy Policy' }]} withSchema={false} />
        </div>
      </div>
    </PublicLayout>
  );
}
