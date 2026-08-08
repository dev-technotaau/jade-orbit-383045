/**
 * Inline JSON-LD script tag for structured-data markup.
 *
 * Rendered server-side by React so search-engine crawlers see the
 * payload in the initial HTML response — client-only injection would
 * miss the Googlebot first-render pass.
 *
 * `dangerouslySetInnerHTML` is the standard React pattern for
 * non-executable `<script>` payloads. The JSON is pre-serialised with
 * `JSON.stringify` + a defensive `</script>` escape so a stray `<`
 * inside a value (e.g. breadcrumb labels containing HTML) can't break
 * out of the script context.
 */
interface JsonLdProps {
  /** A single schema object or an array of schemas for one page. */
  data: Record<string, unknown> | ReadonlyArray<Record<string, unknown>>;
  /** Optional @id for the script tag (useful for deduping in hydration). */
  id?: string;
}

export default function JsonLd({ data, id }: JsonLdProps) {
  const json = JSON.stringify(data)
    // Prevent </script> string from closing the tag mid-value.
    .replace(/</g, '\\u003c');

  return <script type="application/ld+json" id={id} dangerouslySetInnerHTML={{ __html: json }} />;
}
