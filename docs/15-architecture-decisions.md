# Architecture Decision Records — Leish! Aesthetic Marketplace

**Version:** 1.0 · **Date:** 2026-10-12

## ADR-001 — React/Vite SPA with Express API

**Decision:** Keep the current React 19/Vite client and Express server boundary. **Why:** It is already implemented, deployable to Vercel and supports server-only secrets. **Consequence:** URL-backed routing and code splitting are required to improve shareability and initial bundle size.

## ADR-002 — Server-side Gemini integration

**Decision:** Call Gemini only from Express. **Why:** Protects the API key and centralizes model tiering, timeouts, output validation and fallbacks. **Consequence:** AI features depend on API route latency and require deterministic keyless behavior for development.

## ADR-003 — Firestore as intended durable store, JSON as test fallback

**Decision:** Hide persistence behind a `DataStore` interface; use Firestore for verified production durability and retain the JSON implementation for local tests. **Why:** The app needs concurrent durable writes while preserving fast isolated tests. **Consequence:** Firestore rules, indexes, migration and emulator evidence are release dependencies.

## ADR-004 — JWT bearer authentication for the API

**Decision:** Use short-lived-ish JWT sessions returned by auth routes and sent as Bearer headers. **Why:** Matches the current SPA/API design and keeps provider/client mutations explicit. **Consequence:** Secret rotation invalidates sessions; authorization middleware is mandatory.

## ADR-005 — Booking requests, not payments, in v1

**Decision:** Create `pending` booking requests without charging money. **Why:** Payment, escrow, refunds and provider payouts require separate financial and compliance design. **Consequence:** Confirmation language must never imply a completed purchase.

## ADR-006 — AI fallback is a product requirement

**Decision:** AI failure degrades to labeled deterministic content. **Why:** Discovery and booking must remain available when keys, quotas, grounding or model calls fail. **Consequence:** Every AI response needs a source envelope and fallback test.

## ADR-007 — Keep Workspace and media studios behind explicit scope gates

**Decision:** Do not represent unverified Workspace writes, image/video generation, payment, or real availability as core launch functionality. **Why:** These areas require credentials, quota, consent, or operational policy beyond the marketplace funnel. **Consequence:** They remain separately testable backlog surfaces with clear “not verified” status.

## ADR-008 — RM/km and timezone-safe local dates

**Decision:** Use RM and km consistently and construct appointment dates from local calendar parts before serialization. **Why:** The launch market is Malaysia and UTC conversion previously produced off-by-one booking dates. **Consequence:** Locale/date tests must run in Asia/Kuala_Lumpur as well as UTC.
