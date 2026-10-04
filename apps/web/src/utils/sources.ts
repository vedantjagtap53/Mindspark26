// Turns the AI service's retrieval sources ("products\eln.md > ELN (reverse convertible) > What it
// is") into a short list grouped by document: [{ document: "ELN (reverse convertible)", sections:
// ["What it is", …] }]. Display only.

export interface SourceGroup {
  document: string;
  sections: string[];
}

export function groupSources(sources: string[]): SourceGroup[] {
  const groups = new Map<string, string[]>();
  for (const source of sources) {
    const parts = source
      .split('>')
      .map((p) => p.trim())
      .filter(Boolean);
    // parts[0] is the file path; parts[1] the document title; the rest the heading trail.
    const fallback = parts[0]?.split(/[\\/]/).pop()?.replace(/\.md$/i, '') ?? source;
    const document = (parts[1] ?? fallback).replace(/\s*\(DRAFT\)\s*$/i, ' (draft)');
    const section = parts.length > 2 ? parts[parts.length - 1]! : null;
    const list = groups.get(document) ?? [];
    if (section && !list.includes(section)) list.push(section);
    groups.set(document, list);
  }
  return [...groups].map(([document, sections]) => ({ document, sections }));
}
