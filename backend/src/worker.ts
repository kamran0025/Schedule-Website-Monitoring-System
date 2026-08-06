import { connectDb } from "./config/db.js";
import { startWorker } from "./queue/worker.js";

async function start(): Promise<void> {
  await connectDb();
  startWorker();
}

start().catch((error: unknown) => {
  console.error("Failed to start worker:", error);
  process.exit(1);
});
