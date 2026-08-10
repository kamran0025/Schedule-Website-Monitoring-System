import { Readability } from "@mozilla/readability";
import { JSDOM } from "jsdom";

import { normalizeText } from "./normalizeText.js";

export class ContentExtractionError extends Error {}

export interface ExtractedContent {
  title: string;
  html: string;
  text: string;
}

// Elements that are unambiguously chrome regardless of how much text they
// contain. Readability scores content by text density and occasionally
// keeps a <nav> or <header> that's stuffed with links/text, so we strip
// these ourselves before handing the DOM to it rather than relying on
// scoring alone.
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

function stripBoilerplate(document: Document): void {
  for (const selector of BOILERPLATE_SELECTORS) {
    document.querySelectorAll(selector).forEach((element) => element.remove());
  }
}

export function extractContent(html: string, url: string): ExtractedContent {
  const dom = new JSDOM(html, { url });
  stripBoilerplate(dom.window.document);

  const article = new Readability(dom.window.document).parse();
  if (!article?.textContent?.trim()) {
    throw new ContentExtractionError(`Unable to extract article content from ${url}`);
  }

  return {
    title: article.title?.trim() ?? "",
    html: article.content ?? "",
    text: normalizeText(article.textContent),
  };
}
