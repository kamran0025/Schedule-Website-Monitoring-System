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

### Phase 9: AI

-   Content-hash change detection (skip AI call if page is unchanged since
    last run — cost control, not just a future nice-to-have)
-   Summarize cleaned content
-   Limit output to concise digest

### Phase 10: Email

-   Send digest
-   Include original URL

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

-   Logging
-   Monitoring
-   Browser pool
-   Retry & backoff

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
