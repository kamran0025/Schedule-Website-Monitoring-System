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
  redisUrl: required("REDIS_URL", "redis://localhost:6379"),
  executionJobMaxAttempts: Number(required("EXECUTION_JOB_MAX_ATTEMPTS", "3")),
  executionJobBackoffDelayMs: Number(required("EXECUTION_JOB_BACKOFF_DELAY_MS", "5000")),
  executionWorkerConcurrency: Number(required("EXECUTION_WORKER_CONCURRENCY", "5")),
  renderNavigationTimeoutMs: Number(required("RENDER_NAVIGATION_TIMEOUT_MS", "30000")),
  renderMaxResponseBytes: Number(required("RENDER_MAX_RESPONSE_BYTES", String(25 * 1024 * 1024))),
  renderMaxConcurrentPages: Number(required("RENDER_MAX_CONCURRENT_PAGES", "3")),
  renderUserAgent: required("RENDER_USER_AGENT", "NewsletterExtensionBot/1.0 (+render worker)"),
  emailjsServiceId: required("EMAILJS_SERVICE_ID"),
  emailjsTemplateId: required("EMAILJS_TEMPLATE_ID"),
  emailjsPublicKey: required("EMAILJS_PUBLIC_KEY"),
  emailjsPrivateKey: required("EMAILJS_PRIVATE_KEY"),
  historyRetentionDays: Number(required("HISTORY_RETENTION_DAYS", "30")),
  historyCleanupIntervalMs: Number(required("HISTORY_CLEANUP_INTERVAL_MS", String(24 * 60 * 60 * 1000))),
  listingMaxItemsPerDigest: Number(required("LISTING_MAX_ITEMS_PER_DIGEST", "5")),
};
