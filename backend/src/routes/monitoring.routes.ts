import { Router } from "express";
import mongoose from "mongoose";

import { logger } from "../config/logger.js";
import { createRedisConnection } from "../queue/connection.js";
import { executionQueue } from "../queue/executionQueue.js";

export const monitoringRouter = Router();

// A dedicated long-lived connection just for health pings, rather than
// opening a fresh ioredis connection per request. ioredis emits 'error' on
// connection trouble; without a listener, Node treats that as an unhandled
// 'error' event and crashes the process, so this has to be registered even
// though we only care about the outcome of ping() below.
const redisHealthClient = createRedisConnection();
redisHealthClient.on("error", (error) => {
  logger.warn({ err: error }, "Health-check Redis connection error");
});

monitoringRouter.get("/health", async (_req, res) => {
  const mongoUp = mongoose.connection.readyState === 1;

  let redisUp: boolean;
  try {
    await redisHealthClient.ping();
    redisUp = true;
  } catch {
    redisUp = false;
  }

  const healthy = mongoUp && redisUp;
  res.status(healthy ? 200 : 503).json({
    status: healthy ? "ok" : "degraded",
    mongo: mongoUp ? "up" : "down",
    redis: redisUp ? "up" : "down",
  });
});

// Deliberately unauthenticated, same as /health - it only exposes queue
// depth and process resource usage, nothing user-specific. In a real
// deployment this should sit behind network-level restriction (a
// reverse proxy / VPC-only access) rather than application auth, same as
// a typical Prometheus /metrics endpoint - that's a Phase 15 concern.
monitoringRouter.get("/metrics", async (_req, res) => {
  const queueCounts = await executionQueue.getJobCounts(
    "waiting",
    "active",
    "completed",
    "failed",
    "delayed",
  );

  res.json({
    uptimeSeconds: Math.round(process.uptime()),
    memory: process.memoryUsage(),
    queue: queueCounts,
  });
});
