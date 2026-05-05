# Glassfin Design System

A reusable spec for the Glassfin visual language. Pass this to Claude (or any designer) when building related projects, plugins, or marketing surfaces that should look and feel like Glassfin.

This document captures **what's already in the code** — every token here is sourced from `src/styles.css`. Treat it as descriptive, not aspirational.

> **Companion doc:** [PRODUCT_GUIDELINES.md](PRODUCT_GUIDELINES.md) covers *how Glassfin should look and behave at the product level* — surfaces, states, motion, and the rules a designer needs before they start a screen. This doc covers the **token reference** (every CSS var, every radius, every easing curve). Use the two together: PRODUCT_GUIDELINES tells you *what* to build, this doc tells you *what to build it with*.
>
> Where the two diverge, **PRODUCT_GUIDELINES is canonical** — it's anchored to the Claude Design prototype at [docs/ui-prototype/Glassfin/](docs/ui-prototype/Glassfin/) and this doc is catching up. The current state-of-the-code values are still listed here as the truth-on-disk.

---

## 1. Principles

1. **Quiet, layered translucency — not neon.** Glass surfaces sit on a near-black base with subtle vibrancy. No glowing borders, no laser gradients, no rainbow accents.
2. **Apple-system feel.** Muted system-blue accent. Tight type rhythm. Large corner radii. Generous whitespace.
3. **Calm motion.** Short eases, small displacements. No spinning loaders unless content is genuinely streaming. Respect `prefers-reduced-motion`.
4. **Honest empty states.** No demo data, no fake content. When something's empty, say so plainly — or hide the surface entirely (see §10).
5. **TV/remote first-class.** Focus rings are big and visible (3–6px), not 1px afterthoughts. Arrow-key navigation works on rails.
6. **One accent at a time.** A single accent colour drives buttons, focus, active-states, and progress bars across the entire app. Plugins can override; the user can override; defaults to system blue.

When in doubt: pick the option that looks more like macOS Sequoia and less like a gaming launcher.

---

## 2. Colour

### Base layer

```css
--bg-base:        #06070a;     /* The base canvas. Near black, slightly cool. */
--bg-elevated:    #0c0d12;     /* For elevated regions. Rare — most depth uses glass. */
--bg-tint-warm:   rgba(255, 246, 230, 0.012);  /* Subtle warm bleed on hero backdrops */
--bg-tint-cool:   rgba(180, 200, 255, 0.018);  /* Subtle cool bleed on dashboards */
```

The base is **not pure black** — `#06070a` reads as "black" but has a faint coolness that pairs well with the glass tints.

### Glass surfaces

```css
--glass:               rgba(255, 255, 255, 0.045);  /* Standard panel */
--glass-strong:        rgba(255, 255, 255, 0.07);   /* Hover / pressed */
--glass-quiet:         rgba(255, 255, 255, 0.022);  /* Input fields, secondary cards */
--glass-border:        rgba(255, 255, 255, 0.085);  /* Hairline */
--glass-border-strong: rgba(255, 255, 255, 0.14);   /* Hover / focus border */
--glass-inner-light:   rgba(255, 255, 255, 0.05);   /* Inner highlight */
--glass-shadow:
  0 30px 80px rgba(0, 0, 0, 0.45),
  0 1px 0 rgba(255, 255, 255, 0.035) inset;
```

A `.glass-panel` is `background: var(--glass); border: 1px solid var(--glass-border); box-shadow: var(--glass-shadow); backdrop-filter: blur(20px) saturate(140%);`. Backdrop filter is mandatory — without it the panels read as flat grey.

### Text

```css
--text:            rgba(244, 244, 248, 0.96);  /* Primary copy */
--text-secondary:  rgba(244, 244, 248, 0.66);  /* Body, descriptions */
--text-tertiary:   rgba(244, 244, 248, 0.42);  /* Eyebrows, labels */
--text-quaternary: rgba(244, 244, 248, 0.24);  /* Disabled, hints */
```

Text is **never pure white**. The slight desaturation reduces eye strain on dark backgrounds and matches the system look.

### Accent

```css
--accent:        #4f9bff;
--accent-strong: #6aa9ff;
--accent-soft:   rgba(79, 155, 255, 0.18);
--accent-quiet:  rgba(79, 155, 255, 0.08);
```

The accent is user-customisable (Settings → Display → ColorWheel). When you set `--accent` on `:root` everything that needs a highlight picks it up automatically — buttons, focus rings, active tabs, progress bars, slider fills.

**Accent presets** ship with the app:

| Name | Hex |
|---|---|
| Default blue | `#4f9bff` |
| Sunset | `#ff8a4c` |
| Lavender | `#a78bfa` |
| Mint | `#34d399` |
| Rose | `#f472b6` |
| Amber | `#fbbf24` |
| Cyan | `#22d3ee` |

### Status

```css
--positive: #6ad19a;
--warning:  #f3b461;
--danger:   #f87171;
```

Use sparingly. Status colour is reserved for genuine status — connection state, error toasts, save confirmations. Don't use `--positive` for "active state" (use `--accent`).

### Deterministic chip hues

Tags (genres, quality chips) get a hue derived from the tag name via a 32-bit rolling hash. Same input → same hue every render, so chips don't shimmer between renders.

```ts
function hueFromString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return ((h % 360) + 360) % 360;
}
// Then: hsla(hue, 60%, 50%, 0.15) for bg, hsla(hue, 80%, 90%, 1) for text.
```

---

## 3. Typography

### Stack

```css
font-family: "Glassfin Display", "SF Pro Text", "Inter", "Helvetica Neue", Arial, sans-serif;
font-feature-settings: "ss01", "cv11";  /* SF Pro stylistic alternates */
font-synthesis: none;
-webkit-font-smoothing: antialiased;
```

We `@font-face` the name `"Glassfin Display"` to a list of `local()` sources — no webfont download, no FOUC. macOS gets SF Pro, Windows gets Inter (if installed) or Helvetica/Arial fallback.

### Scale

| Use | Size | Weight | Tracking | Leading |
|---|---|---|---|---|
| Hero title (carousel) | `clamp(1.4rem, 2.4vw, 2.1rem)` | 600 | -0.02em | 1.15 |
| Hero title (mobile, empty state) | `clamp(1.6rem, 7vw, 2.4rem)` | 600 | -0.02em | 1.2 |
| Page title (h1, library/facet pages) | `clamp(1.6rem, 2.4vw, 2.1rem)` | 600 | -0.02em | 1.15 |
| Section title | 1.05–1.15rem | 500 | -0.01em | 1.3 |
| Card title | 0.95–1rem | 500 | -0.005em | 1.3 |
| Body | 0.88–0.92rem | 400 | -0.005em | 1.55 |
| Small | 0.78–0.85rem | 400 | normal | 1.4 |
| Eyebrow | 0.74–0.78rem | 500 | 0.06em | 1.2 (uppercase) |
| Code / mono | 0.85rem | 400 | normal | 1.4 (`ui-monospace, SF Mono, Menlo`) |

### Rules

- **Tighten letter-spacing on headings** by `-0.005em` to `-0.02em`. This is the single biggest "feels expensive" signal.
- **Don't go below 0.78rem** in production. Smaller is illegible on retina at typical viewing distance.
- **Body text is `--text-secondary` (0.66 opacity)**, not `--text`. Reserve `--text` for headings and primary actions.
- **Eyebrows are uppercase + tracked**. They label sections; never use them for value-bearing copy.
- **One-line clamp on hero overviews** (carousel only) — long descriptions overflow the bounded hero height. The detail page carries the full overview.
- **Allow wrapping on hero titles** in the empty/connect state — "Connect your Jellyfin server" is 4 words; nowrap-clamping clips it on mobile.

### Hierarchy hint

When in doubt about which level a piece of text is, ask: would the user act on this, scan past it, or read it carefully?
- Act → primary text, full opacity
- Scan → secondary text, 0.66 opacity
- Read → body text, 0.66 opacity, longer measure (52ch max)
- Label → tertiary text, 0.42 opacity, eyebrow style

---

## 4. Spacing & layout

### Density

Three density modes drive the home rails and library grid:

```css
html[data-density="compact"]  .poster-row { grid-template-columns: repeat(auto-fill, minmax(110px, 1fr)); gap: 10px; }
html[data-density="default"]  .poster-row { grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); gap: 14px; }
html[data-density="spacious"] .poster-row { grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 22px; }
```

Pick a base column width that works at the centre density, then ±20px for the others.

### Grid

The dashboard uses a top-level CSS grid: `grid-template-columns: 80px 1fr` (side-rail + content), with `max-width: 1680px` on `.content-shell` so it doesn't sprawl on ultrawide.

### Gaps

| Context | Gap |
|---|---|
| Poster rows (default density) | 14–16px |
| Continue-watching cards | 14px |
| Section to section | 22px |
| Detail-page sections | 14–18px |
| Settings rows | 8–10px |
| Within a card | 4–10px |

### Padding

Glass panels use 16–22px of internal padding. Settings sections are 18–22px. Hero copy is 24px (mobile) / 36–48px (desktop).

---

## 5. Radii

```css
--r-xs:   10px;   /* Inline chips, small inputs */
--r-sm:   14px;   /* Cards, buttons, inputs */
--r-md:   18px;   /* Panels, modals */
--r-lg:   24px;   /* Hero, large surfaces */
--r-xl:   32px;   /* The dashboard root container */
--r-pill: 999px;  /* Buttons, chips, sliders */
```

Bigger radii than typical web apps — this is one of the strongest "Apple-feel" signals. **Inputs and buttons should never be sharp-cornered.**

---

## 6. Surfaces & vibrancy

### Glass panel pattern

```css
.glass-panel {
  background: var(--glass);
  border: 1px solid var(--glass-border);
  border-radius: var(--r-md);
  box-shadow: var(--glass-shadow);
  backdrop-filter: blur(20px) saturate(140%);
  -webkit-backdrop-filter: blur(20px) saturate(140%);
}
```

`saturate(140%)` is what makes the panel feel like macOS rather than blurry plastic.

### Ambient glows

The dashboard has two soft radial gradients fixed off-screen (`.ambient-a`, `.ambient-b`) that bleed faint colour into the background. Subtle — never obvious. Use them for atmosphere on large empty surfaces.

```css
.ambient-a { background: radial-gradient(ellipse 50% 60% at 90% -20%, rgba(120, 90, 200, 0.08), transparent 70%); }
.ambient-b { background: radial-gradient(ellipse 50% 60% at -10% 110%, rgba(79, 155, 255, 0.06), transparent 70%); }
```

### Hero image treatments

- **Backdrop image present:** display at 78% opacity with a `imageBreathe` 22s ease-in-out scale animation (1.0 → 1.04 → 1.0). Never crop the focal subject — Jellyfin's backdrop endpoint already returns a wide crop.
- **No backdrop:** blur the portrait poster and stretch it edge-to-edge as ambient fill. Don't reveal the seams.

Vignette on top: linear gradient from transparent at 50% → `rgba(6, 7, 10, 0.85)` at 100% so the bottom-anchored copy stays legible.

---

## 7. Motion

### Durations

| Event | Duration | Easing |
|---|---|---|
| Hover state on a tile | 160ms | `cubic-bezier(0.16, 1, 0.3, 1)` (decel) |
| Image scale on hover | 600ms | `cubic-bezier(0.16, 1, 0.3, 1)` |
| Page transition | spring, stiffness 220, damping 26 | framer-motion |
| Modal entrance | spring, stiffness 120, damping 18 | framer-motion |
| Hero carousel slide | 500ms | linear cross-fade |
| Hero auto-rotate | 7000ms interval | — |
| Image breathe | 22000ms | ease-in-out infinite alternate |

### Rules

- **Cubic-bezier `(0.16, 1, 0.3, 1)`** — "ease-out-expo" — is the default for any UI transition. Sharp out, lazy in.
- **Spring physics** for layout-changing motion. Static eases for colour / opacity.
- **Reduce motion is non-negotiable.** Both `@media (prefers-reduced-motion: reduce)` and `html[data-reduce-motion="true"]` collapse all animation/transition durations to 0.001ms.
- **No spinning loaders** on real surfaces. Skeleton states only. (Spinners are okay for transient inline waits like "Testing connection…".)

---

## 8. Components

### Buttons

| Variant | Use |
|---|---|
| **Primary** (`.primary-button`) | One per surface. Filled with `--accent`, white text, pill or large radius. Adds a subtle outer glow `box-shadow: 0 8px 32px rgba(79, 155, 255, 0.35)`. |
| **Secondary** (`.secondary-button`) | Outline + glass background. Use for non-destructive secondary actions (Override artwork, Provider links). |
| **Text** (`.text-button`) | No fill, no border. Subtle hover background. Use for minor actions (Sign out, Reset onboarding). |
| **Icon** (`.icon-button`, `.player-icon-button`) | 36–44px square, glass background, centred symbol. Use in toolbars, players, side rail. |
| **Magnetic** (`.MagneticButton`) | Hero CTA. Tracks the cursor with a small offset. Reserve for the absolute primary action — usually a single hero. |

### Posters and cards

- **`.poster-tile`** — portrait 2:3 aspect, used in library grids and home rails. Title under the poster, rating below in small text.
- **`.media-card`** — landscape 16:9, used in Continue Watching. Includes a progress bar at the bottom when `progress > 0`.
- **`.season-tile`** — same shape as poster-tile but with episode count below.
- **`.episode-row`** — landscape thumbnail + title + overview. List item, not a tile.

### Form inputs

```css
.setting-row input, .setting-row select {
  padding: 9px 12px;
  border-radius: var(--r-sm);
  border: 1px solid var(--glass-border);
  background: var(--glass-quiet);
  color: var(--text);
  font: inherit;
}

input:focus-visible, select:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
  border-color: var(--accent);
}
```

Toggles are custom (32px wide × 22px tall), not native checkboxes — see `.nav-toggle-row input[type="checkbox"]`. Native checkboxes survive in dense matrices (request panel) where space is at a premium.

### Chips

Pill-shaped, 6–8px vertical / 14–16px horizontal padding. Active state has a `--accent-soft` background and `--accent` border. Inactive is `--glass` background with `--glass-border`. Hover bumps to `--glass-strong`.

For deterministic-hue chips (genres, quality tags), see §2.

### Status indicators

A 6px coloured dot before status text. Green = connected. Red = offline. The dot has a subtle glow `box-shadow: 0 0 8px currentColor`.

---

## 9. Iconography

- **Library:** `symbols-react` (Apple SF Symbols). Never mix in lucide / heroicons / phosphor.
- **Default size:** 18×18 in body, 20×20 in side rail, 14×14 in compact buttons (provider links, request actions).
- **Stroke / weight:** use `Fill` variants for primary actions (`IconPlayFill`, `IconHeartFill`), unfilled for secondary (`IconHeart`).
- **Vidstack ships its own player icons** — the player chrome can use those, but everything else stays on `symbols-react`.

---

## 10. States

### Empty states

Two distinct flavours:

1. **Type-locked pages (LibraryPage, FacetPage)** render explicit empty-state copy: heading + body + (where applicable) a CTA. The empty state IS the content.

2. **Home dashboard rails** return `null` when offline or empty. The hero's connect prompt already conveys the offline state once at the top — stacked "Sign in to see X" cards are noise. Loading still shows skeletons.

### Loading

Skeletons only. A skeleton card is `.skeleton-card`: same dimensions as the real card with a subtle pulse animation. No spinners on rails.

### Hover

Tiles scale-up imagery (1.04×) and lift slightly (`translateY(-2px)`). Cards bump background to `--glass-strong`. Buttons brighten 10%. Never shadow-pop on hover — it reads as cheap.

### Focus

Always visible. `outline: 2-3px solid var(--accent-strong); outline-offset: 3-6px;` for tiles. Never `outline: none` without a substitute — see `.poster-tile:focus-visible img` for the pattern of styling a child element.

### Disabled

`opacity: 0.45` + `cursor: not-allowed` + remove hover affordance. Don't grey out by changing colour — it confuses the colour-blind.

---

## 11. Accessibility

### Mandatory

- All interactive elements respond to `:focus-visible` with a high-contrast outline.
- All images have `alt=""` (decorative) or meaningful alt text. Posters use `alt=""` because the title is a sibling element.
- All toggles have `aria-pressed` or `aria-checked`. All sliders have `aria-valuenow`/`min`/`max`/`text`.
- All modals trap focus and close on Esc.
- `prefers-reduced-motion` and the prefs `reduceMotion` toggle both fully disable animation.

### Contrast targets

- Primary text on `--bg-base`: 14.5:1 (passes AAA).
- Secondary text on `--bg-base`: 9.5:1 (passes AAA at large, AA at body).
- `--accent` on `--bg-base`: 6.8:1 (passes AA).
- Status colours on `--bg-base`: all pass AA.

If you change the accent, verify `--accent` still hits at least 4.5:1 against `--bg-base` for body text and 3:1 for large text / non-text contrast. Most pastel hex values fail this check.

### Keyboard navigation

- Side rail: arrow keys cycle tabs. Enter activates.
- Rails: arrow keys move along the row (roving focus via `useRovingFocus`). Up/down moves between rails.
- Player: Space/k = play, m = mute, f = fullscreen, c = captions, ←/→ = seek 10s, ↑/↓ = volume.
- All clickable cards are keyboard-activatable via Enter/Space.

---

## 12. Density & responsive

Three breakpoints in the codebase:

| Width | Behaviour |
|---|---|
| `> 760px` | Desktop layout: 80px side rail + content area. |
| `≤ 760px` | Mobile: side rail collapses to a fixed bottom tab bar. Hero becomes single-column. Top-actions wrap. Poster rows become 2–3 columns. |
| `≤ 540px` | Compact mobile: hero side panel hides, episode rows stack thumbnail above text, settings rows go full-width-stacked. |

The density modes (§4) apply on top of any breakpoint.

---

## 13. What "feels like Glassfin" — the smell test

If a designer or a generated mockup makes any of these mistakes, push back:

- **Sharp corners on buttons or inputs.** Always use `--r-sm` minimum.
- **Pure white text** on dark backgrounds. Use `--text` (96% opacity).
- **A second accent colour** competing with the primary. There's exactly one accent.
- **Inline gradient borders** or "neon" glows. Glass is calm, not glowing.
- **Native browser checkboxes** in dense forms. Use the custom toggle.
- **Loading spinners** on content rails. Use skeletons.
- **Hard-coded colour for genre chips.** Hash the name; let the deterministic hue do the work.
- **Empty cards saying "Nothing here"** stacked on the home page. Hide the rail.
- **Motion on hover that displaces by more than 4px or scales more than 1.04×.** Restraint.
- **Focus rings under 2px or invisible.** TV remote users exist.
- **Body text smaller than 0.85rem** in an interface someone might look at across a room.

---

## 14. Cheat sheet for Claude prompts

When asking Claude (or any LLM) to design a Glassfin-adjacent surface, prepend something like:

> Design [X] in the Glassfin visual language: a calm Apple-style glass aesthetic on a near-black base (#06070a), with `rgba(255,255,255,0.045)` translucent panels, a single muted system-blue accent (`#4f9bff`), large radii (14–24px), tight letterspacing on headings (-0.01 to -0.02em), one-line clamps on hero overviews, deterministic-hue chips for tags, generous focus rings for TV remote, no neon glows, no spinners on rails (skeletons only), and respect for `prefers-reduced-motion`. The user's accent customisation drives `--accent` on `:root`; everything else inherits.

That paragraph + a link to this doc is enough for a one-shot Claude run to produce something on-brand.

---

## 15. File map

| Token / pattern | Source of truth |
|---|---|
| Colour vars, type vars, radii | [src/styles.css](src/styles.css) `:root` |
| Density rules | [src/styles.css](src/styles.css) `html[data-density=…]` |
| Reduce-motion | [src/styles.css](src/styles.css) `@media`, `html[data-reduce-motion]` |
| Apply-prefs runtime | [src/prefs.ts](src/prefs.ts) `applyVisualPrefs` |
| Component patterns | [src/components/](src/components/) |
| Plugin theme override API | [src/plugins.ts](src/plugins.ts) `registerTheme` |

When you add a new pattern, document it here. When you change a token, update §2–§7 in this doc in the same commit.
