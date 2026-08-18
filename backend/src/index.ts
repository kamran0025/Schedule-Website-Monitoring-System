import { createApp } from "./app.js";
import { connectDb } from "./config/db.js";
import { env } from "./config/env.js";
import { logger } from "./config/logger.js";
import { startHistoryCleanup } from "./history/historyCleanup.js";
import { startScheduler } from "./scheduler/scheduler.js";

// A rejection reaching here means some async call slipped past every
// try/catch in the codebase - log it, but don't exit, since the API
// server serving other in-flight requests is still perfectly healthy.
process.on("unhandledRejection", (reason) => {
  logger.error({ err: reason }, "Unhandled promise rejection");
});

// A synchronous throw that escaped every handler leaves the process in an
// undefined state (Node's own guidance) - log and exit rather than keep
// serving requests from a process that might be half-broken. Restarting
// it is left to a process supervisor (Phase 15), which doesn't exist yet.
process.on("uncaughtException", (error) => {
  logger.fatal({ err: error }, "Uncaught exception - exiting");
  process.exit(1);
});

const app = createApp();

async function start(): Promise<void> {
  await connectDb();
  startScheduler();
  startHistoryCleanup();
  app.listen(env.port, () => {
    logger.info(`Backend listening on port ${env.port} (${env.nodeEnv})`);
  });
}

start().catch((error: unknown) => {
  logger.fatal({ err: error }, "Failed to start server");
  process.exit(1);
});
