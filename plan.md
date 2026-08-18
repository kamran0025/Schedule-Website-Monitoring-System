# Universal Newsletter Extension - Project Plan

## Objective

Build a Chrome extension that lets users subscribe to any public webpage
by entering a URL and schedule frequency. A backend periodically renders
the page with Puppeteer, extracts meaningful content, generates an AI
summary, emails users, and allows schedule
management.

## Architecture

-   Chrome Extension (React + Vite + TypeScript)
-   Express.js Backend
-   MongoDB
-   Scheduler (BullMQ/Redis or node-cron for MVP)
-   Worker Service
-   Puppeteer
-   DOM Extraction
-   AI Summary Service
-   Email Service

## User Identification (MVP)

No full account system for MVP. Each extension install generates a unique
instance ID (stored locally) sent with every request; the user's email is
collected at subscribe time and stored on the Schedule. The backend issues
an API key per instance so schedule endpoints aren't open to anonymous
abuse. Full multi-user auth (login, ownership transfer across devices)
stays a future enhancement.

## Security & Abuse Prevention

Because this renders arbitrary user-supplied URLs server-side, it's an
SSRF vector by default. Required before Phase 7 ships:

-   Validate submitted URLs: http(s) only, resolve DNS and reject
    loopback/private/link-local ranges (including the 169.254.169.254
    cloud metadata address) before **and** after redirects.
-   Enforce a hard navigation timeout and max response size per render.
-   Cap concurrent Puppeteer pages and run the browser with a restricted
    resource budget (memory/CPU) so one bad page can't starve the worker.
-   Enforce a minimum schedule interval (e.g. 15 min) and a per-user cap
    on active schedules to prevent the service being used to hammer a
    target site.
-   Rate-limit the public API (per instance ID / IP) in addition to
    per-schedule interval limits.

## Milestones

### Phase 1: Project Setup

-   Backend (Express + TypeScript)
-   Chrome Extension (React + Vite)
-   Shared configuration

### Phase 2: Database

-   Schedule model
-   ExecutionHistory model

### Phase 3: Schedule APIs

-   Create Schedule
-   List Schedules
-   Pause Schedule
-   Resume Schedule
-   Delete Schedule
-   Run Now

### Phase 4: Extension UI

-   Create Schedule screen
-   Dashboard
-   Schedule actions

### Phase 5: Scheduler

-   Find due schedules
-   Queue execution jobs

### Phase 6: Queue & Workers

-   BullMQ setup
-   Worker processing
-   Retry strategy

### Phase 7: Puppeteer

-   URL validation / SSRF guard (see Security & Abuse Prevention)
-   Render webpage
-   Wait for page load
-   Extract HTML

### Phase 8: DOM Processing

-   Remove headers, footers, ads, scripts
-   Extract main/article content
-   Detect listing/index pages (a blog's post grid, not a single article) by
    the repeated post-card DOM structure, and extract each item's title,
    URL, and excerpt separately instead of flattening the whole page into
    one incoherent article — falls back to normal single-article extraction
    when no such repeated structure is found

### Phase 9: AI

-   Content-hash change detection (skip AI call if page is unchanged since
    last run — cost control, not just a future nice-to-have)
-   Summarize cleaned content
-   Limit output to concise digest
-   Listing pages: diff the current item list against the URLs seen on the
    last check (stored per schedule) so only newly-added posts are reported,
    not the same posts re-sent whenever the page's markup shifts slightly
-   Listing pages: render and summarize each new post's own page for a real
    summary, rather than relying on the short teaser text already sitting on
    the index page; capped per digest to bound render cost, with a
    per-post fallback to the teaser excerpt if that post's page fails

### Phase 10: Email

-   Send digest
-   Include original URL
-   Listing digest format: "N new posts" plus one bullet per post (linked
    title + summary), reusing the same EmailJS template as the
    single-article digest by filling its summary field with an HTML list
    instead of a paragraph

### Phase 11: History

-   Store execution logs
-   History API
-   Retention/cleanup policy (cap history growth per schedule)

### Phase 12: UI Improvements

-   Loading states
-   Toasts
-   Search & filter
-   Dark mode

### Phase 13: Production Readiness

-   Structured logging (pino) across the API and worker processes, replacing
    ad hoc console.log/error, plus HTTP request logging
-   Monitoring: a deeper /health check (Mongo + Redis connectivity, not just
    "the process is up") and a /metrics endpoint exposing BullMQ queue depth
    and process resource usage
-   Browser pool: multiple independently-launched Chromium processes drawn
    round-robin, instead of one shared browser, so a single crashed/wedged
    browser doesn't stall every in-flight render at once
-   Snapshot deduplication: coalesce renders of the same URL when multiple
    schedules (possibly from different instances) become due around the
    same scheduler tick, instead of rendering it once per schedule
-   Retry & backoff (already covered by Phase 6's BullMQ configuration)
-   Error handling: process-level unhandledRejection/uncaughtException
    handlers on both entry points, a BullMQ Worker 'error' listener, and a
    fix for an unguarded rejection in the history cleanup loop that could
    have crashed the API process

### Phase 14: Testing

-   Unit tests (DOM extraction, AI prompt building, URL validation)
-   Integration tests (schedule APIs, worker pipeline end-to-end)
-   SSRF/security test cases (private IPs, redirects, metadata endpoint)

### Phase 15: Deployment & Packaging

-   Backend deployment (Docker, hosting, env/secrets management)
-   Chrome Web Store packaging & listing
-   CI pipeline (lint, test, build)

## Future Enhancements

-   Slack/Discord notifications
-   Multiple monitored sections
-   Semantic diff
-   Browser pool optimization
-   Multi-user authentication
