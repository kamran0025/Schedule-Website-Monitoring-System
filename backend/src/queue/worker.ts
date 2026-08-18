import { UnrecoverableError, Worker, type Job } from "bullmq";

import { hashContent } from "../ai/contentHash.js";
import { summarizeContent } from "../ai/summarize.js";
import { env } from "../config/env.js";
import { logger } from "../config/logger.js";
import { ContentExtractionError, extractContent } from "../dom/extractContent.js";
import { extractListing, type ListingItem } from "../dom/extractListing.js";
import { EmailDeliveryError, sendDigestEmail } from "../email/digestEmail.js";
import { sendListingDigestEmail } from "../email/listingDigestEmail.js";
import { ExecutionHistoryModel } from "../models/executionHistory.model.js";
import { ScheduleModel } from "../models/schedule.model.js";
import { closeBrowser } from "../render/browser.js";
import { InvalidUrlError, SsrfBlockedError } from "../render/ssrfGuard.js";
import { renderPageDeduped } from "../render/snapshotCache.js";
import { createRedisConnection } from "./connection.js";
import { EXECUTION_QUEUE_NAME, type ExecutionJob } from "./executionQueue.js";

type HistoryStatus = "success" | "failed" | "skipped";

// One row per job attempt (so retries show up individually in the history
// API/UI, not just the final outcome) rather than one row per logical
// execution.
async function recordHistory(
  scheduleId: string,
  startedAt: Date,
  status: HistoryStatus,
  fields: { error?: string; contentHash?: string; summary?: string } = {},
): Promise<void> {
  await ExecutionHistoryModel.create({
    scheduleId,
    startedAt,
    finishedAt: new Date(),
    status,
    error: fields.error ?? null,
    contentHash: fields.contentHash ?? null,
    summary: fields.summary ?? null,
  });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// Renders one listing item's own page and summarizes it individually, so
// the digest shows a real per-post summary rather than just the short
// teaser excerpt already sitting on the index page. A single bad post
// (broken link, blocked by the SSRF guard, no extractable article)
// shouldn't sink the whole digest, so failures here fall back to the
// listing's teaser excerpt instead of throwing.
async function summarizeListingItem(
  item: ListingItem,
): Promise<{ title: string; url: string; summary: string }> {
  try {
    const { html, finalUrl } = await renderPageDeduped(item.url);
    const content = extractContent(html, finalUrl);
    // Prefer the title already read off the listing card - it's the
    // post's actual displayed title. The deep-rendered page's own <title>
    // is a less reliable fallback: some sites leave it as the site-wide
    // title on every post page, which is worse than what we already had.
    return { title: item.title || content.title, url: finalUrl, summary: summarizeContent(content.text) };
  } catch (error) {
    logger.warn({ err: error, url: item.url }, "Could not deep-summarize listing item");
    return { title: item.title, url: item.url, summary: item.excerpt || "No preview available." };
  }
}

async function processListingSchedule(
  job: Job<ExecutionJob>,
  startedAt: Date,
  items: ListingItem[],
  indexUrl: string,
): Promise<void> {
  const schedule = await ScheduleModel.findById(job.data.scheduleId).select(
    "email lastListingItemKeys lastRunAt",
  );
  if (!schedule) {
    logger.info({ scheduleId: job.data.scheduleId, jobId: job.id }, "Schedule no longer exists, dropping job");
    return;
  }

  // Never checked before: everything on the page would otherwise look
  // "new" and trigger a digest of the pre-existing backlog. Capture it as
  // the baseline instead - only items that show up on a later run (i.e.
  // added after the schedule was created) should ever get emailed.
  const isFirstRun = schedule.lastRunAt === null;

  const seenKeys = new Set(schedule.lastListingItemKeys);
  const newItems = items.filter((item) => !seenKeys.has(item.url));
  const contentHash = hashContent(items.map((item) => item.url).join("\n"));

  // Always snapshot the full current listing, whether or not anything new
  // was found - a merge that only ever adds keys would let an item that
  // scrolls off the page's first view and later reappears get reported as
  // "new" a second time.
  schedule.lastListingItemKeys = items.map((item) => item.url).slice(0, 300);
  schedule.lastRunAt = startedAt;
  await schedule.save();

  if (isFirstRun) {
    logger.info(
      { scheduleId: job.data.scheduleId, itemCount: items.length },
      "First check for schedule, capturing baseline listing without emailing",
    );
    await recordHistory(job.data.scheduleId, startedAt, "skipped", {
      contentHash,
      summary: "Baseline captured on first check; existing items not emailed",
    });
    return;
  }

  if (newItems.length === 0) {
    logger.info({ scheduleId: job.data.scheduleId }, "No new listing items");
    await recordHistory(job.data.scheduleId, startedAt, "skipped", { contentHash });
    return;
  }

  const toSummarize = newItems.slice(0, env.listingMaxItemsPerDigest);
  const summarized: Array<{ title: string; url: string; summary: string }> = [];
  for (const item of toSummarize) {
    summarized.push(await summarizeListingItem(item));
  }

  const historySummary = `${newItems.length} new post(s): ${summarized.map((item) => item.title).join("; ")}`;

  try {
    await sendListingDigestEmail({
      toEmail: schedule.email,
      indexUrl,
      items: summarized,
      totalNewCount: newItems.length,
      runDate: new Date(),
    });
  } catch (error) {
    await recordHistory(job.data.scheduleId, startedAt, "failed", {
      error: errorMessage(error),
      contentHash,
      summary: historySummary,
    });
    // A misconfigured template/service ID won't fix itself on retry -
    // fail the job permanently instead of burning retry attempts on it.
    if (error instanceof EmailDeliveryError) {
      throw new UnrecoverableError(error.message);
    }
    throw error;
  }

  logger.info(
    { scheduleId: job.data.scheduleId, email: schedule.email, newPostCount: newItems.length },
    "Listing digest sent",
  );
  await recordHistory(job.data.scheduleId, startedAt, "success", { contentHash, summary: historySummary });
}

async function processArticleSchedule(
  job: Job<ExecutionJob>,
  startedAt: Date,
  html: string,
  finalUrl: string,
): Promise<void> {
  let content;
  try {
    content = extractContent(html, finalUrl);
  } catch (error) {
    await recordHistory(job.data.scheduleId, startedAt, "failed", { error: errorMessage(error) });
    if (error instanceof ContentExtractionError) {
      throw new UnrecoverableError(error.message);
    }
    throw error;
  }

  logger.info(
    { scheduleId: job.data.scheduleId, title: content.title, chars: content.text.length },
    "Extracted article content",
  );

  const schedule = await ScheduleModel.findById(job.data.scheduleId).select(
    "email lastContentHash lastRunAt",
  );
  if (!schedule) {
    logger.info({ scheduleId: job.data.scheduleId, jobId: job.id }, "Schedule no longer exists, dropping job");
    return;
  }

  const contentHash = hashContent(content.text);

  // Never checked before: the page's current content would otherwise look
  // like a "change" and trigger an email right away. Capture it as the
  // baseline instead - only a change found on a later run (i.e. after the
  // schedule was created) should get emailed.
  if (schedule.lastRunAt === null) {
    logger.info({ scheduleId: job.data.scheduleId }, "First check for schedule, capturing baseline content without emailing");
    schedule.lastContentHash = contentHash;
    schedule.lastRunAt = startedAt;
    await schedule.save();
    await recordHistory(job.data.scheduleId, startedAt, "skipped", {
      contentHash,
      summary: "Baseline captured on first check; no email sent",
    });
    return;
  }

  if (contentHash === schedule.lastContentHash) {
    logger.info({ scheduleId: job.data.scheduleId }, "Content unchanged, skipping summarization");
    schedule.lastRunAt = startedAt;
    await schedule.save();
    await recordHistory(job.data.scheduleId, startedAt, "skipped", { contentHash });
    return;
  }

  const summary = summarizeContent(content.text);

  logger.info({ scheduleId: job.data.scheduleId, summary }, "Generated summary");

  try {
    await sendDigestEmail({
      toEmail: schedule.email,
      title: content.title,
      summary,
      sourceUrl: finalUrl,
      runDate: new Date(),
    });
  } catch (error) {
    await recordHistory(job.data.scheduleId, startedAt, "failed", {
      error: errorMessage(error),
      contentHash,
      summary,
    });
    // A misconfigured template/service ID won't fix itself on retry -
    // fail the job permanently instead of burning retry attempts on it.
    if (error instanceof EmailDeliveryError) {
      throw new UnrecoverableError(error.message);
    }
    throw error;
  }

  logger.info({ scheduleId: job.data.scheduleId, email: schedule.email }, "Digest email sent");

  schedule.lastContentHash = contentHash;
  schedule.lastRunAt = startedAt;
  await schedule.save();
  await recordHistory(job.data.scheduleId, startedAt, "success", { contentHash, summary });
}

async function processExecutionJob(job: Job<ExecutionJob>): Promise<void> {
  const startedAt = new Date();
  logger.info(
    { jobId: job.id, scheduleId: job.data.scheduleId, url: job.data.url },
    "Processing execution job",
  );

  let html: string;
  let finalUrl: string;
  try {
    const result = await renderPageDeduped(job.data.url);
    html = result.html;
    finalUrl = result.finalUrl;
  } catch (error) {
    await recordHistory(job.data.scheduleId, startedAt, "failed", { error: errorMessage(error) });
    // A blocked/invalid URL will never succeed on retry - fail the job
    // permanently instead of burning the configured retry attempts on it.
    if (error instanceof SsrfBlockedError || error instanceof InvalidUrlError) {
      throw new UnrecoverableError(error.message);
    }
    throw error;
  }

  logger.info({ scheduleId: job.data.scheduleId, chars: html.length }, "Rendered page");

  const listingItems = extractListing(html, finalUrl);
  if (listingItems) {
    logger.info(
      { scheduleId: job.data.scheduleId, itemCount: listingItems.length },
      "Detected a listing page",
    );
    await processListingSchedule(job, startedAt, listingItems, finalUrl);
    return;
  }

  await processArticleSchedule(job, startedAt, html, finalUrl);
}

export function startWorker(): Worker<ExecutionJob> {
  const worker = new Worker<ExecutionJob>(EXECUTION_QUEUE_NAME, processExecutionJob, {
    connection: createRedisConnection(),
    concurrency: env.executionWorkerConcurrency,
  });

  worker.on("completed", (job) => {
    logger.info({ jobId: job.id, scheduleId: job.data.scheduleId }, "Execution job completed");
  });

  worker.on("failed", (job, error) => {
    logger.error(
      { jobId: job?.id, scheduleId: job?.data.scheduleId, err: error },
      "Execution job failed",
    );
  });

  // Not tied to any specific job (connection issues, internal BullMQ
  // errors) - without a listener, this would surface as an unhandled
  // 'error' event and crash the whole worker process instead of just
  // logging it.
  worker.on("error", (error) => {
    logger.error({ err: error }, "Worker error");
  });

  worker.on("closed", () => {
    void closeBrowser();
  });

  logger.info(`Worker started, concurrency ${env.executionWorkerConcurrency}`);
  return worker;
}
