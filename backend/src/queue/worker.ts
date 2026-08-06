import { UnrecoverableError, Worker, type Job } from "bullmq";

import { env } from "../config/env.js";
import { closeBrowser } from "../render/browser.js";
import { renderPage } from "../render/renderPage.js";
import { InvalidUrlError, SsrfBlockedError } from "../render/ssrfGuard.js";
import { createRedisConnection } from "./connection.js";
import { EXECUTION_QUEUE_NAME, type ExecutionJob } from "./executionQueue.js";

async function processExecutionJob(job: Job<ExecutionJob>): Promise<void> {
  console.log(`Processing execution job ${job.id} for schedule ${job.data.scheduleId} (${job.data.url})`);

  let html: string;
  try {
    const result = await renderPage(job.data.url);
    html = result.html;
  } catch (error) {
    // A blocked/invalid URL will never succeed on retry - fail the job
    // permanently instead of burning the configured retry attempts on it.
    if (error instanceof SsrfBlockedError || error instanceof InvalidUrlError) {
      throw new UnrecoverableError(error.message);
    }
    throw error;
  }

  console.log(`Rendered ${html.length} chars of HTML for schedule ${job.data.scheduleId}`);
  // DOM extraction (Phase 8), AI summary (Phase 9), and email delivery
  // (Phase 10) aren't implemented yet.
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
