'use client';

/**
 * Employer-only support card surfaced on the employer dashboard. Shows the
 * dedicated helpline with hours + email + a "Get Help" button that opens
 * the same HelpModal/ContactModal pair used elsewhere, pre-scoped to the
 * employer-dashboard FAQ context.
 */

import { useState } from 'react';
import { Phone, Mail, HelpCircle, MessageCircle } from 'lucide-react';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import HelpModal from './HelpModal';
import ContactModal from './ContactModal';
import { EMPLOYER_HELPLINE, EMPLOYER_HELPLINE_HOURS, SUPPORT_EMAIL } from '@/constants/support';

export default function EmployerSupportCard() {
  const [helpOpen, setHelpOpen] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);

  return (
    <>
      <Card padding="lg" className="border-l-primary border-l-4">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-start gap-3">
            <div className="bg-primary-light flex h-11 w-11 shrink-0 items-center justify-center rounded-xl">
              <Phone className="text-primary h-5 w-5" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-[var(--text)]">
                Dedicated Employer Helpline
              </h3>
              <a
                href={EMPLOYER_HELPLINE.href}
                className="text-primary mt-1 block text-lg font-bold tracking-wide hover:underline"
              >
                {EMPLOYER_HELPLINE.display}
              </a>
              <p className="mt-0.5 text-xs text-[var(--text-muted)]">{EMPLOYER_HELPLINE_HOURS}</p>
              <a
                href={`mailto:${SUPPORT_EMAIL}`}
                className="hover:text-primary mt-2 inline-flex items-center gap-1.5 text-xs text-[var(--text-secondary)]"
              >
                <Mail className="h-3.5 w-3.5" />
                {SUPPORT_EMAIL}
              </a>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              leftIcon={<HelpCircle className="h-4 w-4" />}
              onClick={() => setHelpOpen(true)}
            >
              Help & FAQs
            </Button>
            <Button
              size="sm"
              variant="primary"
              leftIcon={<MessageCircle className="h-4 w-4" />}
              onClick={() => setContactOpen(true)}
            >
              Contact us
            </Button>
          </div>
        </div>
      </Card>

      <HelpModal
        isOpen={helpOpen}
        onClose={() => setHelpOpen(false)}
        pageContext="dashboard-employer"
        audience="employer"
      />
      <ContactModal
        isOpen={contactOpen}
        onClose={() => setContactOpen(false)}
        showEmployerHelpline
      />
    </>
  );
}
