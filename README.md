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

# Here's a walkthrough of everything Phase 11 & 12 added, grouped by concern:

1. Storing execution logs

worker.ts now writes one ExecutionHistory row per job **attempt** (not just per logical execution) via a new recordHistory() helper, so a job that fails twice and then succeeds shows up as three separate history rows — useful for seeing retry behavior, not just final outcome. A row is written at every exit point that already existed: render failure, extraction failure, unchanged-content skip, email failure, and success — each capturing status (success/failed/skipped), the error message where relevant, and contentHash/summary where they'd already been computed. The one branch that still doesn't record anything is "schedule no longer exists" (line ~50) — there's no owner left to show that history to, so it's a no-op by design, same as before.
models/executionHistory.model.ts (Phase 2's already-defined-but-unused model) — added a standalone index on startedAt, separate from the existing {scheduleId, startedAt} compound index, since the retention job below queries across all schedules by date alone and can't use a compound index whose leading field it doesn't filter on.
2. The history API

routes/history.routes.ts — GET /api/schedules/:scheduleId/history, mounted with mergeParams so it can read :scheduleId from its own path segment. Same conventions as schedule.routes.ts: requireApiKey, then an ownership check (the parent schedule must belong to req.instanceId) before returning anything, otherwise 404 — an instance can't enumerate another instance's execution history by guessing a schedule ID. Supports ?limit= (capped at 100, default 20) and ?status=success|failed|skipped for filtering, sorted newest-first.
schedule.routes.ts's DELETE /:id now also deletes that schedule's ExecutionHistory rows — without this, deleting a schedule would leave orphaned history no one could ever query again (the ownership check above requires the parent schedule to still exist).
3. Retention/cleanup job

history/historyCleanup.ts — startHistoryCleanup() is a poll loop shaped exactly like scheduler.ts (Phase 5): no cron-expression scheduling needed for a job that just runs once a day, deleting ExecutionHistory rows older than env.historyRetentionDays (default 30). Runs once immediately on startup too, not just after the first interval. Started from index.ts alongside startScheduler(), so it lives in the API process rather than the worker — it's a simple periodic Mongo delete, not something that needs BullMQ's retry/backoff machinery.
env.ts — added historyRetentionDays, historyCleanupIntervalMs (default 24h).
4. Displaying history in the extension

lib/historyApi.ts — typed listHistory(scheduleId) wrapper, mirroring scheduleApi.ts's conventions.
popup/components/ScheduleItem.tsx — a new "History" button toggles an inline, lazily-loaded list of that schedule's past runs (status, timestamp, and the error or summary snippet from that run), fetched once and cached in local state until the popup closes.
5. UI polish

Loading states: popup/components/Spinner.tsx (a small CSS-spin element) replaces the old plain-text "Loading..." in App.tsx and shows next to busy action buttons and while history is loading.
Toast notifications: lib/toast.tsx — a small self-built ToastProvider/useToast (no new dependency, to keep the popup bundle small) mounted once in main.tsx. ScheduleForm and ScheduleItem call toast.success()/toast.error() on every action's outcome, in addition to (not instead of) the existing inline error text, since inline errors persist for validation context while toasts are just transient confirmation.
Empty states: ScheduleList.tsx now distinguishes "no subscriptions yet" (nothing created) from "no subscriptions match your search" (filtered to nothing) via a hasAnySchedules prop, and the history panel shows "No executions yet." when a schedule has never run.
Search and filter: App.tsx adds a URL substring search box and an all/active/paused status filter above the subscription list, computed client-side via useMemo over the already-fetched schedule list (no new backend endpoint needed - the schedule list is already small per instance, capped by maxActiveSchedulesPerInstance).
Dark mode: popup/index.css sets color-scheme: light dark so native form controls follow the OS theme too. Every component now carries dark: Tailwind variants (backgrounds, text, borders) alongside the existing light-mode classes. Tailwind v4's dark: variant already follows prefers-color-scheme by default with zero config — there's no tailwind.config.js in this project (v4 is CSS-first) and none was needed for this.
Not run against a live Redis/worker in this environment (same constraint as prior phases), but backend type-checks and lints clean, and the extension type-checks, lints (oxlint — one pre-existing-pattern warning about co-locating a hook with its provider in toast.tsx, not an error), and builds via vite build. Not manually clicked through in a loaded Chrome extension window here — worth a quick load-unpacked smoke test of the History button, search/filter, and a forced dark-mode toggle (OS-level or DevTools' rendering emulation) before considering Phase 12 fully done.

# Here's a walkthrough of the listing-page enhancement to Phase 8/9/10:

Real-world testing surfaced a gap: Readability (Phase 8) treats an entire page as one article, so a blog index/listing page - a grid of post teasers, not prose - gets flattened into one run-on paragraph, and the Phase 9 extractive summarizer then picks nonsense "top sentences" out of that flattened mess. The fix isn't a better summarizer; it's recognizing the page isn't a single article at all.

1. Detecting a listing page

dom/extractListing.ts (new) — runs before extractContent.ts gets a chance to flatten everything. It looks for the repeated-sibling DOM structure a set of post cards actually has: for every heading (h1-h4) on the page, it walks up the tree looking for a parent whose direct children repeat the same tag+class signature at least 3 times - the shape of "N post cards sharing a listing container." It picks the largest such group found anywhere on the page, then pulls a title/URL/excerpt out of each card. Returns null (not an empty array) when no confident repeated structure exists, so the caller falls back to today's single-article path exactly as before - this only changes behavior on pages that actually look like a listing.
dom/stripBoilerplate.ts — the header/footer/nav/script/etc. removal that extractContent.ts already did was pulled out into its own module so extractListing.ts could reuse it without duplicating the selector list.
Verified against synthetic markup shaped like the "Ideas worth reading" page from testing: a 5-post grid correctly comes back as 5 {title, url, excerpt} items, and a synthetic single-article page (one <h1>, several <h2> subheadings, prose <p>s - the shape Readability is actually meant for) correctly comes back null instead of a false-positive listing.
2. Reporting only newly-added posts, not the whole list every time

schedule.model.ts — added lastListingItemKeys: string[], the item URLs seen as of the last check for listing-mode schedules (single-article schedules keep using lastContentHash, untouched). worker.ts diffs the current listing's URLs against this stored set to find newItems, then unconditionally overwrites it with the full current snapshot (not a merge) - so an item that scrolls off the page and later reappears doesn't get double-reported, and a page with cosmetic churn (an ad slot reshuffling, a "5 min read" label changing) doesn't re-notify about posts you've already seen.
If nothing's new, the run is recorded as "skipped," same as the unchanged-content case for single articles.
3. A real per-post summary, not just the listing's teaser excerpt

worker.ts's summarizeListingItem() renders each new post's own URL (reusing Phase 7's renderPage) and runs it through the existing single-article pipeline (extractContent + summarizeContent) to get a genuine summary of that post - not just whatever short teaser text happened to be sitting on the index page. Capped at env.listingMaxItemsPerDigest (default 5) new posts per run, processed sequentially, to bound how many extra page renders one job triggers. If an individual post's page fails to render or extract (broken link, blocked by the SSRF guard, paywall with no extractable article), that one post falls back to its listing excerpt instead of failing the whole digest - one bad link shouldn't cost you the other four summaries.
The email still says how many were found even beyond the cap ("+ 3 more new posts not shown here"), so the count in the subject line ("5 new posts on ...") isn't silently wrong when there are more new posts than the cap shows.
4. The email itself

email/listingDigestEmail.ts (new) — builds an HTML bullet list (one <li> per post: linked title + its summary) and sends it through the exact same EmailJS template as the single-article digest (email/digestEmail.ts, refactored to expose a shared sendTemplateEmail() both digest types call), just with summary filled in as that HTML list instead of a paragraph.
email/escapeHtml.ts (new) — every title/summary/URL going into that bullet list comes from an arbitrary third-party page, and unlike the single-article digest (where title/summary are plain strings dropped into the dashboard template's own markup), the listing digest builds its own HTML fragment around this untrusted text. Without escaping, a page with something HTML-looking in a post title could inject markup into the recipient's email - so every value is HTML-escaped before being embedded.
One dashboard change needed on your end: the EmailJS template's {{summary}} placeholder is currently wrapped in a <p> (`<p style="...">{{summary}}</p>`) for the single-article case. A <ul> nested inside a <p> is invalid HTML - most mail clients will still render it tolerably, but swapping that wrapper to a <div> would make listing digests render correctly rather than just "probably fine."
env.ts — added listingMaxItemsPerDigest.
Not verified against a live EmailJS send or a real-world listing page in this environment - the detection heuristic is confirmed against synthetic markup (see point 1) and the backend type-checks/lints clean, but the actual "N posts crawled and summarized and emailed" path needs a real Redis + worker + a schedule pointed at an actual blog index to see the final email as EmailJS renders it.

# Here's a walkthrough of everything Phase 13 added, grouped by concern:

1. Logging

config/logger.ts — a single pino instance, pretty-printed with colors in development (via pino-pretty) and plain JSON lines in production (what a real log aggregator expects to parse, not colorized text meant for a terminal).
Every console.log/console.error in the operational code paths - config/db.ts, index.ts, worker.ts (the entry point), scheduler/scheduler.ts, history/historyCleanup.ts, queue/worker.ts, app.ts's error handler - now goes through logger.*, with structured fields (scheduleId, jobId, err) instead of string-interpolated messages where that's actually useful to filter on later.
app.ts also gets pino-http as request-logging middleware, mounted before the monitoring routes so /health and /metrics polling doesn't spam the log on every scrape.
2. Monitoring

routes/monitoring.routes.ts (new) — GET /health now actually checks something: mongoose.connection.readyState for Mongo and a ping() against a dedicated long-lived Redis connection, returning 503 with which dependency is down instead of always blindly returning {status: "ok"} regardless of whether the database is reachable.
GET /metrics exposes process.uptime()/process.memoryUsage() and BullMQ queue depth (waiting/active/completed/failed/delayed, via executionQueue.getJobCounts() - the Queue instance from queue/executionQueue.ts is now exported for this). Deliberately unauthenticated, same as /health - it's operational data, not user data, and in a real deployment this should be kept off the public internet at the network/proxy level rather than behind application auth (a Phase 15 concern, not something worth building a whole admin-auth system for here).
Both mounted before the /api rate limiter so monitoring tools polling them aren't rate-limited alongside real traffic.
3. Browser pool

render/browser.ts was rewritten from one shared Puppeteer browser to a round-robin pool of env.renderBrowserPoolSize (default 2) independently-launched Chromium processes. getBrowser()/closeBrowser() keep the exact same signatures, so renderPage.ts and queue/worker.ts needed zero changes - this is a drop-in internal upgrade. The page-concurrency cap from Phase 7 (renderMaxConcurrentPages, via the existing Semaphore in renderPage.ts) still bounds the total number of concurrent pages regardless of which pool slot they land on.
Also fixed a latent bug while at it: the original single-browser version never cleared browserPromise if launchBrowser() itself rejected (e.g. Chromium failing to start), so every subsequent render would keep awaiting the same permanently-rejected promise instead of retrying. Each pool slot now clears itself on a failed launch too, not just on a later disconnect.
4. Snapshot deduplication

render/snapshotCache.ts (new) — renderPageDeduped() coalesces renders by URL: concurrent callers for the same URL share one in-flight render instead of each triggering their own, and a completed render stays cached for env.snapshotDedupeTtlMs (default 2 minutes) for callers arriving slightly later. This matters because a full render is the most expensive step in the pipeline, and it's realistic for multiple schedules - different instances subscribed to the same popular blog, or a listing page linking to a post that's separately its own schedule - to become due around the same scheduler tick.
The TTL default is kept comfortably under MIN_SCHEDULE_INTERVAL_MINUTES (3 minutes) so no schedule ever sees content staler than its own configured cadence would already tolerate on its own.
queue/worker.ts now calls renderPageDeduped() instead of renderPage() directly, at both call sites: the main per-schedule render and each listing item's individual deep-summarization render.
5. Error handling

index.ts and worker.ts (entry points) both now register process.on("unhandledRejection", ...) (log and keep running - one async slip elsewhere shouldn't take down a process serving/processing everything else) and process.on("uncaughtException", ...) (log fatal and exit(1), since Node's own guidance is that the process is in an undefined state after a truly uncaught synchronous throw - restarting it is left to a process supervisor, which is a Phase 15 concern that doesn't exist yet).
queue/worker.ts's BullMQ Worker now has an worker.on("error", ...) listener - errors not tied to any specific job (e.g. connection trouble) would otherwise be an unhandled EventEmitter 'error' event, which Node treats as fatal.
Fixed a real bug along the way: history/historyCleanup.ts's poll loop called cleanupOldHistory() with void and no .catch(), unlike scheduler.ts's equivalent loop which already caught its own errors - a transient Mongo error during cleanup would have been an unhandled rejection. Now wrapped the same way scheduler.ts already does it.
env.ts — added logLevel, renderBrowserPoolSize, snapshotDedupeTtlMs.
package.json — added pino, pino-http (plus pino-pretty as a dev dependency for local formatting).
Verified in this environment: started the API against the real local Redis and MongoDB Atlas cluster used throughout this project, confirmed pretty-printed logs appear on startup, and hit both endpoints directly - GET /health returned {"status":"ok","mongo":"up","redis":"up"}, and GET /metrics returned real uptime/memory/queue-depth numbers reflecting actual BullMQ state left over from earlier testing (100 completed, 11 failed jobs). The browser pool and snapshot dedup changes type-check and lint clean but weren't separately exercised against a live multi-browser Puppeteer run or a real concurrent-duplicate-URL race in this session.