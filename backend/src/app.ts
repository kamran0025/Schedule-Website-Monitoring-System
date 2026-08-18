import cors from "cors";
import express, { type Express, type NextFunction, type Request, type Response } from "express";
import { pinoHttp } from "pino-http";

import { logger } from "./config/logger.js";
import { apiRateLimiter } from "./middleware/rateLimit.middleware.js";
import { historyRouter } from "./routes/history.routes.js";
import { instanceRouter } from "./routes/instance.routes.js";
import { monitoringRouter } from "./routes/monitoring.routes.js";
import { scheduleRouter } from "./routes/schedule.routes.js";

export function createApp(): Express {
  const app = express();

  app.use(cors());
  app.use(express.json());
  // Mounted before the monitoring routes so /health and /metrics don't
  // spam the request log every time something scrapes them.
  app.use(
    pinoHttp({
      logger,
      autoLogging: { ignore: (req) => req.url === "/health" || req.url === "/metrics" },
    }),
  );

  app.use(monitoringRouter);

  app.use("/api", apiRateLimiter);
  app.use("/api/instances", instanceRouter);
  app.use("/api/schedules", scheduleRouter);
  app.use("/api/schedules/:scheduleId/history", historyRouter);

  // Express identifies error middleware by arity, so `next` must stay even though it's unused.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    logger.error({ err }, "Unhandled request error");
    res.status(500).json({ error: "Internal server error" });
  });

  return app;
}
