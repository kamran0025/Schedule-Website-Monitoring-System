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

## Phase 9 - AI

-   [x] Content-hash change detection (skip summarization if unchanged)
-   [x] Build summarization service
-   [x] Define prompt
-   [x] Handle API failures

## Phase 10 - Email

-   [ ] Email template
-   [ ] Send digest
-   [ ] Link to original webpage

## Phase 11 - History

-   [ ] Store execution logs
-   [ ] Build history API
-   [ ] Display history in extension
-   [ ] Retention/cleanup job for old execution logs

## Phase 12 - UI Polish

-   [ ] Loading states
-   [ ] Toast notifications
-   [ ] Empty states
-   [ ] Search and filter
-   [ ] Dark mode

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
