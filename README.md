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

# Here's a walkthrough of everything Phase 6 added, grouped by concern:

1. Redis connection

queue/connection.ts — createRedisConnection() returns a fresh ioredis client per caller, with maxRetriesPerRequest: null (BullMQ's requirement for any connection it manages, since it handles retries for blocking commands itself). Each process (API/scheduler vs. worker) makes its own connection — no sharing needed since they run separately.
2. The real queue (replaces Phase 5's in-memory stand-in)

queue/executionQueue.ts — a BullMQ Queue named "schedule-execution". enqueueExecution() calls queue.add(), attaching the retry strategy at add-time: attempts (default 3) and exponential backoff (default 5s base delay), both configurable via env. Also caps Redis growth with removeOnComplete: 100 / removeOnFail: 500 so history doesn't accumulate forever. scheduler.ts now imports enqueueExecution from here instead of the old scheduler/executionQueue.ts, which is deleted — same call site, same job shape, just a real Redis-backed queue underneath instead of an in-process object.
3. The worker

queue/worker.ts — startWorker() creates a BullMQ Worker consuming that same queue, with concurrency from env (default 5 — the same knob Phase 7 will need to cap concurrent Puppeteer pages). completed/failed event listeners log outcomes so retry behavior is visible. The job processor itself is still a placeholder — it logs the job and returns — since rendering (Phase 7), DOM extraction (Phase 8), AI summary (Phase 9), and email (Phase 10) don't exist yet.
worker.ts (top-level entry point) — a separate process from the API: connects to Mongo, then starts the worker. Run via npm run dev:worker (or start:worker after build), independent of npm run dev. This matches the plan's architecture split between the Express backend and a distinct Worker Service — a heavy Puppeteer-driven worker shouldn't share a process with the request-handling API.
4. Config

env.ts — added redisUrl, executionJobMaxAttempts, executionJobBackoffDelayMs, executionWorkerConcurrency (with .env/.env.example updated to match).
Not verified end-to-end here — there's no Redis server or Docker available in this environment, so the queue/worker code is confirmed to build, lint, and fail gracefully (BullMQ/ioredis retry with backoff and log ECONNREFUSED rather than crashing) but hasn't been exercised against a live Redis. Point REDIS_URL at a real instance (local install or a hosted one) and run both npm run dev and npm run dev:worker to see a job actually flow through.

# Here's a walkthrough of everything Phase 7 added, grouped by concern:

1. Headless rendering

render/browser.ts — getBrowser() launches a single shared headless Puppeteer instance (sandbox flags off for container compatibility, capped heap via --js-flags) lazily on first use and reuses it across jobs; closeBrowser() tears it down on worker shutdown. If Chromium crashes, the disconnected event clears the cached promise so the next call relaunches instead of returning a dead browser forever.
render/renderPage.ts — renderPage(url) opens a page on that shared browser, navigates, and returns the fully-rendered HTML plus the final URL (post-redirects). Caps concurrent pages via a semaphore (env.renderMaxConcurrentPages) so a burst of due schedules can't spin up unbounded Chromium pages and exhaust memory.
render/semaphore.ts — a small permit-counting Semaphore used to enforce that concurrency cap; queued acquirers are handed the release directly rather than racing a freed permit.
2. Blocking SSRF, not just checking it once

render/ssrfGuard.ts — assertRenderableUrl() rejects non-http(s) URLs and resolves the hostname, blocking anything outside ipaddr.js's "unicast" range (loopback, private ranges, link-local including the 169.254.169.254 cloud metadata address, etc.) — fail-closed on unrecognized ranges rather than an denylist of known-bad ones.
renderPage.ts re-checks the hostname after navigation completes (page.url() may differ from the requested URL after redirects) and, more importantly, intercepts every request the page itself makes — the initial navigation, each redirect hop, and every subresource fetch — via Puppeteer's request interception, so a page can't pivot the server into fetching an internal address via a redirect or an `<img>`/`fetch()` it controls. Per-hostname results are cached for the life of one render to avoid redundant DNS lookups.
Image/media/font requests are aborted outright (BLOCKED_RESOURCE_TYPES) since they're irrelevant to content extraction and just cost bandwidth/memory.
3. Bounding the damage a hostile page can do

A CDP Network.dataReceived listener (attachResponseSizeGuard) tallies decoded bytes as they stream in and force-closes the page once env.renderMaxResponseBytes is exceeded — deliberately not relying on Content-Length, which is frequently absent (chunked transfer, HTTP/2 proxies). Distinguished from a normal timeout via a ResponseTooLargeError vs. RenderTimeoutError so the worker (Phase 6/10) can tell "page is huge" apart from "page is slow/broken."
4. Wiring

worker.ts's job processor now calls renderPage(job.data.url) instead of the Phase 6 placeholder; InvalidUrlError/SsrfBlockedError are treated as permanent failures (UnrecoverableError) since retrying won't change a hostname's IP range, while timeouts and size-limit errors are left to BullMQ's normal retry/backoff.
env.ts — added renderMaxConcurrentPages, renderNavigationTimeoutMs, renderMaxResponseBytes, renderUserAgent.
Not verified against a live Chromium in this environment (no display/sandbox available here) — confirmed to build and type-check; exercise it by running npm run dev:worker with a real REDIS_URL and watching a job render an actual page.

# Here's a walkthrough of everything Phase 8 & 9 added, grouped by concern:

1. Turning rendered HTML into clean article text

dom/extractContent.ts — extractContent(html, url) loads the rendered HTML into a JSDOM document, strips unambiguous chrome first (header/footer/nav/aside/script/style/iframe/svg/form, plus role="navigation"/"banner"/"contentinfo") rather than trusting Readability's text-density scoring alone to exclude it, then hands the cleaned document to @mozilla/readability to pull out the article's title/HTML/text. Throws ContentExtractionError when Readability can't find any article content (e.g. a page that's all chrome, or a non-article page).
dom/normalizeText.ts — normalizeText() collapses the whitespace noise Readability's textContent leaves behind (non-breaking spaces, trailing spaces per line, runs of blank lines) into stable, compact text, so the content-hash step below isn't sensitive to incidental whitespace churn between runs.
2. Skipping unnecessary summarization

ai/contentHash.ts — hashContent() is a thin SHA-256 wrapper over the normalized article text.
worker.ts loads the schedule's stored lastContentHash, hashes the freshly-extracted text, and short-circuits (no summarization, no save) if they match — the common case for a page that hasn't changed since the last poll.
3. Summarization

ai/summarize.ts — summarizeContent() is an extractive summarizer with no external API and no per-run cost: it splits the article into sentences, scores each by the average frequency (across the whole article) of its non-stopword terms, then keeps the four highest-scoring sentences in their original order. Short fragments (nav crumbs, citations) are filtered out by a minimum word count before scoring, since they otherwise spike the per-word average despite not being real content, and only the first ~60% of qualifying sentences are eligible at all, since trailing sections (references, related links) are rarely the article's substance regardless of site.
Chosen over an LLM-based summary for now since it has no API key, rate limit, or per-execution cost to manage — swapping in an LLM call later only means replacing this function's body, since the worker just awaits a string.
4. Wiring

worker.ts's job processor now runs render (Phase 7) → extractContent → hash-compare → summarizeContent → persist lastContentHash, in that order, after which nothing yet does anything with the summary — email delivery (Phase 10) doesn't exist yet, so the summary is currently just logged.
ContentExtractionError is treated as a permanent failure (UnrecoverableError), same reasoning as Phase 7's URL errors — a page that has no extractable article won't gain one on retry.
package.json — added @mozilla/readability and jsdom (plus @types/jsdom).
tasks.md — Phases 8 and 9 checked off.
Not verified against a live worker/Redis in this environment for the same reason as Phase 6/7 — confirmed to build and type-check. Exercise it by running npm run dev:worker against a real REDIS_URL and a schedule pointed at an actual article URL, then watching the logs for the extracted title and generated summary.

# Here's a walkthrough of everything Phase 10 added, grouped by concern:

1. Sending the digest

email/digestEmail.ts — sendDigestEmail() sends via EmailJS's Node SDK (@emailjs/nodejs), calling emailjs.send() with the service/template ID and public/private key from env, passing per-call options rather than a global emailjs.init() so the module stays stateless like the rest of the codebase. The private key is required (not just the public key) since EmailJS's origin-based allowlisting — its normal anti-abuse check for browser callers — doesn't apply to a server process; the private key is what lets a non-browser caller send at all.
The template itself lives in the EmailJS dashboard, not in this repo — buildTemplateParams() just fills in to_email, subject, title, summary, source_url (the link back to the original page), and run_date as template variables. Changing the email's look-and-feel means editing the dashboard template, not this file.
2. Telling permanent failures from transient ones

EmailDeliveryError marks failures a retry can't fix: a missing/invalid service or template ID (EmailJS rejects these by throwing a plain string, not an Error, straight out of its SDK — handled explicitly since it's an unusual failure shape) or EmailJS returning a 4xx (bad request, blocked recipient). worker.ts converts this into an UnrecoverableError, same pattern as Phase 7's SSRF errors and Phase 8's ContentExtractionError, so a broken config fails the job once instead of burning all retry attempts on an error that can't self-resolve.
Everything else — network errors, EmailJS 5xx, or 429 rate-limiting — is rethrown as a plain Error and left to BullMQ's existing retry/backoff (Phase 6), since those can plausibly succeed on the next attempt.
3. Wiring

worker.ts now selects schedule.email alongside lastContentHash, calls sendDigestEmail() right after summarizeContent(), and only advances lastContentHash after the email send succeeds — so a failed send (permanent or after retries exhausted) leaves the hash untouched and the next scheduled poll will regenerate the same summary and try sending again, rather than silently marking a never-delivered digest as done.
env.ts — added emailjsServiceId, emailjsTemplateId, emailjsPublicKey, emailjsPrivateKey, all required with no dev fallback (unlike most other env vars) since there's no meaningful default for a third-party account's credentials — the worker won't start without them configured.
package.json — added @emailjs/nodejs.
tasks.md — Phase 10 checked off.
Not verified against a live EmailJS account in this environment — no service/template/keys are configured here. Confirmed to build, lint, and type-check. To exercise it: create an EmailJS account, connect an email service (Gmail/Outlook/SMTP) in its dashboard, create a template using the `to_email`/`subject`/`title`/`summary`/`source_url`/`run_date` variables above, fill EMAILJS_SERVICE_ID/EMAILJS_TEMPLATE_ID/EMAILJS_PUBLIC_KEY/EMAILJS_PRIVATE_KEY into backend/.env, then run npm run dev:worker against a real REDIS_URL and a schedule pointed at a real article URL to see an actual digest land in an inbox.