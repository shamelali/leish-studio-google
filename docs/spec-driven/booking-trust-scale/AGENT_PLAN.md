# Booking Trust & Scale — Agent Plan

Status: Frozen
Specification approval reference: user approval 2026-10-16 (conditional on green verification — met: `tsc` clean, `vitest` 262/262).
Shared contracts frozen at version/commit: envelope `{ data, pagination: { page, limit, total, pages } }`; `Booking.contactVerified?: boolean`; `Idempotency-Key` header + 24h TTL; OTP verification via `contactCode`.
Plan owner: Main agent

## Frozen Shared Contracts

| Contract/type/schema | Location | Owner | Change approval rule |
|---|---|---|---|
| Paginated envelope `{ data: T[], pagination: { page, limit, total, pages } }` | `server/pagination.ts` (new) | TASK-001 | Main agent only; frontend + API change together |
| `page` default 1 (1-based), `limit` default 20 / max 100, invalid → 400 | `server/validation.ts` pageQuerySchema | TASK-001 | Same |
| `Booking.contactVerified?: boolean` additive-optional | `src/types.ts:62` | TASK-003 | Additive only; never required |
| Overlap math `overlaps(a, b)` on minute ranges, buffer 0 | `server/slots.ts` (new) | TASK-002 | Pure function; changes need AC-006 re-proof |
| Verification record `{ contact, codeHash, expiresAt, attempts }` per store | `server/contact-verification.ts` (new) + stores | TASK-003 | Main agent only |
| Idempotency record `{ key, scope, bookingId, createdAt, expiresAt }` per store | stores | TASK-002 | Main agent only |

## Dependency Graph

- TASK-001 (pagination) — independent; no dependencies. Unblocks frontend envelope handling needed by later slices' UI work.
- TASK-002 (conflict + idempotency) — depends on nothing but serializes with TASK-001/003 on `server.ts` + stores. Runs after TASK-001.
- TASK-003 (verification + token strictness + limiter) — depends on TASK-002 (shares `POST /api/bookings` handler edits). Runs after TASK-002.

No parallel delegation: all three tasks overlap on `server.ts` and the three stores. Main agent executes sequentially.

## Ownership Map

| Task ID | Allowed paths | Forbidden paths | Overlap check |
|---|---|---|---|
| TASK-001 | `server/pagination.ts`, `server/validation.ts` (page schema only), `server.ts` (4 list handlers only), `server/data-store.ts` + `firestore-store.ts` + `supabase-store.ts` (list reads only), `src/lib/api.ts`, `src/components/SalonDetails.tsx` (review fetch only), `supabase/migrations/*` (pagination columns), new tests | `POST /api/bookings`, auth middleware, email, BookingModal | Overlaps TASK-002/003 on server.ts+stores → serialized, not parallel |
| TASK-002 | `server/slots.ts`, `server/slots.test.ts`, `server.ts` (booking-create only), stores (booking-create only), `supabase/migrations/*` (slot columns + exclusion constraint), store tests | list handlers, verification, email | Same → serialized |
| TASK-003 | `server/contact-verification.ts`, `server/email.ts` (builder only), `server/validation.ts` (booking/verify schemas), `server.ts` (booking-create + verify-request + limiter), `src/types.ts` (optional field only), `src/components/BookingModal.tsx` (OTP step), tests | list handlers, slot math | Same → serialized |

## Tasks

### TASK-001 — Paginated list endpoints + frontend unwrap

- Objective: all four list endpoints return the frozen envelope, bounded, with role scoping preserved; SPA renders unchanged.
- Related FRs: FR-006, FR-007, FR-009
- Related ACs: AC-009, AC-010, AC-011 (lists part), AC-013
- Inputs: frozen envelope contract; current handlers `server.ts:864, 987, 776, ~1137`.
- Dependencies: none.
- Allowed files/directories: see ownership map TASK-001.
- Forbidden files/directories: see ownership map TASK-001.
- Required outputs: `server/pagination.ts`; page/limit schema; 4 handlers paginated; per-store ranged reads (+ Supabase `created_at` migration if needed for ordering); `src/lib/api.ts` unwrap + `SalonDetails.tsx:75` unwrap; supertest coverage per AC-009/AC-010.
- Required checks: `tsc --noEmit`; `vitest run` (incl. new tests); `vite build`.
- Required evidence: supertest transcripts for 4 endpoints × variants; role matrix transcript; suite output.
- Stop and report when: A-2 is violated (an unknown API consumer surfaces); Supabase ordering needs a migration riskier than adding `created_at`; any existing test breaks on shape change.

### TASK-002 — Slot conflict + idempotency on booking create

- Objective: conflicting slots rejected `409`; retries idempotent; races serialize to exactly one booking across all three stores.
- Related FRs: FR-004, FR-005
- Related ACs: AC-005, AC-006, AC-007, AC-008, AC-014, AC-013
- Inputs: frozen overlap semantics; store implementations.
- Dependencies: TASK-001 complete (handler region stable).
- Allowed files/directories: see ownership map TASK-002.
- Forbidden files/directories: see ownership map TASK-002.
- Required outputs: `server/slots.ts` + unit matrix; per-store conflict checks (JSON sync, Firestore txn, Supabase exclusion + migration); idempotency records + `Idempotency-Key` handling; `409`/`200`-replay mapping; concurrency tests per store.
- Required checks: `tsc --noEmit`; `vitest run`; Firestore emulator test if configured; Supabase migration dry-run on test project only.
- Required evidence: race-test output per store; replay transcript; slots matrix output.
- Stop and report when: exclusion-constraint DDL is rejected by the Supabase project posture (fall back to rpc per design); emulator unavailable (document + cover with unit/integration instead).

### TASK-003 — Contact verification + token strictness + write limiter

- Objective: guests verify email via OTP before booking; identity binding enforced; bad tokens 401; dedicated write bucket.
- Related FRs: FR-001, FR-002, FR-003, FR-008
- Related ACs: AC-001, AC-002, AC-003, AC-004, AC-015, AC-012, AC-011 (OTP UI), AC-013
- Inputs: `server/email.ts` Brevo transport; `BookingModal` flow.
- Dependencies: TASK-002 complete.
- Allowed files/directories: see ownership map TASK-003.
- Forbidden files/directories: see ownership map TASK-003.
- Required outputs: `verify-request` endpoint + record stores; OTP email builder; handler checks (`contactCode`, binding, 401 strictness); write limiter; `BookingModal` OTP step; full AC transcripts.
- Required checks: `tsc --noEmit`; `vitest run`; staging manual pass for AC-011.
- Required evidence: per-AC transcripts incl. expiry/lockout/reuse; limiter burst transcript; suite output.
- Stop and report when: Brevo sandbox blocks test sends (use test double + document); BookingModal UX needs product input beyond the frozen flow.

## Integration Order

TASK-001 → judge → TASK-002 → judge → TASK-003 → judge → final acceptance matrix (all 15 ACs) → deliver.

## Main-Agent Validation Plan

After each task: inspect the diff (no summary-trust), run the task's required checks, exercise the ACs directly (supertest for API, targeted UI pass for AC-011 at the end), record the acceptance matrix in LOOP.md, and only then open the next task. Any requirement change discovered mid-task stops that task, revises the spec, and re-seeks approval before resuming.
