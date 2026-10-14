# App Flow — Leish! Aesthetic Marketplace

| | |
|---|---|
| **Document** | 03 — Application Flow & Information Architecture |
| **Version** | 1.0 |
| **Date** | 2026-10-08 |
| **Companion** | [01-prd.md](./01-prd.md) · [02-trd.md](./02-trd.md) |

---

## 1. Navigation Model

There is no URL router today — navigation is a Zustand `activeTab` view machine rendered inside `AnimatePresence` in `src/App.tsx`.

```
                        ┌──────────────────────────────┐
                        │           NAVBAR             │
                        │  scroll-condense h-20 → h-16 │
                        │  Cmd/Ctrl+K → search focus   │
                        └──────────────┬───────────────┘
        ┌──────────┬──────────┬────────┴───┬────────────┬───────────┬──────────┐
        ▼          ▼          ▼            ▼            ▼           ▼          ▼
   [explore]   [lookbook] [ai-stylist] [workspace]  [client]   [provider]  (modals)
   Discover    AI Lookbook  AI Advisor   Google Hub  My Bookings Salon Portal
   (primary)   (primary)    (primary)    (More ▾)    (More ▾)   (More ▾ /  AuthModal
                                                                 account)   ProfileModal
                                                                              BookingModal
```

**Navbar groups** (`src/components/Navbar.tsx`):

| Group | Items | Visibility |
|---|---|---|
| `PRIMARY_ITEMS` | Discover, AI Lookbook, AI Advisor | Always |
| `TOOL_ITEMS` | Workspace, My Bookings | Workspace + My Bookings in "More ▾" for guests; account menu when signed in |
| `SALON_ITEM` | Salon Portal | Visible to guests (acquisition) and providers; hidden from signed-in clients |

**Interaction details:** `layoutId` animated active pill · scroll-condense header · `Cmd/Ctrl+K` jumps to Discover and focuses `#hero-search` · `Escape` closes menus · responsive mobile disclosure with grouped sections · `aria-expanded` / `aria-controls` · visible focus rings.

**Overlay modals (orthogonal to tabs):** `AuthModal`, `BookingModal`, `ProfileModal`.

---

## 2. Information Architecture (Sitemap)

```
explore ──────────── Explore (Discover)
 │                     ├─ Hero (search, category chips, rating filter, sort)
 │                     ├─ MUA grid (MUACard)
 │                     ├─ Studio grid (SalonCard)
 │                     ├─ InteractiveMap (markers → info window → view)
 │                     └─ SalonDetails  ← selectedSalon
 │                          ├─ gallery / services / staff / hours / reviews
 │                          ├─ AI review summary (vibe · bestFor · tip)
 │                          ├─ travel-quote estimate
 │                          └─ [Book] ─→ BookingModal
lookbook ─────────── AI Lookbook Studio
 │                     ├─ trend inputs → LookbookItem spec
 │                     └─ [Book This Look] ─→ BookingModal (moodboard attached)
ai-stylist ───────── AI Advisor
 │                     ├─ goals / skin profile / occasion wizard
 │                     └─ recommended services → SalonDetails
workspace ────────── Google Workspace Hub (9 sub-tabs)
 │                     overview · gmail · drive · docs · forms ·
 │                     tasks · contacts · chat · classroom
client ───────────── Client Portal
 │                     ├─ appointment feed (status badges)
 │                     ├─ cancel appointment
 │                     └─ leave review
provider ─────────── Provider Dashboard (4 sub-tabs)
                       ├─ appointments (status transitions)
                       ├─ services (CRUD)
                       ├─ profile (edit)
                       └─ audit (AI quality audit)
```

---

## 3. Actors & Entry States

| Actor | Signed out | Signed in (client) | Signed in (provider) |
|---|---|---|---|
| Landing state | Explore | Explore + account menu | Explore + account menu |
| Client Portal | Sign-in prompt | Full access | — |
| Salon Portal | Acquisition CTA → sign-in | Hidden in nav | Full access (4 sub-tabs) |
| Booking funnel | Allowed (details captured in form) | Prefilled from profile | — |
| Workspace | Overview only → Google sign-in | Google OAuth required for actions | Google OAuth required |

---

## 4. Core Flow — Guest Discovery → Booking  (P0)

```
[Land: Explore]
   │  type in #hero-search (Cmd+K) / pick category chip / set rating filter
   ▼
[Filtered results: MUACard grid + SalonCard grid] ── empty? ──▶ [Empty state + clear filters]
   │
   │  optional: InteractiveMap → marker → InfoWindow → "View Profile"
   ▼
[SalonDetails]
   │  browse gallery, services, staff, hours, reviews
   │  AI summary block loads (Gemini · shows fallback label if degraded)
   │  optional: travel-quote estimate (venue → pseudo distance + fee)
   ▼
[BookingModal]
   ├─ Step 1  Date & time            (validated: future date, valid time slot)
   ├─ Step 2  Client details         (name, email, phone, notes)
   │          + on-location toggle   (venue → travel surcharge)
   │          + optional moodboard   (from Lookbook)
   ├─ Step 3  Review & Confirm
   ▼
[POST /api/bookings → status: 'pending']
   ├─ success ─▶ [Confirmation state] ─▶ booking appears in Client Portal
   └─ error   ─▶ inline error banner (retry)   ← must never fail silently
```

**Requirements:** every step preserves state on back-navigation; the modal is keyboard-trappable; errors render inline, not in console.

---

## 5. Flow — AI Lookbook → Booking  (P1)

```
[Lookbook tab]
   │  choose occasion / category / preferences
   ▼
[POST /api/gemini/trends-lookbook]  (googleSearch grounding, 7s race)
   ├─ model ok ───▶ [LookbookItem spec]
   │                 palette hexes · complexion · eye · lip · longevity
   │                 groundedTrendContext (cited trends)
   │                 recommendedSalonId + service (deep link)
   └─ timeout/err ─▶ [curated fallback look] + "sample look" label
   ▼
[Save/inspect spec] ── [Book This Look] ─▶ BookingModal (Step 2 pre-attaches
                                            lookName, palette, lipFormula, eyeStyle)
   ▼
[Booking confirmed with attachedMoodboard]
```

---

## 6. Flow — AI Advisor  (P1)

```
[AI Advisor tab]
   │  Step 1: goals (free text)  →  Step 2: skin/hair profile  →  Step 3: occasion
   │  optional: preferred category
   ▼
[POST /api/gemini/advice]  (JSON responseSchema)
   ▼
[Recommendation screen]
   ├─ recommendationText (prose)
   └─ suggestedServices[] ─ each: service · salon · est. price · reason
        └─ [View] ─▶ SalonDetails (deep link) ─▶ booking funnel
```

---

## 7. Flow — Auth  (P0)

```
[AuthModal]
   ├─ Sign in          (email + password → POST /api/auth/login → JWT 7d)
   ├─ Create account   (name, email, password, role → POST /api/auth/register)
   └─ Demo quick-login (client demo / provider demo)
   ▼
[localStorage: leish_auth_user, leish_auth_token  +  zustand persist]
   ▼
[Navbar re-renders: account menu replaces "More ▾"; nav groups recomputed]
   ├─ role=client   → Salon Portal hidden, My Bookings visible
   └─ role=provider → Salon Portal visible with full dashboard
```

**Session restore:** store hydrates on boot; `GET /api/auth/me` validates the token and refreshes the profile; an invalid/expired token clears state silently and returns the user to guest mode.

---

## 8. Flow — Client Portal  (P0)

```
[client tab]
   ├─ guest ─▶ [Sign-in prompt] ─▶ AuthModal
   └─ signed in
        ▼
[Appointment feed]  GET /api/bookings?email=<user email>
   ├─ upcoming / past sections, status badges (pending · confirmed · completed · cancelled)
   ├─ [Cancel]  → PATCH /api/bookings/:id/status {cancelled}   ⚠ requires Authorization
   │              └─ confirm dialog → optimistic update → rollback on failure
   └─ [Leave review] (completed only) → POST /api/reviews → appears on SalonDetails
```

---

## 9. Flow — Provider Dashboard  (P0)

```
[provider tab]
   ├─ guest ─▶ [Acquisition CTA] → AuthModal (demo provider)
   ├─ client ─▶ nav hides the entry
   └─ provider (user.salonId set)
        ▼
   ┌─ appointments ────────────────────────────────────────────┐
   │  GET /api/bookings?salonId=<own>                          │
   │  pending → [Confirm] → confirmed → [Complete] → completed │
   │  pending/confirmed → [Cancel]                             │
   │  ⚠ all four mutations currently omit Authorization       │
   ├─ services                                                  │
   │  list + [Add service] + [Edit] + [Delete]  → /api/salons/:id/services*
   ├─ profile                                                   │
   │  edit name, tagline, description, hours, gallery           │
   │  → PUT /api/salons/:id   (⚠ ownership check required)     │
   └─ audit
      POST /api/gemini/quality-audit → score + prioritized fixes
```

**Authorization rule (TR-7):** providers may only touch `user.salonId`; admins may touch any. Enforced server-side in middleware, not in the UI.

---

## 10. Flow — Google Workspace Hub  (P2/P3)

```
[workspace tab]
   ├─ Overview  → status tiles + "Connect Google Account"
   └─ Google sign-in (Firebase provider) → consent for scopes:
      drive.readonly · drive.file · gmail.send · gmail.readonly ·
      documents.readonly · forms.responses.readonly · tasks ·
      contacts.readonly · chat.spaces
        ▼
   gmail    compose → send (RFC822 base64url)        → confirmation emails
   drive    list files                                → contracts, moodboards
   docs     list + create + batchUpdate               → consultation notes
   forms    list + responses                          → intake forms
   tasks    list + create                             → follow-ups
   contacts list                                      → client directory
   chat     list spaces + post message                → team updates
   classroom list courses + create                    → masterclass admin
```

**State:** the access token is cached **in memory only** today → every reload re-auths. Requirement: persist with refresh-token rotation, or make re-auth explicit and clearly communicated.

---

## 11. Cross-Cutting States

| State | Behavior |
|---|---|
| **Loading** | Skeleton cards for grids; stepped progress for the 3-step modal; AI calls show an indeterminate shimmer with a "sampling trends…" caption |
| **Empty** | Filter-aware empty states with a "clear filters" recovery action; portal-specific "no appointments yet → Explore" CTA |
| **Error** | Inline banner with retry; `ErrorBoundary` wraps the React root; AI errors degrade to labeled fallback content, never a dead spinner |
| **Fallback AI** | Response carries `source: 'fallback'` → UI shows a quiet "sample result" chip (TR-3) |
| **Offline/degraded** | React Query retries once, then serves `placeholderData`; booking CTA disabled with an explanatory note only if the API is unreachable |
| **Auth expiry** | 401 → clear session → preserve intended route → prompt sign-in |
| **Concurrent edit** | Status changes are last-write-wins in v1; v2 adds optimistic concurrency (`updatedAt` check) |

---

## 12. End-to-End Journey Map

```
 AWARENESS            CONSIDER            DECIDE              POST-BOOK
 ─────────            ─────────           ───────             ─────────
 Explore hero    →    SalonDetails   →    BookingModal   →    Client Portal
 category chips       AI review summary    date/time            track status
 map marker           service menu         details + venue      cancel
 Advisor recs         staff + hours        moodboard attach     leave review
 Lookbook spec        travel estimate      confirm
                                          Provider Dashboard ← status transitions
                                                                   AI quality audit
```

---

## 13. Flow-Level Requirements Summary

| ID | Requirement | Priority |
|---|---|---|
| FL-1 | Booking submit must show success or an actionable inline error — never fail silently | P0 |
| FL-2 | All provider/client mutations send the JWT (single HTTP client) | P0 |
| FL-3 | Guest → sign-in prompts preserve the intended destination | P1 |
| FL-4 | Lookbook → booking carries the moodboard through all 3 steps | P1 |
| FL-5 | Deep links from Advisor/Chat/Map land on the correct detail view | P1 |
| FL-6 | URL reflects the current view (shareable/back-button) | P1 |
| FL-7 | Every AI surface labels fallback output | P1 |
| FL-8 | Mobile: all flows usable at 360px; nav disclosure groups sections | P1 |
