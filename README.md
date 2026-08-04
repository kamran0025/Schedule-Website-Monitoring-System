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

# Here's a walkthrough of everything Phase 4 added, grouped by concern:

1. Instance identity (extension side)

The extension needed its half of the Phase 3 auth handshake:

lib/instance.ts — getOrCreateInstance() checks chrome.storage.local for a saved instanceId/apiKey; if none exists it generates an instanceId (crypto.randomUUID()), calls POST /api/instances to register it, and persists the returned apiKey. Cached in-memory too, and concurrent callers await the same in-flight registration instead of double-registering.
lib/apiClient.ts — a request interceptor now attaches x-instance-id/x-api-key to every call by awaiting getOrCreateInstance(), except for the /api/instances registration call itself (which can't have credentials yet — that's what would deadlock the interceptor against its own in-flight promise). Also fixed a pre-existing typo (API_BASE_UR → API_BASE_URL) that meant every request was going to baseURL: undefined.
2. Schedule API client

lib/scheduleApi.ts — typed wrappers for all six Phase 3 endpoints (list/create/pause/resume/delete/run) plus the Schedule type mirroring the Mongoose model.
lib/errors.ts — extractErrorMessage() pulls the {error: "..."} message out of a failed axios response so the UI can show the backend's actual validation message (e.g. "Maximum of 20 active schedules reached") instead of a generic failure string.
3. UI

popup/components/ScheduleForm.tsx — the subscription form: URL/email/interval inputs, client-side interval floor matching the backend's MIN_SCHEDULE_INTERVAL_MINUTES, inline error display, disabled submit while in flight.
popup/components/ScheduleItem.tsx / ScheduleList.tsx — the dashboard: one row per schedule showing status, interval, and a relative next-run time, with Pause/Resume (toggled by current status), Run Now, and Delete buttons. Each row tracks its own pending action so one schedule's request can't block or misattribute to another.
popup/App.tsx — wires it together: loads schedules on mount, prepends new ones on create, patches the changed row in place on pause/resume/run, and removes it on delete — no full refetch needed after an action.
Nothing here executes a render/summarize/email yet — Run Now still just flips nextRunAt to now, same as Phase 3, since the scheduler (Phase 5) and worker (Phase 6) aren't built.

# Here's a walkthrough of everything Phase 5 added, grouped by concern:

1. Finding due schedules

scheduler/scheduler.ts — startScheduler() runs pollDueSchedules() on a setInterval (env.schedulerPollIntervalMs, default 30s — no need for cron-expression scheduling here, just a fixed poll). Each tick finds every active schedule whose nextRunAt has passed.
2. Claiming them without double-processing

The tricky part of any poll-based scheduler: if a tick takes longer than the poll interval, or two ticks overlap, the same due schedule could get picked up twice before anything consumes it. claimDueSchedule() re-checks status: "active", nextRunAt: {$lte: now} inside a findOneAndUpdate — same filter as the find, plus the write — so the DB only lets one caller "win" per schedule. The winner's reward is having nextRunAt pushed forward by intervalMinutes immediately, atomically, in that same operation; a second concurrent tick's update simply matches nothing and comes back null, which the loop treats as "already claimed, skip."
3. Queueing execution jobs

scheduler/executionQueue.ts — a minimal enqueue() / process() interface deliberately shaped like BullMQ's Queue/Worker API. Right now it's in-process: enqueue() just calls whatever handler process() registered, or logs a warning and drops the job if nothing has registered one yet (nothing has — that's Phase 6). Keeping the interface identical means Phase 6 swaps the class body for a real Redis-backed BullMQ queue without touching scheduler.ts's call site.
4. Wiring

index.ts — startScheduler() is called right after connectDb() succeeds, before app.listen(), so the poll loop only starts once Mongo is reachable.
env.ts — added schedulerPollIntervalMs (SCHEDULER_POLL_INTERVAL_MS, default 30000).
Verified by hand against a running instance: created a schedule, called POST /:id/run to mark it due, and confirmed the next poll tick advanced nextRunAt by exactly intervalMinutes — proof the claim logic is doing its job instead of just re-running the same schedule forever.