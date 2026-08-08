'use client';

/**
 * Candidate auth hero background image.
 *
 * Extracted into its own client component because the parent CandidateAuthShell
 * is a Server Component, and event handlers (the `onError` fallback that hides
 * the image on load failure, revealing the gradient behind it) cannot be passed
 * from a Server Component. Keeping this tiny client boundary lets the shell stay
 * a server component.
 */
export default function CandidateHeroImage() {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/images/candidate_auth_banner.webp"
      alt=""
      aria-hidden
      className="absolute inset-0 h-full w-full object-cover object-center"
      onError={(e) => {
        e.currentTarget.style.display = 'none';
      }}
    />
  );
}
