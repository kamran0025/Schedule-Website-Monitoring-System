import { JSDOM } from "jsdom";

import { stripBoilerplate } from "./stripBoilerplate.js";

export interface ListingItem {
  title: string;
  url: string;
  excerpt: string;
}

// A blog index page's post "cards" are what Readability treats as one big
// undifferentiated article, flattening every teaser into a single run-on
// paragraph. This looks for the repeated-sibling structure that shape
// actually has instead, so each card can become its own item.
const MIN_LISTING_ITEMS = 3;
const MIN_TITLE_LENGTH = 8;
const MAX_TITLE_LENGTH = 200;
const MAX_EXCERPT_LENGTH = 240;
const HEADING_SELECTOR = "h1, h2, h3, h4";

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function elementSignature(element: Element): string {
  const classes = Array.from(element.classList).sort().join(".");
  return classes ? `${element.tagName}.${classes}` : element.tagName;
}

function nearestLink(element: Element): Element | null {
  if (element.tagName === "A" && element.hasAttribute("href")) return element;
  return element.querySelector("a[href]") ?? element.closest("a[href]");
}

function resolveUrl(href: string, baseUrl: string): string | null {
  try {
    const resolved = new URL(href, baseUrl);
    return resolved.protocol === "http:" || resolved.protocol === "https:" ? resolved.toString() : null;
  } catch {
    return null;
  }
}

// Walks up from each heading looking for a parent whose direct children
// repeat the same tag/class signature at least MIN_LISTING_ITEMS times -
// the shape of a set of post cards sharing a listing container. Picks the
// largest such group found anywhere on the page.
function findCardGroup(document: Document): Element[] | null {
  const groups = new Map<string, Element[]>();

  for (const heading of document.querySelectorAll(HEADING_SELECTOR)) {
    const titleLength = normalizeWhitespace(heading.textContent ?? "").length;
    if (titleLength < MIN_TITLE_LENGTH || titleLength > MAX_TITLE_LENGTH) continue;

    let card: Element = heading;
    while (card.parentElement && card.parentElement !== document.body) {
      const parent = card.parentElement;
      const signature = elementSignature(card);
      const siblings = Array.from(parent.children).filter(
        (sibling) => elementSignature(sibling) === signature,
      );

      if (siblings.length >= MIN_LISTING_ITEMS) {
        const key = `${elementSignature(parent)}>${signature}`;
        const existing = groups.get(key);
        if (!existing || existing.length < siblings.length) {
          groups.set(key, siblings);
        }
        break;
      }
      card = parent;
    }
  }

  if (groups.size === 0) return null;
  return Array.from(groups.values()).sort((a, b) => b.length - a.length)[0];
}

function extractItem(card: Element, baseUrl: string): ListingItem | null {
  const heading = card.matches(HEADING_SELECTOR) ? card : card.querySelector(HEADING_SELECTOR);
  const title = normalizeWhitespace(heading?.textContent ?? "");
  if (!heading || title.length < MIN_TITLE_LENGTH) return null;

  const link = nearestLink(heading) ?? nearestLink(card);
  const href = link?.getAttribute("href");
  const url = href ? resolveUrl(href, baseUrl) : null;
  if (!url) return null;

  const excerpt = Array.from(card.querySelectorAll("p"))
    .map((p) => normalizeWhitespace(p.textContent ?? ""))
    .find((text) => text.length > 0 && text !== title);

  return { title, url, excerpt: (excerpt ?? "").slice(0, MAX_EXCERPT_LENGTH) };
}

// Returns null (rather than an empty array) when no confident repeated
// listing structure is found, so the caller falls back to treating the
// page as a single article via extractContent.ts instead.
export function extractListing(html: string, baseUrl: string): ListingItem[] | null {
  const dom = new JSDOM(html, { url: baseUrl });
  stripBoilerplate(dom.window.document);

  const cards = findCardGroup(dom.window.document);
  if (!cards) return null;

  const items: ListingItem[] = [];
  const seenUrls = new Set<string>();
  for (const card of cards) {
    const item = extractItem(card, baseUrl);
    if (!item || seenUrls.has(item.url)) continue;
    seenUrls.add(item.url);
    items.push(item);
  }

  return items.length >= MIN_LISTING_ITEMS ? items : null;
}
