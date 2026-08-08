'use client';

import { useState, type FormEvent } from 'react';
import Image from 'next/image';
import { Mail, MapPin, Clock, Phone, Send } from 'lucide-react';
import BrandIcon, { type BrandIconName } from '@/components/common/BrandIcon';
import Breadcrumbs from '@/components/common/Breadcrumbs';
import PublicLayout from '@/components/layout/PublicLayout';
import JsonLd from '@/components/seo/JsonLd';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Textarea from '@/components/ui/Textarea';
import { showToast } from '@/components/ui/Toast';
import { breadcrumbSchema, contactPageSchema, graph } from '@/lib/json-ld';
import { ticketService } from '@/services/ticket.service';
import type { ApiError } from '@/types/api';
import type { TicketCategory } from '@/types/ticket';

interface ContactCard {
  icon?: typeof Mail;
  /** Brand-icon slug (e.g. 'whatsapp') — takes precedence over `icon`. */
  brand?: BrandIconName;
  title: string;
  detail: string;
  description: string;
  href?: string;
}

const contactInfo: ContactCard[] = [
  {
    icon: Mail,
    title: 'Email Us',
    detail: 'support@hireadda.in',
    description: 'We typically respond within 24 hours',
  },
  {
    // WhatsApp moved out of this list to the sitewide floating button
    // (`components/common/WhatsAppFloatingButton.tsx`), which keeps the same
    // wa.me destination. This card is the phone line.
    icon: Phone,
    title: 'Call Us',
    detail: '+91 1762 469136',
    description: 'Mon - Fri, 9:00 AM - 6:00 PM IST',
    href: 'tel:+911762469136',
  },
  {
    icon: MapPin,
    title: 'Visit Us',
    detail: 'Chandigarh, India',
    description: 'Tricity Plaza, Peer Muchalla, Chandigarh, India 160104',
  },
  {
    icon: Clock,
    title: 'Office Hours',
    detail: 'Mon - Fri, 9:00 AM - 6:00 PM IST',
    description: 'Closed on weekends and public holidays',
  },
];

const categoryOptions = [
  { value: 'GENERAL', label: 'General Inquiry' },
  { value: 'TECHNICAL', label: 'Technical Support' },
  { value: 'BILLING', label: 'Billing & Payments' },
  { value: 'BUG_REPORT', label: 'Report a Bug' },
  { value: 'FEATURE_REQUEST', label: 'Feature Request' },
  { value: 'ACCOUNT', label: 'Account Issue' },
  { value: 'OTHER', label: 'Other' },
];

export default function ContactPage() {
  const [form, setForm] = useState({
    name: '',
    email: '',
    subject: '',
    message: '',
    category: '' as '' | TicketCategory,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [ticketNumber, setTicketNumber] = useState<string | null>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (!form.name || !form.email || !form.subject || !form.message) {
      showToast.error('Please fill in all fields');
      return;
    }

    setIsSubmitting(true);

    try {
      const result = await ticketService.createGuestTicket({
        name: form.name,
        email: form.email,
        subject: form.subject,
        description: form.message,
        category: (form.category || 'GENERAL') as TicketCategory,
      });
      setTicketNumber(result.data.ticketNumber);
      showToast.success(
        `Ticket ${result.data.ticketNumber} created!`,
        'We will respond within 24 hours.',
      );
      setForm({ name: '', email: '', subject: '', message: '', category: '' });
    } catch (err) {
      const error = err as unknown as ApiError;
      showToast.error(error?.message || 'Failed to send message. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const contactJsonLd = graph(
    contactPageSchema({
      url: '/contact',
      name: 'Contact Hire Adda',
      description:
        'Get in touch with Hire Adda. Support, sales, billing, privacy, and security contact channels — all in one place.',
      speakableCssSelectors: ['h1', '.subtitle'],
    }),
    breadcrumbSchema([
      { name: 'Home', url: '/' },
      { name: 'Contact', url: '/contact' },
    ]),
  );

  return (
    <PublicLayout>
      <JsonLd id="jsonld-contact" data={contactJsonLd} />
      {/* Hero Section */}
      <section className="bg-primary-50 under-public-header relative overflow-hidden">
        {/* Background photo — a friendly support specialist, shot with bright
            negative space on the left for the headline to sit over. */}
        <Image
          src="/images/contact-hero.jpg"
          alt="A Hire Adda support specialist wearing a headset, smiling and ready to help"
          fill
          priority
          sizes="100vw"
          className="object-cover object-center"
        />
        {/* Legibility scrims: (1) a left→right white wash so the headline on the
            left stays crisp while the photo's subject on the right shows
            through; (2) a flatter white wash on mobile only, where the photo
            crops tighter behind the full-width text. */}
        <div className="absolute inset-0 bg-gradient-to-r from-white via-white/85 to-transparent" />
        <div className="absolute inset-0 bg-white/55 sm:bg-transparent" />
        {/* Top scrim for the overlaying header. At scroll-top the public
            header is transparent and sits over this photograph; the left→right
            wash above only protects the left side, so the nav links and auth
            buttons on the right would land on raw image. This 80px veil keeps
            the whole bar legible and stops exactly where the header ends, so
            the composition below it is untouched. */}
        <div
          aria-hidden="true"
          className="absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-white via-white/75 to-transparent"
        />

        <div className="relative mx-auto max-w-7xl px-4 py-20 sm:px-6 sm:py-28 lg:px-8">
          <div className="max-w-xl">
            <h1 className="text-4xl font-bold tracking-tight text-[var(--text)] sm:text-5xl">
              Get in <span className="text-primary">Touch</span>
            </h1>
            <p className="mt-6 max-w-lg text-lg text-[var(--text-secondary)]">
              Have a question, feedback, or need help? We&apos;d love to hear from you. Our team is
              here to assist you with anything you need.
            </p>
          </div>
        </div>
      </section>

      {/* Contact Form & Info */}
      <section className="bg-white py-16 sm:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid gap-12 lg:grid-cols-5">
            {/* Form */}
            <div className="lg:col-span-3">
              <div className="rounded-xl border border-[var(--border)] bg-white p-6 sm:p-8">
                <h2 className="text-2xl font-bold text-[var(--text)]">Send Us a Message</h2>
                <p className="mt-2 text-[var(--text-secondary)]">
                  Fill out the form below and we will get back to you as soon as possible.
                </p>

                {ticketNumber && (
                  <div className="mb-6 rounded-lg border border-[var(--success)] bg-[var(--success-light)] p-4">
                    <p className="font-semibold text-[var(--success)]">
                      Ticket Created Successfully!
                    </p>
                    <p className="mt-1 text-sm text-[var(--text-secondary)]">
                      Your ticket number is{' '}
                      <span className="font-mono font-bold text-[var(--text)]">{ticketNumber}</span>
                      . We will respond within 24 hours. Please save this number for reference.
                    </p>
                  </div>
                )}

                <form onSubmit={handleSubmit} className="mt-8 space-y-6">
                  <div className="grid gap-6 sm:grid-cols-2">
                    <Input
                      label="Full Name"
                      name="name"
                      placeholder="Your full name"
                      value={form.name}
                      onChange={handleChange}
                      required
                    />
                    <Input
                      label="Email Address"
                      name="email"
                      type="email"
                      placeholder="you@example.com"
                      value={form.email}
                      onChange={handleChange}
                      required
                    />
                  </div>

                  <div className="grid gap-6 sm:grid-cols-2">
                    <Input
                      label="Subject"
                      name="subject"
                      placeholder="Brief summary of your issue"
                      value={form.subject}
                      onChange={handleChange}
                      required
                    />
                    <Select
                      label="Category"
                      options={categoryOptions}
                      value={form.category}
                      onChange={(v) =>
                        setForm((prev) => ({ ...prev, category: v as '' | TicketCategory }))
                      }
                      placeholder="Select a category"
                    />
                  </div>

                  <Textarea
                    label="Message"
                    name="message"
                    rows={5}
                    placeholder="Tell us how we can help..."
                    value={form.message}
                    onChange={handleChange}
                    required
                  />

                  <Button
                    type="submit"
                    size="lg"
                    isLoading={isSubmitting}
                    leftIcon={<Send className="h-4 w-4" />}
                    tooltip="Submit your message to our support team"
                  >
                    Send Message
                  </Button>
                </form>
              </div>
            </div>

            {/* Contact Info */}
            <div className="lg:col-span-2">
              <div className="space-y-6">
                {contactInfo.map((info) => (
                  <div
                    key={info.title}
                    className="rounded-xl border border-[var(--border)] bg-white p-6"
                  >
                    <div className="flex items-start gap-4">
                      <div className="bg-primary-light flex h-11 w-11 shrink-0 items-center justify-center rounded-lg">
                        {info.brand ? (
                          <BrandIcon
                            name={info.brand}
                            className="text-primary h-5 w-5"
                            title={info.title}
                          />
                        ) : (
                          info.icon && <info.icon className="text-primary h-5 w-5" />
                        )}
                      </div>
                      <div>
                        <h3 className="font-semibold text-[var(--text)]">{info.title}</h3>
                        {info.href ? (
                          <a
                            href={info.href}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary mt-1 inline-block font-medium hover:underline"
                          >
                            {info.detail}
                          </a>
                        ) : (
                          <p className="text-primary mt-1 font-medium">{info.detail}</p>
                        )}
                        <p className="mt-0.5 text-sm text-[var(--text-muted)]">
                          {info.description}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Breadcrumbs — bottom-of-content placement (above site footer)
          for visual consistency with company-detail / job-detail.
          BreadcrumbList JSON-LD is already in the page's combined
          `breadcrumbSchema()` graph above, so `withSchema={false}`. */}
      <div className="border-t border-[var(--border)] bg-white">
        <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
          <Breadcrumbs items={[{ name: 'Contact' }]} withSchema={false} />
        </div>
      </div>
    </PublicLayout>
  );
}
