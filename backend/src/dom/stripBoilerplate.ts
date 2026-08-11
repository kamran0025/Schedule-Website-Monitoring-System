// Elements that are unambiguously chrome regardless of how much text they
// contain. Readability scores content by text density and occasionally
// keeps a <nav> or <header> that's stuffed with links/text, so we strip
// these ourselves before handing the DOM to it (or to the listing
// detector) rather than relying on scoring alone.
const BOILERPLATE_SELECTORS = [
  "header",
  "footer",
  "nav",
  "aside",
  "script",
  "style",
  "noscript",
  "iframe",
  "svg",
  "form",
  '[role="navigation"]',
  '[role="banner"]',
  '[role="contentinfo"]',
];

export function stripBoilerplate(document: Document): void {
  for (const selector of BOILERPLATE_SELECTORS) {
    document.querySelectorAll(selector).forEach((element) => element.remove());
  }
}
