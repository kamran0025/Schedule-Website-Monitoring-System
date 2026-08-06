import type { HTTPRequest, Page } from "puppeteer";

import { env } from "../config/env.js";
import { getBrowser } from "./browser.js";
import { assertPublicHostname, assertRenderableUrl, SsrfBlockedError } from "./ssrfGuard.js";
import { Semaphore } from "./semaphore.js";

export class ResponseTooLargeError extends Error {}
export class RenderTimeoutError extends Error {}

export interface RenderResult {
  html: string;
  finalUrl: string;
}

// Resource types we never need for content extraction; blocking them keeps
// each render's bandwidth/memory footprint down.
const BLOCKED_RESOURCE_TYPES = new Set(["image", "media", "font"]);

const pageSemaphore = new Semaphore(env.renderMaxConcurrentPages);

// SSRF-checks every outbound request the rendered page makes (initial
// navigation, each redirect hop, and every subresource) so a malicious page
// can't pivot our server into fetching internal/metadata addresses. Results
// are cached per hostname for the lifetime of one render to avoid redundant
// DNS lookups for repeated hosts (e.g. a CDN used by many subresources).
function createRequestGuard() {
  const checked = new Map<string, Promise<boolean>>();

  function isHostnameAllowed(hostname: string): Promise<boolean> {
    let pending = checked.get(hostname);
    if (!pending) {
      pending = assertPublicHostname(hostname).then(
        () => true,
        () => false,
      );
      checked.set(hostname, pending);
    }
    return pending;
  }

  return async function handleRequest(request: HTTPRequest): Promise<void> {
    if (BLOCKED_RESOURCE_TYPES.has(request.resourceType())) {
      await request.abort("blockedbyclient").catch(() => undefined);
      return;
    }

    let hostname: string;
    try {
      hostname = new URL(request.url()).hostname;
    } catch {
      await request.abort("blockedbyclient").catch(() => undefined);
      return;
    }

    const allowed = await isHostnameAllowed(hostname);
    if (!allowed) {
      await request.abort("blockedbyclient").catch(() => undefined);
      return;
    }

    await request.continue().catch(() => undefined);
  };
}

// Tracks cumulative bytes actually received across the page via CDP -
// Content-Length is frequently absent (chunked transfer, HTTP/2 proxies
// like Cloudflare), so header-based accounting alone would silently never
// trip. Network.dataReceived fires per chunk as it arrives, letting us
// force-close the page as soon as the budget is exceeded instead of waiting
// for the download to finish.
async function attachResponseSizeGuard(
  page: Page,
  maxBytes: number,
  onExceeded: () => void,
): Promise<void> {
  const client = await page.createCDPSession();
  let total = 0;
  client.on("Network.dataReceived", (event) => {
    // encodedDataLength (wire/compressed size) is unreliably reported here -
    // often 0 even for real responses. dataLength (decoded bytes) is the
    // field CDP actually populates per chunk as it streams in.
    total += event.dataLength;
    if (total > maxBytes) onExceeded();
  });
  await client.send("Network.enable");
}

export async function renderPage(rawUrl: string): Promise<RenderResult> {
  const target = await assertRenderableUrl(rawUrl);

  const release = await pageSemaphore.acquire();
  try {
    const browser = await getBrowser();
    const page = await browser.newPage();

    try {
      await page.setUserAgent(env.renderUserAgent);
      await page.setViewport({ width: 1280, height: 800 });
      page.setDefaultNavigationTimeout(env.renderNavigationTimeoutMs);

      await page.setRequestInterception(true);
      page.on("request", createRequestGuard());

      let sizeExceeded = false;
      await attachResponseSizeGuard(page, env.renderMaxResponseBytes, () => {
        sizeExceeded = true;
        void page.close().catch(() => undefined);
      });

      try {
        await page.goto(target.toString(), {
          waitUntil: ["load", "networkidle2"],
          timeout: env.renderNavigationTimeoutMs,
        });
      } catch (error) {
        if (sizeExceeded) {
          throw new ResponseTooLargeError(
            `Response exceeded ${env.renderMaxResponseBytes} byte budget for ${rawUrl}`,
          );
        }
        if (error instanceof Error && error.name === "TimeoutError") {
          throw new RenderTimeoutError(`Navigation to ${rawUrl} timed out`);
        }
        throw error;
      }

      if (sizeExceeded) {
        throw new ResponseTooLargeError(
          `Response exceeded ${env.renderMaxResponseBytes} byte budget for ${rawUrl}`,
        );
      }

      const finalUrl = page.url();
      await assertPublicHostname(new URL(finalUrl).hostname);

      const html = await page.content();
      return { html, finalUrl };
    } finally {
      await page.close().catch(() => undefined);
    }
  } finally {
    release();
  }
}

export { SsrfBlockedError };
