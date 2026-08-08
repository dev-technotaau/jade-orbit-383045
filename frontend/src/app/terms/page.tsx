import PublicLayout from '@/components/layout/PublicLayout';
import Breadcrumbs from '@/components/common/Breadcrumbs';
import JsonLd from '@/components/seo/JsonLd';
import { generateMetadata as buildMetadata } from '@/components/common/SEO';
import { breadcrumbSchema, graph, webPageSchema } from '@/lib/json-ld';
import type { Metadata } from 'next';

export const metadata: Metadata = buildMetadata({
  title: 'Terms of Service',
  description:
    'Review the Hire Adda terms of service. Understand the rules and guidelines for using our job portal platform.',
  url: '/terms',
});

const termsJsonLd = graph(
  webPageSchema({
    url: '/terms',
    name: 'Terms of Service',
    description:
      'The rules governing your use of Hire Adda — accounts, content, intellectual property, liability, and dispute resolution.',
    dateModified: '2026-02-01',
    speakableCssSelectors: ['h1'],
  }),
  breadcrumbSchema([
    { name: 'Home', url: '/' },
    { name: 'Terms of Service', url: '/terms' },
  ]),
);

const sections = [
  {
    title: 'Acceptance of Terms',
    content:
      'By accessing or using the Hire Adda platform, you acknowledge that you have read, understood, and agree to be bound by these Terms of Service and our Privacy Policy. If you do not agree to these terms, you must not access or use our platform. We reserve the right to modify these terms at any time, and we will notify you of material changes through the platform or via email. Your continued use of Hire Adda after such modifications constitutes your acceptance of the updated terms. If you are using Hire Adda on behalf of a company or other legal entity, you represent that you have the authority to bind that entity to these terms.',
  },
  {
    title: 'Description of Service',
    content:
      'Hire Adda is an online employment platform that connects job seekers with employers across India. Our services include job search and discovery, profile creation and management, job posting and applicant tracking, AI-powered candidate-job matching, application management, messaging between candidates and employers, and related career services. We provide our platform on an "as is" and "as available" basis. We reserve the right to modify, suspend, or discontinue any part of our services at any time, with or without notice. We are not responsible for any third-party services or content accessible through our platform.',
  },
  {
    title: 'User Accounts',
    content:
      'To access certain features of Hire Adda, you must create an account by providing accurate, current, and complete information. You are responsible for maintaining the confidentiality of your account credentials and for all activities that occur under your account. You must immediately notify Hire Adda of any unauthorized use of your account or any other security breach. You may not create multiple accounts, share your account with others, or transfer your account to another person without our written consent. We reserve the right to suspend or terminate accounts that violate these terms, contain false information, or have been inactive for an extended period. You must be at least 18 years of age to create an account on Hire Adda.',
  },
  {
    title: 'User Responsibilities',
    content:
      'You agree to use Hire Adda only for lawful purposes and in accordance with these terms. You shall not use the platform to post false, misleading, or fraudulent content, including fake job listings or misrepresented qualifications. You shall not harass, threaten, or discriminate against other users. You shall not attempt to gain unauthorized access to any part of the platform or its systems. You shall not use automated tools, bots, or scrapers to collect data from the platform without our express written permission. You shall not upload or transmit viruses, malware, or any harmful code. You are solely responsible for the content you post, including job listings, profile information, and messages, and you represent that such content is accurate and does not violate any third-party rights.',
  },
  {
    title: 'Job Postings',
    content:
      'Employers are responsible for ensuring that all job postings comply with applicable Indian labor laws, including the Equal Remuneration Act, the Minimum Wages Act, and relevant state employment regulations. Job postings must not contain discriminatory requirements based on caste, religion, gender, age, disability, or any other protected characteristic unless the requirement is a genuine occupational qualification. All job postings are subject to moderation by Hire Adda. We reserve the right to remove, modify, or decline to publish any job posting that violates our guidelines, applicable laws, or these terms. Employers must provide accurate information about the position, compensation, location, and requirements. Misleading or fraudulent job postings will result in immediate account suspension.',
  },
  {
    title: 'Intellectual Property',
    content:
      'All content, features, and functionality of the Hire Adda platform, including but not limited to text, graphics, logos, icons, images, audio clips, software, and the overall design, are the exclusive property of Opportunity Makers Group and are protected by Indian and international copyright, trademark, and other intellectual property laws. You may not reproduce, distribute, modify, create derivative works of, publicly display, or otherwise use any of our intellectual property without our express written permission. By posting content on Hire Adda, you grant us a non-exclusive, worldwide, royalty-free license to use, display, and distribute such content in connection with providing our services. You retain all ownership rights to the content you submit.',
  },
  {
    title: 'Limitation of Liability',
    content:
      'To the maximum extent permitted by applicable law, Opportunity Makers Group, its directors, employees, partners, and affiliates shall not be liable for any indirect, incidental, special, consequential, or punitive damages, including but not limited to loss of profits, data, use, or goodwill, arising out of or in connection with your use of the platform. Hire Adda does not guarantee employment outcomes or the accuracy of information provided by employers or candidates. We are not responsible for hiring decisions made by employers or employment outcomes. Our total liability for any claims arising from these terms or your use of the platform shall not exceed the amount you paid to Hire Adda in the twelve months preceding the claim, or INR 10,000, whichever is greater.',
  },
  {
    title: 'Termination',
    content:
      'Either party may terminate this agreement at any time. You may deactivate your account through your account settings or by contacting our support team. Hire Adda reserves the right to suspend or terminate your account immediately, without prior notice, if we reasonably believe that you have violated these terms, engaged in fraudulent activity, or pose a risk to other users or the platform. Upon termination, your right to access and use the platform ceases immediately. Provisions of these terms that by their nature should survive termination, including intellectual property, limitation of liability, indemnification, and governing law, shall continue in effect after termination. We may retain certain data as required by law or for legitimate business purposes.',
  },
  {
    title: 'Governing Law',
    content:
      'These Terms of Service shall be governed by and construed in accordance with the laws of India, without regard to conflict of law principles. Any disputes arising out of or relating to these terms or the use of Hire Adda shall be subject to the exclusive jurisdiction of the courts in Chandigarh, India. Notwithstanding the foregoing, Hire Adda may seek injunctive or other equitable relief in any court of competent jurisdiction to prevent the actual or threatened infringement or misappropriation of our intellectual property rights. If any provision of these terms is found to be unenforceable, the remaining provisions shall continue in full force and effect.',
  },
  {
    title: 'Contact Information',
    content:
      'If you have questions or concerns about these Terms of Service, please contact us at legal@hireadda.in. For general inquiries, reach out to support@hireadda.in or call +91 1762469136. You may also write to us at Opportunity Makers Group, Tricity Plaza, Peer Muchalla, Chandigarh, India 160104. We aim to address all inquiries within 7 business days.',
  },
];

export default function TermsPage() {
  return (
    <PublicLayout>
      <JsonLd id="jsonld-terms" data={termsJsonLd} />
      {/* Hero Section */}
      <section className="from-primary-50 under-public-header relative overflow-hidden bg-gradient-to-br via-white to-[var(--accent-light)]">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
          <div className="mx-auto max-w-3xl text-center">
            <h1 className="text-4xl font-bold tracking-tight text-[var(--text)] sm:text-5xl">
              Terms of Service
            </h1>
            <p className="mt-4 text-[var(--text-secondary)]">
              Last updated:{' '}
              <time dateTime="2026-02-01" className="font-medium">
                February 2026
              </time>
            </p>
            <p className="mt-2 text-sm text-[var(--text-muted)]">
              Authored by Hire Adda Legal · Reviewed by Trust &amp; Safety team
            </p>
          </div>
        </div>
      </section>

      {/* Content */}
      <section className="bg-white py-12 sm:py-16">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
          <div className="rounded-xl border border-[var(--border)] bg-white p-6 sm:p-10">
            <p className="leading-relaxed text-[var(--text-secondary)]">
              Welcome to Hire Adda. These Terms of Service (&quot;Terms&quot;) govern your access to
              and use of the Hire Adda website, applications, and services (collectively, the
              &quot;Platform&quot;) operated by Opportunity Makers Group (&quot;Hire Adda,&quot;
              &quot;we,&quot; &quot;us,&quot; or &quot;our&quot;), a sole proprietorship
              (proprietor: Harpreet Kaur) registered under the laws of India. Please read these
              terms carefully before using our platform.
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
                These Terms of Service are effective as of February 1, 2026. Opportunity Makers
                Group is registered under the laws of India with its registered office in
                Chandigarh. By using our platform, you confirm that you accept these terms and agree
                to comply with them.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Breadcrumbs — bottom placement, narrow rail. */}
      <div className="border-t border-[var(--border)] bg-white">
        <div className="mx-auto max-w-4xl px-4 py-4 sm:px-6 lg:px-8">
          <Breadcrumbs items={[{ name: 'Terms of Service' }]} withSchema={false} />
        </div>
      </div>
    </PublicLayout>
  );
}
