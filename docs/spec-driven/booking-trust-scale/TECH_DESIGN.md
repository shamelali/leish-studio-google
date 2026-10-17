# Booking Trust & Scale — Technical Design

Status: Frozen
Based on PRD version/date: Draft 2026-10-16 (D1/D2/D3 decided)
Owner: main agent
Approval: Approved by user on 2026-10-16 (conditional: green verification — met)

## Current System State

- `POST /api/bookings` (`server.ts:1017-1101`): zod-validated (`server/validation.ts:30`), looks up salon/service/staff, optionally decodes Bearer leniently (`server.ts:1056-1068`, silent `catch`), builds `Booking` (`src/types.ts:62-92`), `createBooking` in the active store. No conflict check, no idempotency, no write rate limit.
- Stores: `JsonDataStore.createBooking` is synchronous (`server/data-store.ts:260`); `FirestoreStore` plain `set/add` (`server/firestore-store.ts:108`); `SupabaseStore` plain `insert` into `bookings(id, salon_id, client_email, data)` (`server/supabase-store.ts:90-99`).
- Lists: four endpoints return bare arrays; frontend hooks (`src/lib/api.ts:50-119`) expect arrays.
- Email: `server/email.ts` sends via Brevo REST, best-effort, never throws. No verification-code infrastructure exists.
- Booking identity: `clientId?` set only when a valid token is presented; `canModifyBooking` falls back to email comparison (`server.ts:396-400`).

## Overall Approach

Three vertical slices, shippable in order: (1) pagination envelope, (2) conflict + idempotency, (3) contact verification + token strictness. Slice 1 is independent of 2–3; slices 2 and 3 both touch `POST /api/bookings` and serialize on that handler. All three stores implement each slice; shared helpers live in `server/` (overlap math, envelope builder, code hashing).

## Modules and Responsibilities

| Module | Responsibility | Related FRs | Owned contracts |
|---|---|---|---|
| `server.ts` booking handler | auth strictness, verification check, conflict check call, idempotency check call, write limiter | FR-001…FR-005, FR-008 | `POST /api/bookings` request/response; `Idempotency-Key` header (pending G3) |
| `server/validation.ts` | `bookingSchema` += `contactCode?`; new `verifyRequestSchema`; `page`/`limit` query schema | FR-001, FR-006 | zod schemas |
| `server/slots.ts` (new) | `parseSlot(date, time)`, `slotEnd(start, durationMin)`, `overlaps(a, b)`; buffer = 0 | FR-004 | slot math (unit-tested, store-independent) |
| `server/contact-verification.ts` (new) | code issue/verify, hashing, expiry, attempt limits; Brevo send via `server/email.ts` | FR-001 | verification record shape per store |
| `server/pagination.ts` (new) | `parsePageQuery`, `envelope(data, total, page, limit)` | FR-006 | `{ data, pagination }` shape |
| `JsonDataStore` / `FirestoreStore` / `SupabaseStore` | per-store conflict query, idempotency + verification record CRUD, paginated reads | FR-004…FR-007 | store-level methods (see below) |
| `server/email.ts` | new `verificationCodeEmail` builder reusing Brevo transport | FR-001 | email subject/body |
| `src/lib/api.ts` + consumers | unwrap envelopes; send `Idempotency-Key`; verification UI flow in `BookingModal` | FR-009 | frontend response types |

## Interface Contracts

**Paginated envelope (all four lists):**
```json
GET /api/salons?page=2&limit=20
{ "data": [ ... ], "pagination": { "page": 2, "limit": 20, "total": 137, "pages": 7 } }
```
`page` 1-based default 1; `limit` default 20, max 100 (D5 assumed; invalid → 400). Unknown query keys ignored. Existing filters (`email`, `salonId` on bookings) apply before pagination; `total` counts post-filter rows.

**Booking create (after slices 2–3):**
- `POST /api/bookings` accepts optional `Idempotency-Key` header (G3) and optional `contactCode` body field.
- Authenticated: `clientId` = token user; contact must equal account email (case-insensitive) or be code-verified; else `422 { code: 'contact_unverified' }`.
- Present-but-invalid Bearer → `401` (FR-003). Absent Bearer → guest path (D1b).
- Guest with real email contact: requires valid `contactCode` for that contact, else `422 { code: 'contact_unverified' }`.
- `POST /api/bookings/verify-request { contact }` → `202` (always 202 for real emails to avoid enumeration; sends 6-digit OTP or magic link per G1). Non-email contacts → `422` unless G2 decides otherwise.
- Conflict → `409 { code: 'slot_conflict' }`. Idempotent replay → `200` with original booking (not `201`).

## Data Model and Migration

- `Booking` (`src/types.ts:62`): add optional `contactVerified: boolean` (audit/badge; backward compatible).
- Idempotency records `{ key, scope, bookingId, createdAt, expiresAt }`, scope = `user:{id}` or `guest:{normalizedContact}`. TTL 24h (pending G3). JSON: in-memory + persisted in `db_store.json`; Firestore: `idempotency_keys` collection; Supabase: `idempotency_keys` table.
- Verification records `{ contact, codeHash, expiresAt (10 min), attempts, verifiedAt? }`, same per-store placement. Codes: 6-digit numeric, sha256 stored, max 5 attempts then invalidate.
- Supabase pagination/sort needs indexed columns: add `created_at timestamptz` (+ backfill from `data->>'createdAt'`) to `bookings`, `users`; `reviews` ordering keeps in-code sort after `salon_id`-filtered select with `.range()`. Migration SQL ships with the change; RLS unchanged (service-role access).
- Supabase conflict enforcement: `starts_at`/`ends_at timestamptz` columns populated by app code at insert + `EXCLUDE USING gist (staff_id WITH =, tstzrange(starts_at, ends_at) WITH &&) WHERE (status <> 'cancelled')`. Recommended over rpc (bulletproof at DB level; race-free without app locks). Alternative (rpc `create_booking_if_free`): fallback if exclusion DDL is rejected in review.
- Firestore: conflict check inside `runTransaction` (pattern already used for reviews, `firestore-store.ts:132`); pagination via `orderBy + limit + offset(page)` (offset acceptable at current scale; cursor deferred).
- JSON store: synchronous check-then-insert is atomic in-process (no `await` between check and insert); single-process dev/test only — production requires durable backends already.

## State Transitions

- Booking statuses unchanged (`pending|confirmed|completed|cancelled`, `src/types.ts:60`).
- Conflict set: statuses `pending`, `confirmed`, `completed` block; `cancelled` never blocks (BR-2).
- Verification record: `issued → verified | expired | locked(attempts)`; consumed on first successful booking create (single-use).

## Concurrency, Consistency, and Idempotency

- Overlap math is pure and unit-tested (`server/slots.ts`): parse `YYYY-MM-DD` + `h:mm AM/PM` (same regexes as `bookingSchema`) to minutes-since-epoch; overlap = `a.start < b.end && b.start < a.end`; duration from the booked service's `serviceDuration`.
- Firestore: check + insert in one transaction → linearizable per slot.
- Supabase: exclusion constraint → database-linearizable; app maps `23P01`/exclusion violation to `409`.
- JSON: synchronous section → safe in-process.
- Idempotency: check key first; on miss, create booking + record atomically per store (Firestore txn; Supabase: unique index on `key` makes double-insert safe, second writer reads winner; JSON sync). Replay returns original with `200`.
- `POST /verify-request` rate-limited (per-contact + per-IP) to prevent code-spam and Brevo cost abuse.

## Authentication, Authorization, Privacy, and Security

- FR-003: `Authorization: Bearer <garbage>` → `401 { code: 'invalid_token' }`. Only absent header takes the guest path.
- Codes: crypto-random, hashed at rest, 10-min TTL, 5-attempt lockout, single-use, constant-time compare.
- `verify-request` returns `202` regardless (no account/contact enumeration); logs distinguish internally.
- PII: verification records contain only contact + hashes; expired records purged on read + periodic sweep.
- No change to TR-7 (`canModifyBooking`, role model) except bookings are now reliably attributable, which strengthens the email-fallback rather than replacing it.

## Failures, Retry, Recovery, and Degradation

- Brevo down / no `BREVO_API_KEY`: `verify-request` returns `503 { code: 'verification_unavailable' }` (differs from confirmation emails, which stay best-effort). Authenticated users booking with their own account email are unaffected.
- Store conflict-check failure (transient): `503`, client retries with same idempotency key — safe by construction.
- Clock skew: expiry comparisons use server clock only; codes valid 10 min server-side.

## Performance and Capacity

- Lists: bounded to ≤100 rows; Supabase uses indexed `order + range`; Firestore `limit/offset`; JSON slices in memory.
- Booking create adds: 1 verification read, 1 idempotency read/write, 1 conflict read — all indexed/keyed; no full-table scans introduced. (`findReviewEligibility` full scans remain out of scope.)
- Write limiter on `POST /api/bookings`: 20 req/min/IP (tune in review), separate bucket from read limiter (FR-008).

## Observability: Logs, Metrics, and Alerts

- Structured server logs (existing `console.warn` convention): `booking.conflict`, `booking.idempotent_replay`, `booking.unverified_rejected`, `verify.code_sent`, `verify.locked`.
- No new metrics infra (none exists); counts derivable from logs.

## Compatibility

- Breaking: envelope shape on four list endpoints — mitigated by same-release frontend update (A-1) and no known external consumers (A-2 to confirm).
- `Booking.contactVerified` additive-optional; old clients ignore it.
- New `409`/`422`/`401` cases are new behavior on previously-accepted requests — documented in release notes; frontend maps them to user messages.

## Release and Rollback

- Order: migrate Supabase columns → deploy API + frontend together → verify ACs on staging. Rollback = redeploy previous build; new columns/records are ignored by old code (additive only). No destructive migration.

## Test Boundaries

- Unit: `server/slots.test.ts` (overlap matrix incl. boundaries, midnight, invalid inputs).
- Store: conflict + idempotency tests per store (JSON sync; Firestore via emulator; Supabase via test project) incl. concurrent same-slot attempts.
- API (supertest): 401 on bad token; 422 unverified guest; verify-request → create success; replay same key → one booking; race two creates → one 201 + one 409; pagination defaults/caps/envelope on all four endpoints; role scoping preserved.
- Regression: full existing suite (`vitest run`) green.

## Alternatives Considered

- Exact-slot match instead of overlap (rejected by D2).
- Magic-link verification (pending G1).
- Cursor pagination (deferred: offset fine at current scale; total counts needed by admin UI anyway).
- Supabase rpc instead of exclusion constraint (fallback).

## Blocked Technical Issues

| Issue | Product dependency | Impact | Status |
|---|---|---|---|
| G1: OTP code for guest verification | D1b UX | Email builder + BookingModal flow | Decided: 6-digit OTP |
| G2: Non-email guest contacts under D1b | D1b | `verify-request` accepts emails only for guests | Decided: guests need email |
| G3: Idempotency transport + TTL | FR-005 | Header + fallback hash, 24h | Decided: header + 24h |

## Technical Decision Log

| Decision ID | Decision | Alternatives | Rationale | Related FRs |
|---|---|---|---|---|
| TD-1 | Envelope `{ data, pagination }`, page/limit, max 100 | Bare array + header | D3; explicit, matches repo API standard | FR-006 |
| TD-2 | Duration-overlap with 0 buffer, pure `server/slots.ts` | DB-native range ops per store | D2; one tested implementation, all stores share it | FR-004 |
| TD-3 | Supabase exclusion constraint for conflicts | rpc function | Race-free at DB level; rpc is fallback | FR-004 |
| TD-4 | Inline `contactCode` on booking create (no separate confirm endpoint) | Two-step confirm API | Fewer endpoints, single round trip after code receipt | FR-001 |
| TD-5 | Verification send failure is fatal (503), unlike best-effort confirmations | Best-effort + allow unverified | A verification that can silently fail is no verification | FR-001 |
