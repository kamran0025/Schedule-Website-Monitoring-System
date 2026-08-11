import { Readability } from "@mozilla/readability";
import { JSDOM } from "jsdom";

import { normalizeText } from "./normalizeText.js";
import { stripBoilerplate } from "./stripBoilerplate.js";

export class ContentExtractionError extends Error {}

export interface ExtractedContent {
  title: string;
  html: string;
  text: string;
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
