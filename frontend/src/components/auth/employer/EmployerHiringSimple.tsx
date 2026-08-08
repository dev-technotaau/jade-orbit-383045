'use client';

import { motion } from 'framer-motion';
import { Building2, Store, Handshake, Check, Layers, type LucideIcon } from 'lucide-react';

type Segment = {
  icon: LucideIcon;
  title: string;
  description: string;
  benefits: string[];
};

const SEGMENTS: Segment[] = [
  {
    icon: Building2,
    title: 'Large Companies & Enterprises',
    description:
      'Built for bulk and high-volume hiring across teams, roles and locations — with the tools and support to keep every requisition moving.',
    benefits: [
      'Multi-seat team accounts, unlimited job posts & premium listings',
      'Full CV database (HireDex) access with assisted hiring',
      'Dedicated account manager & priority support',
    ],
  },
  {
    icon: Store,
    title: 'Small & Medium Businesses',
    description:
      'Affordable and fast hiring for growing businesses. Start free, post your first job in minutes and only pay as you scale.',
    benefits: [
      'Free plan to get started, pay-as-you-grow job posts',
      'Quick applicant management from a single dashboard',
      'Urgent-hiring badges to fill critical roles faster',
    ],
  },
  {
    icon: Handshake,
    title: 'Consultants & Agencies',
    description:
      'Recruitment at scale for staffing firms and independent consultants — source, manage and place candidates across every client.',
    benefits: [
      'Vendor Connect for a steady stream of hiring leads',
      'Manage multiple clients with CV database & bulk downloads',
      'Connect directly with client companies to close faster',
    ],
  },
];

export default function EmployerHiringSimple() {
  return (
    <section className="bg-[var(--bg-secondary)] px-4 py-16 sm:py-20">
      <div className="mx-auto max-w-7xl">
        {/* Header */}
        <motion.div
          className="mx-auto max-w-2xl text-center"
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
        >
          <span className="bg-primary-light text-primary inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold">
            <Layers className="h-3.5 w-3.5" />
            For every kind of business
          </span>
          <h2 className="mt-4 text-3xl font-extrabold text-[var(--text)] sm:text-4xl">
            Hiring made simple for every business
          </h2>
          <p className="mt-4 text-base text-[var(--text-muted)]">
            From fast-growing startups to large enterprises and recruitment agencies, Hire Adda
            gives every team the right tools to find and hire the best talent in India.
          </p>
        </motion.div>

        {/* Cards */}
        <div className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-3">
          {SEGMENTS.map((segment, i) => {
            const Icon = segment.icon;
            return (
              <motion.div
                key={segment.title}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-40px' }}
                transition={{ duration: 0.45, delay: i * 0.1 }}
              >
                <article className="group hover:border-primary/40 relative flex h-full flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-white p-6 shadow-sm transition-all duration-300 hover:-translate-y-1.5 hover:shadow-xl sm:p-8">
                  {/* Top accent bar (reveals on hover) */}
                  <span
                    aria-hidden="true"
                    className="bg-primary absolute inset-x-0 top-0 h-1 origin-left scale-x-0 transition-transform duration-300 group-hover:scale-x-100"
                  />

                  <div className="bg-primary/10 text-primary flex h-12 w-12 items-center justify-center rounded-xl transition-transform duration-300 group-hover:scale-110">
                    <Icon className="h-6 w-6" />
                  </div>

                  <h3 className="mt-5 text-lg font-bold text-[var(--text)]">{segment.title}</h3>
                  <p className="mt-2 text-sm text-[var(--text-muted)]">{segment.description}</p>

                  <ul className="mt-4 space-y-2">
                    {segment.benefits.map((benefit) => (
                      <li
                        key={benefit}
                        className="flex items-start gap-2 text-sm text-[var(--text-secondary)]"
                      >
                        <Check className="text-primary mt-0.5 h-4 w-4 shrink-0" />
                        <span>{benefit}</span>
                      </li>
                    ))}
                  </ul>
                </article>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
