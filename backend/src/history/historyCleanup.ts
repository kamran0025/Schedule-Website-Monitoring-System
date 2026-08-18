import { env } from "../config/env.js";
import { logger } from "../config/logger.js";
import { ExecutionHistoryModel } from "../models/executionHistory.model.js";

const DAY_MS = 24 * 60 * 60 * 1000;

async function cleanupOldHistory(): Promise<void> {
  const cutoff = new Date(Date.now() - env.historyRetentionDays * DAY_MS);
  const result = await ExecutionHistoryModel.deleteMany({ startedAt: { $lt: cutoff } });
  if (result.deletedCount > 0) {
    logger.info(
      `History cleanup: removed ${result.deletedCount} execution record(s) older than ${env.historyRetentionDays}d`,
    );
  }
}

function runCleanup(): void {
  cleanupOldHistory().catch((error: unknown) => {
    logger.error({ err: error }, "History cleanup failed");
  });
}

// A poll loop, same shape as scheduler.ts (Phase 5) - no need for
// cron-expression scheduling for a job that just runs once a day.
export function startHistoryCleanup(): NodeJS.Timeout {
  runCleanup();
  return setInterval(runCleanup, env.historyCleanupIntervalMs);
}
