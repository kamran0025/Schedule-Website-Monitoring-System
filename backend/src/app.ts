import cors from "cors";
import express, { type Express, type NextFunction, type Request, type Response } from "express";

import { apiRateLimiter } from "./middleware/rateLimit.middleware.js";
import { instanceRouter } from "./routes/instance.routes.js";
import { scheduleRouter } from "./routes/schedule.routes.js";

export function createApp(): Express {
  const app = express();

  app.use(cors());
  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.use("/api", apiRateLimiter);
  app.use("/api/instances", instanceRouter);
  app.use("/api/schedules", scheduleRouter);

  // Express identifies error middleware by arity, so `next` must stay even though it's unused.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  });

  return app;
}
