import { createApp } from "./app.js";
import { connectDb } from "./config/db.js";
import { env } from "./config/env.js";

const app = createApp();

async function start(): Promise<void> {
  await connectDb();
  app.listen(env.port, () => {
    console.log(`Backend listening on port ${env.port} (${env.nodeEnv})`);
  });
}

start().catch((error: unknown) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});
