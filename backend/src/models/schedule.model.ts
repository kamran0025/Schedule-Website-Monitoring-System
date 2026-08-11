import { Schema, model, type InferSchemaType } from "mongoose";

export const MIN_SCHEDULE_INTERVAL_MINUTES = 3;

//defines the Schedule collection: one document per user's "watch this URL" subscription.
// Holds instanceId/email (who owns it), url/intervalMinutes (what to watch and how often),
// status (active/paused), and nextRunAt/lastRunAt/lastContentHash — the fields the Phase 5 scheduler
// and Phase 9 AI change-detection will read/write.

const scheduleSchema = new Schema(
  {
    instanceId: { type: String, required: true, index: true },
    email: { type: String, required: true },
    url: { type: String, required: true },
    intervalMinutes: {
      type: Number,
      required: true,
      min: MIN_SCHEDULE_INTERVAL_MINUTES,
    },
    status: {
      type: String,
      enum: ["active", "paused"],
      default: "active",
      required: true,
    },
    lastRunAt: { type: Date, default: null },
    nextRunAt: { type: Date, required: true },
    lastContentHash: { type: String, default: null },
    // For listing/index pages (extractListing.ts): the item URLs seen as
    // of the last check, so the next run can email only newly-added posts
    // instead of re-notifying about the same ones every time the page's
    // markup shifts slightly. Unused for single-article schedules, which
    // rely on lastContentHash instead.
    lastListingItemKeys: { type: [String], default: [] },
  },
  { timestamps: true },
);

scheduleSchema.index({ status: 1, nextRunAt: 1 });

export type Schedule = InferSchemaType<typeof scheduleSchema>;

export const ScheduleModel = model("Schedule", scheduleSchema);
