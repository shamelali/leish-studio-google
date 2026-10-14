# Use-Case Specification — Leish! Aesthetic Marketplace

**Version:** 1.0 · **Date:** 2026-10-12 · **Status:** Development baseline

## Actors and shared conditions

Actors are Guest, Client, Provider, Admin, Gemini service, Google/Firebase, Maps service, and Workspace APIs. Unless stated otherwise, the browser has loaded the SPA and the API is reachable. Authentication and ownership are enforced server-side, not only by navigation visibility.

## UC-01 — Discover a provider

**Primary actor:** Guest · **Priority:** P0

1. Guest opens Explore.
2. Guest searches or selects filters.
3. System queries/filters catalog data and shows MUA and studio results.
4. Guest selects a card or map marker.
5. System opens the provider detail view.

**Alternatives:** No results → show clear-filters recovery. API failure → show retryable error. Map failure → cards remain usable.

**Success:** Detail view contains enough information to start a booking.

## UC-02 — Request an appointment

**Primary actor:** Guest or Client · **Priority:** P0

1. Actor selects a service and opens Book.
2. Actor enters a future date/time.
3. Actor enters name, email, phone and optional notes.
4. Actor optionally selects on-location venue and moodboard.
5. Actor reviews price, service and booking details.
6. System validates and creates a `pending` booking.
7. System displays a confirmation receipt.

**Alternatives:** Invalid input → field-level validation. API rejection → inline message with retry. Duplicate submission → do not create an ambiguous second request.

**Success:** Booking is visible to the client and provider according to authorization rules.

## UC-03 — Sign in

**Primary actor:** Guest · **Priority:** P0

1. Guest opens the auth modal.
2. Guest submits credentials or approved demo login.
3. API verifies the password and returns a JWT and sanitized user.
4. Client persists the session and restores the intended destination.

**Alternatives:** Invalid credentials → generic error. Expired token → clear local session and request sign-in. Rate limit → explain retry timing without exposing account existence.

## UC-04 — Manage a client appointment

**Primary actor:** Client · **Priority:** P0

1. Client opens My Bookings.
2. System requests appointments scoped to the authenticated client.
3. Client opens an eligible upcoming booking and confirms cancellation.
4. System authorizes and changes status to `cancelled`.

**Failure:** A client attempting another client's booking receives 403/404-safe behavior and no data disclosure.

## UC-05 — Confirm a provider booking

**Primary actor:** Provider · **Priority:** P0

1. Provider signs in and opens Salon Portal.
2. System loads bookings for the provider's own salon.
3. Provider selects Confirm, Complete or Cancel when allowed.
4. API checks role, salon ownership and status transition.
5. UI updates the status and shows success/error feedback.

## UC-06 — Maintain provider services

**Primary actor:** Provider · **Priority:** P0

1. Provider opens Services.
2. Provider creates, edits or deletes a service.
3. Client-side form validation runs.
4. API repeats validation and checks salon ownership.
5. Catalog reflects the change after successful persistence.

## UC-07 — Generate a lookbook

**Primary actor:** Guest or Client · **Priority:** P1

1. Actor supplies occasion and preferences.
2. API calls Gemini with trend grounding and a timeout.
3. System parses the structured look specification.
4. UI displays palette, complexion, eye, lip and longevity guidance.
5. Actor selects Book This Look.
6. System carries the moodboard into the booking flow.

**Alternative:** Missing key, timeout or parse failure → deterministic fallback with a sample-result label.

## UC-08 — Get AI service advice

**Primary actor:** Guest or Client · **Priority:** P1

1. Actor supplies goals, skin/hair profile and occasion.
2. System requests structured recommendations.
3. UI shows explanation and catalog-backed suggested services.
4. Actor opens a provider detail page.

## UC-09 — Connect Workspace

**Primary actor:** Workspace user · **Priority:** P2

1. User opens Workspace Hub.
2. User starts Google consent.
3. Firebase returns an access token or an explicit consent error.
4. System lists the selected Workspace resource or presents the required re-auth path.

## UC-10 — Operate a release

**Primary actor:** Developer/Operator · **Priority:** P0

1. Operator runs typecheck, tests and build.
2. Operator verifies environment variables and secret hygiene.
3. Operator deploys through the approved Vercel path.
4. Operator runs directory, booking, provider and deep-link smoke tests.
5. Operator monitors logs and records deployment evidence.

## Acceptance mapping

| Use case | Main requirements | Primary test |
|---|---|---|
| UC-01 | FR-1.x, FR-2.x | Catalog/component smoke |
| UC-02 | FR-3.x | API + E2E booking |
| UC-03 | FR-9.x | Auth integration |
| UC-04 | FR-6.x | Authz matrix |
| UC-05/06 | FR-7.x | Provider integration |
| UC-07/08 | FR-4.x/FR-5.x | AI contract/fallback tests |
| UC-09 | FR-8.x | OAuth/manual smoke |
| UC-10 | NFR-1…NFR-8 | CI and runbook gate |
