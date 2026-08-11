import { UnrecoverableError, Worker, type Job } from "bullmq";

import { hashContent } from "../ai/contentHash.js";
import { summarizeContent } from "../ai/summarize.js";
import { env } from "../config/env.js";
import { ContentExtractionError, extractContent } from "../dom/extractContent.js";
import { EmailDeliveryError, sendDigestEmail } from "../email/digestEmail.js";
import { ScheduleModel } from "../models/schedule.model.js";
import { closeBrowser } from "../render/browser.js";
import { renderPage } from "../render/renderPage.js";
import { InvalidUrlError, SsrfBlockedError } from "../render/ssrfGuard.js";
import { createRedisConnection } from "./connection.js";
import { EXECUTION_QUEUE_NAME, type ExecutionJob } from "./executionQueue.js";

async function processExecutionJob(job: Job<ExecutionJob>): Promise<void> {
  console.log(`Processing execution job ${job.id} for schedule ${job.data.scheduleId} (${job.data.url})`);

  let html: string;
  let finalUrl: string;
  try {
    const result = await renderPage(job.data.url);
    html = result.html;
    finalUrl = result.finalUrl;
  } catch (error) {
    // A blocked/invalid URL will never succeed on retry - fail the job
    // permanently instead of burning the configured retry attempts on it.
    if (error instanceof SsrfBlockedError || error instanceof InvalidUrlError) {
      throw new UnrecoverableError(error.message);
    }
    throw error;
  }

  console.log(`Rendered ${html.length} chars of HTML for schedule ${job.data.scheduleId}`);

  let content;
  try {
    content = extractContent(html, finalUrl);
  } catch (error) {
    if (error instanceof ContentExtractionError) {
      throw new UnrecoverableError(error.message);
    }
    throw error;
  }

  console.log(
    `Extracted "${content.title}" (${content.text.length} chars) for schedule ${job.data.scheduleId}`,
  );

  const schedule = await ScheduleModel.findById(job.data.scheduleId).select("email lastContentHash");
  if (!schedule) {
    console.log(`Schedule ${job.data.scheduleId} no longer exists, dropping job ${job.id}`);
    return;
  }

  const contentHash = hashContent(content.text);
  if (contentHash === schedule.lastContentHash) {
    console.log(`Content unchanged for schedule ${job.data.scheduleId}, skipping summarization`);
    return;
  }

  const summary = summarizeContent(content.text);

  console.log(`Summary for schedule ${job.data.scheduleId}: ${summary}`);

  try {
    await sendDigestEmail({
      toEmail: schedule.email,
      title: content.title,
      summary,
      sourceUrl: finalUrl,
      runDate: new Date(),
    });
  } catch (error) {
    // A misconfigured template/service ID won't fix itself on retry -
    // fail the job permanently instead of burning retry attempts on it.
    if (error instanceof EmailDeliveryError) {
      throw new UnrecoverableError(error.message);
    }
    throw error;
  }

  console.log(`Digest email sent to ${schedule.email} for schedule ${job.data.scheduleId}`);

  schedule.lastContentHash = contentHash;
  await schedule.save();
}

export function startWorker(): Worker<ExecutionJob> {
  const worker = new Worker<ExecutionJob>(EXECUTION_QUEUE_NAME, processExecutionJob, {
    connection: createRedisConnection(),
    concurrency: env.executionWorkerConcurrency,
  });

  worker.on("completed", (job) => {
    console.log(`Execution job ${job.id} completed for schedule ${job.data.scheduleId}`);
  });

  worker.on("failed", (job, error) => {
    console.error(`Execution job ${job?.id} failed for schedule ${job?.data.scheduleId}:`, error);
  });

  worker.on("closed", () => {
    void closeBrowser();
  });

  console.log(`Worker started, concurrency ${env.executionWorkerConcurrency}`);
  return worker;
}
