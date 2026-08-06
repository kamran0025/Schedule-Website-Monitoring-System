import { Queue } from "bullmq";

import { env } from "../config/env.js";
import { createRedisConnection } from "./connection.js";

export const EXECUTION_QUEUE_NAME = "schedule-execution";

export interface ExecutionJob {
  scheduleId: string;
  url: string;
}

const queue = new Queue<ExecutionJob>(EXECUTION_QUEUE_NAME, {
  connection: createRedisConnection(),
});

export async function enqueueExecution(job: ExecutionJob): Promise<void> {
  await queue.add("execute", job, {
    attempts: env.executionJobMaxAttempts,
    backoff: { type: "exponential", delay: env.executionJobBackoffDelayMs },
    removeOnComplete: 100,
    removeOnFail: 500,
  });
}
