import pino from "pino";

import { env } from "./env.js";

// Pretty-printed in development so `npm run dev`/`dev:worker` stay readable;
// plain JSON lines in production, which is what log aggregators (CloudWatch,
// Loki, etc.) expect to parse rather than colorized text.
export const logger = pino({
  level: env.logLevel,
  transport:
    env.nodeEnv === "development"
      ? { target: "pino-pretty", options: { colorize: true, translateTime: "SYS:standard" } }
      : undefined,
});
