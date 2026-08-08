/**
 * ItemListJsonLd — emits an ItemList payload for listing/search-result
 * pages. Two factory shapes:
 *
 *   - `<ItemListJsonLd kind="jobPostings" url={...} items={...} />` —
 *     uses the dedicated `jobPostingListSchema` builder which Google
 *     Jobs picks up for the rich-result SERP carousel.
 *
 *   - `<ItemListJsonLd kind="generic" url={...} items={...} />` —
 *     a vanilla `ItemList` for any list page (companies, articles, etc).
 */

import JsonLd from './JsonLd';
import { jobPostingListSchema } from '@/lib/json-ld';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://hireadda.in';

type Props =
  | {
      kind: 'jobPostings';
      id?: string;
      url: string;
      items: ReadonlyArray<{ url: string; title: string; hiringOrganizationName: string }>;
    }
  | {
      kind: 'generic';
      id?: string;
      url: string;
      items: ReadonlyArray<{ url: string; name: string }>;
    };

function abs(url: string): string {
  if (url.startsWith('http')) return url;
  return `${APP_URL}${url}`;
}

export default function ItemListJsonLd(props: Props) {
  if (props.kind === 'jobPostings') {
    return (
      <JsonLd
        id={props.id ?? 'jsonld-itemlist-jobs'}
        data={jobPostingListSchema(props.url, props.items)}
      />
    );
  }
  // Generic ItemList
  const data = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    '@id': `${abs(props.url)}#itemlist`,
    itemListElement: props.items.map((it, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      url: abs(it.url),
      name: it.name,
    })),
  };
  return <JsonLd id={props.id ?? 'jsonld-itemlist'} data={data} />;
}
