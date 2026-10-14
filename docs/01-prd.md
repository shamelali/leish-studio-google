# PRD — Leish! Aesthetic Marketplace

| | |
|---|---|
| **Document** | 01 — Product Requirements Document |
| **Product** | Leish! Aesthetic Marketplace |
| **Version** | 1.0 |
| **Date** | 2026-10-08 |
| **Status** | Draft for review |
| **Owner** | Product / Duta Integra Solutions |

---

## 1. Summary

Leish! is a luxury **makeup-artistry booking marketplace** for the Klang Valley / Kuala Lumpur market. It connects two supply-side entities — **independent freelance MUAs** (mobile artists) and **luxury makeup studios / ateliers** — with **clients** looking to book bridal, red-carpet, editorial, soft-glam and airbrush services.

Differentiation comes from three pillars:

1. **Curated discovery** — split listings for MUAs vs. studios, category filters, a map locator, and listing detail pages with services, staff, hours and reviews.
2. **AI-assisted decision making** — an AI Lookbook (trend-grounded look specs), an AI Advisor (personalized service recommendations), an AI review summarizer, and a provider-facing AI quality audit, all powered by Gemini.
3. **Operational tooling** — a client portal (appointments, cancellation, reviews) and a provider dashboard (appointment management, service CRUD, profile editing, AI audit), plus a Google Workspace hub for business workflows.

The product is delivered as a single-page React application backed by an Express API, deployable to Vercel, with Gemini called server-side only.

---

## 2. Problem & Opportunity

- **Fragmented discovery.** Clients find artists through Instagram DMs and word-of-mouth; there is no structured way to compare price, travel radius, rating, availability, or specialty.
- **No booking infrastructure.** Artists manage bookings through chat threads and manual calendars; no-shows, double-bookings and status confusion are common.
- **Weak presentation of craft.** Makeup is visual, but listings rarely convey *what a look actually consists of* (palette, complexion, eye, lip, longevity) in a way clients can act on.
- **Back-office overload.** Small studios juggle Gmail, Drive, Sheets and chat manually for confirmations, reminders, and records.
- **Market context.** Malaysia is a RM-denominated market with a dense, mobile-first audience and high Instagram engagement — an ideal fit for a curated, visually rich marketplace.

---

## 3. Goals

| # | Goal | Measure |
|---|---|---|
| G1 | Make discovery fast and trustworthy | Time-to-first-detail-view < 60s; search → detail CTR |
| G2 | Convert browsing into bookings | Detail → booking-start → booking-complete funnel |
| G3 | Differentiate with AI that is genuinely useful | Lookbook/Advisor sessions → bookings attached to a moodboard |
| G4 | Give providers a reason to return weekly | Provider dashboard weekly active; appointment status churn |
| G5 | Demonstrate Google/Gemini/Workspace capability end-to-end | Workspace actions completed; AI endpoints served without fallback |

### Non-goals (v1)

- Payments / commissions / escrow (booking is a request, money changes hands offline).
- Native mobile apps.
- Real-time chat between client and provider.
- Multi-city / multi-country expansion.
- Provider-side payouts or tax tooling.

---

## 4. Personas

### P1 — Client (demand side)
Books bridal, event and editorial glam. Visually driven, compares 3–5 providers, cares about rating, price floor, travel-to-venue capability and portfolio. Expects confirmation of a request and a clear record of appointments.
*Example: `shamelali@gmail.com` (demo account).*

### P2 — Freelance MUA (supply side, mobile)
Works from a personal kit, travels within a radius, lists starting price and kit brands, sells on Instagram. Needs bookings, statuses, and a portfolio — not a complex POS.
*Seed: `mua-1` … `mua-4`.*

### P3 — Studio Director (supply side, fixed location)
Runs a multi-staff atelier with a service menu and working hours. Needs appointment triage, service CRUD, profile management, and quality/consistency insight.
*Seed: `salon-1` … `salon-6`; demo accounts `director@atelierleish.com`, `rosewood@beauty.com`.*

### P4 — Workspace power user (secondary)
A provider or operator who wants confirmations, documents, forms and task lists handled inside Gmail/Drive/Tasks/Docs.

---

## 5. Personas → Roles

`User.role: 'client' | 'provider' | 'admin'` (see `src/types.ts`). Admin is defined in the model but has no dedicated surface in v1; it is reserved for marketplace operations.

---

## 6. Scope — Epics & Functional Requirements

### E1 — Discovery & Search  (`activeTab: 'explore'`)

| ID | Requirement | Priority |
|---|---|---|
| FR-1.1 | Hero section with a curated, user-switchable hero image persisted across sessions. | P1 |
| FR-1.2 | Free-text search across listing name, tagline, location and services. | P1 |
| FR-1.3 | Category chips: `all`, `bridal`, `editorial`, `soft-glam`, `airbrush`, `masterclass`. | P1 |
| FR-1.4 | Listing-type filter (`all / mua / studio`) and rating filter + sorting. | P1 |
| FR-1.5 | Split results: MUA grid (`MUACard`) and studio grid (`SalonCard`), each with trust badges (verified, rating, price floor). | P1 |
| FR-1.6 | Interactive Google Map with per-listing markers, MUA/Studio marker pills, info windows, and "View Profile" deep-link. | P2 |
| FR-1.7 | Empty state with recovery actions when filters return nothing. | P1 |

### E2 — Listing Detail (`SalonDetails`)

| ID | Requirement | Priority |
|---|---|---|
| FR-2.1 | Gallery, description, category, rating and review count. | P1 |
| FR-2.2 | Full service menu (name, price, duration, description, category). | P1 |
| FR-2.3 | Staff roster with role and rating; working hours. | P2 |
| FR-2.4 | Reviews list plus **AI review summary** (`vibe`, `bestFor`, `tip`) generated by Gemini. | P2 |
| FR-2.5 | Travel-quote estimate for on-location events (venue + distance + fee). | P2 |
| FR-2.6 | Primary CTA into the booking funnel. | P1 |

### E3 — Booking Funnel (`BookingModal`)

| ID | Requirement | Priority |
|---|---|---|
| FR-3.1 | Three steps: **① date & time → ② client details (name, email, phone, notes) + on-location venue & travel surcharge → ③ review & confirm**. | P0 |
| FR-3.2 | Client-side validation with zod/react-hook-form, server-side re-validation with zod. | P0 |
| FR-3.3 | Optional attachment of an AI Lookbook moodboard (look name, palette, lip formula, eye style) to the booking. | P2 |
| FR-3.4 | Booking is created as `pending` and appears in both client and provider views. | P0 |
| FR-3.5 | Inline, visible error feedback on failure — never a silent failure. | P0 |

### E4 — AI Lookbook Studio (`activeTab: 'lookbook'`)

| ID | Requirement | Priority |
|---|---|---|
| FR-4.1 | Input: occasion/category + preferences → output a structured look spec: name, category, vibe, color palette (hex + name), complexion (finish/coverage/technique), eye artistry, lip formula, longevity features. | P1 |
| FR-4.2 | Grounded in **live trend research** (Gemini with Google Search tool), with a timeout and graceful fallback to a curated look. | P1 |
| FR-4.3 | "Book This Look" hands the spec into the booking funnel as an attached moodboard. | P1 |

### E5 — AI Advisor / Stylist (`activeTab: 'ai-stylist'`)

| ID | Requirement | Priority |
|---|---|---|
| FR-5.1 | Input: goals, skin/hair profile, occasion, optional preferred category. | P1 |
| FR-5.2 | Output: recommendation text + a ranked list of suggested services drawn from the live catalog (service, category, salon, estimated price, reason). | P1 |
| FR-5.3 | Every recommendation deep-links to the provider's detail page. | P1 |

### E6 — Client Portal (`activeTab: 'client'`)

| ID | Requirement | Priority |
|---|---|---|
| FR-6.1 | Appointment feed for the signed-in client's email, with status badges. | P0 |
| FR-6.2 | Cancel an upcoming appointment (status → `cancelled`). | P0 |
| FR-6.3 | Leave a review (rating + text) on a completed appointment. | P1 |
| FR-6.4 | Require authentication; show a sign-in prompt for guests. | P0 |

### E7 — Provider Dashboard (`activeTab: 'provider'`)

Four sub-tabs: `appointments | services | profile | audit`.

| ID | Requirement | Priority |
|---|---|---|
| FR-7.1 | Appointments list scoped to the provider's salon, with status transitions (`pending → confirmed → completed / cancelled`). | P0 |
| FR-7.2 | Service CRUD (add / edit / delete) against the provider's own listing. | P0 |
| FR-7.3 | Studio profile editing (name, tagline, description, hours, gallery). | P1 |
| FR-7.4 | **AI quality audit**: Gemini scores the listing's completeness/quality and returns actionable fixes. | P2 |
| FR-7.5 | Provider access gated by role; a guest sees an acquisition/sign-in entry point. | P0 |

### E8 — Google Workspace Hub (`activeTab: 'workspace'`)

Nine sub-tabs: `overview, gmail, drive, docs, forms, tasks, contacts, chat, classroom`.

| ID | Requirement | Priority |
|---|---|---|
| FR-8.1 | Google OAuth sign-in (Firebase Google provider) with the documented scopes (Drive, Gmail send/read, Docs read, Forms responses, Tasks, Contacts, Chat spaces). | P2 |
| FR-8.2 | Gmail: compose & send confirmation emails. | P2 |
| FR-8.3 | Drive/Docs: list and create documents. | P3 |
| FR-8.4 | Forms: list forms and their responses (e.g., consultation intake). | P3 |
| FR-8.5 | Tasks: list and create follow-up tasks. | P3 |
| FR-8.6 | Contacts / Chat / Classroom: read-only listing in v1. | P3 |

### E9 — Auth & Accounts

| ID | Requirement | Priority |
|---|---|---|
| FR-9.1 | Email/password registration and login with JWT (7-day expiry) and bcrypt password hashing. | P0 |
| FR-9.2 | Sign-in / sign-up modal with demo quick-login for client and provider personas. | P1 |
| FR-9.3 | Profile view/edit (name, phone, bio, avatar). | P1 |
| FR-9.4 | Session persists across reloads (localStorage) and hydrates on boot. | P0 |

### E10 — Platform AI (chat & media)

| ID | Requirement | Priority |
|---|---|---|
| FR-10.1 | Assistant chatbot grounded in the live directory with Google Search or Maps grounding and model tiering (fast/standard/complex). | P2 |
| FR-10.2 | Image studio: generate/edit listing imagery via Gemini image models with aspect-ratio control. | P3 |
| FR-10.3 | Veo video studio: generate short promo clips (16:9 / 9:16), poll status, download MP4. | P3 |
| FR-10.4 | All AI endpoints must degrade to a deterministic mock when the API key is missing or the call fails. | P0 |

---

## 7. Success Metrics

| Category | Metric | Target (first 90 days) |
|---|---|---|
| Activation | Demo-account sessions that reach a detail page | ≥ 70% |
| Conversion | Detail view → booking started | ≥ 25% |
| Conversion | Booking started → `pending` booking created | ≥ 60% |
| AI | Lookbook/Advisor sessions with non-fallback output | ≥ 90% |
| AI → commerce | Bookings with an attached moodboard | ≥ 15% of bookings |
| Provider | Providers completing a status transition weekly | ≥ 50% of seeded providers |
| Reliability | Booking API 4xx rate | < 2% |
| Quality | Lighthouse performance (mobile) | ≥ 80 |

---

## 8. Non-Functional Requirements

| ID | Requirement |
|---|---|
| NFR-1 | **Security**: JWT-authenticated mutations, bcrypt password storage, Helmet headers, rate limiting (auth: 20/15min, general: 100/15min per IP), 100kb JSON body limit, zod validation on every write. |
| NFR-2 | **Authorization**: a user may only mutate resources they own (own profile, own salon, own bookings). *Currently unmet — see risks.* |
| NFR-3 | **Privacy**: no public enumeration of users, emails or bookings; PII never returned to unauthenticated callers. *Currently unmet — see risks.* |
| NFR-4 | **Availability of AI**: every AI feature must have a deterministic fallback; a Gemini outage must never block browsing or booking. |
| NFR-5 | **Accessibility**: WCAG 2.1 AA contrast (documented ratios: body 15.4:1, muted 8.0:1, accent-text 4.5:1, control borders ≥ 3:1), keyboard navigation, visible focus, `aria-expanded`/`aria-controls` on menus. |
| NFR-6 | **Performance**: initial route interactive < 2.5s on 4G; AI calls client-visible < 3s (with timeout + fallback). |
| NFR-7 | **Data durability**: user-generated data must survive deploys and scale horizontally. *Currently unmet — JSON file store.* |
| NFR-8 | **Locale correctness**: single currency (RM) and units (km) across UI, copy, and structured data. *Currently inconsistent.* |

---

## 9. Constraints

- Server-side-only Gemini key; no API key may ship to the client.
- Vercel serverless filesystem is read-only → no durable local writes as-is.
- No payments provider in scope → bookings are requests, not transactions.
- Team size and timeline: see Implementation Plan (docs/06).

---

## 10. Risks & Mitigations

| # | Risk | Impact | Mitigation |
|---|---|---|---|
| R1 | **Booking creation currently fails silently** (server zod date regex corrupted; client error swallowed). | P0 — core funnel broken | Phase 0 hotfix in Implementation Plan. |
| R2 | **Authenticated mutations omit the `Authorization` header** in ClientPortal, ProviderDashboard, ProfileModal → silent 401s. | P0 — provider & client ops broken | Centralize all calls through `src/lib/api.ts`. |
| R3 | **Data resets on every deploy** (JSON store written to `/tmp` on Vercel). | P0 — marketplace unusable in production | Migrate to Firestore (rules/blueprint already exist). |
| R4 | **Over-exposed API**: public booking reads, public demo-user listing, unauthenticated reviews, missing ownership checks. | Security / GDPR-adjacent | AuthZ audit before any public launch. |
| R5 | Committed secrets (Firebase web key, Maps key, dev JWT secret fallback). | Security | Rotate keys, move to env vars with safe public-only scopes. |
| R6 | Three complete AI studios (image, Veo, chat) are built but **unmounted** — wasted capability. | Engagement | Wire into nav or remove; decide in Phase 2. |
| R7 | Currency/unit inconsistency (`$` vs `RM`, miles vs km) erodes trust in a Malaysian market. | Trust | Normalize to RM/km in one pass. |
| R8 | Rate limit is global per IP → heavy AI use can lock users out of auth endpoints. | UX | Split buckets per route group. |

---

## 11. Open Questions

1. Should bookings require client authentication, or stay guest-friendly with email-based lookup?
2. Is `admin` a real v1 surface (moderation, verification badges) or deferred?
3. Do we wire the image / Veo / chat studios into navigation, or cut them from scope?
4. Verification badges: manual (ops) or automated (KYC/documents)?
5. Preferred launch shape: Firestore from day one, or a managed Postgres?

---

## 12. Release Criteria (v1)

- [ ] A guest can search → open a listing → complete a booking and see it in the client portal.
- [ ] A provider can sign in, confirm a booking, add a service, and edit their profile.
- [ ] All writes are authorized (owner-only) and validated (zod, server-side).
- [ ] Data persists across a redeploy.
- [ ] Every AI feature shows a graceful fallback, never a spinner forever.
- [ ] Single currency (RM) and distance unit (km) everywhere.
- [ ] No secrets in the repository; `JWT_SECRET` has no development fallback in production.
