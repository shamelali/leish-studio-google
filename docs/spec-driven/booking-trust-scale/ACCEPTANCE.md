# Booking Trust & Scale — Acceptance Contract

Status: Frozen
Based on PRD/Tech Design version/date: Draft 2026-10-16 (all product decisions D1–D3, G1–G3 decided)
Approval: Approved by user on 2026-10-16 (conditional: green verification — met)

## Scope Boundaries

### In Scope

- Booking auth strictness, guest OTP verification, slot-conflict + idempotency, pagination envelopes on the four list endpoints, frontend adaptation, write rate limit, full test coverage of the above.

### Out of Scope

- Past-date/working-hours validation, payments, review-eligibility scans, review atomicity, real-time availability holds, backfilling `clientId` on legacy rows.

### Non-goals

- Permission-model changes (TR-7), status-model changes, verification at account registration.

### Deferred

- Cursor pagination (offset ships now), per-salon configurable buffers, verified-contact badges in provider UI.

### Assumptions

- A-1 same-release API+frontend deploy; A-2 no external API consumers (to confirm before release); A-3 Firestore/Supabase support transactions/DDL; A-4 `serviceDuration` trustworthy.

### Release Blockers

- Every blocking AC below must pass with cited evidence. AC-012 (rate limit) is non-blocking but must be implemented or explicitly deferred before release.

### Definition of Done

- All blocking ACs evidenced; `tsc --noEmit` clean; `vitest run` fully green; `vite build` succeeds; Supabase migration applied on staging and verified; docs updated (`docs/11-api-specification.md` endpoint contracts).

## Acceptance Criteria

### AC-001 — Invalid Bearer token is rejected, never downgraded

- Related FRs: FR-003
- Blocking: Yes
- Scenario: `POST /api/bookings` with `Authorization: Bearer <garbage>` and an otherwise valid payload.
- Preconditions: valid salon/service/staff fixtures.
- Action/event: submit the request.
- Expected result: `401 { code: 'invalid_token' }`; no booking row created in any store.
- Required evidence: supertest transcript + row-count query before/after.

### AC-002 — Authenticated bookings bind to the token identity

- Related FRs: FR-002
- Blocking: Yes
- Scenario: signed-in client books with (a) their own account email, (b) someone else's email without a code.
- Preconditions: two user accounts.
- Action/event: submit both creates with a valid Bearer.
- Expected result: (a) `201`, persisted `clientId` = token user; (b) `422 { code: 'contact_unverified' }`, nothing persisted.
- Required evidence: supertest transcript + persisted row inspection.

### AC-003 — Guest verifies email, then books

- Related FRs: FR-001
- Blocking: Yes
- Scenario: anonymous guest end-to-end.
- Preconditions: Brevo configured on staging (or test double capturing the code); valid slot fixtures.
- Action/event: `POST /api/bookings/verify-request { contact }` → `202`; `POST /api/bookings` with payload + `contactCode` → `201`; same payload without code → `422`.
- Expected result: verified booking persists with `contactVerified: true`; unverified attempt persists nothing.
- Required evidence: supertest transcript + captured code + row inspection.

### AC-004 — Non-email guest contact is rejected

- Related FRs: FR-001
- Blocking: Yes
- Scenario: anonymous `verify-request` and booking create with `clientEmail: "client"`.
- Preconditions: none.
- Action/event: submit both requests.
- Expected result: `422` on both; nothing persisted or emailed.
- Required evidence: supertest transcript.

### AC-005 — Exact-slot conflict is rejected

- Related FRs: FR-004
- Blocking: Yes
- Scenario: two identical `(salon, staff, date, time)` requests, different contacts.
- Preconditions: first booking exists in `pending`.
- Action/event: submit the second create (verified contact).
- Expected result: `409 { code: 'slot_conflict' }`; exactly one row for the slot.
- Required evidence: supertest transcript + slot row-count query, per store type.

### AC-006 — Overlapping (non-identical) slots conflict; back-to-back is allowed

- Related FRs: FR-004
- Blocking: Yes
- Scenario: 60-min service at 10:00 AM exists; attempt 10:30 AM (overlap) and 11:00 AM (adjacent).
- Preconditions: seeded booking + service durations known.
- Action/event: submit both attempts.
- Expected result: 10:30 → `409`; 11:00 → `201`.
- Required evidence: supertest transcript + `server/slots.test.ts` boundary matrix green.

### AC-007 — Idempotent replay returns the original

- Related FRs: FR-005
- Blocking: Yes
- Scenario: same payload + same `Idempotency-Key` sent twice (simulated timeout retry).
- Preconditions: verified contact.
- Action/event: submit twice.
- Expected result: first `201`, second `200` with identical booking `id`; exactly one row.
- Required evidence: supertest transcript + row-count query.

### AC-008 — Concurrent race creates exactly one booking

- Related FRs: FR-004, FR-005
- Blocking: Yes
- Scenario: N parallel creates for the same slot with distinct idempotency keys.
- Preconditions: clean slot, all contacts verified.
- Action/event: fire concurrently.
- Expected result: exactly one `201`, rest `409`; exactly one row (JSON, Firestore emulator, Supabase test project).
- Required evidence: concurrency test output per store.

### AC-009 — Pagination envelope on all four lists

- Related FRs: FR-006
- Blocking: Yes
- Scenario: `GET /api/salons`, `/api/bookings` (as admin), `/api/users` (as admin), `/api/reviews/:salonId` with default, `?page=2&limit=5`, `?limit=1000`, `?limit=abc`.
- Preconditions: seeded rows exceeding one page.
- Action/event: request each variant.
- Expected result: `{ data, pagination: { page, limit, total, pages } }`; defaults `page=1, limit=20`; `limit>100` → `400`; non-numeric → `400`; `data.length ≤ limit`; `total`/`pages` consistent.
- Required evidence: supertest transcript for all four endpoints.

### AC-010 — Role scoping preserved under pagination

- Related FRs: FR-007
- Blocking: Yes
- Scenario: client, provider (with/without salon), admin hit `GET /api/bookings?page=1&limit=5` (+ admin filters).
- Preconditions: mixed-ownership bookings.
- Action/event: request as each role.
- Expected result: same visibility rules as today (`server.ts:991-1008`), paginated; provider without salon → `403`.
- Required evidence: supertest transcript per role.

### AC-011 — Dashboards work against envelopes

- Related FRs: FR-009
- Blocking: Yes
- Scenario: explore catalog, Client Portal bookings, Provider Dashboard, Admin Users load in a real browser build.
- Preconditions: staging build with seeded data.
- Action/event: navigate each surface; create a booking via BookingModal (incl. OTP step as guest).
- Expected result: lists render, counts correct, booking flow completes; no console errors from shape mismatch.
- Required evidence: manual check notes + screenshots, or e2E transcript if harness exists.

### AC-012 — Write rate limit on booking create

- Related FRs: FR-008
- Blocking: No
- Scenario: burst of `POST /api/bookings` from one IP beyond the bucket.
- Preconditions: limiter configured (e.g., 20/min).
- Action/event: exceed the bucket.
- Expected result: `429` with retry semantics; legitimate single requests unaffected.
- Required evidence: supertest burst transcript.

### AC-013 — No regressions

- Related FRs: all
- Blocking: Yes
- Scenario: existing quality gates.
- Preconditions: clean checkout, repaired `node_modules`.
- Action/event: `tsc --noEmit`, `vitest run`, `vite build`.
- Expected result: all green; baseline was 262 passed / 0 failed (2026-10-16).
- Required evidence: command outputs.

### AC-014 — Cancelled bookings do not block slots

- Related FRs: FR-004
- Blocking: Yes
- Scenario: slot held only by a `cancelled` booking.
- Preconditions: cancelled fixture row.
- Action/event: book the same slot.
- Expected result: `201`.
- Required evidence: supertest transcript.

### AC-015 — Verification codes expire, lock out, and are single-use

- Related FRs: FR-001
- Blocking: Yes
- Scenario: code reuse after success; 6th attempt after 5 failures; code older than 10 min.
- Preconditions: issued codes (test clock or short-TTL harness).
- Action/event: submit each case.
- Expected result: all rejected (`422`, locked record invalidated); no booking created.
- Required evidence: supertest/store-test transcript.

## Coverage Map

| FR ID | AC IDs | Coverage notes |
|---|---|---|
| FR-001 | AC-003, AC-004, AC-015 | Guest policy + OTP lifecycle + non-email rule |
| FR-002 | AC-002 | Identity binding |
| FR-003 | AC-001 | Token strictness |
| FR-004 | AC-005, AC-006, AC-008, AC-014 | Exact, overlap, race, cancellation |
| FR-005 | AC-007, AC-008 | Replay + race with distinct keys |
| FR-006 | AC-009 | Envelope everywhere |
| FR-007 | AC-010 | Scoping under pagination |
| FR-008 | AC-012 | Write limiter (non-blocking) |
| FR-009 | AC-011, AC-013 | Frontend + regression gates |
