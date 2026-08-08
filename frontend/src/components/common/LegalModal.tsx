'use client';

import { useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, FileText, Shield, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import Tooltip from '@/components/ui/Tooltip';

type LegalType = 'terms' | 'privacy';

interface LegalModalProps {
  isOpen: boolean;
  onClose: () => void;
  type: LegalType;
}

const termsSections = [
  {
    title: 'Acceptance of Terms',
    content:
      'By accessing or using the HireAdda platform, you acknowledge that you have read, understood, and agree to be bound by these Terms of Service and our Privacy Policy. If you do not agree to these terms, you must not access or use our platform. We reserve the right to modify these terms at any time, and we will notify you of material changes through the platform or via email. Your continued use of HireAdda after such modifications constitutes your acceptance of the updated terms. If you are using HireAdda on behalf of a company or other legal entity, you represent that you have the authority to bind that entity to these terms.',
  },
  {
    title: 'Description of Service',
    content:
      'HireAdda is an online employment platform that connects job seekers with employers across India. Our services include job search and discovery, profile creation and management, job posting and applicant tracking, AI-powered candidate-job matching, application management, messaging between candidates and employers, and related career services. We provide our platform on an "as is" and "as available" basis. We reserve the right to modify, suspend, or discontinue any part of our services at any time, with or without notice. We are not responsible for any third-party services or content accessible through our platform.',
  },
  {
    title: 'User Accounts',
    content:
      'To access certain features of HireAdda, you must create an account by providing accurate, current, and complete information. You are responsible for maintaining the confidentiality of your account credentials and for all activities that occur under your account. You must immediately notify HireAdda of any unauthorized use of your account or any other security breach. You may not create multiple accounts, share your account with others, or transfer your account to another person without our written consent. We reserve the right to suspend or terminate accounts that violate these terms, contain false information, or have been inactive for an extended period. You must be at least 18 years of age to create an account on HireAdda.',
  },
  {
    title: 'User Responsibilities',
    content:
      'You agree to use HireAdda only for lawful purposes and in accordance with these terms. You shall not use the platform to post false, misleading, or fraudulent content, including fake job listings or misrepresented qualifications. You shall not harass, threaten, or discriminate against other users. You shall not attempt to gain unauthorized access to any part of the platform or its systems. You shall not use automated tools, bots, or scrapers to collect data from the platform without our express written permission. You shall not upload or transmit viruses, malware, or any harmful code. You are solely responsible for the content you post, including job listings, profile information, and messages, and you represent that such content is accurate and does not violate any third-party rights.',
  },
  {
    title: 'Job Postings',
    content:
      'Employers are responsible for ensuring that all job postings comply with applicable Indian labor laws, including the Equal Remuneration Act, the Minimum Wages Act, and relevant state employment regulations. Job postings must not contain discriminatory requirements based on caste, religion, gender, age, disability, or any other protected characteristic unless the requirement is a genuine occupational qualification. All job postings are subject to moderation by HireAdda. We reserve the right to remove, modify, or decline to publish any job posting that violates our guidelines, applicable laws, or these terms. Employers must provide accurate information about the position, compensation, location, and requirements. Misleading or fraudulent job postings will result in immediate account suspension.',
  },
  {
    title: 'Intellectual Property',
    content:
      'All content, features, and functionality of the HireAdda platform, including but not limited to text, graphics, logos, icons, images, audio clips, software, and the overall design, are the exclusive property of Opportunity Makers Group and are protected by Indian and international copyright, trademark, and other intellectual property laws. You may not reproduce, distribute, modify, create derivative works of, publicly display, or otherwise use any of our intellectual property without our express written permission. By posting content on HireAdda, you grant us a non-exclusive, worldwide, royalty-free license to use, display, and distribute such content in connection with providing our services. You retain all ownership rights to the content you submit.',
  },
  {
    title: 'Limitation of Liability',
    content:
      'To the maximum extent permitted by applicable law, Opportunity Makers Group, its directors, employees, partners, and affiliates shall not be liable for any indirect, incidental, special, consequential, or punitive damages, including but not limited to loss of profits, data, use, or goodwill, arising out of or in connection with your use of the platform. HireAdda does not guarantee employment outcomes or the accuracy of information provided by employers or candidates. We are not responsible for hiring decisions made by employers or employment outcomes. Our total liability for any claims arising from these terms or your use of the platform shall not exceed the amount you paid to HireAdda in the twelve months preceding the claim, or INR 10,000, whichever is greater.',
  },
  {
    title: 'Termination',
    content:
      'Either party may terminate this agreement at any time. You may deactivate your account through your account settings or by contacting our support team. HireAdda reserves the right to suspend or terminate your account immediately, without prior notice, if we reasonably believe that you have violated these terms, engaged in fraudulent activity, or pose a risk to other users or the platform. Upon termination, your right to access and use the platform ceases immediately. Provisions of these terms that by their nature should survive termination, including intellectual property, limitation of liability, indemnification, and governing law, shall continue in effect after termination. We may retain certain data as required by law or for legitimate business purposes.',
  },
  {
    title: 'Governing Law',
    content:
      'These Terms of Service shall be governed by and construed in accordance with the laws of India, without regard to conflict of law principles. Any disputes arising out of or relating to these terms or the use of HireAdda shall be subject to the exclusive jurisdiction of the courts in Chandigarh, India. Notwithstanding the foregoing, HireAdda may seek injunctive or other equitable relief in any court of competent jurisdiction to prevent the actual or threatened infringement or misappropriation of our intellectual property rights. If any provision of these terms is found to be unenforceable, the remaining provisions shall continue in full force and effect.',
  },
  {
    title: 'Contact Information',
    content:
      'If you have questions or concerns about these Terms of Service, please contact us at legal@hireadda.in. For general inquiries, reach out to support@hireadda.in or call +91 1762469136. You may also write to us at Opportunity Makers Group, Tricity Plaza, Peer Muchalla, Chandigarh, India 160104. We aim to address all inquiries within 7 business days.',
  },
];

const privacySections = [
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
      'When you apply for a job, your profile information and resume are shared with the employer who posted the listing. Employers who post jobs may have their company information visible to all platform users. We do not sell your personal information to third parties. We may share your information with trusted service providers who assist us in operating our platform, such as cloud hosting providers, email delivery services, payment processors, and analytics tools. These providers are bound by contractual obligations to keep your information confidential and use it only for the purposes we specify. We may also disclose your information if required by law, in response to legal process, or to protect the rights, property, or safety of HireAdda, our users, or the public.',
  },
  {
    title: 'Data Security',
    content:
      'We implement industry-standard security measures to protect your personal information from unauthorized access, alteration, disclosure, or destruction. These measures include encryption of data in transit using TLS/SSL, encryption of sensitive data at rest, regular security audits and vulnerability assessments, access controls and authentication mechanisms, and secure data backup procedures. While we strive to protect your personal information, no method of transmission over the Internet or electronic storage is completely secure. We cannot guarantee absolute security, but we continuously monitor and update our security practices to address emerging threats.',
  },
  {
    title: 'Cookies',
    content:
      'HireAdda uses cookies and similar tracking technologies to enhance your browsing experience, analyze platform usage, and deliver personalized content. Essential cookies are required for the platform to function properly, including session management, authentication, and security features. Analytics cookies help us understand how users interact with our platform, which pages are most popular, and where users encounter issues. Preference cookies remember your settings and choices, such as language preference and notification settings. You can manage your cookie preferences through your browser settings. Please note that disabling certain cookies may affect the functionality of our platform.',
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
      'HireAdda is not intended for use by individuals under the age of 18. We do not knowingly collect personal information from children under 18 years of age. If we discover that we have inadvertently collected information from a child under 18, we will take immediate steps to delete that information from our servers. If you are a parent or guardian and believe your child has provided us with personal information, please contact us immediately at privacy@hireadda.in so we can take appropriate action.',
  },
  {
    title: 'Changes to This Policy',
    content:
      'We may update this Privacy Policy from time to time to reflect changes in our practices, technologies, legal requirements, or other factors. When we make material changes, we will notify you through a prominent notice on our platform, via email to the address associated with your account, or through other appropriate communication channels. We encourage you to review this Privacy Policy periodically to stay informed about how we protect your information. Your continued use of HireAdda after the effective date of any changes constitutes your acceptance of the updated policy.',
  },
  {
    title: 'Contact Us',
    content:
      'If you have questions, concerns, or requests regarding this Privacy Policy or our data practices, please contact our Data Protection Officer at privacy@hireadda.in. You can also reach us by mail at Opportunity Makers Group, Tricity Plaza, Peer Muchalla, Chandigarh, India 160104. For general support inquiries, contact support@hireadda.in or call our toll-free number at +91 1762469136. We aim to respond to all privacy-related inquiries within 7 business days.',
  },
];

const config = {
  terms: {
    title: 'Terms of Service',
    subtitle: 'Last updated: February 2026',
    icon: FileText,
    intro:
      'Welcome to HireAdda. These Terms of Service ("Terms") govern your access to and use of the HireAdda website, applications, and services (collectively, the "Platform") operated by Opportunity Makers Group ("HireAdda," "we," "us," or "our"), a sole proprietorship (proprietor: Harpreet Kaur) registered under the laws of India. Please read these terms carefully before using our platform.',
    sections: termsSections,
    footer:
      'These Terms of Service are effective as of February 1, 2026. Opportunity Makers Group is registered under the laws of India with its registered office in Chandigarh. By using our platform, you confirm that you accept these terms and agree to comply with them.',
  },
  privacy: {
    title: 'Privacy Policy',
    subtitle: 'Last updated: February 2026',
    icon: Shield,
    intro:
      'At Opportunity Makers Group ("HireAdda," "we," "us," or "our"), we are committed to protecting the privacy and security of your personal information. This Privacy Policy describes how we collect, use, share, and protect information when you use our website, mobile applications, and related services (collectively, the "Platform"). By using HireAdda, you agree to the collection and use of information in accordance with this policy.',
    sections: privacySections,
    footer:
      'This Privacy Policy is effective as of February 1, 2026. Opportunity Makers Group is registered under the laws of India with its registered office in Chandigarh.',
  },
} as const;

export default function LegalModal({ isOpen, onClose, type }: LegalModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const { title, subtitle, icon: Icon, intro, sections, footer } = config[type];

  const handleEscape = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    },
    [onClose],
  );

  const handleTab = useCallback((e: KeyboardEvent) => {
    if (e.key !== 'Tab' || !dialogRef.current) return;
    const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey) {
      if (document.activeElement === first) {
        e.preventDefault();
        last.focus();
      }
    } else {
      if (document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      previousFocusRef.current = document.activeElement as HTMLElement;
      document.addEventListener('keydown', handleEscape);
      document.addEventListener('keydown', handleTab);
      document.body.style.overflow = 'hidden';
      requestAnimationFrame(() => dialogRef.current?.focus());
    }
    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.removeEventListener('keydown', handleTab);
      document.body.style.overflow = '';
      if (previousFocusRef.current) {
        previousFocusRef.current.focus();
        previousFocusRef.current = null;
      }
    };
  }, [isOpen, handleEscape, handleTab]);

  const scrollToTop = () => {
    scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  };

  if (typeof window === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
            aria-hidden="true"
          />

          {/* Modal panel */}
          <motion.div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="legal-modal-title"
            tabIndex={-1}
            initial={{ opacity: 0, y: '100%' }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className={cn(
              'relative flex w-full max-w-3xl flex-col outline-none',
              'rounded-t-2xl sm:rounded-2xl',
              'bg-white shadow-2xl',
              'max-h-[90vh] sm:max-h-[85vh]',
            )}
          >
            {/* Drag indicator (mobile) */}
            <div className="flex justify-center pt-3 sm:hidden">
              <div className="h-1 w-10 rounded-full bg-[var(--border)]" />
            </div>

            {/* Header */}
            <div className="flex items-start justify-between border-b border-[var(--border)] px-6 pt-4 pb-4 sm:pt-5">
              <div className="flex items-center gap-3">
                <div className="bg-primary-light flex h-10 w-10 items-center justify-center rounded-xl">
                  <Icon className="text-primary h-5 w-5" />
                </div>
                <div>
                  <h2 id="legal-modal-title" className="text-lg font-semibold text-[var(--text)]">
                    {title}
                  </h2>
                  <p className="text-xs text-[var(--text-muted)]">{subtitle}</p>
                </div>
              </div>
              <Tooltip content="Close dialog">
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close"
                  className="rounded-lg p-2 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-secondary)] hover:text-[var(--text)]"
                >
                  <X className="h-5 w-5" />
                </button>
              </Tooltip>
            </div>

            {/* Scrollable content */}
            <div
              data-lenis-prevent
              ref={scrollRef}
              className="flex-1 overflow-y-auto overscroll-contain px-6 py-5"
            >
              <p className="leading-relaxed text-[var(--text-secondary)]">{intro}</p>

              <div className="mt-8 space-y-8">
                {sections.map((section, index) => (
                  <div key={section.title}>
                    <h3 className="text-base font-semibold text-[var(--text)]">
                      {index + 1}. {section.title}
                    </h3>
                    <p className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">
                      {section.content}
                    </p>
                  </div>
                ))}
              </div>

              <div className="mt-8 border-t border-[var(--border)] pt-5">
                <p className="text-xs leading-relaxed text-[var(--text-muted)]">{footer}</p>
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between border-t border-[var(--border)] px-6 py-4">
              <Tooltip content="Scroll back to top">
                <button
                  type="button"
                  onClick={scrollToTop}
                  className="flex items-center gap-1.5 text-xs text-[var(--text-muted)] transition-colors hover:text-[var(--text)]"
                >
                  <ChevronUp className="h-3.5 w-3.5" />
                  Back to top
                </button>
              </Tooltip>
              <Tooltip content="Acknowledge and close">
                <button
                  type="button"
                  onClick={onClose}
                  className="bg-primary hover:bg-primary-hover rounded-lg px-5 py-2 text-sm font-medium text-white transition-colors"
                >
                  I Understand
                </button>
              </Tooltip>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
