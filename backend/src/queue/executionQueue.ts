import { Queue } from "bullmq";

import { env } from "../config/env.js";
import { createRedisConnection } from "./connection.js";

export const EXECUTION_QUEUE_NAME = "schedule-execution";

export interface ExecutionJob {
  scheduleId: string;
  url: string;
}

// Exported so the /metrics route (monitoring.routes.ts) can read queue
// depth via getJobCounts() without opening its own separate Queue/connection.
export const executionQueue = new Queue<ExecutionJob>(EXECUTION_QUEUE_NAME, {
  connection: createRedisConnection(),
});

export async function enqueueExecution(job: ExecutionJob): Promise<void> {
  await executionQueue.add("execute", job, {
    attempts: env.executionJobMaxAttempts,
    backoff: { type: "exponential", delay: env.executionJobBackoffDelayMs },
    removeOnComplete: 100,
    removeOnFail: 500,
  });
}
