# Changelog

All notable changes to Glassfin are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

The full versioning policy — when to bump, what to update, where the
version is surfaced — lives in [PRODUCT_GUIDELINES.md](PRODUCT_GUIDELINES.md)
§16.

## [Unreleased]

_Nothing pending._

## [0.0.1] — 2026-05-06

First tracked version. Treats every prior commit as the implicit baseline;
this entry records the state at the time the changelog was introduced.

### Added
- **Product guidelines** — `PRODUCT_GUIDELINES.md` codifying the visual
  language pulled from the Claude Design prototype (top bar, hero, side
  rail, glass tokens, motion, smell tests).
- **Inline sync chip** — `src/components/SyncChip.tsx` replaces the
  floating `SyncDock`; visible only while syncing, collapses to silence
  on idle.
- **Profile picker page** — `/profiles` route + `src/components/ProfilePicker.tsx`
  with current-user hero card, server URL, and a switch grid backed by
  `JellyfinClient.getUsers()`.
- **`react-colorful` accent picker** — `ColorWheel` rewritten on top of
  `HexColorPicker` (~2.8 KB, zero deps); the previous hand-rolled hue
  ring + SV square is gone.
- **Versioning policy** — this changelog plus PRODUCT_GUIDELINES §16 and
  the surfacing rules in Settings → About / `/version.json`.

### Changed
- **Top bar** — three-column grid (`minmax(320px, 480px) 1fr auto`) with
  the sync chip in the middle column; search field is 44 px tall, chip
  buttons 40 px.
- **Hero CTA** — glass/translucent primary button with bold uppercase
  label and accent text + icon; tight pill drop-shadow (no square clip
  artefact from the panel's `overflow: hidden`).
- **Hero genre chips** — uniform width, right-aligned, bold; decorative
  only (not clickable; navigation belongs on the detail page).
- **Settings nav** — scrolls back to top when switching categories so the
  sticky sidebar doesn't appear to float between tabs.
- **Skeleton wave** — single canonical `@keyframes shimmer` (200%
  background-position cycle, 1.6 s linear), travelling left-to-right.
  Removed the duplicate keyframes that was freezing
  `.skeleton-card::after` mid-cycle.
- **Glass tokens** — base panel blur bumped to `blur(60px) saturate(1.9)`;
  accent default re-tuned to `#7fb6ff`.

### Removed
- `src/components/SyncDock.tsx` and all `.sync-dock-*` CSS — replaced by
  the inline chip.
- Hand-rolled `.color-wheel-ring` / `.color-wheel-sv` / `.color-wheel-*-thumb`
  CSS — replaced by `.react-colorful` overrides.

[Unreleased]: https://github.com/nerkza/glassfin/compare/v0.0.1...HEAD
[0.0.1]: https://github.com/nerkza/glassfin/releases/tag/v0.0.1
