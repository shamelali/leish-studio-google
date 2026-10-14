# Design Brief — Leish! Aesthetic Marketplace

| | |
|---|---|
| **Document** | 04 — Design Brief |
| **Version** | 1.0 |
| **Date** | 2026-10-08 |
| **Companion** | [05-background-scheme.md](./05-background-scheme.md) (background/gradient system) |

---

## 1. Brand Positioning

> **Leish! — where artistry is booked, not begged for.**

A curated, haute-couture marketplace for makeup artistry in the Klang Valley. It must feel closer to a **fashion house lookbook** than to a directory: dark, warm, editorial, confident. The product sells *craft* — so the interface should recede and let photography, palette and typography carry the luxury signal.

**Personality (four words):** *Editorial · Warm · Precise · Assured.*

| Is | Is not |
|---|---|
| Champagne-on-espresso, gallery-dark | Cold blue SaaS dark mode |
| Serif display + mono micro-labels | Generic system sans everywhere |
| Restrained gold accents on CTAs | Gold-plated everything / bling |
| Confident, short copy | Hype, exclamation marks, emoji spam |
| Photography-forward | Illustration- or icon-forward |

---

## 2. Audience & Design Implications

| Persona | What the design must do for them |
|---|---|
| **Client** (visual, comparison shopper) | Big imagery, glanceable price/rating, obvious primary CTA, zero friction to booking |
| **Freelance MUA** (mobile-first, Instagram-native) | Fast scanning, thumb-reachable controls, status clarity |
| **Studio Director** (operational) | Dense tables that stay legible, clear status chips, deliberate (not playful) interactions |
| **Workspace power user** | Task-oriented layout, fewer flourishes, obvious system feedback |

---

## 3. Design Principles

1. **Dark canvas, light content.** The espresso canvas is a constant; cards, photos and type are the light sources. Never invert to a light panel mid-flow.
2. **One gold moment per view.** Gold (`#574D3C → #A88F5A`) marks the single most important action or active state on screen. If everything is gold, nothing is.
3. **Serif for voice, mono for data.** Headlines and look names are serif; labels, prices, timestamps and badges are uppercase mono with tracking.
4. **Warmth over contrast gimmicks.** Elevation is expressed with *warm surface steps and hairline borders*, not drop shadows.
5. **Motion is punctuation.** Framer Motion entrance fades/slide-ups and one animated nav pill — no perpetual animation, no parallax theater.
6. **Honest states.** Loading, empty, error, and AI-fallback states are designed, not afterthoughts.

---

## 4. Typography

| Role | Family (token) | Usage |
|---|---|---|
| Display / headline | `--font-serif` → **Lora / Playfair Display** | Hero H1, section titles, look names, detail-page titles |
| Body | `--font-sans` → **Raleway / Inter** | Paragraphs, forms, descriptions |
| Micro-label | `--font-mono` → **JetBrains Mono**, uppercase, `tracking-wider`, ~11–12px | Eyebrows, badges, prices, table headers, timestamps |
| Display alt | `--font-display` → **Space Grotesk** | Reserved; currently unused in markup — either adopt for numeric hero stats or drop the token |

**Scale (recommended):** 12 (mono label) / 14 (meta) / 16 (body) / 18–20 (lead) / 24–28 (h3) / 32–40 (h2) / 56–72 (hero, serif, tight leading ~1.05).

⚠ **Known issue:** `index.html` loads Playfair Display, Plus Jakarta Sans, Space Grotesk and JetBrains Mono while `@theme` requests Raleway/Lora/Inter → those fall back to system fonts. *Reconcile the two lists (load what the theme declares, or re-point the tokens).*

---

## 5. Color Roles

Full background system → [05-background-scheme.md](./05-background-scheme.md).

| Token | Value | Role |
|---|---|---|
| `--color-canvas` | `#0F0D0A` | Page background, scrims target |
| `--color-surface` | `#221E16` | Cards, panels |
| `--color-elevated` | `#14110C` | Modals, drawers, sticky bars |
| `--color-chip` | `#2B251B` | Chips, input fills, filter pills |
| `--color-line` | `#3E3628` | Hairline borders (1–2px) |
| `--color-accent` | `#574D3C` | Primary button fill, glow orbs (fills only) |
| `--color-accent-soft` | `#746853` | Control borders, focus (3.6:1 ≥ 3:1) |
| `--color-accent-text` | `#8F7749` | Accent-colored text (4.5:1) |
| `--color-accent-strong` | `#A88F5A` | Hover/active accent, headings-on-gold |
| `--color-fg` / `-muted` / `-dim` | `#E6E5E4` / `#ADA69A` / `#968B78` | Body / secondary / tertiary text |
| Deep crimson | `#751313 → #B12220` | Secondary CTA gradient (Lookbook "Book This Look") |
| Emerald | `#10B981` | Success / confirmed status only |
| Amber | star ratings | Ratings only |

**Documented contrast (vs canvas):** fg 15.4:1 · muted 8.0:1 · dim 5.8:1 · accent-text 4.5:1 · accent-strong 6.2:1 · accent-soft 3.6:1 (control borders, WCAG 1.4.11 ≥ 3:1).

**Rule:** never place `--color-fg-dim`/`fg-subtle` body copy on `--color-surface`; re-check contrast when layering on photography (use scrims, see background scheme).

---

## 6. Layout & Grid

- **Max width:** ~1280–1440px content column, generous side gutters; hero and map go full-bleed.
- **Spacing scale:** 4px base (`0.25rem → 6rem` token scale). Section rhythm: 64–96px vertical; card padding 16–24px; grid gaps 16–24px.
- **Radii:** cards `rounded-2xl/3xl` (16–24px), buttons `rounded-xl`, chips/badges `rounded-full`, inputs `rounded-xl`.
- **Grids:** MUA and studio listings in responsive card grids (1 / 2 / 3–4 columns); detail pages use a 2-column split (media left, actions right) collapsing to one column on mobile.
- **Density:** client surfaces breathe; provider dashboard tables are denser (12–14px mono cells) but retain hairline separation.

---

## 7. Components

| Component | Spec |
|---|---|
| **Primary button** | `bg-accent` → hover `accent-strong`, `rounded-xl`, 14–15px medium, min-h 44px (touch target), focus ring `accent-soft` 2px offset |
| **Secondary button** | Transparent, 1px `line` border, `fg` text, hover fills `chip` |
| **CTA gradient** | `from-[#574D3C] to-[#463D2E]`; Lookbook variant `to-[#751313]` with hover `#B12220` |
| **Card** | `surface` fill, 1px `line` border, `rounded-2xl`, hover: border → `accent-soft` + `translate-y-[-2px]`, 150–200ms ease-out |
| **Listing card** | 4:3 media with bottom fade scrim, serif name, mono price/rating row, badge chips (Verified / From RM x) |
| **Chip / filter pill** | `chip` fill, `rounded-full`, mono uppercase; active = `accent` fill, `fg`-on-gold text |
| **Input** | `chip` fill, 1px `line`, `rounded-xl`, placeholder `fg-subtle`, focus border `accent-soft`, label above in mono uppercase |
| **Modal** | `elevated` fill, `rounded-3xl`, backdrop `backdrop-blur-sm` over canvas at 60–70% opacity, trapped focus, `Escape` to close |
| **Status badge** | mono uppercase, dot + label: pending `fg-dim`, confirmed `accent-text`, completed `emerald`, cancelled crimson |
| **Rating** | amber stars + `fg-muted` count in mono |
| **Nav** | sticky, scroll-condense h-20→h-16, `layoutId` active pill, blur + hairline bottom border when condensed |

---

## 8. Motion

| Interaction | Behavior | Timing |
|---|---|---|
| View transition | `AnimatePresence` fade + 8–12px rise | 250–350ms ease-out |
| Nav active pill | `layoutId` spring | stiffness ~400, damping ~30 |
| Card hover | border + 2px lift | 150–200ms |
| Modal | scale 0.97→1 + fade; backdrop fade | 200ms |
| AI generation | indeterminate shimmer + rotating captions ("sampling trends…") | loop, no bounce |
| Filter/search | debounced list re-flow, `AnimatePresence` on items | 200ms |
| Reduced motion | honor `prefers-reduced-motion`: disable transforms, keep opacity | — |

No autoplay video, no infinite marquee, no cursor-follow effects.

---

## 9. Imagery

- **Direction:** editorial beauty photography — warm skin tones, directional light, deep shadows that merge into the espresso canvas.
- **Treatment:** hero images at `brightness-[0.38]` under dual scrims; gallery/detail images bottom-faded `from-[#0F0D0A]/85`.
- **Consistency:** fixed aspect boxes (4:3 cards, 16:9 galleries, 9:16 reels) to prevent layout shift; `loading="lazy"` below the fold.
- **AI-generated assets** (Image Studio) must be prompt-locked to the same look: *"haute couture editorial, warm chiaroscuro, espresso-and-gold grade"* so they sit beside stock photos invisibly.
- **Avoid:** cool-toned stock, white-background product shots, visible watermarks, clashing color casts.

---

## 10. Voice & Copy

- **Register:** confident, warm, expert — a studio director, not a marketer.
- **Headlines:** short, serif, sentence case ("Find the artist for your moment.").
- **Micro-labels:** mono, uppercase, tracked ("FEATURED ATELIERS", "FROM RM 380").
- **Money:** always `RM` with no decimals for whole amounts; distances in `km`. *(Current UI mixes `$` and miles — must be normalized.)*
- **Errors:** plain and actionable — "We couldn't save that booking. Check the date and try again." never "Error 400".
- **AI output:** always labeled — a quiet "sample result" chip when `source: 'fallback'`.
- **Never claim what isn't real:** remove decorative badges ("Firestore Live & Syncing") or back them with live data; derive hero stats from actual records.

---

## 11. Accessibility

- Contrast: maintain documented ratios; body ≥ 4.5:1, UI borders/focus ≥ 3:1.
- Keyboard: full nav reachability, visible focus (`accent-soft` ring), `Escape` closes overlays, focus trapped in modals.
- Semantics: `aria-expanded`/`aria-controls` on disclosures, labelled form fields, live regions for async results.
- Targets: ≥ 44×44px interactive areas; body text ≥ 16px.
- Motion: `prefers-reduced-motion` respected (§8).
- Images: meaningful `alt` on listing photos; decorative glows `alt=""`/`aria-hidden`.

---

## 12. Responsive Strategy

| Breakpoint | Behavior |
|---|---|
| < 640px | Single column, disclosure nav, stacked detail page, sticky bottom CTA in booking flow, map below list |
| 640–1024 | 2-column grids, condensed nav with "More ▾" |
| > 1024 | 3–4 column grids, split detail layout, full nav row, map beside list |

---

## 13. Deliverables & Handoff

1. **Token source of truth:** `src/index.css` `@theme` (live) — promote `design-tokens.ts` to a generated mirror or delete it (currently unreferenced).
2. **Component inventory:** the §7 table as the canonical checklist; any new component must map to an existing recipe or add a token.
3. **QA gate:** contrast re-check per surface, keyboard pass, reduced-motion pass, RM/km copy pass.
4. **Out of scope for v1:** light theme, illustration system, icon redesign (lucide-react at 1.5–2px stroke, `fg-muted` default / `accent-strong` active).
