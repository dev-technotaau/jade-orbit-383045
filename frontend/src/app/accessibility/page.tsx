import PublicLayout from '@/components/layout/PublicLayout';
import Breadcrumbs from '@/components/common/Breadcrumbs';
import JsonLd from '@/components/seo/JsonLd';
import { generateMetadata as buildMetadata } from '@/components/common/SEO';
import { breadcrumbSchema, graph, webPageSchema } from '@/lib/json-ld';
import type { Metadata } from 'next';

export const metadata: Metadata = buildMetadata({
  title: 'Accessibility Statement',
  description:
    'Hire Adda is committed to making our platform accessible to all users, including people with disabilities.',
  url: '/accessibility',
});

const accessibilityJsonLd = graph(
  webPageSchema({
    url: '/accessibility',
    name: 'Accessibility Statement',
    description:
      'Hire Adda conforms to WCAG 2.1 Level AA — our commitments, testing methodology, supported assistive technologies, and how to report accessibility issues.',
    dateModified: '2026-02-01',
    speakableCssSelectors: ['h1'],
  }),
  breadcrumbSchema([
    { name: 'Home', url: '/' },
    { name: 'Accessibility', url: '/accessibility' },
  ]),
);

const sections = [
  {
    title: 'Our Commitment',
    content:
      'Hire Adda is committed to ensuring digital accessibility for people with disabilities. We are continuously improving the user experience for everyone and applying the relevant accessibility standards to ensure we provide equal access to all users. We believe that every person, regardless of ability, should be able to search for jobs, apply to opportunities, and manage their career or hiring needs through our platform without barriers.',
  },
  {
    title: 'Accessibility Standards',
    content:
      'We aim to conform to the Web Content Accessibility Guidelines (WCAG) 2.1 at Level AA, as published by the World Wide Web Consortium (W3C). These guidelines explain how to make web content more accessible to people with a wide range of disabilities, including visual, auditory, physical, speech, cognitive, language, learning, and neurological disabilities. We also strive to comply with the Rights of Persons with Disabilities Act, 2016 (India) and other applicable accessibility regulations.',
  },
  {
    title: 'Accessibility Features',
    content:
      'Our platform includes the following accessibility features: semantic HTML markup for proper screen reader navigation, keyboard navigation support throughout the platform, sufficient color contrast ratios for text and interactive elements, alternative text for meaningful images, focus indicators for interactive elements, resizable text that does not break page layout, ARIA landmarks and labels for assistive technology, form labels and error messages that are programmatically associated with their controls, skip navigation links for keyboard users, and responsive design that adapts to different screen sizes and zoom levels.',
  },
  {
    title: 'Assistive Technology Compatibility',
    content:
      'Hire Adda is designed to be compatible with common assistive technologies. We test our platform with popular screen readers including NVDA, JAWS, and VoiceOver. Our platform supports browser zoom up to 200% without loss of content or functionality. We ensure compatibility with voice recognition software and alternative input devices. We also support high-contrast mode and respect system-level preferences for reduced motion and color scheme.',
  },
  {
    title: 'Known Limitations',
    content:
      'While we strive for full accessibility, some areas of our platform may have limitations. Third-party content and embedded services (such as video players or social media widgets) may not fully meet accessibility standards. Older PDF documents may not be fully accessible. Some dynamic content loaded via JavaScript may have brief delays before becoming accessible to screen readers. We are actively working to address these limitations and welcome your feedback to prioritize improvements.',
  },
  {
    title: 'Feedback and Assistance',
    content:
      'We welcome your feedback on the accessibility of Hire Adda. If you encounter accessibility barriers or have suggestions for improvement, please contact us through any of the following channels: email accessibility@hireadda.in, call +91 1762469136 (Mon-Fri, 9 AM - 6 PM IST), or use the contact form on our website. When reporting an accessibility issue, please include the URL of the page, a description of the issue, the assistive technology and browser you were using, and any other relevant details. We aim to acknowledge all accessibility feedback within 2 business days and resolve issues within 15 business days.',
  },
  {
    title: 'Continuous Improvement',
    content:
      'We are committed to an ongoing process of accessibility improvement. Our approach includes regular automated and manual accessibility testing, training our development team on accessible design and coding practices, including accessibility requirements in our design and development process, conducting periodic accessibility audits with external experts, engaging users with disabilities in usability testing, and monitoring and updating our accessibility practices as standards evolve. We review this statement annually and update it to reflect our progress.',
  },
  {
    title: 'Alternative Access',
    content:
      'If you are unable to access any content or feature on our platform due to a disability, we will make reasonable efforts to provide the information in an alternative format. You may request accessible versions of documents, assistance with completing forms or applications, information about job listings in an accessible format, or any other reasonable accommodation. Contact our accessibility team at accessibility@hireadda.in or call +91 1762469136 for assistance.',
  },
  {
    title: 'Legal Compliance',
    content:
      'This accessibility statement is in accordance with the Rights of Persons with Disabilities Act, 2016 (India), the Information Technology Act, 2000 and its amendments, the Guidelines for Indian Government Websites (GIGW) as applicable best practices, and the Web Content Accessibility Guidelines (WCAG) 2.1 Level AA. Opportunity Makers Group takes its accessibility obligations seriously and is committed to meeting or exceeding all applicable requirements.',
  },
];

export default function AccessibilityPage() {
  return (
    <PublicLayout>
      <JsonLd id="jsonld-accessibility" data={accessibilityJsonLd} />
      {/* Hero Section */}
      <section className="from-primary-50 under-public-header relative overflow-hidden bg-gradient-to-br via-white to-[var(--accent-light)]">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
          <div className="mx-auto max-w-3xl text-center">
            <h1 className="text-4xl font-bold tracking-tight text-[var(--text)] sm:text-5xl">
              Accessibility Statement
            </h1>
            <p className="mt-4 text-[var(--text-secondary)]">
              Last updated:{' '}
              <time dateTime="2026-02-01" className="font-medium">
                February 2026
              </time>
            </p>
            <p className="mt-2 text-sm text-[var(--text-muted)]">
              Authored by Hire Adda Accessibility Working Group · Conforms to WCAG 2.1 Level AA
            </p>
          </div>
        </div>
      </section>

      {/* Content */}
      <section className="bg-white py-12 sm:py-16">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
          <div className="rounded-xl border border-[var(--border)] bg-white p-6 sm:p-10">
            <p className="leading-relaxed text-[var(--text-secondary)]">
              Opportunity Makers Group (&quot;Hire Adda,&quot; &quot;we,&quot; &quot;us,&quot; or
              &quot;our&quot;) is committed to providing a platform that is accessible to the widest
              possible audience, regardless of technology or ability. This accessibility statement
              outlines our efforts to ensure an inclusive experience for all users.
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
                This Accessibility Statement is effective as of February 1, 2026 and was last
                reviewed on February 1, 2026. Opportunity Makers Group is registered under the laws
                of India with its registered office in Chandigarh. We are committed to making our
                platform accessible to everyone.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Breadcrumbs — bottom placement, narrow rail. */}
      <div className="border-t border-[var(--border)] bg-white">
        <div className="mx-auto max-w-4xl px-4 py-4 sm:px-6 lg:px-8">
          <Breadcrumbs items={[{ name: 'Accessibility' }]} withSchema={false} />
        </div>
      </div>
    </PublicLayout>
  );
}
