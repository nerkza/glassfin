# Glassfin — Goals, Architecture, Roadmap

Last updated: 2026-05-06

## 1. Product

Glassfin is a browser/PWA media client for Jellyfin libraries that aims to feel closer to a premium streaming app than a server dashboard. Self-hosted, runtime-configurable, designed to run cleanly on Unraid behind Tailscale or Cloudflare Tunnel.

**Principles**

1. *Media first, admin second.* The first screen is a media experience.
2. *Self-hosted without feeling self-hosted.* Static container, premium UI.
3. *Runtime configurable.* Endpoint, mode, plugins via env vars or in-app settings.
4. *Device-forward.* Phones, tablets, browsers, TV/remote, eventual cast.
5. *No invented data.* Empty states are honest. There is no demo fallback.

**Users**

- *Primary:* Self-hosters running Jellyfin at home who want a more modern UI than the default web client.
- *Household:* Family members who don't care about server details.
- *Future:* Power users with Tailscale/Cloudflare remote access, TV-room playback, and plugin authors.

## 2. Current Capabilities (verified)

| Area | Capability |
| --- | --- |
| Auth | Username/password via `/Users/AuthenticateByName`; session persisted in localStorage; sign-out clears it |
| User picker | `/Users/Public` discovery; avatar grid; auto-sign-in for password-less users; auto-discover in onboarding |
| Onboarding | First-run 5-step flow (welcome → server URL verify → user picker → credentials → done) gated by localStorage; reset devtool in Settings |
| Library | Server-side paginated fetch with infinite scroll (page size 60); `TotalRecordCount` surfaced in section header |
| Library filter chips | All / Movies / TV / Music; resets pagination on change |
| Search | Server-side via `SearchTerm` parameter; debounced 300 ms |
| Resume rail | Real `/Users/{id}/Items/Resume` items with skeleton loading |
| Item detail | Full-page (no longer a modal): hero artwork, tagline, genres, cast, ratings, IMDb/TMDB/TVDB deep-links, artwork override |
| Routing | Hash router — `#/`, `#/movies`, `#/shows`, `#/music`, `#/live`, `#/item/{id}`, `#/settings`. Browser back/forward arrows work; refresh on a detail page restores via `getItemDetail()` fallback |
| Top-level nav | SideRail tabs route to dedicated pages: Home (dashboard), Movies, Shows, Music, Live (placeholder until Jellyfin Live TV API). Each library tab is a self-contained `LibraryPage` with its own paginated state, sort options (Name/Recently added/Year), and TopBar-driven search |
| Hide library tabs | Settings → Display → Navigation toggles each library tab on/off. Persisted in `localStorage["glassfin.prefs"]` via `src/prefs.ts`. Hidden tabs disappear from the rail but direct hash navigation still works |
| Hero | Auto-rotating carousel; picks 5 random items per session; backdrop image preferred, blurred-poster fallback; vertically-stacked tag column with deterministic hue colours per genre/quality chip |
| Artwork override | Pick from Jellyfin RemoteImages or upload custom file (base64 POST) |
| Player | `@vidstack/react` engine (HLS auto-loaded for transcodes); custom glass-themed transport; settings popover with hover-opened submenu (Quality 2160p/1440p/1080p/720p/480p, Audio, Subtitles, Container, Video codec) |
| Subtitles | Jellyfin `/Subtitles/.../Stream.vtt` injected as vidstack `<Track>` elements; off-or-track selection flips text-track mode without reloading |
| Audio tracks | Re-stream via `AudioStreamIndex` parameter; position preserved across reload |
| Progress reporting | `Sessions/Playing/Progress`/`/Stopped` via vidstack events; throttled 10 s |
| Profile chip | TopBar shows active user + routes to settings |
| Status chip | Single-word "Online"/"Offline" with green/red dot |
| Sync indicator | Floating bottom-left dock: "X of Y items", live elapsed, indeterminate→percent progress, ✓ on success |
| Logging | 6 levels (silent → trace), persisted; ring buffer (1000 entries); Settings → Logs view; floating Live Log dock (opt-in only — no auto-show) |
| Theme | Apple-style glass: muted system blue, vibrancy, calm motion, large radii |
| TV/remote | Focus-visible rings, roving arrow-key focus on rails, Escape closes modals |
| Plugins | `PluginManifest`, runtime registry, dynamic-import loader; **Sunset reference plugin** ships built-in; Settings → Plugins UI for install/uninstall + per-plugin panels rendered inline |
| Empty states | Hero, ContinueRail, LibraryPanel each have explicit disconnected/empty messaging |
| Error handling | 30 s `AbortController` timeout per request; `Promise.allSettled` instead of swallowed errors; visible status reflects partial success; stale-response guards on paginated fetches |
| Deployment | Multi-stage Docker → Nginx; runtime config via `config.js`; `/health` endpoint; Tailscale and Cloudflare Tunnel docs |

**Verified end-to-end against a real Jellyfin server** at `192.168.1.6:8096`: auth, library sync (8,540 items), resume rail, sync indicator, onboarding flow.

## 3. Architecture

Stack: React 19 + TypeScript + Vite + Framer Motion + symbols-react + `@vidstack/react` for the player + plain CSS. No backend. Browser talks to Jellyfin directly.

| Path | Purpose |
| --- | --- |
| `src/App.tsx` | Root: state, auth, sync orchestration, routing-to-page wiring, JellyfinItem→MediaItem mapping |
| `src/main.tsx` | Bootstrap; loads vidstack base CSS + plugins before paint |
| `src/router.ts` | Hash router (`useHashRoute`, `navigate`, `goBack`, `navTabForRoute`, `NAV_TABS`); ~120 lines, no library |
| `src/prefs.ts` | Persisted UI preferences (hidden library tabs); single localStorage key with versioned schema + subscriber API |
| `src/components/LibraryPage.tsx` | Per-tab library page (Movies/Shows/Music/Live); self-contained pagination, sort, infinite scroll; Live is a placeholder |
| `src/jellyfin.ts` | Jellyfin API client (auth, items, resume, progress, artwork, users, remote images, public info, subtitle URLs, parameterised playback URLs) |
| `src/runtimeConfig.ts` | Reads `window.__GLASSFIN_CONFIG__` |
| `src/logger.ts` | Levelled logger with ring buffer + subscriber API |
| `src/plugins.ts` | Plugin manifest, registry (with per-plugin theme key tracking), dynamic-import loader |
| `src/plugins/index.ts` | Built-in plugin directory exposed to Settings |
| `src/plugins/sunset-theme.ts` | Reference plugin — theme override + stats panel |
| `src/media.ts` | `MediaItem` / `DeviceTarget` types + the single real `localPlaybackDevice` |
| `src/styles.css` | Visual system (glass tokens, type, motion, layouts, responsive) |
| `src/hooks/useRovingFocus.ts` | Arrow-key roving focus for rails |
| `src/components/SideRail.tsx` | Sidebar navigation |
| `src/components/TopBar.tsx` | Search, status chip, profile chip |
| `src/components/HeroSection.tsx` | Rotating carousel with backdrops + tag column |
| `src/components/ContinueRail.tsx` | Resume rail |
| `src/components/LibraryPanel.tsx` | Library grid + filter chips + IntersectionObserver sentinel |
| `src/components/MediaCard.tsx` | Resume card |
| `src/components/PosterTile.tsx` | Library poster tile |
| `src/components/SectionTitle.tsx` | Shared section header |
| `src/components/MagneticButton.tsx` | Animated primary button |
| `src/components/PlayerOverlay.tsx` | vidstack-based player + custom transport + Jellyfin progress + settings menu with submenu |
| `src/components/DetailPage.tsx` | Item detail page (formerly modal) |
| `src/components/ArtworkPanel.tsx` | RemoteImages picker + upload |
| `src/components/SettingsPage.tsx` | Connection / Playback / Libraries / Tasks / Display / Plugins / Logs / About + plugin install UI |
| `src/components/UserPicker.tsx` | `/Users/Public` avatar grid (autoDiscover supported) |
| `src/components/Onboarding.tsx` | First-run guided overlay |
| `src/components/LogsPanel.tsx` | Settings → Logs view |
| `src/components/LiveLogDock.tsx` | Floating log dock (opt-in only) |
| `src/components/SyncDock.tsx` | Floating sync progress dock |
| `Dockerfile`, `nginx.conf`, `docker-entrypoint.sh` | Production container |
| `deploy/` | Tailscale + Cloudflare Tunnel docs and examples |

**Runtime config** (`/config.js`, generated by `docker-entrypoint.sh`):

| Key | Purpose |
| --- | --- |
| `JELLYFIN_URL` | Browser-reachable Jellyfin base URL |
| `JELLYFIN_API_KEY`, `JELLYFIN_USER_ID` | Optional preconfigured fallback (auth-by-name is preferred) |
| `PUBLIC_APP_URL` | External URL users open |
| `REMOTE_ACCESS_MODE` | `lan`, `tailscale`, or `cloudflare` |
| `SONARR_URL`, `SONARR_API_KEY` | Optional. When both set, Glassfin offers "Request via Sonarr" in the search empty state |
| `RADARR_URL`, `RADARR_API_KEY` | Optional. When both set, Glassfin offers "Request via Radarr" in the search empty state |

**Constraint:** the user's browser must reach `JELLYFIN_URL`. If Glassfin is exposed via Cloudflare/Tailscale but Jellyfin is LAN-only, library calls will fail.

## 4. Roadmap

### Phase 0 — Foundation · ✓ Complete
React/Vite scaffold, dark UI, PWA, Docker/Nginx, runtime config, deployment docs, build + container verification.

### Phase 1 — Real Jellyfin Library · ✓ Complete
Auth, library fetch, resume rail, server-side search + filter chips + paginated infinite scroll, item detail, playback progress, expanded metadata, artwork override, multi-user picker. **Remaining:** real-server QA pass against more libraries.

### Phase Settings — Customisation depth · In Progress
**Done (2026-05-06):** `prefs.ts` schema bumped to v2 (with v1→v2 migration that preserves saved values). New persisted prefs: `defaultQualityPreset`, `preferredAudioLanguage`, `preferredSubtitleLanguage`, `subtitleMode`, `accentColor`, `layoutDensity`, `reduceMotion`, `hiddenLibraryIds`. `applyVisualPrefs()` runs at boot from `main.tsx` and on every prefs change, applying `--accent` CSS var + `data-density` + `data-reduce-motion` to `<html>`.

**Done (2026-05-06):** Settings → **Playback** — quality preset, preferred audio/subtitle language pickers, subtitle behaviour (off/auto/forced) — all read by PlayerOverlay on mount via `getPrefs()`. The pre-existing device picker stays.

**Done (2026-05-06):** Settings → **Libraries** — fetches `/Users/{id}/Views`, renders a toggle per library. Hidden library IDs flow through a single `filterByLibrary(items)` helper in App.tsx that drops items whose `parentId` is hidden. Applied to Hero candidates, ContinueRail, Recently Added/Recommended/Favorites/Collections rails, LibraryPanel, LibraryPage, and FacetPage. Filter is applied at render time (not fetch) so toggling a library updates the UI instantly.

**Done (2026-05-06):** Settings → **Display** — full **HSV color wheel** picker (`src/components/ColorWheel.tsx`): outer hue ring (CSS conic-gradient masked to a band), inner SV square (layered linear-gradients recoloured per hue), pointer-driven drag handlers with pointer capture, hex + R/G/B inputs that round-trip through HSV. Plus accent presets, layout-density dropdown (compact/default/spacious — tunes `.poster-row`, `.continue-grid`, `.content-shell` gaps), and force reduce-motion toggle.

**Done (2026-05-06):** Settings → **About** — Glassfin app metadata + Jellyfin server info readout (server name, version, OS, server ID) fetched via `/System/Info/Public` when the category opens.

**Remaining:** Tasks (admin-gated `/ScheduledTasks`), default-landing-tab pref, auto-play next episode toggle.

### Phase 2 — Playback UX · In Progress
Goal: dedicated player feel.
**Done:** vidstack engine (HLS support out of the box), custom transport, settings popover with quality/audio/container/codec/subtitles, progress reporting, keyboard controls, subtitle delivery via VTT, **memoised src prop + canPlay-gated position restore + onError/onLoadStart/onLoadedMetadata logging** so the settings chain is traceable end-to-end.
**Outstanding cosmetic bugs:**
- **Scrubber + volume slider track-fill render white instead of accent** — vidstack's `--media-slider-track-fill-bg` CSS-var override isn't taking effect. Slider drag IS working (not a logic problem), but the coloured-fill portion is invisible. Likely needs the override at higher specificity or applied before vidstack's defaults.
- **Settings rows: "current value" column not right-aligned** — the two `Auto` labels in Container + Video codec rows don't line up against the right edge.
**Remaining:** verify slider colour fix on real refresh, replay-from-saved-position on open, error states.

### Phase 3 — Library Depth · In Progress
**Done (2026-05-06):** Top-level nav routes — every SideRail tab now goes somewhere distinct. `/movies`, `/shows`, `/music`, `/live` are dedicated pages with type-locked filters, sort options (Name / Recently added / Year), TopBar-driven search, and infinite scroll. Live is a placeholder until the Jellyfin Live TV API surface is wired. `mapJellyfinItem` extracted to `src/media.ts` so multiple library surfaces share one reference.
**Done (2026-05-06):** Hide-library-tabs toggle — Settings → Display → Navigation lets the user remove tabs they don't use. Persisted via `src/prefs.ts` (versioned schema, single localStorage key, subscriber API).
**Done (2026-05-06):** Series → Season → Episode drill — `DetailPage` branches on `item.kind`. Series shows a Seasons grid (poster + episode count, click → navigate to season). Season shows an Episodes list (16:9 thumbnail + episode #/title/runtime/overview, click → episode detail). Episode detail shows "Series · S2 · E5" eyebrow and the existing Play button; container types (Series/Season) hide the play button. Children fetched via new `JellyfinClient.getChildren(parentId)` (uses `/Users/{id}/Items?ParentId=...`). Acceptance: home → series → season → episode → play now works (final QA against the live server pending).
**Done (2026-05-06):** Recently Added + Favorites rails on Home — generic `PosterRail` component renders both, fed by new `getLatestItems()` and `getFavoriteItems()` endpoints. Heart toggle on `DetailPage` (`isFavorite` field on `MediaItem`, optimistic flip + revert on error, server sync via new `setFavorite()`). Up Next card on Series detail surfaces the next unwatched episode via new `getNextUp({ seriesId })` endpoint with thumbnail + S/E label + Play/Details actions.
**Done (2026-05-06):** Empty rails hidden — Home dashboard rails (Continue Watching, Recently Added, Favorites) return `null` when offline or empty rather than rendering placeholder cards. Loading still shows skeletons.
**Done (2026-05-06):** Genre + Person facet pages — new routes `#/genre/{name}` and `#/person/{id}`. New `FacetPage` component shares pagination/sort/infinite-scroll behaviour with `LibraryPage` but queries with `Genres=` or `PersonIds=`. Genre chips in HeroSection are now clickable buttons; cast names in DetailPage are clickable buttons that route to `/person/{id}`; genre chips in DetailPage's meta-row are also clickable. Person facet page renders person photo + bio above the filmography grid via new `getPerson(id)` endpoint.
**Done (2026-05-06):** Mobile responsive pass — Hero h1 wraps and shrinks (was nowrap-clamped at 2.6rem floor, now 1.6rem with normal wrap on mobile). Hero p lifts the 1-line clamp on the empty/connect state so the full intro renders. Top-actions changed from rigid `1fr 44px 44px` (legacy bell slot) to `flex` so the profile chip isn't squeezed. Poster row mobile bumped from 1 column to `repeat(auto-fill, minmax(110px, 1fr))`. Library page header stacks vertically on mobile with a full-width sort dropdown.
**Done (2026-05-06):** Recommended rail on Home — new `getRecommendedItems()` endpoint hits `/Users/{id}/Suggestions`. Renders as a `PosterRail` between Recently Added and Favorites, hidden when empty (per `feedback_hide_empty_rails`).
**Done (2026-05-06):** Collections / BoxSets — new `boxset` MediaKind + `getCollections()` endpoint. Collections rail on Home (`PosterRail`, hidden when empty). DetailPage branches BoxSet → renders contained items via `getChildren()` in a poster grid using the same tile shape as Seasons. Container types (Series/Season/BoxSet) all hide the Play button.
**Phase 3 status:** Acceptance criterion (home → series → season → episode → play works fluidly) plus genre/person/collection facet surfaces and three home rails (Recently Added, Recommended, Favorites, Collections) shipped. Final live-server QA pending across all surfaces.

### Phase 4 — Device & Living Room · In Progress
**Done:** focus rings, roving arrow-key focus on rails, keyboard player controls.
**Remaining:** cross-rail focus jumps, dedicated 10-foot mode (larger type/hits), real cast/remote-control via Jellyfin sessions API.

### Phase 5 — Multi-User · In Progress
**Done:** `/Users/Public` discovery, avatar tile picker, profile chip, password-less auto-sign-in.
**Remaining:** admin-vs-user UI gating, parental rating enforcement, per-user display preferences (Jellyfin DisplayPreferences API), guest/kiosk mode.

### Phase 6 — Plugins · In Progress
**Done:** manifest schema, runtime registry with per-plugin theme key tracking, dynamic-import loader, theme + settings-panel APIs, Settings → Plugins install/uninstall UI, **Sunset reference plugin**, panels rendered inline under each plugin's card, **localStorage-backed install persistence** (`registry.install`/`uninstall` write to `glassfin.plugins.installed`; `restorePersistedBuiltIns()` runs on app boot from `main.tsx`).
**Remaining:** more reference plugins (IMDb-rating enricher, webhook notifier), per-plugin sandboxing, isolated storage, authoring guide.

### Phase 6.5 — First-run Onboarding · ✓ Complete
5-step overlay (welcome → server URL → user picker → credentials → done). Persists `glassfin.onboardingComplete` flag. Reset devtool in Settings → Connection. Validated server via `/System/Info/Public`. UserPicker has `autoDiscover` for the picker step.

### Phase 7 — Deployment & Security · In Progress
**Done (2026-05-06):** Static security headers in `nginx.conf` (X-Content-Type-Options, X-Frame-Options DENY, Referrer-Policy strict-origin-when-cross-origin, Permissions-Policy locking down powerful APIs except fullscreen + PiP for the player, Strict-Transport-Security 1y).
**Done (2026-05-06):** Templated CSP — `docker-entrypoint.sh` extracts the origin from `JELLYFIN_URL`, `SONARR_URL`, `RADARR_URL` and writes a per-deployment `connect-src` allow-list. `script-src 'self'` is strict (no inline, no eval). Rendered into `/etc/nginx/conf.d/glassfin-csp.conf` and included from the main server block.
**Done (2026-05-06):** `/version.json` endpoint with `name / version / gitSha / builtAt / remoteAccessMode` populated by `docker-entrypoint.sh` from build-args. Settings → About reads it and falls back gracefully when running outside the container (e.g., `npm run dev`).
**Done (2026-05-06):** CORS guidance + security-headers reference in `deploy/REMOTE_ACCESS.md` covering same-host preferred path, explicit allow-list path, reverse-proxy snippet for header injection.

**Done (2026-05-06):** Unraid Community Apps template at `deploy/unraid/glassfin.xml` + `deploy/unraid/README.md` install guide. Covers all env vars (Jellyfin + Sonarr/Radarr), masks API keys, defaults sensible.

**Done (2026-05-06):** Cloudflare Access worked example at `deploy/cloudflare-tunnel/ACCESS.md` covering the full flow (app definitions, policies, CORS implications across same-domain XHRs, service tokens for the API key path, common failure modes).

**Done (2026-05-06):** Reverse-proxy auth compatibility doc at `deploy/PROXY_AUTH.md` — covers Authelia/Cloudflare Access/Caddy/nginx/Traefik/Pomerium/Tailscale, explains the cross-origin XHR constraint that breaks Basic-auth-on-Jellyfin setups, gives diagnosis playbook for CORS / 401 / network failures.

**Done (2026-05-06):** Release process doc at `deploy/RELEASE.md` covering semver, git tags, GHCR image tag scheme (`latest` / `MAJOR.MINOR.PATCH` / `MAJOR.MINOR` / `main` / `sha-…`), GitHub Actions build shape with `--build-arg` populating `/version.json`, release checklist, hotfix flow, rollback flow.

**Done (2026-05-06):** `docker-compose.yml` updated with all current env vars (Sonarr/Radarr) and the new `GLASSFIN_VERSION` / `GLASSFIN_GIT_SHA` / `GLASSFIN_BUILT_AT` build-args.

**Phase 7 status:** Feature-complete from a deploy-docs perspective. Awaits a real CI workflow being committed (sample shape in RELEASE.md) and a real Docker build verification once your daemon is running.

### Phase 8 — PWA & Offline · Planned
Better service-worker caching with versioning, offline empty state, safe offline media downloads, install-prompt affordance, app shortcuts.

### Phase 9 — Quality System · Planned
Vitest for client mappers and pure functions, Playwright smoke tests at desktop + mobile, Docker build check script, lint/format tooling, CI workflow once a remote exists.

## 5. Outstanding bugs (current backlog, in priority order)

These are real bugs the user has reported or hit. **Not** speculative.

1. **Player slider fills (scrubber + volume) render white, not accent.** Drag works, colour doesn't. CSS-variable override on `.player-scrubber` / `.player-volume-slider` isn't reaching vidstack's `--slider-fill` or `--media-slider-track-fill-bg`. Investigate CSS specificity vs vidstack's `:where(.vds-slider .vds-slider-track-fill)`. *(Cosmetic.)*
2. **Settings menu rows: current-value column not right-aligned.** Quick CSS fix on `.player-settings-row` grid template — `auto 1fr auto` should align middle column (with `text-align: right` or `justify-self: end`). *(Cosmetic.)*
3. ~~**Big bundle size warning**~~ — **resolved 2026-05-06.** Main bundle dropped from 689 KB / 204 KB gzip → 400 KB / 124 KB gzip. PlayerOverlay (vidstack), SettingsPage, DetailPage, LibraryPage, FacetPage, ArtworkPanel, RequestPanel are all `lazy()` + `<Suspense>` wrapped in App.tsx. Vidstack's ~180 KB chunk only ships when the user clicks Play.

### Recently fixed (2026-05-06)

- **`client.getBackdropUrl is not a function`** — root cause was the service worker's blanket cache-first strategy (`public/sw.js`) which kept serving stale hashed JS bundles after deploys. SW now uses network-first for HTML navigations + `/config.js` and cache-first only for hashed `/assets/*`. CACHE_NAME bumped to `v2` so existing users get a clean cache on next visit.
- **Player settings (quality / container / codec / audio) didn't take effect end-to-end** — `src` prop was an inline object literal recreated every render, causing vidstack to re-emit a "new" src on every render and never settle on a load. The position-restore subscriber also raced with stale `canPlay` state from the old src. Fixed by memoising the src object on `playbackUrl` and gating restore on a `canPlay` false→true transition. Added `onError` / `onLoadStart` / `onLoadedMetadata` logging + a `Playback URL recomputed` debug log so the chain is now traceable in Settings → Logs.
- **Plugin install state didn't persist across refresh** — `glassfin.plugins.installed` is now written by `registry.install`/`uninstall` and read by `restorePersistedBuiltIns()` on app boot from `main.tsx`. Verified: install Sunset → reload → accent stays orange; uninstall → reload → accent reverts to blue.

## 6. Backlog (next features, priority order)

1. Real-server QA across multiple library shapes (large, sparse, music-only).
2. Resume from saved position on player open (currently starts at 0).
3. CSP + Nginx security headers (Phase 7 first slice).
4. Vitest + Playwright bootstrap (Phase 9).
5. Season/episode browsing (Phase 3).
6. ~~**Sonarr / Radarr integration**~~ — **shipped 2026-05-06.** `src/arr.ts` exposes `SonarrClient` + `RadarrClient` with `lookup` / `getQualityProfiles` / `getRootFolders` / `addSeries` / `addMovie` / `testConnection`. `src/components/RequestPanel.tsx` is a modal opened from the search empty state in LibraryPanel + LibraryPage when at least one *arr is configured. Settings → Servers section shows configured *arrs, lets the user test connections, and explains the env vars to set. Out-of-scope for this slice (and intentionally so): editing indexers, custom format scoring, monitor-only options — the request flow uses sensible defaults (monitor everything, search-on-add).

## 7. Security

**Current model:** static app served by Nginx; browser talks directly to Jellyfin; optional API key in runtime config.

**Risks:** browser-stored access tokens are readable by anyone with the browser profile; public Cloudflare exposure without Access exposes the UI; if Jellyfin is also public it must be secured independently; direct browser→Jellyfin requests need CORS or proxying.

**Hardening options:** prefer auth-by-name over long-lived API keys (default); add a small backend proxy if secrets must stay server-side; recommend Cloudflare Access for public hostnames; prefer Tailscale private access for households; add CSP and Nginx headers.

## 8. Definition of Done — First Real Release

- Connect to Jellyfin without manually finding a user UUID. ✓
- Home rails populate from real Jellyfin data. ✓
- Continue Watching comes from Jellyfin resume. ✓
- Selecting a real item opens a detail view. ✓ (now a proper page)
- Playback starts reliably for common video files. ✓ (vidstack)
- Playback progress is reported back to Jellyfin. ✓
- Player slider fills render in the accent colour. ✗
- Settings popover changes (quality / container / codec) actually apply. ✗
- Plugin install survives a refresh. ✗
- Docker image builds cleanly. ✓
- Unraid deployment instructions tested from a fresh setup.
- Remote-access docs cover LAN, Tailscale, and Cloudflare Tunnel. ✓
- Basic tests or smoke checks exist.
- Pagination so large libraries are usable. ✓

## 9. Agent Handoff Notes

Before making changes:

1. Read [README.md](README.md) and [PROJECT_REVIEW.md](PROJECT_REVIEW.md).
2. Read this file.
3. Inspect [App.tsx](src/App.tsx), [jellyfin.ts](src/jellyfin.ts), [styles.css](src/styles.css), [logger.ts](src/logger.ts), [router.ts](src/router.ts), [PlayerOverlay.tsx](src/components/PlayerOverlay.tsx).
4. Run `npm run build` before and after meaningful changes.
5. Use only `symbols-react` for non-player icons; vidstack ships its own icon set for player chrome if needed.
6. Never push to git without explicit user permission.

**Implementation style:**

- No demo or mock data in the rendered UI. Empty states are honest.
- Browser-side errors must be visible (status string and/or logger). Never `.catch(() => [])`.
- Add to the Logger when wiring new server interactions — it's the user's primary debugging surface.
- New Jellyfin requests should go through `JellyfinClient.request()` so they pick up timeout + logging.
- Keep `App.tsx` shell-thin; new feature surfaces are components.
- Surfaces that need TV/remote use should respect focus-visible and keyboard input.
- When touching the player, prefer vidstack hooks (`useMediaState`) over manual `<video>` event listeners.

## 10. Recent Sessions Summary

**2026-05-04 → 2026-05-05**

- Migrated player from native `<video>` to `@vidstack/react` (HLS support, gestures, proper auto-hide, accessibility). Custom glass-themed transport sits on top via plain absolutely-positioned divs (Controls.Root was unreliable).
- Hash routing: `useHashRoute()` + `navigate()` + `goBack()`. `#/`, `#/item/{id}`, `#/settings`. Browser back/forward work; refresh on a detail page restores via `getItemDetail()`.
- Onboarding (Phase 6.5) shipped: 5-step flow, gated by localStorage, reset devtool in Settings.
- DetailModal → DetailPage. No longer a popup; replaces the dashboard area when an item is open. ESC = back.
- Server-side library pagination (page size 60), filter chips (All/Movies/TV/Music), debounced server-side search, IntersectionObserver-driven infinite scroll, stale-response guards.
- Hero rebuilt as auto-rotating carousel: 5 random items per session, backdrop preferred + blurred-poster fallback, vertically-stacked tag column on the right next to the poster, deterministic-hue colours for genre/quality chips.
- Plugin system fleshed out: per-plugin theme key tracking on uninstall, logger integration, Sunset reference plugin, install/uninstall UI in Settings → Plugins, per-plugin panels rendered inline.
- Removed mock data: synthesised "Personal library / Ready / Resume ready" meta strings replaced with real MediaStream-derived chips (resolution / HDR / codec / audio layout). Cast button + notification bell removed (non-functional). DetailPage "Demo" source label removed. Empty progress track on MediaCard hidden when 0.
- LiveLogDock auto-show removed entirely — the dock is now strictly opt-in (open from Settings → Logs).
- Settings menu rebuilt as category list with hover-opened submenu to the left.
- Several bugs introduced and partially-resolved during the player rewrite (sliders, settings end-to-end). See §5 outstanding bugs.

Verified end-to-end against `192.168.1.6:8096` Jellyfin: 8,540-item library.
