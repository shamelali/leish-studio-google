# Background Scheme — Leish! Aesthetic Marketplace

| | |
|---|---|
| **Document** | 05 — Background, Gradient & Elevation System |
| **Version** | 1.0 |
| **Date** | 2026-10-08 |
| **Companion** | [04-design-brief.md](./04-design-brief.md) |
| **Source of truth** | `src/index.css` (`@theme`) + patterns observed across `src/components/*` |

> **Concept — "Espresso Gallery."** The interface is a darkened gallery: a warm near-black room (`#0F0D0A`) in which photography, gold accents and type are the light. Backgrounds step up in *warm* increments — never gray, never blue — and depth is built from surface steps, hairline borders, scrims and a single soft gold glow. No hard drop shadows, no pure black, no pure white.

---

## 1. The Elevation Ladder

Six rungs, each a warm-dark step. **Every surface in the app must map to exactly one rung.**

| Rung | Token | Hex | Use for | Observed in |
|---|---|---|---|---|
| **0 · Canvas** | `--color-canvas` | `#0F0D0A` | Page background, empty wells | `App.tsx` root, `LoadingSpinner`, `ImageStudio`, `WorkspaceHub` cards |
| **1 · Recessed** | — | `#0E0C09` / `#100E0A` | Inputs wells inside modals, gradient endpoints, backdrop of dialogs | `ProfileModal` (`#100E0A`), `AIStylist` result (`→ #0E0C09`) |
| **2 · Panel** | `--color-elevated` | `#14110C` (`#110F0B`–`#15120D`) | Modals, drawers, sticky bars, feature panels | `BookingModal`, `ClientPortal` sign-in, `AIStylist` form, `LookbookStudio` card (`#110F0B`) |
| **3 · Card / Surface** | `--color-surface` | `#221E16` (`#17140F`–`#1F1B14`) | Cards, sub-sections, inputs, secondary buttons | `ProfileModal` inner (`#17140F`), `ClientPortal` rows, `WorkspaceHub` inputs (`#18150F`) |
| **4 · Chip** | `--color-chip` | `#2B251B` | Chips, pills, badges, hovered fills | filter chips, avatar wells (`#201C15`), buttons |
| **5 · Line** | `--color-line` | `#3E3628` | Hairline borders only (1–2px), dividers | card borders, dropdown borders |

**Rules**
- Depth goes *up* by rung + a hairline border — not by shadow alone.
- Never place rung 3 on rung 3 (no "card in card" of equal value); step down to rung 1/2 for insets.
- Never use `#000000` as a surface (black is reserved for photo scrims, §4) and never `#FFFFFF` as a fill (white is text/`fg` only).

---

## 2. Observed Neutral Ramp (de-facto tokens)

Values actually rendered in the codebase today, ordered dark → light:

```
#0E0C09  recessed deep        #14110C  panel            #1F1B14  raised row
#0F0D0A  canvas               #15120D  panel warm       #201C15  avatar well
#100E0A  dialog bg            #17140F  card inset        #221E16  surface / border
#110F0B  feature card         #18150F  input fill        #2B251B  chip
#12100C  inset row            #1A1711  banner panel      #3E3628  line
                             #1D1912  panel gradient mid
```

⚠ **Debt:** these ~16 hexes are scattered as arbitrary values (`bg-[#17140F]`). They collapse into **5 tokens** — see §8 (Codification).

---

## 3. Layer Types

### 3.1 Base layer
```css
body { background-color: var(--color-canvas); color: var(--color-fg); }
```
Every view roots on canvas. Sections separate with spacing + hairlines, **not** with alternating background bands.

### 3.2 Panel gradient (hero / feature panels)
Directional warm sweep that gives large panels a subtle light source:

| Variant | CSS | Used by |
|---|---|---|
| **A · horizontal** | `linear-gradient(to right, #15120D 0%, #1D1912 50%, #100E0A 100%)` | `LookbookStudio` hero panel |
| **B · horizontal (short)** | `to right, #17140F → #100E0A` | `ClientPortal` header banner |
| **C · diagonal** | `to bottom right, #18150F → #100E0A` | `ClientPortal` summary card |
| **D · diagonal (deep)** | `to bottom right, #17140F → #0E0C09` | `AIStylist` result card |
| **E · horizontal (wide)** | `to right, #14110D → #1D1912 → #100E0A` | `ProviderDashboard` footer CTA |
| **F · banner** | `to right, #1A1711 → #100E0A` | `ProviderDashboard` promo strip |

**Rules:** delta between endpoints ≤ ~15% luminance (it must read as *lighting*, not as a striped design); always paired with a 1px `#574D3C`/30–40% border when it signals importance; never behind body text longer than 3 lines.

### 3.3 Glow orb (the signature motif)
```html
<div class="absolute top-10 right-10 w-96 h-96 rounded-full
            bg-[#574D3C]/15 blur-3xl pointer-events-none"></div>
```
- **Color:** `--color-accent #574D3C` at **10–18% opacity** (rarely 20%).
- **Blur:** `blur-3xl` (64px) minimum; `blur-2xl` for smaller instances.
- **Placement:** anchored to a corner, half-off the container (`-mt-10 -mr-10`), `overflow-hidden` on the parent.
- **Count:** **max 1 per view.** Seen in `App.tsx` hero (96×96) and `LookbookStudio` (72×72).
- **Always** `pointer-events-none`; decorative → `aria-hidden`.
- **Never** place under running text — only under headings, empty space, or media.

### 3.4 Frosted overlay (floating chrome over content)
```html
<!-- nav -->
class="sticky border-b bg-canvas/95 backdrop-blur-md"
<!-- dropdown -->
class="border border-line bg-elevated p-2 shadow-2xl"
<!-- pill over photo -->
class="bg-black/70 border border-white/20 backdrop-blur-md"
```
| Element | Fill | Blur | Border |
|---|---|---|---|
| Sticky nav | `canvas/95` | `backdrop-blur-md` | `border-b line` (accent-tinted when scrolled) |
| Dropdown/menu | `elevated` (opaque) | none needed | `1px line`, `shadow-2xl` |
| Chip over photo | `black/60–80` | `backdrop-blur-md` | `white/10–20` or `accent/50` |
| Modal backdrop | `black/80` | `backdrop-blur-md` | — |
| Hero search dropdown | `canvas/95` | `backdrop-blur-xl` | `#3E3628` |

**Rule:** blur only on elements that *float over scrollable content*; opaque fills everywhere else (blur is the most expensive item on this list — see §7).

---

## 4. Scrims (photo darkening for legibility)

Backgrounds over photography guarantee text contrast. Four recipes, all currently in use:

| Recipe | CSS | Purpose |
|---|---|---|
| **Bottom fade (strong)** | `to top, #0F0D0A 0%, rgba(15,13,10,.6) 50%, transparent 100%` | Hero (`via 60%`) |
| **Bottom fade (cards)** | `to top, #0F0D0A/85 → transparent` | `SalonCard`, gallery bases |
| **Bottom fade (subtle)** | `to top, #0F0D0A 0%, /40 40%, transparent` | `MUACard`, `SalonDetails`, `LookbookStudio` |
| **Left rail** | `to right, #0F0D0A/95 → /50 → transparent` | Hero text column |
| **Black cap** | `to top, black/80 → transparent` | Small caption chips on imagery |
| **Image dim** | `filter: brightness(0.38)` | Hero photo base state (before scrims) |

**Rules**
- Text over photography sits on **at least one scrim**; if copy is longer than a headline, use *two* (bottom + side).
- Scrim color is **always canvas `#0F0D0A`** (never pure black) so the fade melts into the page; `black/` is allowed only for tiny caption chips.
- Keep fades ≥ 40% of the image height — a hard cut reads as a rectangle, not light.
- After scrims, re-verify contrast: body over image ≥ 4.5:1, large/mono labels ≥ 3:1.

---

## 5. Accent & CTA Gradients

| Name | Gradient | Hover | Where |
|---|---|---|---|
| **Gold primary** | `to right, #574D3C → #463D2E` | `brightness-110` | Auth submit, AI Advisor CTA |
| **Gold → crimson** | `to right, #574D3C → #751311` / `→ #7F1513` | `#B12220 → #8E1917` | Lookbook "Book This Look" (the one high-emotion CTA) |
| **Gold tint** | `bg-[#574D3C]/5 · /10 · /15 · /20` | — | Selected rows, info callouts, badges, empty states |
| **Gold border** | `border-[#574D3C]/30 · /40 · /50 · /60` | solid `#574D3C` on active | Active chips, selected cards, focus |
| **Gold shadow** | `shadow-lg shadow-[#574D3C]/25` | — | Primary buttons (tinted glow, not gray) |

**Rules**
- One gradient CTA per viewport; flat `bg-accent` elsewhere.
- Gold-tint fills are the *only* "highlight" language — do not introduce blue/green selection states (emerald is reserved for success).
- Crimson appears **once** per flow at most; it signals the decisive moment (booking commitment).

---

## 6. Screen-by-Screen Background Map

| Screen | Base | Panels | Accents |
|---|---|---|---|
| **Explore / Hero** | canvas | photo + `brightness-.38` + bottom & left scrims | 1 glow orb (top-right), gold chips, `canvas/95` search dropdown |
| **Listing grids** | canvas | cards `bg-canvas` + `border-#221E16`, bottom fade on media | hover: border → `#574D3C/60` + gold-tint shadow |
| **SalonDetails** | canvas | gallery bottom fade; inset rows `#17140F` | gold border on AI summary callout |
| **BookingModal** | `black/80` + blur backdrop | panel `#14110C`, steps inset `#574D3C/5–10` | active step `bg-#574D3C`, gold CTA |
| **AuthModal / ProfileModal** | `black/80` + `backdrop-blur-md` | dialog `#100E0A`, inset `#17140F` | gold CTA gradient, demo chips `#574D3C/15` |
| **AI Lookbook** | canvas | variant A panel gradient + glow orb; result card `#110F0B` | crimson→gold CTA |
| **AI Advisor** | canvas | form `#14110C`, result variant D gradient | gold submit, gold-tint callouts |
| **Client Portal** | canvas | variant B/C banners, rows `#12100C`, `#1F1B14` | `#574D3C/5–20` status tints |
| **Provider Dashboard** | canvas | variant E/F banners, tables on canvas | gold-tint status chips |
| **Workspace Hub** | canvas | repeated cards `bg-canvas` + `border-#221E16`, inputs `#18150F` | `#18150F` inset panels |
| **Map** | canvas | map container `bg-canvas`, `border-#221E16` | `black/80` frosted legend |

---

## 7. Accessibility & Performance

**Contrast**
- Body text on canvas `#0F0D0A`: **15.4:1** · muted `#C4B8A4` 9.9:1 · dim `#B8A77A` 8.2:1 · accent-text `#C4AD78` 8.9:1.
- Muted, dim, subtle and accent-text tiers are now measured at **≥4.5:1 on every dark rung**, including chip and line, so labels remain readable when components change elevation.
- Primary actions use the dark `#574D3C` fill with `on-primary #E6E5E4`; the hover fill `#6B5F4A` also remains ≥4.5:1. Do not replace this fill with bright gold behind light text.
- Semantic status colors use a high-contrast foreground plus a tinted surface and 3:1 border: success (emerald), warning (champagne), danger (crimson), and info (blue).
- **Watch:** gold-tint fills (`/5–/20`) reduce effective contrast — re-check status or `fg-muted` text inside translucent panels; drop to `fg` if < 4.5:1.

**Performance**
- `blur-3xl` on a 384px orb and `backdrop-blur` on sticky chrome force repaints on scroll — acceptable, but:
  - max **1 orb + 1 blurred sticky element** per screen;
  - `pointer-events-none` + `will-change: auto` on orbs;
  - avoid `backdrop-blur` on elements that resize during scroll (tables/accordions).
- Scrims are pure gradients → GPU-cheap; prefer them to overlay divs with `opacity`.
- `prefers-reduced-motion`: orbs stay (static), but any orb *pulse/fade* animation is disabled.

---

## 8. Codification Plan (debt cleanup)

**Problem:** ~16 raw hexes and 20+ bespoke gradient strings live as Tailwind arbitrary values, duplicated per component.

**Proposal** — add to `src/index.css` `@theme`:

```css
--color-recessed: #100E0A;   /* rung 1 */
--color-panel:    #14110C;   /* rung 2  (alias of elevated) */
--color-inset:    #17140F;   /* rung 3 dark inset */
```

And promote the recurring recipes to utilities:

```css
@layer utilities {
  .bg-panel-gradient      { background-image: linear-gradient(to right, #15120D, #1D1912, #100E0A); }
  .bg-panel-gradient-dim  { background-image: linear-gradient(to bottom right, #17140F, #0E0C09); }
  .bg-scrim-bottom        { background-image: linear-gradient(to top, #0F0D0A, rgba(15,13,10,.6) 50%, transparent); }
  .bg-scrim-bottom-soft   { background-image: linear-gradient(to top, rgba(15,13,10,.85), transparent); }
  .bg-scrim-left          { background-image: linear-gradient(to right, rgba(15,13,10,.95), rgba(15,13,10,.5) 55%, transparent); }
  .glow-orb               { border-radius: 9999px; background: rgb(87 77 60 / .15); filter: blur(64px); pointer-events: none; }
}
```

**Migration order:** Hero → Lookbook → ClientPortal/ProviderDashboard banners → modals → grids → WorkspaceHub (largest count, lowest risk). Verify each screen visually after conversion; the change is a rename, not a redesign.

> Note: `src/lib/design-tokens.ts` documents a *different* palette and is imported nowhere. Either regenerate it from `@theme` or delete it — two sources of truth is how drift starts.

---

## 9. Do & Don't

| ✅ Do | ❌ Don't |
|---|---|
| Step elevation with the 6-rung ladder | Invent a new near-black hex per component |
| Hairline `#3E3628` borders for definition | Heavy gray drop shadows (`shadow-black/50`) |
| One glow orb per view, corner-anchored, ≤18% | Multiple orbs, orbs behind body text |
| Canvas-colored scrims over photography | Pure-black full-image overlays / unreadable text on photos |
| ≤15% luminance delta on panel gradients | Loud multi-stop brand gradients on sections |
| Gold tint `#574D3C/5–20` as the only highlight | Blue selection, purple focus, rainbow status colors |
| `backdrop-blur` only on floating chrome | Blur on scrolling cards or full-page backdrops |
| `pointer-events-none` + `aria-hidden` on decoration | Interactive elements inside decorative layers |

---

## 10. Acceptance Checklist

- [ ] Every surface maps to one of the 6 rungs (no orphan hexes after §8 migration).
- [ ] Exactly one glow orb per view; decorative layers are `pointer-events-none` + `aria-hidden`.
- [ ] All text over photography sits on a scrim and re-passes contrast.
- [ ] One gradient CTA per viewport; crimson appears at most once per flow.
- [ ] No `#000` surfaces, no `#FFF` fills, no cool-gray neutrals.
- [ ] Panel gradients ≤15% luminance delta.
- [ ] `backdrop-blur` limited to sticky nav, modals, and photo-floating chips.
- [ ] Raw hex count in `src/` reduced to tokens/utilities (grep gate: `bg-\[#` returns only approved values).
