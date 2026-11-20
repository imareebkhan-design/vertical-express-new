/**
 * Collapses runs of sections that share a group, preserving author order, so
 * the content file stays the source of sequence rather than an alphabetical
 * accident. A group can recur after another (the FAQ does), so each run is
 * keyed by its first section's id rather than by its group name — keying by
 * name gave React duplicate keys on /faq.
 */
export function groupSectionRuns<T extends { id: string; group?: string }>(
  sections: T[]
): { key: string; group?: string; items: T[] }[] {
  const runs: { key: string; group?: string; items: T[] }[] = [];
  for (const section of sections) {
    const last = runs[runs.length - 1];
    if (last && last.group === section.group) last.items.push(section);
    else runs.push({ key: section.id, group: section.group, items: [section] });
  }
  return runs;
}
