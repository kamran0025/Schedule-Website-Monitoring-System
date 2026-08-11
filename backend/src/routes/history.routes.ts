import { Router } from "express";
import { Types } from "mongoose";

import { requireApiKey } from "../middleware/auth.middleware.js";
import { ExecutionHistoryModel } from "../models/executionHistory.model.js";
import { ScheduleModel } from "../models/schedule.model.js";

// Mounted at /api/schedules/:scheduleId/history - mergeParams so :scheduleId
// (owned by the parent scheduleRouter's path) is visible here too.
export const historyRouter = Router({ mergeParams: true });

historyRouter.use(requireApiKey);

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const HISTORY_STATUSES = new Set(["success", "failed", "skipped"]);

historyRouter.get("/", async (req, res) => {
  const { scheduleId } = req.params as { scheduleId: string };

  if (!Types.ObjectId.isValid(scheduleId)) {
    res.status(404).json({ error: "Schedule not found" });
    return;
  }

  const schedule = await ScheduleModel.findOne({
    _id: scheduleId,
    instanceId: req.instanceId,
  }).select("_id");
  if (!schedule) {
    res.status(404).json({ error: "Schedule not found" });
    return;
  }

  const limit = Math.min(Number(req.query.limit) || DEFAULT_LIMIT, MAX_LIMIT);
  const status = typeof req.query.status === "string" ? req.query.status : undefined;

  const query: Record<string, unknown> = { scheduleId };
  if (status && HISTORY_STATUSES.has(status)) {
    query.status = status;
  }

  const history = await ExecutionHistoryModel.find(query).sort({ startedAt: -1 }).limit(limit);
  res.json(history);
});
