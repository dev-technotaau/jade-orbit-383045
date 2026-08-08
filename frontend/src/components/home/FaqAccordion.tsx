'use client';

import { useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ChevronDown } from 'lucide-react';

interface Faq {
  question: string;
  answer: string;
}

/**
 * FaqAccordion — animated-height FAQ accordion. Split into two independent
 * columns so opening an item only shifts its own column (not the row
 * neighbour). Honors prefers-reduced-motion.
 */
export default function FaqAccordion({ faqs }: { faqs: Faq[] }) {
  const mid = Math.ceil(faqs.length / 2);
  const columns = [faqs.slice(0, mid), faqs.slice(mid)];

  return (
    <div className="grid items-start gap-x-6 md:grid-cols-2">
      {columns.map((col, ci) => (
        <div key={ci} className="space-y-3">
          {col.map((faq) => (
            <FaqItem key={faq.question} faq={faq} />
          ))}
        </div>
      ))}
    </div>
  );
}

function FaqItem({ faq }: { faq: Faq }) {
  const [open, setOpen] = useState(false);
  const reduce = useReducedMotion();

  return (
    <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] transition-shadow hover:shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-4 px-6 py-4 text-left font-medium text-[var(--text)]"
      >
        {faq.question}
        <ChevronDown
          className={`h-5 w-5 shrink-0 text-[var(--text-muted)] transition-transform duration-300 ${
            open ? 'rotate-180' : ''
          }`}
        />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: reduce ? 0 : 0.3, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <p className="border-t border-[var(--border)] px-6 py-4 leading-relaxed text-[var(--text-secondary)]">
              {faq.answer}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
