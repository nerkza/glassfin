# Glassfin Product Guidelines

How Glassfin should look, feel, and behave — at the **product level**, not the token level. This is the brief you hand to a designer (or to Claude) before they start a new screen.

For the descriptive token reference (every CSS variable, every radius, every easing curve), see [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md). The two docs are designed to sit side-by-side: this one tells you *what to build*, that one tells you *what to build it with*.

This document is anchored to the Claude Design prototype shipped at [docs/ui-prototype/Glassfin/](docs/ui-prototype/Glassfin/) on 2026-05-05. When the prototype and the live app disagree, **the prototype is canonical** — DESIGN_SYSTEM.md and the source code are catching up.

---

## 1. Product personality

Glassfin is a **quiet client for Jellyfin**. That phrase is on the title bar and it earns its keep — every product decision should fall out of it.

| Adjective | What it means in practice |
|---|---|
| **Quiet** | No neon. No spinners on rails. No "achievement unlocked" toasts. Status is ambient, not interruptive. |
| **Layered** | Translucent panels stacked over a near-black canvas. Depth comes from blur + saturation, not borders + shadows. |
| **Honest** | If a server is offline, say so. If a rail is empty, hide it. Never show fake data or placeholder cards that look like real content. |
| **Cinematic** | The hero, the player, the detail page should feel like editorial pages from a quality streaming service — not like a NAS admin panel. |
| **TV-friendly** | Focus rings are large and obvious. Rails support arrow-key navigation. Density modes accommodate "across the room" viewing distance. |

The smell test for any new screen: does it look more like **macOS Sequoia** or more like a **gaming launcher**? It should always read as the former.

---

## 2. The five surfaces

Glassfin has five canonical surfaces. Every screen is one of these, or a composition of them. New surfaces should justify why they don't fit.

### 2.1 The dashboard (Home)

The default landing. A **rotating hero carousel** at the top, then a stack of horizontal rails:

1. Continue watching (16:9 cards, progress bars, "X left")
2. Recently added (2:3 posters, horizontal scroll)
3. Recommended for you (2:3 posters, horizontal scroll)
4. Favorites (2:3 posters, horizontal scroll)
5. Collections (2:3 posters, horizontal scroll)
6. Library / search results panel (poster grid with pagination)

Rules:

- **Rails return `null` when empty** offline or when the rail has no items. Never show a "Sign in to see Continue Watching" placeholder. The hero already conveys offline state.
- **Skeletons during initial fetch only.** Once a rail has items, never go back to a skeleton — pagination loads more in-place.
- **Hero is genuinely random per session** (5 picks from resume + library merged). It is not a static "featured item". It rotates every 7 seconds with a Ken-Burns 1.0→1.04 zoom on the backdrop, paused on hover.

### 2.2 The library / facet pages

Type-locked browsing surfaces — `/movies`, `/shows`, `/music`, `/live`, `/genre/{name}`, `/person/{id}`.

These pages have an **explicit empty-state** (see §6) — the empty state IS the content. They never `null` out, because the user navigated here intentionally and expects an answer.

Layout:
- Top: page title + meta (count, sort dropdown, filter chips, optional A–Z rail)
- Body: poster grid in the current density
- Tail: "Load more" sentinel for infinite scroll

### 2.3 The detail page

`/item/{id}` — the canonical "tell me about this thing" view.

Composition:
- **Detail hero** (60dvh-ish) — backdrop image at 0.7 opacity, `imageBreathe` zoom, dark gradient vignette, 220px portrait poster overlaid on the bottom-left, copy stacked to its right.
- **Action row** — Play (primary), More (secondary), Favorite (icon), Override Artwork (icon), Request If Missing (icon, only when *arr is configured).
- **Description** — full overview, no clamp.
- **Genre chips** — deterministic-hue, non-clickable in the hero context, **clickable** here (deep-link to `/genre/{name}`).
- **Cast row** — circular face avatars with name + role.
- **Info grid** — type, studio, released, runtime, rating, codec, bitrate.
- **Provider links** — IMDb / TMDB / TVDB pill chips with external-link icons.
- **For series:** season tabs + episode list. **For albums:** track list with `01 — Track Name — 4:23` rows.

### 2.4 The settings page

Two-column layout:
- **Left:** sticky vertical nav with sections (Connection, Playback, Libraries, Servers, Tasks, Display, Plugins, Logs, About)
- **Right:** scrollable content panes, each one a glass-panel `.settings-section`

Each section header is `h2` with a one-line description below it. Each setting is a `.setting-row`: label + sub (in mono) on the left, control (toggle, dropdown, text input) on the right.

Settings is the only place in the app where **mono type is allowed in primary copy** — server URLs, version strings, IDs.

### 2.5 The player overlay

Fullscreen modal (`z-index: 50`), black backdrop, three rows: top bar (back arrow + title + actions) → stage (vidstack canvas) → bottom controls (scrub bar + play/pause/skip). Vidstack is the only third-party player and its native chrome is hidden in favour of Glassfin-native controls — see [feedback_vidstack_player.md](.claude/projects/-Users-lewis-Documents-Projects-glassfin/memory/feedback_vidstack_player.md) for the wiring rules.

Player keyboard map: Space/k = play, m = mute, f = fullscreen, c = captions, ←/→ = seek 10s, ↑/↓ = volume.

### 2.6 Newer / planned surfaces

- **Profile picker** (`/profiles`) — a fullscreen "who is using Glassfin" grid. Large rounded-square avatars (90px), name + role below, tapped to authenticate. Replaces the inline UserPicker for multi-user households.
- **Now playing (Music)** — square album art + track list, ambient blurred-art background, accent-glow play button.
- **Onboarding** — fullscreen overlay (`z-index: 100`), pip stepper, glass card, ambient orb background. 3 steps: server URL → user picker → confirm.

---

## 3. The top bar

The top bar is **three columns**, in this order:

1. **Search** (380px max, `min-height: 36px`, glass-panel pill, magnifier icon, ⌘K kbd hint, placeholder: "Search films, shows, music, live channels")
2. **Sync chip** (inline, glass-panel with accent-tinted gradient, animated, see §3.1)
3. **Right actions** (`min-height: 36px` chip-buttons): connection status dot, profile chip with avatar+name

### 3.1 The sync chip (inline)

The library-sync indicator lives **inline in the top bar**, not as a floating dock. This was previously a floating dock in the bottom-left and was promoted in 2026-05-05 because the prototype designed a chip with proper dimensions (the old chip was cramped; the new one isn't).

Anatomy:

```
┌──────────────────────────────────────────────────────────┐
│  [⟳]  SYNCING SHOWS  the.bear.s03e07.fanart.jpg     46%  │
│       ████████████████░░░░░░░░░░░░░░░░░░░░░░░░░         │
└──────────────────────────────────────────────────────────┘
```

- Icon block (32×32, accent-tinted, contains a spinning refresh icon)
- Two-line meta:
  - Line 1: `LABEL` (caps, accent-strong) + filename (mono, ellipsis-clipped, tertiary)
  - Line 2: thin (4px) accent-fill bar, transform-origin left, transitions on `scaleX`
- Percentage (right-aligned, mono, accent-strong, tabular numerals)

States:

| State | Behaviour |
|---|---|
| Active | Visible, animated, pct grows. |
| Idle (incl. just-finished) | `opacity: 0; scale: 0.94; filter: blur(2px); pointer-events: none;` collapses cleanly. Don't `display: none` — the layout shifts. **No transient "Library synced" toast.** Idle is silence — finishing a sync is not an event the user triggered, so don't pop a notification at them. The chip simply exhales away when sync flips to inactive. |
| Failed | Stays visible with the danger colour until dismissed. (Reserve for sync failures; runs through a separate code path the chip doesn't currently model.) |

The transition is `900ms cubic-bezier(0.65, 0, 0.35, 1)` for opacity, `1200ms` for scale + padding. The chip should feel like it's *exhaling* away when it goes idle.

**Top-bar-only rule:** the inline sync chip is the only privileged ambient-status surface. Anything else (download queue, transcode progress, server-event toasts) goes to a **floating dock** (`LiveLogDock` is the canonical example).

---

## 4. The hero carousel

The hero is the **first thing the user sees** on Home. It does the heaviest visual work in the app.

### 4.1 Layout

```
┌────────────────────────────────────────────────────────────┐
│                                                            │
│   [eyebrow: FEATURED · STUDIO]                            │
│   ╔══════════════╗                                        │
│   ║              ║                       [poster]         │
│   ║  TITLE       ║                       2:3 portrait     │
│   ║              ║                       180–200px wide   │
│   ╚══════════════╝                                        │
│   ★ 8.4 · 2024 · 2h 28m · HD                              │
│   One-line clamp of the synopsis…                         │
│   [▶ Resume]  [More info]  [+]            [tag] [tag] [tag]│
│                       ●●●○○                                │
└────────────────────────────────────────────────────────────┘
```

- Height: `clamp(420px, 52dvh, 560px)`
- Border-radius: `var(--r-xl)` (32px)
- Background: backdrop image at 0.85 opacity with a 22s `imageBreathe` 1.0→1.06 ease-in-out animation
- Vignette: bottom-vertical (transparent → 0.95 black at 100%) and left-horizontal (0.85 black → transparent at 70%) — copy is bottom-left-anchored and needs the contrast
- Pip indicator: bottom-centre, glass pill, active pip widens from 18px to 32px and fills with accent over 7s as the auto-rotate timer runs

### 4.2 Tag cluster

The tags on the right:
- Year, runtime, rating — neutral glass chips
- Genres (max 3) — **deterministic hue per genre name**, **non-clickable in the hero**. They're informational labels here. The **detail page** is where genres are clickable.

This is a deliberate distinction: the hero is for orientation, the detail page is for navigation. Don't conflate them.

### 4.3 Empty / connect state

When `candidates.length === 0`:
- Same glass-panel container, no backdrop image
- Eyebrow: `WELCOME` (or `LIBRARY` if connected but empty)
- Title: `Connect your Jellyfin server` (or `Your library is empty`)
- Body: explanation
- CTA: `MagneticButton` to settings

The MagneticButton (cursor-tracking primary) is reserved for the hero's primary action. Don't sprinkle it elsewhere.

---

## 5. The side rail

Always-on left-edge nav. **80px wide**, sticky-top, glass-panel, full-height with 14px outer padding and `border-radius: var(--r-xl)`.

Stack:
- **Brand mark** (44×44, accent→lavender gradient `G`, scales 1.04 on hover)
- **Nav** (Home / Movies / Shows / Music / Live)
- spacer (justify-content: space-between)
- **Settings** (icon-button, bottom-anchored)

### Active state

Two cues:
1. Background bumps to `--glass-strong` with `--glass-border-strong` border
2. **A 3px × 18px accent stripe** sits 10px to the *left* of the active button, with an 8px accent-coloured glow. This is the prototype's signature side-rail detail and should not be omitted.

Hidden tabs (toggled in Settings → Display) drop out of the nav cleanly — no greyed-out placeholder.

### Mobile

Below 900px, the side rail becomes a **fixed bottom tab bar** spanning the viewport, brand mark hidden, nav direction flipped to row. The active-stripe drops in this layout.

---

## 6. States

Glassfin has four canonical states for any data surface: **loading, empty, error, connected-but-empty**. Honesty matters.

### 6.1 Loading

- Skeleton cards only — same dimensions as the real card, subtle shimmer (200% horizontal background-position cycle, 1.6s)
- Never spinners on rails. Spinners are okay for transient inline waits ("Testing connection…") but never on content surfaces.

### 6.2 Empty

Two flavours:
- **Type-locked pages** (LibraryPage, FacetPage): explicit `state-card` with glyph + heading + body + (optional) CTA. The empty state is the content.
- **Home dashboard rails**: `return null`. The hero's connect prompt covers offline; stacked "Sign in to see X" cards are noise.

### 6.3 Error

- `state-card` with danger-tinted glyph
- Heading: what happened, plainly ("Couldn't load your library")
- Body: actionable next step ("Check your server URL in Settings → Connection.")
- Action: retry button, secondary action: "View logs"

Errors **never** show a stack trace in production UI. Logs are in `Settings → Logs`.

### 6.4 Connected-but-empty

`state-card` with neutral glyph. "Your Movies library is empty. Add content in Jellyfin or check library permissions." Don't disguise this as an error.

---

## 7. Density and responsive

Three density modes drive the home rails and library grid (set on `html[data-density]`):

| Mode | Min poster width | Gap |
|---|---|---|
| compact | 110–120px | 10px |
| default (balanced) | 130–150px | 14px |
| spacious | 180px | 18–22px |

Two breakpoints:
- `> 900px` — desktop layout (80px side rail + content)
- `≤ 900px` — mobile (fixed bottom tab bar, single-column hero, top-actions wrap, episode rows stack)

The density mode applies on top of any breakpoint.

Library grid uses `repeat(auto-fill, minmax(var(--grid-min), 1fr))` — never a fixed number of columns. Cards reflow naturally with width.

---

## 8. Motion

The prototype evolves the durations slightly. Use these going forward:

| Event | Duration | Easing |
|---|---|---|
| Hover on a tile | 160ms | `cubic-bezier(0.16, 1, 0.3, 1)` |
| Tile poster zoom on hover | 600ms | `cubic-bezier(0.16, 1, 0.3, 1)` |
| Play overlay reveal on tile | 200–240ms | `cubic-bezier(0.16, 1, 0.3, 1)` |
| Hero slide cross-fade | 900ms | `cubic-bezier(0.16, 1, 0.3, 1)` |
| Hero auto-advance | 7000ms | — |
| Image breathe (Ken Burns) | 22000ms | `ease-in-out infinite alternate` |
| Sync chip collapse/expand | 900ms (opacity) / 1200ms (scale) | `cubic-bezier(0.65, 0, 0.35, 1)` |
| Page enter | 320ms | `cubic-bezier(0.16, 1, 0.3, 1)` |
| Player open | 320ms | scale 1.02 → 1.0 + opacity 0 → 1 |
| Onboarding step transition | 360ms | translateY(8px) → 0 |
| Modal entrance | spring (stiffness 120, damping 18) | framer-motion |

### Hard rules

- **No motion on hover ever exceeds 4px displacement or 1.04× scale.** Restraint reads as expensive.
- **Reduce-motion is non-negotiable.** Both `@media (prefers-reduced-motion: reduce)` AND `html[data-reduce-motion="true"]` collapse all transitions to 0.001ms. The auto-advancing hero pip animation also collapses.
- **No spinners on rails.** Skeletons only. (Spinners are fine for inline transient waits.)
- **The `imageBreathe` 22s loop is deliberate and unique** — it's slow enough to not feel busy but persistent enough to make the dashboard feel alive. Don't replace it with parallax or stronger motion.

---

## 9. Buttons

Four flavours, listed in order of weight. **One primary per surface.** Never two `primary-button`s side by side.

| Variant | When | Visual |
|---|---|---|
| **MagneticButton** | The single most important action on a hero or onboarding step. Tracks the cursor with a small offset. | Filled accent, white text, magnetic translate on cursor proximity |
| **`primary-button`** | The conventional primary on a detail page, settings save, etc. | Filled accent, white text, pill, glow shadow `0 8px 32px rgba(accent, 0.4)`, `inset 0 1px 0 rgba(255,255,255,0.25)` |
| **`secondary-button`** | Non-destructive secondary (More info, Override artwork) | Glass-panel pill, white text, accent border on hover |
| **`text-button`** | Tertiary action (Sign out, Reset onboarding, "View all") | No fill, no border, subtle hover background |
| **`back-button`** | Navigation back (detail page, settings) | Mini secondary-button with left chevron |
| **`icon-button`** | Toolbar/rail/player icon-only buttons | 36–46px square, glass background, centered symbol |

Pill radius (999px) is the default for all buttons. **Sharp-cornered buttons or inputs are a smell-test fail.**

---

## 10. Accent and theming

There is **exactly one accent colour at a time**.

The prototype upgrades the default from `#4f9bff` (deeper system blue) to **`#7fb6ff`** (lighter, friendlier system blue). The change is intentional — the lighter hue reads better against the more luminous glass surfaces in the new prototype.

Presets shipped in Settings → Display → ColorWheel:

| Name | Hex |
|---|---|
| Default blue | `#7fb6ff` ← new default |
| Sunset | `#ff8a4c` |
| Lavender | `#a78bfa` |
| Mint | `#34d399` |
| Rose | `#f472b6` |
| Amber | `#fbbf24` |
| Cyan | `#22d3ee` |

The user picks one; it sets `--accent` on `:root`; everything that needs a highlight inherits — buttons, focus rings, active tabs, progress bars, slider fills.

**Plugins can override** `--accent` for plugin-scoped surfaces, but never globally. See `src/plugins.ts`.

If a designer picks a new accent value, verify:
- ≥ 4.5:1 against `--bg-base` for body text
- ≥ 3:1 against `--bg-base` for non-text (focus rings, fill bars)
- ≥ 6:1 against `--bg-base` for primary-button white text

Most pastels fail the contrast check. The presets shipped were vetted.

---

## 11. Glass language

The prototype's **glass values are more luminous** than the prior shipping app. Use these going forward:

```css
--glass:               rgba(255, 255, 255, 0.085);
--glass-strong:        rgba(255, 255, 255, 0.13);   /* hover / pressed */
--glass-quiet:         rgba(255, 255, 255, 0.045);  /* inputs, secondary cards */
--glass-border:        rgba(255, 255, 255, 0.16);
--glass-border-strong: rgba(255, 255, 255, 0.26);
--glass-blur:          saturate(1.9) blur(60px);
```

The blur jumps from 40 → 60px and the saturation from 1.6 → 1.9. This is the single biggest visual delta from the prior version — panels read as **much more vibrant** without losing their dark canvas. Don't water it down.

Every `.glass-panel` keeps the **lit-from-above hairline highlight** (`::before` with a transparent → 0.28-white → transparent gradient at the top edge). It's mandatory for the Apple-material feel.

---

## 12. Type

The font stack now prefers downloaded **Geist** as the primary fallback for non-Apple devices, in this order:

```
"Glassfin Display" → SF Pro Display → SF Pro Text → Geist → Inter Tight → Manrope → Helvetica Neue
```

Geist (Vercel's neo-grotesque) is loaded from Google Fonts in the prototype. It's the closest free face to SF Pro and significantly better than Inter on display sizes — slightly more mechanical, very modern. Inter Tight stays in the chain for legacy support.

**Never** use the OS-default sans (`system-ui` alone). Always go through the named stack.

Hierarchy (semantic classes from the prototype):

| Class | Use |
|---|---|
| `.t-hero` / `.t-h1` | Hero title, page title |
| `.t-h2` | Section title |
| `.t-card-title` | Poster tile / media card title |
| `.t-body` | Body copy |
| `.t-small` | Small captions, metadata |
| `.t-eyebrow` | Uppercase label (caps, tracked, tertiary opacity) |
| `.t-mono` | Code, file paths, IDs, percentages |

Body text is **`--text-secondary` (0.66 opacity)**, headings are `--text` (0.96), labels are `--text-tertiary` (0.42). **Never pure white.**

---

## 13. Smell tests — what to push back on

If a designer (or generated mockup) ships any of these, push back:

- ❌ Sharp corners on buttons or inputs
- ❌ Pure white text on dark backgrounds
- ❌ A second accent colour competing with the primary
- ❌ Inline gradient borders or "neon" glows
- ❌ Native browser checkboxes in the dense form areas (use the custom toggle)
- ❌ Loading spinners on content rails (use skeletons)
- ❌ Hard-coded colour for genre chips (hash the name)
- ❌ Empty "Nothing here" cards stacked on the home page (hide the rail)
- ❌ Hover motion exceeding 4px or 1.04×
- ❌ Focus rings under 2px or invisible
- ❌ Body text smaller than 0.85rem (TV-distance illegibility)
- ❌ Mock data, lorem ipsum, fake item titles in production code
- ❌ Genre chips clickable in the hero (decorative there; navigation belongs on the detail page)
- ❌ Sync state in a position other than the inline top-bar chip (or in addition to it)
- ❌ Any new ambient-status surface in the top bar that isn't sync (use a floating dock)

---

## 14. The Claude prompt

When asking Claude (or any LLM) to design a Glassfin-adjacent screen, prepend:

> Design [X] in the Glassfin visual language: a calm Apple-style glass aesthetic on a near-black base (`#06070a`), with `rgba(255,255,255,0.085)` translucent panels, a single muted system-blue accent (`#7fb6ff`), large radii (14–32px), `blur(60px) saturate(1.9)` backdrop filter, tight letter-spacing on headings (-0.01 to -0.025em), a lit-from-above 1px highlight on every glass surface, deterministic-hue chips for tags, generous focus rings (3px) for TV remote, no neon glows, no spinners on rails (skeletons only), the `imageBreathe` 22s ken-burns animation on hero backdrops, an inline top-bar sync chip (not a floating dock), and respect for `prefers-reduced-motion`. The user's accent customisation drives `--accent` on `:root`; everything else inherits. See [PRODUCT_GUIDELINES.md](PRODUCT_GUIDELINES.md) and [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md) in the repo for the full system.

That paragraph + a link to this doc + the shipped components is enough for a one-shot Claude run to produce something on-brand.

---

## 15. Where these guidelines live

| Concern | Source |
|---|---|
| Tokens, radii, type vars | [src/styles.css](src/styles.css) — descriptive in [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md) |
| Component patterns | [src/components/](src/components/) |
| Prefs runtime (apply density / reduced-motion / accent) | [src/prefs.ts](src/prefs.ts) `applyVisualPrefs` |
| Plugin theme override | [src/plugins.ts](src/plugins.ts) `registerTheme` |
| The reference prototype | [docs/ui-prototype/Glassfin/](docs/ui-prototype/Glassfin/) |

When you ship a new pattern, update **this doc** with the rule (the *what* and *why*) and **DESIGN_SYSTEM.md** with the token (the *how*). One commit.

---

## 16. Versioning

Glassfin follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html)
with a pre-1.0 caveat: while we're on `0.x.y`, the public surface (Jellyfin
fields we read, settings shape, plugin manifest) can still move. Each
non-trivial change still gets a version bump and a changelog line.

### When to bump

| Bump | Trigger |
|---|---|
| **Patch** (`0.0.x → 0.0.(x+1)`) | Bug fix, visual tweak, copy change, dependency-only update. The default for everyday work. |
| **Minor** (`0.x.y → 0.(x+1).0`) | New surface, new top-bar control, new settings category, new persisted pref shape, new plugin hook. Anything a returning user would notice. |
| **Major** (`x.y.z → (x+1).0.0`) | Reserved for the **1.0** cut and beyond. While pre-1.0, breaking changes ship as a **minor** bump (per SemVer's pre-1.0 carve-out) but **must** be called out at the top of the CHANGELOG entry. |

A bump is part of the same commit as the change it ships — never a separate "bump version" PR.

### What to update on every bump

Single source of truth is `package.json`. Mirror it everywhere it's surfaced:

| File | What to change |
|---|---|
| [package.json](package.json) | `"version": "x.y.z"` |
| [docker-entrypoint.sh](docker-entrypoint.sh) | `${GLASSFIN_VERSION:-x.y.z}` default in the `/version.json` template |
| [src/components/SettingsPage.tsx](src/components/SettingsPage.tsx) | Fallback in `<strong>{appVersion?.version ?? "x.y.z"}</strong>` (Settings → About) |
| [README.md](README.md) | Status line — `pre-1.0 (\`0.0.x\` — current: \`vx.y.z\`)` |
| [CHANGELOG.md](CHANGELOG.md) | New `## [x.y.z] — YYYY-MM-DD` block with **Added / Changed / Removed / Fixed** sections (drop empty sections) |

The Docker build also accepts `--build-arg GLASSFIN_VERSION=…` and `--build-arg GLASSFIN_GIT_SHA=…`; CI sets these at image-build time so a deployed `/version.json` reports the exact released tag, not the `package.json` fallback.

### Where the version is shown to the user

- **Settings → About → Glassfin → Version.** The single in-app surface. Reads `/version.json` at boot and falls back to the hard-coded `package.json` value when running outside the container (i.e. `npm run dev`).
- **`/version.json`** at the deployed origin. Useful for ops dashboards and uptime probes.
- **Plugin manifest** — third-party plugins report their own `manifest.version`, displayed under the plugin card in Settings; that's independent of Glassfin's app version.

No version stamp in the side rail, top bar, or footer. The About page is enough — keep the chrome quiet.

### Tagging

Each release commit is tagged `vx.y.z` (lowercase v). Tags are pushed when the release ships, not before. A future `/release` flow will automate this; for now it's a manual `git tag` + `git push --tags` after the version-bump commit lands on `main`.
