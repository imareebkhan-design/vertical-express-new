/** Keep a specific construction-product query from broadening to a raw material. */
export function expandedSearchTerms(query: string, records: readonly { word: string; synonyms: string }[]): string[] {
  const primary = query.trim().toLowerCase();
  const tokens = primary.split(/\s+/).filter(Boolean);
  const terms = new Set([primary]);
  for (const record of records) {
    const list = record.synonyms.split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
    if (tokens.includes(record.word) || primary === record.word || tokens.some(t => list.includes(t)) || list.includes(primary)) {
      terms.add(record.word);
      list.forEach(term => terms.add(term));
    }
  }
  // "steel" alone matches steel sinks and utensils. Preserve the existing
  // structural synonyms (steel bar/rod, iron rod, rebar) instead.
  const structural = /\b(?:tmt|rebar)\b|\b(?:steel|iron)\s+(?:rod|bar)s?\b/.test(primary);
  return [...terms].filter(term => term && !(structural && (term === "steel" || term === "iron")));
}

/** Short names such as ACC must match a word, not the middle of Accessories. */
export function matchesSearchName(name: string, term: string): boolean {
  const lower = name.toLowerCase();
  return term.length <= 3 ? lower.split(/[^a-z0-9]+/).includes(term) : lower.includes(term);
}
