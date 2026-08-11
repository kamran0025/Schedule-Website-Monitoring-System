// Listing digests embed page-derived text (post titles/excerpts) directly
// into an HTML fragment we build ourselves, unlike the single-article
// digest where the title/summary are plain strings dropped into the
// dashboard-managed template's own markup. Since that source text comes
// from an arbitrary third-party page, it must be escaped before going
// into our HTML - otherwise a page with something HTML-looking in a post
// title could inject markup into the recipient's email.
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
