# Glassfin

A polished, Apple-style glass PWA media client for [Jellyfin](https://jellyfin.org). No backend — the browser talks to Jellyfin directly. Designed for self-hosters who want a more premium frontend than Jellyfin's default web client.

> **Status:** pre-1.0 (`0.0.x` — current: `v0.0.1`). Verified end-to-end against a live Jellyfin server with 8.5k items. Some surfaces are awaiting their first real-server QA — see [PROJECT_REVIEW.md](PROJECT_REVIEW.md) for the gate matrix. Version history lives in [CHANGELOG.md](CHANGELOG.md); the versioning rule itself is in [PRODUCT_GUIDELINES.md](PRODUCT_GUIDELINES.md) §16.

```
┌──────────┐                    ┌────────────────┐
│ browser  │ ──── XHR/HLS ────► │ Jellyfin       │
│ Glassfin │ ◄─── poster art ── │  (your server) │
└──────────┘                    └────────────────┘
       ▲                          
       │ static HTML + JS         
       │                          
┌──────┴──────┐
│ Glassfin    │
│ (nginx PWA) │
└─────────────┘
```

---

## What's in it

### Browsing

- **Hash routing** — `#/`, `#/movies`, `#/shows`, `#/music`, `#/live`, `#/genre/{name}`, `#/person/{id}`, `#/item/{id}`, `#/settings`. Browser back/forward + refresh-on-detail-page work.
- **Top-level nav** — every SideRail tab routes to a dedicated, type-locked library page with sort options, infinite-scroll, and TopBar-driven search.
- **Hero carousel** — auto-rotates 5 random items, prefers Jellyfin's 16:9 backdrop with a heavily-blurred-poster fallback. Genre chips are clickable → facet pages.
- **Item detail** — full-page detail with hero artwork, tagline, genres, cast, ratings, IMDb/TMDB/TVDB deep-links, artwork override, and **clickable cast names** that route to the person's filmography.
- **Series → Season → Episode drill** — DetailPage branches on item kind: Series shows a Seasons grid, Season shows an Episodes list, Episode shows the play surface with `Series · S2 · E5` context. Plus an **Up Next** card that surfaces the next unwatched episode.
- **Collections (BoxSets)** — first-class detail surface; clicking a collection shows its items.
- **Home rails** — Continue Watching, Recently Added, Recommended for You, Favorites, Collections. Each rail hides itself when empty (no placeholder noise).
- **Favorites** — heart toggle on the detail page; dedicated rail on Home; backed by Jellyfin's `IsFavorite` UserData.
- **Genre + Person facet pages** — type-locked grids backed by Jellyfin's `Genres=` / `PersonIds=` filters.

### Playback

- **`@vidstack/react` engine** — HLS auto-loaded for transcodes; custom glass-themed transport.
- **Settings popover** — Quality (Auto / 4K / 1440p / 1080p / 720p / 480p), Audio track (re-stream via `AudioStreamIndex`), Subtitles (Jellyfin VTT delivery), Container override, Video codec override.
- **Default playback prefs** — set preferred quality, audio language, subtitle language, and subtitle behaviour (off / auto / forced) in Settings → Playback. The player honours these on every open.
- **Subtitles** — flip text-track mode without reloading.
- **Position-aware reload** — switching audio / quality / codec preserves your playback position.
- **Progress reporting** — throttled `Sessions/Playing/Progress` + `/Stopped` via vidstack events.

### Customisation

- **HSV color wheel** picker (Lightroom-style hue ring + SV square) for the accent colour. Plus accent presets and a hex input.
- **Layout density** — compact / default / spacious. Tunes the grid + gaps without changing the rest of the layout.
- **Reduce motion** — force-disable animations regardless of OS preference.
- **Hide library tabs** — toggle Movies / Shows / Music / Live in / out of the SideRail.
- **Hide Jellyfin libraries** — per-library show/hide; hidden libraries' content doesn't appear in any rail or grid.
- **Plugins** — manifest schema, runtime registry, dynamic-import loader, theme + settings-panel APIs. Install state persists across page reloads. Ships with a **Sunset reference plugin** demonstrating the API.

### Auth

- **Onboarding** — first-run 5-step flow (welcome → server URL verify → user picker → credentials → done). Resettable from Settings.
- **Sign-in** — username/password via `/Users/AuthenticateByName`; session persisted in `localStorage`; sign-out clears it.
- **User picker** — discovers users via `/Users/Public`; auto-sign-in for password-less users.

### Sonarr / Radarr integration

When `SONARR_URL`/`SONARR_API_KEY` and/or `RADARR_URL`/`RADARR_API_KEY` env vars are set, the search empty state shows **"Request '{term}' via Sonarr / Radarr"**. The request modal lookup-searches both *arrs, lets you pick a quality profile + root folder, and POSTs the add. Jellyfin scans the new file on its next run.

Settings → Servers shows the configured *arrs and a Test connection button.

### Operations

- **Production container** — multi-stage Docker build → Nginx → static assets.
- **Strict security headers** — HSTS, X-Frame-Options DENY, X-Content-Type-Options nosniff, Referrer-Policy, Permissions-Policy locking down powerful APIs except fullscreen + PiP for the player.
- **Templated CSP** — `connect-src` is auto-derived from `JELLYFIN_URL` / `SONARR_URL` / `RADARR_URL` so the browser is only allowed to talk to your configured servers.
- **Runtime config** — env vars baked into `/config.js` at container start; no rebuilds for endpoint changes.
- **`/version.json`** — build metadata (version / git sha / build time) surfaced in the in-app About page.
- **`/health`** — endpoint for orchestrators.

---

## Local development

```bash
npm install
npm run dev      # Vite dev server on http://localhost:5173
```

The dev server doesn't generate `/config.js` or `/version.json` — the app handles their absence gracefully (treats *arr URLs as unconfigured, About shows "Development build").

---

## Production build

```bash
npm run build
npm run preview  # serves dist/ on http://localhost:4173
```

Bundle: ~400 KB / ~124 KB gzip main chunk. PlayerOverlay (vidstack) and other heavy surfaces are lazy-loaded into separate chunks — see [PROJECT_REVIEW.md](PROJECT_REVIEW.md) "Bundle size" row for the full split.

---

## Docker

```bash
docker build \
  --build-arg GLASSFIN_VERSION=0.1.0 \
  --build-arg GLASSFIN_GIT_SHA=$(git rev-parse --short HEAD) \
  --build-arg GLASSFIN_BUILT_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ) \
  -t glassfin:local .

docker run --rm -p 8088:8080 \
  -e JELLYFIN_URL=http://your-jellyfin-host:8096 \
  -e PUBLIC_APP_URL=http://localhost:8088 \
  glassfin:local
```

Open `http://localhost:8088`.

### Compose

```bash
docker compose up --build
```

---

## Environment variables

| Var | Required | Purpose |
|---|---|---|
| `JELLYFIN_URL` | ✓ | Browser-reachable Jellyfin base URL |
| `JELLYFIN_API_KEY` | | Optional. Auth-by-name (sign-in form) is preferred |
| `JELLYFIN_USER_ID` | | Optional. Pinned user UUID for the API key fallback |
| `PUBLIC_APP_URL` | | External URL users open |
| `REMOTE_ACCESS_MODE` | | `lan` (default), `tailscale`, or `cloudflare` |
| `SONARR_URL` | | Optional. Set to enable "Request via Sonarr" |
| `SONARR_API_KEY` | | Sonarr API key from Settings → General → Security |
| `RADARR_URL` | | Optional. Set to enable "Request via Radarr" |
| `RADARR_API_KEY` | | Radarr API key from Settings → General → Security |

Build-time args (passed via `--build-arg`):

| Arg | Purpose |
|---|---|
| `GLASSFIN_VERSION` | Surfaced at `/version.json` and Settings → About |
| `GLASSFIN_GIT_SHA` | Same |
| `GLASSFIN_BUILT_AT` | Same |

---

## Deployment guides

- [`deploy/REMOTE_ACCESS.md`](deploy/REMOTE_ACCESS.md) — LAN, Tailscale, Cloudflare Tunnel, **CORS guidance** for Jellyfin, security-headers reference.
- [`deploy/cloudflare-tunnel/`](deploy/cloudflare-tunnel/) — tunnel config + `ACCESS.md` worked example with policies, service tokens, and failure modes.
- [`deploy/tailscale/`](deploy/tailscale/) — Tailnet examples.
- [`deploy/PROXY_AUTH.md`](deploy/PROXY_AUTH.md) — compatibility matrix for Authelia / Caddy basicauth / nginx auth_basic / Traefik ForwardAuth / Pomerium / Tailscale, with a diagnosis playbook for cross-origin auth failures.
- [`deploy/unraid/`](deploy/unraid/) — Community Apps template XML + install README.
- [`deploy/RELEASE.md`](deploy/RELEASE.md) — semver, git tag flow, GHCR image tag scheme, GitHub Actions reference shape, release checklist.

---

## Design system

Glassfin's full visual language is documented in [`DESIGN_SYSTEM.md`](DESIGN_SYSTEM.md). Pass it (or §14, the Claude prompt prelude) to any LLM when building related projects, plugins, or marketing surfaces that should look and feel like Glassfin.

---

## Architecture

| Path | Purpose |
|---|---|
| `src/App.tsx` | Root: state, auth, sync orchestration, route → page wiring |
| `src/main.tsx` | Bootstrap; loads vidstack base CSS + plugins + visual prefs before paint |
| `src/router.ts` | Hash router (`useHashRoute`, `navigate`, `goBack`); ~120 lines, no library |
| `src/jellyfin.ts` | Jellyfin API client (auth, items, resume, latest, favorites, next-up, collections, views, person, progress, artwork, parameterised playback URLs) |
| `src/arr.ts` | Sonarr + Radarr clients (lookup, profiles, root folders, add) |
| `src/prefs.ts` | Persisted UI preferences (versioned schema, subscriber API) |
| `src/runtimeConfig.ts` | Reads `window.__GLASSFIN_CONFIG__` |
| `src/logger.ts` | Levelled logger with ring buffer + subscriber API |
| `src/plugins.ts` | Plugin manifest, registry, dynamic-import loader |
| `src/plugins/index.ts` | Built-in plugin directory + persistent reinstall |
| `src/plugins/sunset-theme.ts` | Reference plugin |
| `src/media.ts` | `MediaItem` types + `mapJellyfinItem` + quality-tag derivation |
| `src/styles.css` | Visual system (glass tokens, type, motion, layout, responsive) |
| `src/components/` | Component surfaces (see [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md) §15) |
| `Dockerfile`, `nginx.conf`, `docker-entrypoint.sh` | Production container with templated CSP |

---

## Troubleshooting

- **Stuck on "Loading library…"** — open Settings → Logs, set verbosity to Debug, retry the action. Requests that timed out show as `× GET /path timed out after 30000ms`. Common cause: CORS preflight failing on the Jellyfin side ([REMOTE_ACCESS.md §CORS](deploy/REMOTE_ACCESS.md)).
- **`Online` chip stays red** — no active session; sign in via Settings → Connection.
- **Re-run onboarding** — Settings → Connection → "Show onboarding again" (clears the saved session + onboarding-complete flag).
- **Plugin install reverts on reload** — should not happen; if it does, `localStorage["glassfin.plugins.installed"]` is being cleared by something. Check the Live Log dock for restore errors.

---

## More

- [`PROJECT_GOALS_ROADMAP.md`](PROJECT_GOALS_ROADMAP.md) — capabilities, architecture, phased roadmap, backlog.
- [`PROJECT_REVIEW.md`](PROJECT_REVIEW.md) — measurable acceptance gates with status flags.
- [`DESIGN_SYSTEM.md`](DESIGN_SYSTEM.md) — visual language reference.

## License

All rights reserved (license not yet declared). If you'd like to use Glassfin under a permissive licence, file an issue.
