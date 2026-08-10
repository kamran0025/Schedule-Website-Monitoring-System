// Collapses the whitespace noise Readability's textContent leaves behind
// (non-breaking spaces, trailing spaces per line, runs of blank lines) so
// downstream consumers (content-hash diffing, summarization) see stable,
// compact text instead of being sensitive to incidental whitespace churn.
export function normalizeText(raw: string): string {
  const lines = raw
    .replace(/\u00a0/g, " ")
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim());

  const collapsed: string[] = [];
  for (const line of lines) {
    if (line.length === 0 && collapsed[collapsed.length - 1]?.length === 0) continue;
    collapsed.push(line);
  }

  return collapsed.join("\n").trim();
}
