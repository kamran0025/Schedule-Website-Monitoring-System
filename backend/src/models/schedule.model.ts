import { Schema, model, type InferSchemaType } from "mongoose";

export const MIN_SCHEDULE_INTERVAL_MINUTES = 15;

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
  },
  { timestamps: true },
);

scheduleSchema.index({ status: 1, nextRunAt: 1 });

export type Schedule = InferSchemaType<typeof scheduleSchema>;

export const ScheduleModel = model("Schedule", scheduleSchema);
