import { connectDb } from "./config/db.js";
import { logger } from "./config/logger.js";
import { startWorker } from "./queue/worker.js";

// See index.ts for the reasoning behind logging-not-exiting on rejection
// vs. logging-and-exiting on an uncaught exception - same trade-off
// applies here: one runaway job shouldn't take down every other
// concurrently-processing job in this worker.
process.on("unhandledRejection", (reason) => {
  logger.error({ err: reason }, "Unhandled promise rejection");
});

process.on("uncaughtException", (error) => {
  logger.fatal({ err: error }, "Uncaught exception - exiting");
  process.exit(1);
});

async function start(): Promise<void> {
  await connectDb();
  startWorker();
}

start().catch((error: unknown) => {
  logger.fatal({ err: error }, "Failed to start worker");
  process.exit(1);
});
