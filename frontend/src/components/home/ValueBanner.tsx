'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import { ArrowRight, Briefcase, Search } from 'lucide-react';
import Button from '@/components/ui/Button';

/**
 * ValueBanner — a full-width, image-led "beat" mid-page. Uses the team-in-office
 * photo (copy-space on the left) with a left→right white gradient so the heading
 * + CTAs stay legible over the light area while the people remain visible on the
 * right. Falls back to a brand-tinted card if the image fails to load.
 */
export default function ValueBanner() {
  return (
    <section className="bg-white px-4 py-16 sm:py-20">
      <div className="mx-auto max-w-7xl">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-40px' }}
          transition={{ duration: 0.5 }}
          className="bg-primary-light relative overflow-hidden rounded-3xl border border-[var(--border)] shadow-sm"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/images/home/banner-value.webp"
            alt=""
            aria-hidden="true"
            className="absolute inset-0 h-full w-full object-cover object-right"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
            }}
          />
          {/* Left legibility wash */}
          <div className="absolute inset-0 bg-gradient-to-r from-white via-white/85 to-transparent sm:via-white/70" />

          <div className="relative z-10 max-w-xl px-6 py-12 sm:px-10 sm:py-16 lg:py-20">
            <span className="bg-primary-light text-primary ring-primary/20 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ring-1">
              <Briefcase className="h-3.5 w-3.5" aria-hidden="true" />
              One platform, both sides of hiring
            </span>
            <h2 className="mt-4 text-3xl font-extrabold tracking-tight text-[var(--text)] sm:text-4xl lg:text-5xl">
              Where India&apos;s talent meets opportunity
            </h2>
            <p className="mt-4 max-w-md text-base text-[var(--text-secondary)] sm:text-lg">
              Whether you&apos;re building your career or building your team, Hire Adda connects the
              right people, faster.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link href="/jobs">
                <Button size="lg" rightIcon={<Search className="h-5 w-5" />}>
                  Find jobs
                </Button>
              </Link>
              <Link href="/auth/register/employer">
                <Button
                  variant="highlight"
                  size="lg"
                  rightIcon={<ArrowRight className="h-5 w-5" />}
                >
                  Post a job
                </Button>
              </Link>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
