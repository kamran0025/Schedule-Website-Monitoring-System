import puppeteer, { type Browser } from "puppeteer";

import { env } from "../config/env.js";
import { logger } from "../config/logger.js";

// A pool of independently-launched Chromium processes, drawn round-robin,
// rather than one shared browser. Spreads concurrent renders across
// multiple processes so one crashed/wedged browser doesn't stall every
// in-flight render at once, and a crash only takes down whichever slice
// of traffic was assigned to that slot while it relaunches.
const LAUNCH_ARGS = [
  "--no-sandbox",
  "--disable-setuid-sandbox",
  "--disable-dev-shm-usage",
  "--disable-gpu",
  "--js-flags=--max-old-space-size=256",
];

interface PoolSlot {
  browserPromise: Promise<Browser> | null;
}

let pool: PoolSlot[] | null = null;
let nextSlot = 0;

function getPool(): PoolSlot[] {
  if (!pool) {
    pool = Array.from({ length: env.renderBrowserPoolSize }, () => ({ browserPromise: null }));
  }
  return pool;
}

async function launchBrowser(slot: PoolSlot): Promise<Browser> {
  const browser = await puppeteer.launch({ headless: true, args: LAUNCH_ARGS });
  browser.on("disconnected", () => {
    slot.browserPromise = null;
  });
  return browser;
}

export async function getBrowser(): Promise<Browser> {
  const slots = getPool();
  const slot = slots[nextSlot];
  nextSlot = (nextSlot + 1) % slots.length;

  if (!slot.browserPromise) {
    slot.browserPromise = launchBrowser(slot).catch((error: unknown) => {
      slot.browserPromise = null;
      throw error;
    });
  }
  return slot.browserPromise;
}

export async function closeBrowser(): Promise<void> {
  if (!pool) return;
  const slots = pool;
  pool = null;

  await Promise.all(
    slots.map(async (slot) => {
      if (!slot.browserPromise) return;
      const browser = await slot.browserPromise.catch(() => null);
      await browser?.close().catch((error: unknown) => {
        logger.warn({ err: error }, "Error closing pooled browser");
      });
    }),
  );
}
