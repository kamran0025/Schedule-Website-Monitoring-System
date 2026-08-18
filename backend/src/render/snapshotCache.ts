import { env } from "../config/env.js";
import { renderPage, type RenderResult } from "./renderPage.js";

interface CacheEntry {
  result: Promise<RenderResult>;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

function prune(): void {
  const now = Date.now();
  for (const [url, entry] of cache) {
    if (entry.expiresAt <= now) cache.delete(url);
  }
}

// A full render is the most expensive step in the pipeline (a real headless
// Chromium navigation). When multiple schedules - possibly from different
// instances, or a listing page linking to a post that's also its own
// schedule - point at the same URL and become due around the same
// scheduler tick, this coalesces them into a single render: concurrent
// callers for the same URL share the in-flight promise, and a completed
// render stays cached for a short window afterward for callers arriving
// slightly later. The TTL is kept comfortably under
// MIN_SCHEDULE_INTERVAL_MINUTES so no schedule ever sees content staler
// than its own configured cadence would already tolerate.
export async function renderPageDeduped(url: string): Promise<RenderResult> {
  prune();

  const cached = cache.get(url);
  if (cached) return cached.result;

  const resultPromise = renderPage(url);
  cache.set(url, { result: resultPromise, expiresAt: Date.now() + env.snapshotDedupeTtlMs });

  try {
    return await resultPromise;
  } catch (error) {
    cache.delete(url); // don't cache failures - the next caller should get a fresh attempt
    throw error;
  }
}
