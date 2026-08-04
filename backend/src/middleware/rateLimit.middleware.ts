import rateLimit, { ipKeyGenerator } from "express-rate-limit";

import { env } from "../config/env.js";

export const apiRateLimiter = rateLimit({
  windowMs: env.rateLimitWindowMs,
  max: env.rateLimitMaxRequests,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.header("x-instance-id") ?? ipKeyGenerator(req.ip ?? "unknown"),
});
