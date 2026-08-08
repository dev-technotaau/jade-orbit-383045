/**
 * JobPostingJsonLd — server component wrapping the canonical
 * JobPosting schema builder.
 *
 * Use on every job-detail page (public + private) so Google Jobs picks
 * up the rich-result eligibility. The underlying builder
 * (`jobPostingSchema` in `lib/json-ld.ts`) emits the full set of Google-
 * required + recommended fields when supplied.
 */

import JsonLd from './JsonLd';
import { jobPostingSchema } from '@/lib/json-ld';
import type { JobPostingInput } from '@/lib/json-ld';

interface Props {
  /** Stable id for hydration de-duplication. */
  id?: string;
  /** All inputs passed straight to `jobPostingSchema`. */
  job: JobPostingInput;
}

export default function JobPostingJsonLd({ id = 'jsonld-job-posting', job }: Props) {
  return <JsonLd id={id} data={jobPostingSchema(job)} />;
}
