# Test Plan — Leish! Aesthetic Marketplace

**Version:** 1.0 · **Date:** 2026-10-12 · **Owner:** Engineering

## 1. Objectives

Prove that discovery, booking, authentication, provider operations and AI degradation work for supported actors; prevent unauthorized access and regression of the booking funnel; and provide a repeatable release gate.

## 2. Test levels

| Level | Tool | Scope | Gate |
|---|---|---|---|
| Static | TypeScript | Compile-time correctness | Required |
| Unit | Vitest | Schemas, transforms, dates, pricing, fallback functions | Required |
| API integration | Vitest + Supertest | Routes, auth, status codes, ownership matrix | Required |
| Component | Vitest + Testing Library when available | Modal steps, portals, navigation and visible errors | Required for changed UI |
| E2E | Playwright or headed browser smoke | Guest booking, provider confirmation, deep links | Required before production |
| Manual accessibility | Keyboard, reduced motion, axe/Lighthouse | Focus, contrast, responsive states | Required before v1 |
| Firestore emulator | Firebase emulator | Adapter round trips, rules and migration | Required before durable backend selection |

## 3. Required test cases

| ID | Case | Expected |
|---|---|---|
| T-001 | Search by listing name/category | Matching results; no-result recovery |
| T-002 | Open listing from card and map | Correct detail view; map failure does not block cards |
| T-003 | Submit valid guest booking | 201, pending status, receipt |
| T-004 | Submit malformed date/email/required field | 400 or client validation; no write |
| T-005 | Booking API unavailable | Visible retryable error; no silent failure |
| T-006 | Login/register round trip | Sanitized user and valid JWT |
| T-007 | Invalid/expired JWT | 401 and session recovery |
| T-008 | Client reads own appointments | Own records only |
| T-009 | Client accesses another booking | 401/403-safe response; no data leak |
| T-010 | Provider confirms own booking | 200 and allowed status transition |
| T-011 | Provider mutates another salon | 403 and unchanged data |
| T-012 | Service/profile CRUD | Validated, owner-scoped persistence |
| T-013 | Review eligibility | Completed booking required |
| T-014 | Gemini missing key/timeout/malformed JSON | Deterministic fallback and `source: fallback` |
| T-015 | Lookbook to booking | Moodboard survives all three steps |
| T-016 | Deep link refresh | App shell loads and correct view opens |
| T-017 | Mobile keyboard/reduced motion | No trapped focus, no unusable horizontal overflow |
| T-018 | Redeploy/persistence | Data remains after restart/deploy for selected backend |

## 4. Environments and fixtures

- Local API: `npm run dev` with isolated test data.
- Test backend: temporary JSON store or Firestore emulator; never production data.
- Seed users: client and provider demo identities from the repository, with test-only credentials.
- AI: run both keyless deterministic tests and a controlled integration test when credentials are available.
- Browser viewports: 360px, 768px and 1280px; timezone tests include Asia/Kuala_Lumpur.

## 5. Release gates

```bash
npm run typecheck
npm test
npm run build
```

Production additionally requires the launch-runbook smoke checks, authz 401/403 matrix, and evidence that the configured store survives redeploy. A failing or skipped check is not a pass.

## 6. Current coverage and gaps

The repository already contains Vitest coverage for routing, analytics, color regression, store behavior, concierge and server/data-store paths. The remaining high-value gap is comprehensive route-by-route authorization and full browser E2E coverage, especially Workspace, image/video studios, physical-device accessibility, and durable Firestore deployment verification.
