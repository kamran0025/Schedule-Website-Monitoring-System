import { env } from "../config/env.js";
import { ScheduleModel } from "../models/schedule.model.js";
import { enqueueExecution } from "../queue/executionQueue.js";

let pollHandle: NodeJS.Timeout | null = null;

// Re-checks status/nextRunAt on the update filter (not just the find), and advances
// nextRunAt as part of the same atomic write. That's what stops two overlapping poll
// ticks from both enqueueing the same due schedule.
async function claimDueSchedule(id: unknown, now: Date, intervalMinutes: number) {
  return ScheduleModel.findOneAndUpdate(
    { _id: id, status: "active", nextRunAt: { $lte: now } },
    { $set: { nextRunAt: new Date(now.getTime() + intervalMinutes * 60_000) } },
  );
}

export async function pollDueSchedules(): Promise<void> {
  const now = new Date();
  const dueSchedules = await ScheduleModel.find({
    status: "active",
    nextRunAt: { $lte: now },
  }).select("_id url intervalMinutes");

  for (const schedule of dueSchedules) {
    const claimed = await claimDueSchedule(schedule._id, now, schedule.intervalMinutes);
    if (!claimed) continue;

    await enqueueExecution({ scheduleId: claimed._id.toString(), url: claimed.url });
  }
}

export function startScheduler(): void {
  if (pollHandle) return;

  pollHandle = setInterval(() => {
    pollDueSchedules().catch((error: unknown) => {
      console.error("Scheduler poll failed:", error);
    });
  }, env.schedulerPollIntervalMs);

  console.log(`Scheduler started, polling every ${env.schedulerPollIntervalMs}ms`);
}
