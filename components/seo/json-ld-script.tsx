import { serializeJsonLdAsHtml } from "@/lib/json-ld";

/**
 * The one place structured data is written into the page.
 *
 * `dangerouslySetInnerHTML` is required here, not a shortcut: React escapes text
 * children of a <script> as HTML entities, which turns every `"` into `&quot;`
 * and the block into invalid JSON. What makes it safe is the serializer, which
 * writes every `<` as a JSON unicode escape so no value can close the tag
 * (lib/json-ld.ts, tested in lib/__tests__/json-ld.test.ts). Keep every JSON-LD
 * block on this component so there is a single sink to review.
 */
export function JsonLdScript({ data }: { data: unknown }) {
  return (
    <script
      type="application/ld+json"
      // nosemgrep: typescript.react.security.audit.react-dangerouslysetinnerhtml.react-dangerouslysetinnerhtml -- input is escaped by serializeJsonLdAsHtml; see comment above.
      dangerouslySetInnerHTML={{ __html: serializeJsonLdAsHtml(data) }}
    />
  );
}
