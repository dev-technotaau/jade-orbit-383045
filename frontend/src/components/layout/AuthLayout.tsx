'use client';

import Logo from '@/components/common/Logo';

interface AuthLayoutProps {
  children: React.ReactNode;
}

export default function AuthLayout({ children }: AuthLayoutProps) {
  return (
    <div className="flex flex-1 flex-col bg-[var(--bg-secondary)]">
      {/* Centered content — logo sits directly above the auth card
          (instead of in a top-left header) so the eye lands on the
          brand first, then the form. Same alignment in every
          viewport because the wrapper is the same `w-full max-w-md`
          column that already constrains the auth card width. The
          `py-8 sm:py-12` keeps the column off the viewport edges on
          short screens while leaving more vertical breathing room on
          desktop. */}
      <main className="flex flex-1 items-center justify-center px-4 py-8 sm:py-12">
        <div className="w-full max-w-md">
          <div className="mb-6 flex justify-center sm:mb-8">
            <Logo size="lg" />
          </div>
          {children}
        </div>
      </main>

      {/* Minimal footer */}
      <footer className="py-4 text-center text-sm text-[var(--text-muted)]">
        &copy; {new Date().getFullYear()} HireAdda. All rights reserved.
      </footer>
    </div>
  );
}
