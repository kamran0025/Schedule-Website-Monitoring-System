import "dotenv/config";

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const env = {
  nodeEnv: required("NODE_ENV", "development"),
  port: Number(required("PORT", "4000")),
  mongoUri: required("MONGO_URI", "mongodb://localhost:27017/newsletter-extension"),
  maxActiveSchedulesPerInstance: Number(required("MAX_ACTIVE_SCHEDULES_PER_INSTANCE", "20")),
  rateLimitWindowMs: Number(required("RATE_LIMIT_WINDOW_MS", String(15 * 60 * 1000))),
  rateLimitMaxRequests: Number(required("RATE_LIMIT_MAX_REQUESTS", "100")),
  schedulerPollIntervalMs: Number(required("SCHEDULER_POLL_INTERVAL_MS", String(30 * 1000))),
};
