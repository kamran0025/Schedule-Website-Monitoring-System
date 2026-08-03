import { Schema, model, Types, type InferSchemaType } from "mongoose";

// defines the ExecutionHistory collection:
// one document per worker run against a schedule (success/failed/skipped, timestamps, error message, content hash, summary sent). 
// This is what Phase 11's history API will query.


const executionHistorySchema = new Schema({
  scheduleId: { type: Types.ObjectId, ref: "Schedule", required: true, index: true },
  status: {
    type: String,
    enum: ["success", "failed", "skipped"],
    required: true,
  },
  startedAt: { type: Date, required: true },
  finishedAt: { type: Date, default: null },
  error: { type: String, default: null },
  contentHash: { type: String, default: null },
  summary: { type: String, default: null },
});

executionHistorySchema.index({ scheduleId: 1, startedAt: -1 });

export type ExecutionHistory = InferSchemaType<typeof executionHistorySchema>;

export const ExecutionHistoryModel = model("ExecutionHistory", executionHistorySchema);
