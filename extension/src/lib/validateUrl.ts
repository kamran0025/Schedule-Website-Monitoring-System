// Mirrors the syntactic half of the backend's parseRenderableUrl check
// (backend/src/render/ssrfGuard.ts) so bad input is caught before a
// round-trip. The SSRF/DNS check can't be replicated here and stays
// backend-only as the source of truth.
export function validatePageUrl(value: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return "Enter a valid URL";
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return "URL must start with http:// or https://";
  }
  return null;
}
