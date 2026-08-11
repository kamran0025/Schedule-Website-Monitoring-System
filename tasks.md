# TASKS.md

## Phase 1 - Setup

-   [x] Initialize Express.js + TypeScript backend
-   [x] Configure ESLint, Prettier, env handling
-   [x] Initialize React + Vite + Typescript Chrome Extension
-   [x] Configure TailwindCSS and API client

## Phase 2 - Database

-   [x] Create Schedule model
-   [x] Create ExecutionHistory model

## Phase 3 - APIs

-   [x] Extension instance ID + API key issuance/middleware
-   [x] POST /schedule (min interval + per-user schedule cap enforced)
-   [x] GET /schedule
-   [x] PATCH /schedule/:id/pause
-   [x] PATCH /schedule/:id/resume
-   [x] DELETE /schedule/:id
-   [x] POST /schedule/:id/run
-   [x] Rate limiting middleware

## Phase 4 - Extension UI

-   [x] Create subscription form
-   [x] Dashboard
-   [x] Pause/Resume/Delete actions
-   [x] Run Now action

## Phase 5 - Scheduler

-   [x] Implement scheduler
-   [x] Find due schedules
-   [x] Enqueue jobs

## Phase 6 - Queue

-   [x] Configure BullMQ
-   [x] Retry strategy
-   [x] Worker implementation

## Phase 7 - Puppeteer

-   [x] URL validation (http/https only)
-   [x] SSRF guard: block loopback/private/link-local IPs incl. 169.254.169.254, re-check after redirects
-   [x] Navigation timeout + max response size
-   [x] Concurrent page cap / resource budget
-   [x] Render page
-   [x] Wait for page load
-   [x] Extract HTML

## Phase 8 - DOM Processing

-   [x] Remove header/footer/navigation
-   [x] Extract main/article content
-   [x] Normalize text
-   [x] Detect listing/index pages (repeated post-card structure) and extract each item's title/URL/excerpt instead of flattening the whole page into one article

## Phase 9 - AI

-   [x] Content-hash change detection (skip summarization if unchanged)
-   [x] Build summarization service
-   [x] Define prompt
-   [x] Handle API failures
-   [x] Listing pages: track previously-seen item URLs per schedule, diff to find newly-added posts only
-   [x] Listing pages: deep-summarize each new post from its own page (not just the listing's teaser excerpt), capped per digest

## Phase 10 - Email

-   [x] Email template
-   [x] Send digest
-   [x] Link to original webpage
-   [x] Listing digest format: "N new posts" + bullet list (title, per-post summary, link) instead of one flattened paragraph

## Phase 11 - History

-   [x] Store execution logs
-   [x] Build history API
-   [x] Display history in extension
-   [x] Retention/cleanup job for old execution logs

## Phase 12 - UI Polish

-   [x] Loading states
-   [x] Toast notifications
-   [x] Empty states
-   [x] Search and filter
-   [x] Dark mode

## Phase 13 - Production

-   [ ] Logging
-   [ ] Monitoring
-   [ ] Browser pool
-   [ ] Snapshot deduplication
-   [ ] Error handling

## Phase 14 - Testing

-   [ ] Unit tests: DOM extraction
-   [ ] Unit tests: AI prompt building
-   [ ] Unit tests: URL validation / SSRF guard
-   [ ] Integration tests: schedule APIs
-   [ ] Integration tests: end-to-end worker pipeline

## Phase 15 - Deployment & Packaging

-   [ ] Dockerize backend
-   [ ] Configure hosting + secrets management
-   [ ] Chrome Web Store listing & packaging
-   [ ] CI pipeline (lint, test, build)
