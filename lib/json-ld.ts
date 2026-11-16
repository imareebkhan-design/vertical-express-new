/**
 * Serialises structured data for a `<script type="application/ld+json">` tag.
 *
 * `JSON.stringify` alone is not safe there: the HTML parser ends the script
 * element at the first `</script>` it sees, whatever JSON string it sits in. A
 * product title or category name containing that sequence would close the tag
 * and have the rest of the value parsed as markup. Writing every `<` as the
 * JSON unicode escape for U+003C leaves the JSON meaning unchanged and gives
 * the parser nothing to match.
 */
export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
