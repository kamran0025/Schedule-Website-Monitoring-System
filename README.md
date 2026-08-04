# Schedule-Website-Monitoring-System

# Here's the current backend file layout and what each piece does, in the order they run:

Startup / config

backend/src/config/env.ts — reads and validates environment variables (NODE_ENV, PORT, MONGO_URI), throwing early if something required is missing. Everything else imports env from here instead of touching process.env directly.
backend/src/config/db.ts — connectDb() opens the Mongoose connection to MongoDB using env.mongoUri. Called once at boot.
App wiring

backend/src/app.ts — builds the Express app: registers cors, JSON body parsing, and the /health route. Exports createApp() so the app can be built without immediately binding to a port (useful for tests later).
backend/src/index.ts — the actual entry point. Calls connectDb(), and only once that succeeds, starts app.listen(). If the DB connection fails, it logs the error and exits instead of silently serving with no database.
Data models (Phase 2, just added)

backend/src/models/schedule.model.ts — defines the Schedule collection: one document per user's "watch this URL" subscription. Holds instanceId/email (who owns it), url/intervalMinutes (what to watch and how often), status (active/paused), and nextRunAt/lastRunAt/lastContentHash — the fields the Phase 5 scheduler and Phase 9 AI change-detection will read/write.
backend/src/models/executionHistory.model.ts — defines the ExecutionHistory collection: one document per worker run against a schedule (success/failed/skipped, timestamps, error message, content hash, summary sent). This is what Phase 11's history API will query.
Nothing in app.ts uses the models yet — that wiring (routes calling into ScheduleModel/ExecutionHistoryModel) is Phase 3.

# Here's a walkthrough of everything Phase 3 added, grouped by concern:

1. Instance identity (extension → backend auth)

Since there's no login system, each extension install needs its own credential. Two new pieces:

instance.model.ts — a Mongo collection mapping instanceId → apiKeyHash.
apiKey.ts — generateApiKey() makes a random 32-byte token; hashApiKey() SHA-256s it for storage; verifyApiKey() compares using timingSafeEqual so response-time doesn't leak how close a guess was.
instance.routes.ts — POST /api/instances takes an instanceId the extension generated locally, and returns a fresh API key. It only returns the raw key once, at registration — after that only the hash exists, so a second registration attempt for the same instanceId gets a 409.
2. Enforcing that identity on every request

auth.middleware.ts — requireApiKey reads the x-instance-id/x-api-key headers, looks up the instance, verifies the key, and sets req.instanceId. Missing headers or a bad key → 401.
types/express.d.ts — just makes TypeScript aware that req.instanceId exists.
rateLimit.middleware.ts — throttles requests, keyed by instance ID (or IP for the unauthenticated register call).
3. The Schedule CRUD API

schedule.routes.ts — all six endpoints from the task list, every one gated behind requireApiKey and scoped to req.instanceId so one instance can't see or touch another's schedules:

POST / — validates url is http/https, email looks like an email, intervalMinutes >= 15, and that the instance hasn't hit its active-schedule cap, then creates the schedule with nextRunAt computed from the interval.
GET / — lists that instance's schedules.
PATCH /:id/pause / PATCH /:id/resume — resume re-checks the active cap (otherwise you could dodge the cap by pausing and resuming in bulk).
DELETE /:id — hard delete.
POST /:id/run — sets nextRunAt to now. It doesn't execute anything yet, since the scheduler (Phase 5) and worker/queue (Phase 6) that would pick this up don't exist yet.
4. Config and wiring

env.ts — added maxActiveSchedulesPerInstance, rateLimitWindowMs, rateLimitMaxRequests (with .env/.env.example updated to match).
app.ts — mounted the rate limiter and both routers under /api, plus a catch-all JSON error handler so a failed DB call returns {error: "..."} instead of Express's default HTML error page.
One bug fixed along the way: express-rate-limit v7 refuses to start if a custom keyGenerator falls back to req.ip directly (IPv6 addresses can collide across subnets) — had to wrap that fallback in their ipKeyGenerator helper.