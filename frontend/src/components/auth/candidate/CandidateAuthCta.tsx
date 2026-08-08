'use client';

/**
 * CandidateAuthCta — "Request callback" banner for the enhanced candidate auth pages.
 *
 * A wide, rounded, light-lavender gradient banner: a support-agent photo pops
 * out of the bottom-left, a bold dark-purple heading and sub-line sit in the
 * middle, and a prominent blue "Request callback" button lives on the right.
 * Clicking the button opens the shared ContactModal (candidate context — no
 * employer helpline).
 *
 * LIGHT-MODE ONLY — the surrounding candidate auth pages are light-only.
 */

import { useState } from 'react';
import Button from '@/components/ui/Button';
import ContactModal from '@/components/support/ContactModal';

export default function CandidateAuthCta() {
  const [contactOpen, setContactOpen] = useState(false);

  return (
    <section className="bg-[var(--bg)] px-4 py-10 sm:py-14">
      <div className="mx-auto max-w-6xl">
        <div className="relative flex min-h-[150px] flex-col items-center gap-5 overflow-hidden rounded-3xl bg-gradient-to-r from-violet-100 via-purple-100 to-violet-200 px-6 py-8 text-center sm:flex-row sm:items-center sm:justify-between sm:px-10 sm:pl-52 sm:text-left">
          {/* Support agent — pops out of the bottom-left. Plain <img> so a
              missing asset degrades gracefully instead of crashing. */}
          <img
            src="/images/employer-cta-agent.webp"
            alt="Hire Adda support specialist"
            className="pointer-events-none absolute bottom-[-14%] left-2 hidden h-[130%] w-auto object-contain select-none sm:block"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
            }}
          />

          {/* Heading + sub-line */}
          <div className="relative">
            <h2 className="text-2xl font-extrabold text-[#3b1e70] sm:text-3xl">
              Not sure where to start your job search?
            </h2>
            <p className="mt-2 text-sm text-[#4b2e83] sm:text-base">
              Leave your details and our team will help you find the right opportunity.
            </p>
          </div>

          {/* Request callback — brand-blue primary button */}
          <Button
            variant="primary"
            size="lg"
            onClick={() => setContactOpen(true)}
            className="relative shrink-0 whitespace-nowrap"
          >
            Request callback
          </Button>
        </div>
      </div>

      <ContactModal
        isOpen={contactOpen}
        onClose={() => setContactOpen(false)}
        defaultCategory="GENERAL"
        title="Request a callback"
      />
    </section>
  );
}
