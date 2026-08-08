/**
 * OrganizationJsonLd — wraps either:
 *   - the global Hire Adda Organization schema (no `company` prop),
 *   - or a per-employer Organization schema (with `company`).
 *
 * Used on the public company-detail page + the global header layout.
 */

import JsonLd from './JsonLd';
import { companySchema, organizationSchema } from '@/lib/json-ld';

interface CompanyLike {
  url: string;
  name: string;
  legalName?: string;
  description?: string;
  logo?: string;
  foundingDate?: string;
  numberOfEmployees?: number | { min: number; max: number };
  industry?: string;
  website?: string;
  sameAs?: string[];
  telephone?: string;
  email?: string;
}

interface Props {
  id?: string;
  /** When omitted, emits the global Hire Adda Organization schema. */
  company?: CompanyLike;
}

export default function OrganizationJsonLd({ id, company }: Props) {
  const data = company ? companySchema(company) : organizationSchema();
  return (
    <JsonLd
      id={id ?? (company ? 'jsonld-organization-company' : 'jsonld-organization')}
      data={data}
    />
  );
}
