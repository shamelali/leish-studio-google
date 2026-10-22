# SRS — Leish! Aesthetic Marketplace

| | |
|---|---|
| **Document** | 08 — Software Requirements Specification |
| **Version** | 1.0 |
| **Date** | 2026-10-12 |
| **Status** | Baseline for development; implementation gaps are marked |
| **Sources** | [PRD](./01-prd.md), [TRD](./02-trd.md), [App Flow](./03-app-flow.md), current source tree |

## 1. Purpose and scope

This specification defines the software behavior and quality requirements for Leish!, a Malaysia-focused makeup-artistry discovery and booking marketplace. It is the engineering-ready companion to the product-level PRD. “Must” requirements are release requirements; “should” requirements are planned improvements; “may” requirements are backlog scope.

## 2. Product boundary

The system includes a React/Vite browser client, an Express API, a persistence adapter, Firebase/Google authentication integrations, Google Maps, and server-side Gemini integrations. It excludes payment processing, escrow, native mobile apps, real-time chat, and multi-country operations for v1.

## 3. User classes

| Class | Capabilities | Primary needs |
|---|---|---|
| Guest | Browse, search, view listings, submit booking request | Low-friction discovery and clear confirmation |
| Client | Guest capabilities plus portal, cancellation and eligible reviews | Track and manage appointments |
| Provider | Manage own listing, services and bookings; run audit | Operational control without a complex POS |
| Admin | Reserved role; no dedicated v1 UI | Future moderation and marketplace operations |
| Workspace user | Google-connected provider/operator | Documents, mail, tasks and collaboration |

## 4. Functional requirements

### SRS-F-001 Discovery

The system shall display searchable MUA and studio listings; support category, type, rating and sort filters; show loading, empty and error states; and allow a user to open a listing from a card or map marker.

### SRS-F-002 Listing details

The system shall display gallery, description, rating, reviews, service menu, staff, hours, travel estimate where applicable, and a booking call to action. AI review summaries shall be labeled as model or fallback output.

### SRS-F-003 Booking

The system shall provide a three-step booking flow for date/time, client details and review/confirm. It shall preserve entered values during back navigation, validate on client and server, create a `pending` booking, display a receipt on success, and show an actionable inline error on failure.

### SRS-F-004 Authentication

The system shall support email/password registration and login, JWT session restoration, demo sign-in for approved seeded accounts, role-aware navigation, and explicit session clearing on invalid or expired credentials.

### SRS-F-005 Client portal

An authenticated client shall see only authorized appointments, cancel an eligible upcoming appointment, and submit a review only when the business rule permits it.

### SRS-F-006 Provider portal

An authenticated provider shall see only their salon's bookings, transition booking status according to the allowed state machine, and create/update/delete services and profile data only for their own salon.

### SRS-F-007 AI capabilities

The system shall expose Lookbook, Advisor, review summary, quality audit and assistant capabilities through server-side Gemini calls. Every user-facing AI call shall validate input, time out, normalize output, return a model/fallback source, and remain usable without a valid API key.

### SRS-F-008 Workspace

The system shall provide an overview for guests and, after Google consent, list or perform the documented Workspace actions permitted by the current implementation. Missing scopes or expired access shall produce a re-authentication path rather than a dead end.

## 5. External interfaces

| Interface | Requirement |
|---|---|
| Browser | Responsive SPA, keyboard usable, modern evergreen browser |
| API | JSON over HTTPS under `/api`; Bearer JWT for protected operations |
| Gemini | Server-side `@google/genai`; no key in client bundle |
| Maps | Restricted browser key for map display; server-side distance integration when implemented |
| Firebase | Auth/Google provider and intended Firestore backend |
| Vercel | Serverless deployment with SPA fallback and configured environment variables |

## 6. Quality attributes

| ID | Requirement | Target |
|---|---|---|
| SRS-Q-001 | Security | Owner-only mutations; deny-by-default data access; no production secret fallback |
| SRS-Q-002 | Availability | Browsing and booking remain usable when AI is unavailable |
| SRS-Q-003 | Performance | Interactive initial route under 2.5s on 4G; mobile Lighthouse ≥80 |
| SRS-Q-004 | Accessibility | WCAG 2.1 AA intent, keyboard navigation, visible focus, reduced motion |
| SRS-Q-005 | Data durability | Production data survives redeploy and concurrent writes |
| SRS-Q-006 | Localization | RM currency, km distance, Malaysia-oriented copy and timezone-safe dates |
| SRS-Q-007 | Observability | Logs identify route, status, latency and correlation context without PII/secrets |

## 7. Business rules

1. Booking status follows `pending → confirmed → completed`; `pending` or `confirmed` may become `cancelled`.
2. A provider may mutate only the salon referenced by `user.salonId`, except an authorized admin.
3. A client may cancel only a booking associated with their authenticated identity.
4. A review requires an eligible completed booking and must not expose private booking data publicly.
5. AI fallback output must be deterministic enough for tests and clearly labeled in the UI.
6. Prices are expressed in Malaysian ringgit (RM); distances are expressed in kilometers (km).

## 8. Open implementation gaps

The current repository still requires production verification or follow-up for Supabase durability and backup/restore, real geocoding, consent-backed analytics delivery, full Workspace writes, payment discovery, real availability, and a physical-device accessibility audit. These are not silently treated as complete.

## 9. Acceptance baseline

The SRS is accepted when a guest booking and provider confirmation journey pass, protected mutations have 401/403 coverage, data persistence is verified for the selected production backend, AI failure paths are labeled, and the release checklist in the PRD is green.
