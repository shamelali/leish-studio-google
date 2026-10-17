# Booking Trust & List Scale — Product Requirements

Status: Frozen
Owner: main agent
Last updated: 2026-10-16
Approval: Approved by user on 2026-10-16 (conditional: green verification — met: tsc clean, 262/262 tests pass)

## Problem and Context

Three load-bearing API weaknesses found during the backend audit (2026-10-16):

1. `POST /api/bookings` (`server.ts:1017`) accepts anonymous bookings and silently ignores invalid Bearer tokens (`server.ts:1056-1068`). Anyone can create bookings as any email address; the `canModifyBooking` email-fallback (`server.ts:400`) then grants control of those bookings to whoever holds that email.
2. No slot-conflict or idempotency guard: concurrent requests for the same `(staffId, date, time)` both return `201` in all three stores (JSON `server/data-store.ts:259`, Firestore `server/firestore-store.ts:108`, Supabase `server/supabase-store.ts:90`). Retrying a slow request creates a duplicate booking.
3. All list endpoints (`GET /api/salons:864`, `/api/bookings:987`, `/api/users:776`, `/api/reviews/:salonId:1137`) return full collections with no `limit`/`page`. Stores fetch everything (Firestore `.get()`, Supabase `select('data')` with no `.range()`), then filter in memory. Cost, latency, and OOM risk grow with the catalog.

## Users and Stakeholders

- Clients (guests and signed-in) booking appointments via `BookingModal` → `useCreateBooking` (`src/lib/api.ts:102`).
- Providers managing their salon's bookings; admins managing users.
- Anonymous visitors browsing the catalog (`useSalons`, `useBookings`, `useReviews`, `useUsers` all expect JSON arrays today).

## Product Goals

- Bookings are attributable: every booking is provably owned by its creator.
- Double-bookings and retry-duplicates are impossible through the public API.
- List endpoints stay fast and cheap as the catalog grows.

## Success Metrics

| Metric | Baseline | Target | Measurement window/source |
|---|---|---|---|
| Conflicting-slot bookings created via API | possible (201+201) | 0 | vitest concurrency test + Firestore/Supabase store tests, per release |
| Duplicate bookings from retried requests | possible | 0 | idempotency AC test, per release |
| Max rows returned by any list endpoint per request | unbounded | ≤ 100 (default 20) | supertest assertion, per release |
| Anonymous bookings with forged contact identity | possible | 0 (per D1 decision) | auth AC test, per release |

## User Flows

1. **Guest books**: picks salon/service/staff/slot → submits contact details → receives confirmed booking (only if D1 keeps guest booking).
2. **Signed-in client books**: same flow; booking is linked to their account and appears in Client Portal.
3. **Double-submit**: client double-clicks / retries on timeout → exactly one booking exists; retry returns the original.
4. **Provider collision**: two clients race the same slot → first wins (`201`), second gets `409` with a clear message.
5. **Browsing**: catalog, bookings, users, reviews load paginated; UI behavior unchanged.

## Functional Requirements

| FR ID | Requirement | Priority | Status | Notes |
|---|---|---|---|---|
| FR-001 | Booking creation follows the frozen guest policy (see D1) | Must | Draft | Current code allows anonymous; changing this alters conversion |
| FR-002 | An authenticated booking is bound to the token identity: `clientId` = token user, and the contact email must belong to that account (or be verified) | Must | Draft | Closes spoofing via `clientEmail` |
| FR-003 | An invalid/expired Bearer token on booking create is rejected (`401`), never silently downgraded to anonymous | Must | Draft | Current `catch {}` at `server.ts:1066` |
| FR-004 | A booking conflicting with an existing non-cancelled booking for the same slot is rejected (`409`) | Must | Draft | Conflict = D2 definition |
| FR-005 | Retrying a booking create with the same idempotency key returns the original booking without creating a duplicate | Must | Draft | Transport = D5 |
| FR-006 | `GET /api/salons`, `/api/bookings`, `/api/users`, `/api/reviews/:salonId` accept `limit` (default 20, max 100) and `page`/`cursor`, and never return more than `limit` rows | Must | Draft | Shape = D3 |
| FR-007 | Existing role scoping on `GET /api/bookings` (client/provider/admin, `server.ts:991-1008`) is preserved under pagination | Must | Draft | |
| FR-008 | `POST /api/bookings` has a dedicated write rate-limit bucket (separate from the shared read limiter at `server.ts:319`) | Should | Draft | Spam/abuse mitigation |
| FR-009 | Provider and admin dashboards keep working unchanged against paginated endpoints | Must | Draft | Frontend updates ship in the same release if the shape changes (D3) |

## Business Rules

- BR-1: A booking slot is identified by `(salonId, staffId, date, time)`; whether duration-overlap counts as conflict is D2.
- BR-2: Cancelled bookings (status `cancelled`) never block a slot; only `pending`/`confirmed` (and completed, historically) conflict. Exact status set frozen in tech design.
- BR-3: Idempotency keys are scoped per authenticated user (or per guest session/contact if guests allowed); a key never returns another user's booking.
- BR-4: Pagination defaults (`limit=20`, `max=100`) apply uniformly; admin `GET /api/users` included.

## Data Lifecycle

- Booking: `pending` → `confirmed` → `completed` | `cancelled` (existing statuses; unchanged).
- Idempotency records: created on first `POST`, readable on retry, expired/deleted after a frozen TTL (tech design).
- No migration of historical bookings required unless D2 retroactively invalidates overlapping legacy rows (default: no retroactive change).

## In Scope

- `POST /api/bookings` auth/identity/conflict/idempotency; zod schema deltas (`server/validation.ts:30`).
- Pagination on the four list endpoints across all three stores (JSON, Firestore, Supabase).
- Frontend `src/lib/api.ts` updates if the response shape changes (D3); React Query keys preserved.
- Tests: supertest concurrency/idempotency/auth tests + store-level tests.

## Out of Scope

- Past-date / working-hours validation on booking slots (noted, not required).
- Payment, deposits, or no-show enforcement.
- Review-eligibility full-table scans (`server.ts:402`) — separate workstream.
- Supabase `createReview` atomicity — separate workstream.

## Non-goals

- Changing booking statuses, roles, or the provider/admin permission model (TR-7 untouched).
- Real-time slot availability / hold-with-expiry UX.
- Backfilling `clientId` on legacy anonymous bookings.

## Assumptions

| ID | Assumption | Risk | Validation plan | Status |
|---|---|---|---|---|
| A-1 | Frontend and API release together (Vercel monodeploy), so a breaking pagination shape is acceptable if D3 chooses the envelope | Medium | D3 decision | Open |
| A-2 | Mobile/long-lived clients: none besides the web SPA; no old-client compat window needed | Medium | Confirm no other API consumers exist | Open |
| A-3 | Firestore transactions and Supabase constraints are available in all deployed backends | Low | Store tests in CI | Open |
| A-4 | `serviceDuration` is trustworthy for overlap math (provider-entered, minutes) | Medium | D2 decision | Open |

## Open Product Decisions

| Decision ID | Dependency | Options | Recommendation | Impacted FRs | Status |
|---|---|---|---|---|---|
| D1 | none | (a) Require sign-in for all bookings; (b) Keep guest booking, but guests must verify contact email (OTP/magic link) before the booking confirms; (c) Keep guest booking as-is (contact details trusted) | (b): preserves conversion, closes forgery; (a) is safer but may cost funnel | FR-001, FR-002, FR-005 | Decided: (b) |
| D2 | none | (a) Exact `(staffId, date, time)` match only; (b) Duration-aware overlap using `serviceDuration` (+ optional buffer) | (b) with 0-min buffer default: real double-booking prevention; (a) leaves back-to-back overlaps | FR-004, BR-1 | Decided: (b) |
| D3 | none | (a) Envelope `{ data, pagination }` (breaking; frontend updated same release); (b) Bare array + `?limit` cap with `X-Total-Count` header (compatible) | (a): explicit contract, matches `api-endpoint-builder` standard; needs same-release frontend change | FR-006, FR-009 | Decided: (a) |
| D4 | D1 | If guests are kept: idempotency key in (i) `Idempotency-Key` header, (ii) body field, (iii) server-derived payload hash | (i) header + server fallback hash: standard, retry-safe | FR-005, BR-3 | BLOCKED |
| D5 | none | Cap `limit` at 50 vs 100 | 100: matches common practice; catalog is small | FR-006, BR-4 | Open (assumed 100) |

## Decision Log

| Decision ID | Decision | Rationale | Decider/date | Impacted FRs |
|---|---|---|---|---|
| D1 | (b) Guests verify contact email before booking confirms | Preserves conversion, closes forgery | user / 2026-10-16 | FR-001, FR-002, FR-005 |
| D2 | (b) Duration-aware overlap, 0-min buffer | Real double-booking prevention | user / 2026-10-16 | FR-004, BR-1 |
| D3 | (a) Envelope `{ data, pagination }` | Explicit contract; frontend ships same release | user / 2026-10-16 | FR-006, FR-009 |
| G1 | 6-digit OTP via Brevo, BookingModal entry, 10-min TTL, 5 attempts | Simpler than magic-link redirects | user / 2026-10-16 | FR-001 |
| G2 | Anonymous booking requires email-format contact | Non-email contacts are unverifiable spam vectors; demos use signed-in accounts | user / 2026-10-16 | FR-001 |
| G3 | `Idempotency-Key` header + server payload-hash fallback, 24h TTL | Standard, retry-safe | user / 2026-10-16 | FR-005 |
