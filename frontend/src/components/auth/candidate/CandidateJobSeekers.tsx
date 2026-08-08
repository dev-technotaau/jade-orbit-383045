'use client';

import { motion } from 'framer-motion';
import { GraduationCap, Briefcase, Repeat, Check, Users, type LucideIcon } from 'lucide-react';

type Segment = {
  icon: LucideIcon;
  title: string;
  description: string;
  benefits: string[];
};

const SEGMENTS: Segment[] = [
  {
    icon: GraduationCap,
    title: 'Freshers & Students',
    description:
      'Just starting out? Land your first job or internship with listings built for early careers — plus the tools to make your very first application shine.',
    benefits: [
      'Fresher-friendly & internship listings',
      'Free ATS-ready resume builder',
      'Entry-level job alerts tailored to you',
    ],
  },
  {
    icon: Briefcase,
    title: 'Experienced Professionals',
    description:
      'Ready for the next step up? Discover senior and specialist roles, and let top companies come to you with a standout profile.',
    benefits: [
      'Senior & specialist roles across industries',
      'Premium profile to get headhunted',
      'Salary & company insights before you apply',
    ],
  },
  {
    icon: Repeat,
    title: 'Career Switchers',
    description:
      'Moving into a new field? We match you to roles that value your transferable skills and help you reposition for a fresh start.',
    benefits: [
      'Roles matched to your transferable skills',
      'Explore new industries & functions',
      'Guidance to reposition your profile',
    ],
  },
];

export default function CandidateJobSeekers() {
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
            <Users className="h-3.5 w-3.5" />
            For every kind of job seeker
          </span>
          <h2 className="mt-4 text-3xl font-extrabold text-[var(--text)] sm:text-4xl">
            Built for every job seeker
          </h2>
          <p className="mt-4 text-base text-[var(--text-muted)]">
            Whether you&apos;re chasing your first role, climbing to the next level or switching
            careers entirely, Hire Adda gives you the right tools to find and land the right job in
            India.
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
