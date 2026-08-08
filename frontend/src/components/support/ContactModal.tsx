'use client';

/**
 * ContactModal — modal mirror of the /contact page form.
 *
 * Uses the same `ticketService.createGuestTicket()` API as /contact, the
 * same field set (name, email, subject, category, message), and the same
 * category options. Authenticated users get name + email pre-filled from
 * the auth store. Optional `defaultCategory` lets context-aware triggers
 * pre-select a category (e.g. the billing-page trigger pre-fills BILLING).
 *
 * The full /contact page is still the canonical surface — this modal is
 * the inline shortcut so users do not have to leave their current flow.
 * A "Open full Contact page" link is always present.
 */

import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { Mail, Phone, Send } from 'lucide-react';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Textarea from '@/components/ui/Textarea';
import { showToast } from '@/components/ui/Toast';
import { ticketService } from '@/services/ticket.service';
import { useAuthStore } from '@/store/auth.store';
import { SUPPORT_EMAIL, resolveEmployerHelpline } from '@/constants/support';
import TollFreeBadge from '@/components/support/TollFreeBadge';
import type { ApiError } from '@/types/api';
import type { TicketCategory } from '@/types/ticket';

const CATEGORY_OPTIONS: { value: TicketCategory; label: string }[] = [
  { value: 'GENERAL', label: 'General Inquiry' },
  { value: 'TECHNICAL', label: 'Technical Support' },
  { value: 'BILLING', label: 'Billing & Payments' },
  { value: 'BUG_REPORT', label: 'Report a Bug' },
  { value: 'FEATURE_REQUEST', label: 'Feature Request' },
  { value: 'ACCOUNT', label: 'Account Issue' },
  { value: 'OTHER', label: 'Other' },
];

interface ContactModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Pre-selected category — useful for context-aware triggers. */
  defaultCategory?: TicketCategory;
  /** Page-scoped title override. Default: "Contact Support". */
  title?: string;
  /** When true, surfaces the employer helpline alongside the form. */
  showEmployerHelpline?: boolean;
}

export default function ContactModal({
  isOpen,
  onClose,
  defaultCategory = 'GENERAL',
  title = 'Contact Support',
  showEmployerHelpline = false,
}: ContactModalProps) {
  const user = useAuthStore((s) => s.user);
  // Dedicated employer helpline only on signed-in employer surfaces; every
  // other caller gets the shared toll-free number.
  const contactPhone = resolveEmployerHelpline(showEmployerHelpline);

  const [form, setForm] = useState({
    name: '',
    email: '',
    subject: '',
    message: '',
    category: defaultCategory as TicketCategory,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [ticketNumber, setTicketNumber] = useState<string | null>(null);

  // Hydrate from auth store + reset state whenever the modal opens.
  useEffect(() => {
    if (!isOpen) return;
    setForm({
      name: user ? `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() : '',
      email: user?.email ?? '',
      subject: '',
      message: '',
      category: defaultCategory,
    });
    setTicketNumber(null);
  }, [isOpen, user, defaultCategory]);

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
        category: form.category,
      });
      setTicketNumber(result.data.ticketNumber);
      showToast.success(
        `Ticket ${result.data.ticketNumber} created!`,
        'We will respond within 24 hours.',
      );
    } catch (err) {
      const error = err as unknown as ApiError;
      showToast.error(error?.message || 'Failed to send message. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} size="lg">
      {/* Quick-contact strip — same channels as /contact contactInfo */}
      <div className="-mt-2 mb-4 grid gap-2 sm:grid-cols-2">
        <a
          href={`mailto:${SUPPORT_EMAIL}`}
          className="hover:border-primary/40 flex items-center gap-3 rounded-lg border border-[var(--border)] bg-white px-3 py-2 transition-colors"
        >
          <div className="bg-primary-light flex h-9 w-9 shrink-0 items-center justify-center rounded-lg">
            <Mail className="text-primary h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-[var(--text-muted)]">Email</p>
            <p className="text-sm font-medium text-[var(--text)]">{SUPPORT_EMAIL}</p>
          </div>
        </a>
        <a
          href={contactPhone.href}
          className="hover:border-primary/40 flex items-center gap-3 rounded-lg border border-[var(--border)] bg-white px-3 py-2 transition-colors"
        >
          <div className="bg-primary-light flex h-9 w-9 shrink-0 items-center justify-center rounded-lg">
            <Phone className="text-primary h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-[var(--text-muted)]">
              {showEmployerHelpline ? 'Employer helpline' : 'Phone'}
            </p>
            <p className="flex flex-wrap items-center gap-1.5 text-sm font-medium text-[var(--text)]">
              {contactPhone.display}
              {contactPhone.tollFree && <TollFreeBadge size="xs" />}
            </p>
          </div>
        </a>
      </div>

      {ticketNumber ? (
        // Success state — mirrors the success card on /contact.
        <div className="rounded-lg border border-[var(--success)] bg-[var(--success-light)] p-4">
          <p className="font-semibold text-[var(--success)]">Ticket Created Successfully!</p>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            Your ticket number is{' '}
            <span className="font-mono font-bold text-[var(--text)]">{ticketNumber}</span>. We will
            respond within 24 hours. Please save this number for reference.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
            <button
              type="button"
              onClick={() => {
                setTicketNumber(null);
                setForm((p) => ({ ...p, subject: '', message: '' }));
              }}
              className="text-primary underline underline-offset-2"
            >
              Send another message
            </button>
            <button
              type="button"
              onClick={onClose}
              className="text-[var(--text-muted)] hover:text-[var(--text)]"
            >
              Close
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
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

          <div className="grid gap-3 sm:grid-cols-2">
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
              options={CATEGORY_OPTIONS}
              value={form.category}
              onChange={(v) => setForm((prev) => ({ ...prev, category: v as TicketCategory }))}
              placeholder="Select a category"
            />
          </div>

          <Textarea
            label="Message"
            name="message"
            rows={4}
            placeholder="Tell us how we can help..."
            value={form.message}
            onChange={handleChange}
            required
          />

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border)] pt-4">
            <Link
              href="/contact"
              onClick={onClose}
              className="text-xs text-[var(--text-muted)] hover:text-[var(--text)]"
            >
              Open full Contact page →
            </Link>
            <Button
              type="submit"
              isLoading={isSubmitting}
              leftIcon={<Send className="h-4 w-4" />}
              tooltip="Submit your message to our support team"
            >
              Send Message
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
