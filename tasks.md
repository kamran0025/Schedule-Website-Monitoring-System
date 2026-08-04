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

-   [ ] Configure BullMQ
-   [ ] Retry strategy
-   [ ] Worker implementation

## Phase 7 - Puppeteer

-   [ ] URL validation (http/https only)
-   [ ] SSRF guard: block loopback/private/link-local IPs incl. 169.254.169.254, re-check after redirects
-   [ ] Navigation timeout + max response size
-   [ ] Concurrent page cap / resource budget
-   [ ] Render page
-   [ ] Wait for page load
-   [ ] Extract HTML

## Phase 8 - DOM Processing

-   [ ] Remove header/footer/navigation
-   [ ] Extract main/article content
-   [ ] Normalize text

## Phase 9 - AI

-   [ ] Content-hash change detection (skip summarization if unchanged)
-   [ ] Build summarization service
-   [ ] Define prompt
-   [ ] Handle API failures

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
