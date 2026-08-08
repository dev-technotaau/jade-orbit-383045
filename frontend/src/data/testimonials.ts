import type { Testimonial } from '@/components/common/TestimonialCarousel';

/**
 * Sample testimonials for the enhanced auth pages.
 *
 * Company names are illustrative (not real-brand endorsements). To show a real
 * company logo, add the file to `public/images/testimonials/<name>.png` and set
 * the `logo` field — the carousel falls back to a brand monogram if it's absent.
 */

export const EMPLOYER_TESTIMONIALS: Testimonial[] = [
  {
    quote:
      'We filled three roles in under two weeks. The candidates are verified and the CV database search is genuinely fast — our time-to-hire dropped by nearly 40%.',
    name: 'Rajesh Iyer',
    title: 'Head of HR',
    company: 'TalentEdge Solutions',
    rating: 5,
  },
  {
    quote:
      'Posting a job took minutes and reached thousands of active job seekers the same day. For a growing company, that reach is exactly what we needed.',
    name: 'Ananya Deshmukh',
    title: 'Founder & CEO',
    company: 'BrightCommerce',
    rating: 5,
  },
  {
    quote:
      "The Talent Vault let us shortlist candidates we'd never have found on other platforms. Unlocking a CV and reaching out is effortless.",
    name: 'Vikram Menon',
    title: 'Talent Acquisition Lead',
    company: 'Nexa Technologies',
    rating: 5,
  },
  {
    quote:
      'Assisted hiring and the dedicated employer helpline made a real difference. It feels like having an extra recruiter on the team.',
    name: 'Priya Sharma',
    title: 'HR Director',
    company: 'Sunrise Retail Group',
    rating: 5,
  },
  {
    quote:
      "As an early-stage startup we needed to hire fast without a big HR team. Hire Adda's smart search and analytics made every hire measurable.",
    name: 'Arjun Rao',
    title: 'Co-founder',
    company: 'FinPay Labs',
    rating: 5,
  },
];

export const CANDIDATE_TESTIMONIALS: Testimonial[] = [
  {
    quote:
      'The AI matching found roles that actually fit my skills. I got three interview calls in my first week and accepted an offer within a month.',
    name: 'Kavitha Nair',
    title: 'Software Engineer',
    company: 'Now at a leading fintech',
    rating: 5,
  },
  {
    quote:
      "Quick Apply and job alerts saved me hours every week. I landed my dream product role in just three weeks — I can't recommend it enough.",
    name: 'Sneha Gupta',
    title: 'Product Manager',
    company: 'Now at a top e-commerce firm',
    rating: 5,
  },
  {
    quote:
      'The free resume builder made my profile stand out. Within days recruiters were reaching out to me directly instead of the other way around.',
    name: 'Rohan Verma',
    title: 'Digital Marketing Specialist',
    company: 'Now at a D2C brand',
    rating: 5,
  },
  {
    quote:
      'As a fresher I was nervous about finding my first job. The application tracking kept everything organised and I got hired within a month of graduating.',
    name: 'Meera Krishnan',
    title: 'Data Analyst',
    company: 'First job via Hire Adda',
    rating: 5,
  },
  {
    quote:
      "I was switching careers and worried recruiters wouldn't notice me. Getting discovered through my profile changed that completely.",
    name: 'Aditya Joshi',
    title: 'Sales Manager',
    company: 'Career switch success',
    rating: 5,
  },
];

/**
 * Homepage "What our users say" — a balanced mix of candidates and employers,
 * each with a real headshot (public/images/home/avatar-N.webp). Rendered by the
 * shared TestimonialCarousel (candidate variant → photo avatars).
 */
export const HOME_TESTIMONIALS: Testimonial[] = [
  {
    quote:
      'I applied to a few roles on a Sunday and had two interviews lined up by Wednesday. The matching genuinely understood what I wanted — I accepted an offer within three weeks.',
    name: 'Ananya Sharma',
    title: 'Software Engineer',
    company: 'Hired · Bengaluru',
    avatar: '/images/home/avatar-1.webp',
    rating: 5,
  },
  {
    quote:
      'The CV database is a game-changer for our team. We shortlisted five strong candidates in a single afternoon and closed the position in ten days.',
    name: 'Priya Nair',
    title: 'HR Manager',
    company: 'Nexa Retail',
    avatar: '/images/home/avatar-3.webp',
    rating: 5,
  },
  {
    quote:
      'Quick Apply saved me so much time — no more re-filling the same details on every job. I found a better-paying role near home in under a month.',
    name: 'Rahul Verma',
    title: 'Sales Executive',
    company: 'Hired · Pune',
    avatar: '/images/home/avatar-2.webp',
    rating: 5,
  },
  {
    quote:
      "As a startup we can't run a big HR team. Posting a job took two minutes and reached thousands of relevant candidates the same day.",
    name: 'Arjun Mehta',
    title: 'Co-founder',
    company: 'BrightCommerce',
    avatar: '/images/home/avatar-4.webp',
    rating: 5,
  },
  {
    quote:
      "I didn't even apply — a recruiter found my profile and reached out. Getting discovered completely changed my job search.",
    name: 'Vikram Singh',
    title: 'Data Analyst',
    company: 'Hired · Hyderabad',
    avatar: '/images/home/avatar-5.webp',
    rating: 5,
  },
  {
    quote:
      'Verified candidates and real-time analytics cut our time-to-hire by nearly 40%. Hire Adda is now our first stop for every open role.',
    name: 'Sneha Reddy',
    title: 'Talent Acquisition Lead',
    company: 'FinPay',
    avatar: '/images/home/avatar-6.webp',
    rating: 5,
  },
];
