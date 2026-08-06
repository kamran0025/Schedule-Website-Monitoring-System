import { Worker, type Job } from "bullmq";

import { env } from "../config/env.js";
import { createRedisConnection } from "./connection.js";
import { EXECUTION_QUEUE_NAME, type ExecutionJob } from "./executionQueue.js";

async function processExecutionJob(job: Job<ExecutionJob>): Promise<void> {
  console.log(`Processing execution job ${job.id} for schedule ${job.data.scheduleId} (${job.data.url})`);
  // Rendering (Phase 7), DOM extraction (Phase 8), AI summary (Phase 9), and
  // email delivery (Phase 10) aren't implemented yet.
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

  console.log(`Worker started, concurrency ${env.executionWorkerConcurrency}`);
  return worker;
}
