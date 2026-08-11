import { env } from "../config/env.js";
import { ExecutionHistoryModel } from "../models/executionHistory.model.js";

const DAY_MS = 24 * 60 * 60 * 1000;

async function cleanupOldHistory(): Promise<void> {
  const cutoff = new Date(Date.now() - env.historyRetentionDays * DAY_MS);
  const result = await ExecutionHistoryModel.deleteMany({ startedAt: { $lt: cutoff } });
  if (result.deletedCount > 0) {
    console.log(
      `History cleanup: removed ${result.deletedCount} execution record(s) older than ${env.historyRetentionDays}d`,
    );
  }
}

// A poll loop, same shape as scheduler.ts (Phase 5) - no need for
// cron-expression scheduling for a job that just runs once a day.
export function startHistoryCleanup(): NodeJS.Timeout {
  void cleanupOldHistory();
  return setInterval(() => {
    void cleanupOldHistory();
  }, env.historyCleanupIntervalMs);
}
