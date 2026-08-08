/**
 * BreadcrumbJsonLd — emits a BreadcrumbList JSON-LD payload on every
 * page that has a multi-level navigation crumb.
 *
 * Pass an ordered list — the schema builder handles position + URL
 * resolution to absolute URLs.
 */

import JsonLd from './JsonLd';
import { breadcrumbSchema } from '@/lib/json-ld';

interface Props {
  id?: string;
  items: ReadonlyArray<{ name: string; url: string }>;
}

export default function BreadcrumbJsonLd({ id = 'jsonld-breadcrumb', items }: Props) {
  if (!items || items.length === 0) return null;
  return <JsonLd id={id} data={breadcrumbSchema(items)} />;
}
