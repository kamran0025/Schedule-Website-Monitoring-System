import { Router } from "express";
import { Types } from "mongoose";

import { env } from "../config/env.js";
import { requireApiKey } from "../middleware/auth.middleware.js";
import { ExecutionHistoryModel } from "../models/executionHistory.model.js";
import { MIN_SCHEDULE_INTERVAL_MINUTES, ScheduleModel } from "../models/schedule.model.js";

export const scheduleRouter = Router();

scheduleRouter.use(requireApiKey);

function isValidUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

async function findOwnedSchedule(id: string, instanceId: string) {
  if (!Types.ObjectId.isValid(id)) return null;
  return ScheduleModel.findOne({ _id: id, instanceId });
}

scheduleRouter.post("/", async (req, res) => {
  const { url, email, intervalMinutes } = req.body as {
    url?: string;
    email?: string;
    intervalMinutes?: number;
  };

  if (!url || !isValidUrl(url)) {
    res.status(400).json({ error: "url must be a valid http(s) URL" });
    return;
  }
  if (!email || !isValidEmail(email)) {
    res.status(400).json({ error: "email must be a valid email address" });
    return;
  }
  if (typeof intervalMinutes !== "number" || intervalMinutes < MIN_SCHEDULE_INTERVAL_MINUTES) {
    res.status(400).json({
      error: `intervalMinutes must be a number >= ${MIN_SCHEDULE_INTERVAL_MINUTES}`,
    });
    return;
  }

  const activeCount = await ScheduleModel.countDocuments({
    instanceId: req.instanceId,
    status: "active",
  });
  if (activeCount >= env.maxActiveSchedulesPerInstance) {
    res.status(429).json({
      error: `Maximum of ${env.maxActiveSchedulesPerInstance} active schedules reached`,
    });
    return;
  }

  const schedule = await ScheduleModel.create({
    instanceId: req.instanceId,
    email,
    url,
    intervalMinutes,
    // Due immediately: the scheduler's next poll tick picks this up right
    // away to capture the baseline hash/listing (worker.ts skips emailing
    // on a schedule's first check). Interval-paced checks only start after
    // that first run claims the schedule and pushes nextRunAt forward.
    nextRunAt: new Date(),
  });

  res.status(201).json(schedule);
});

scheduleRouter.get("/", async (req, res) => {
  const schedules = await ScheduleModel.find({ instanceId: req.instanceId }).sort({
    createdAt: -1,
  });
  res.json(schedules);
});

scheduleRouter.patch("/:id/pause", async (req, res) => {
  const schedule = await findOwnedSchedule(req.params.id, req.instanceId!);
  if (!schedule) {
    res.status(404).json({ error: "Schedule not found" });
    return;
  }

  schedule.status = "paused";
  await schedule.save();
  res.json(schedule);
});

scheduleRouter.patch("/:id/resume", async (req, res) => {
  const schedule = await findOwnedSchedule(req.params.id, req.instanceId!);
  if (!schedule) {
    res.status(404).json({ error: "Schedule not found" });
    return;
  }

  if (schedule.status !== "active") {
    const activeCount = await ScheduleModel.countDocuments({
      instanceId: req.instanceId,
      status: "active",
    });
    if (activeCount >= env.maxActiveSchedulesPerInstance) {
      res.status(429).json({
        error: `Maximum of ${env.maxActiveSchedulesPerInstance} active schedules reached`,
      });
      return;
    }
  }

  schedule.status = "active";
  schedule.nextRunAt = new Date(Date.now() + schedule.intervalMinutes * 60_000);
  await schedule.save();
  res.json(schedule);
});

scheduleRouter.delete("/:id", async (req, res) => {
  const schedule = await findOwnedSchedule(req.params.id, req.instanceId!);
  if (!schedule) {
    res.status(404).json({ error: "Schedule not found" });
    return;
  }

  await schedule.deleteOne();
  await ExecutionHistoryModel.deleteMany({ scheduleId: schedule._id });
  res.status(204).send();
});

scheduleRouter.post("/:id/run", async (req, res) => {
  const schedule = await findOwnedSchedule(req.params.id, req.instanceId!);
  if (!schedule) {
    res.status(404).json({ error: "Schedule not found" });
    return;
  }

  schedule.nextRunAt = new Date();
  await schedule.save();
  res.status(202).json(schedule);
});
