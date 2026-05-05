# Glassfin Project Review

Each gate has a measurable pass condition and concrete evidence to inspect. New gates are added as new capability lands. Failed gates are explicit so the next agent can pick them up.

## Acceptance Gates

| Gate | Status | Pass condition | Evidence |
| --- | --- | --- | --- |
| Project location | ✓ | App lives at `/Users/lewis/Documents/Projects/glassfin` | `package.json`, `src/`, `public/` |
| Visual direction | ✓ | Apple-style glass: muted system blue, vibrancy, tight type, large radii, no neon glow | [src/styles.css](src/styles.css), [src/App.tsx](src/App.tsx) |
| Icon rule | ✓ | Only `symbols-react` is used; no lucide / react-icons / heroicons | [package.json](package.json), component imports |
| Onboarding | ✓ | First-run 5-step flow gated by localStorage; reset devtool in Settings | [src/components/Onboarding.tsx](src/components/Onboarding.tsx) |
| Auth | ✓ | Username/password via `/Users/AuthenticateByName`; session persisted; sign-out clears it | [src/jellyfin.ts](src/jellyfin.ts), [src/App.tsx](src/App.tsx) |
| User discovery | ✓ | `/Users/Public` avatar grid; auto-sign-in for password-less users; auto-discover in onboarding | [src/components/UserPicker.tsx](src/components/UserPicker.tsx) |
| Library + total | ✓ | Server-side paginated fetch; UI shows "X of Y items"; filter chips reset pagination | [src/jellyfin.ts](src/jellyfin.ts), [src/components/LibraryPanel.tsx](src/components/LibraryPanel.tsx) |
| Library pagination | ✓ | IntersectionObserver-driven infinite scroll; stale-response guards via request-id ref | [src/components/LibraryPanel.tsx](src/components/LibraryPanel.tsx), [src/App.tsx](src/App.tsx) |
| Server-side search | ✓ | TopBar query → debounced 300 ms → `SearchTerm=` parameter on Jellyfin fetch | [src/App.tsx](src/App.tsx) |
| Resume rail | ✓ | Real `/Users/{id}/Items/Resume` items rendered, with skeleton state during load | [src/components/ContinueRail.tsx](src/components/ContinueRail.tsx) |
| Recently Added rail | ⚠ | Home rail backed by `/Users/{id}/Items/Latest?IsPlayed=false`; renders via generic `PosterRail`. Final QA against live server pending | [src/components/PosterRail.tsx](src/components/PosterRail.tsx), [src/jellyfin.ts](src/jellyfin.ts) `getLatestItems` |
| Favorites rail + toggle | ⚠ | Heart button on DetailPage (`POST/DELETE /Users/{id}/FavoriteItems/{itemId}`); Home rail backed by `/Users/{id}/Items?Filters=IsFavorite`. Optimistic UI with revert-on-error. Final QA against live server pending | [src/components/DetailPage.tsx](src/components/DetailPage.tsx), [src/jellyfin.ts](src/jellyfin.ts) `setFavorite`/`getFavoriteItems` |
| Up Next on Series detail | ⚠ | Inline card above Seasons grid; `/Shows/NextUp?SeriesId={id}` returns the next unwatched episode. Final QA against live server pending | [src/components/DetailPage.tsx](src/components/DetailPage.tsx) `UpNextCard` |
| Genre + Person facet pages | ⚠ | `#/genre/{name}` and `#/person/{id}` routes; FacetPage queries via `Genres=` / `PersonIds=` library filters; genre chips in HeroSection + DetailPage and cast names in DetailPage all navigate to facet pages. Final QA against live server pending | [src/components/FacetPage.tsx](src/components/FacetPage.tsx), [src/router.ts](src/router.ts), [src/jellyfin.ts](src/jellyfin.ts) `getPerson` |
| Recommended rail | ⚠ | Home rail backed by `/Users/{id}/Suggestions`; renders via `PosterRail`, hidden when empty | [src/jellyfin.ts](src/jellyfin.ts) `getRecommendedItems`, [src/App.tsx](src/App.tsx) |
| Collections rail + BoxSet detail | ⚠ | Home rail of BoxSets backed by `/Items?IncludeItemTypes=BoxSet`; clicking a BoxSet opens a detail page that renders its contained items via `getChildren`. Play button hidden for BoxSets (container type) | [src/jellyfin.ts](src/jellyfin.ts) `getCollections`, [src/components/DetailPage.tsx](src/components/DetailPage.tsx) `BoxSetItemsSection` |
| Mobile responsive | ✓ | Hero h1 wraps + shrinks on mobile; empty hero shows full description; top-actions uses flex (no rigid grid slots); poster row uses 110px-min auto-fill; library page header stacks vertically | [src/styles.css](src/styles.css) `@media (max-width: 760px)` |
| Customisation depth | ✓ | prefs.ts v2 schema with HSV ColorWheel picker, accent presets, layout density, reduce-motion, default playback quality, audio/subtitle language preferences, library show/hide. All wired end-to-end (verified in preview) | [src/prefs.ts](src/prefs.ts), [src/components/ColorWheel.tsx](src/components/ColorWheel.tsx), [src/components/SettingsPage.tsx](src/components/SettingsPage.tsx) |
| Library hide/show filter | ✓ | Settings → Libraries toggles persist `hiddenLibraryIds`. Applied via `filterByLibrary(items)` in App.tsx to all rails, hero candidates, library grid, library tabs, and facet pages. Filter happens at render time so toggle changes are instant | [src/App.tsx](src/App.tsx), [src/components/LibraryPage.tsx](src/components/LibraryPage.tsx), [src/components/FacetPage.tsx](src/components/FacetPage.tsx) |
| Sonarr / Radarr integration | ⚠ | `SonarrClient` + `RadarrClient` opt-in via runtime config env vars. Settings → Servers shows status + test-connection. Search empty state offers "Request via Sonarr/Radarr" → modal with profile + root folder + add. Verified data layer end-to-end with mocked fetches; final QA awaits a real *arr instance | [src/arr.ts](src/arr.ts), [src/components/RequestPanel.tsx](src/components/RequestPanel.tsx), [src/components/SettingsPage.tsx](src/components/SettingsPage.tsx) |
| Routing | ✓ | Hash router (`#/`, `#/movies`, `#/shows`, `#/music`, `#/live`, `#/item/{id}`, `#/settings`); browser back/forward work; refresh on detail page survives | [src/router.ts](src/router.ts), [src/App.tsx](src/App.tsx) |
| Top-level nav routes | ✓ | Every SideRail tab routes to a dedicated page; each library tab has its own pagination state, sort, and search | [src/components/LibraryPage.tsx](src/components/LibraryPage.tsx), [src/components/SideRail.tsx](src/components/SideRail.tsx) |
| Hide library tabs | ✓ | Settings → Display → Navigation toggles persist in `localStorage["glassfin.prefs"]`; hidden tabs disappear from the rail but direct-hash deep links still work | [src/prefs.ts](src/prefs.ts), [src/components/SettingsPage.tsx](src/components/SettingsPage.tsx) |
| Item detail page | ✓ | Full-page detail (not modal); IMDb/TMDB/TVDB deep-links; artwork override; ESC = back; branches on `item.kind` (Series shows Seasons grid, Season shows Episodes list, Episode shows show-context eyebrow) | [src/components/DetailPage.tsx](src/components/DetailPage.tsx) |
| Series → Season → Episode drill | ⚠ | Click Series → Seasons grid; click Season → Episodes list; click Episode → detail with Play. Code paths shipped 2026-05-06; final QA against live server pending | [src/components/DetailPage.tsx](src/components/DetailPage.tsx), [src/jellyfin.ts](src/jellyfin.ts) `getChildren` |
| Hero carousel | ✓ | Rotating carousel; backdrop preferred + blurred-poster fallback; tags-on-right + poster column; deterministic-hue chips | [src/components/HeroSection.tsx](src/components/HeroSection.tsx) |
| Player engine | ✓ | `@vidstack/react`; HLS auto-loaded for transcodes; native vidstack action buttons + sliders | [src/components/PlayerOverlay.tsx](src/components/PlayerOverlay.tsx) |
| Subtitles | ✓ | VTT delivery via Jellyfin `/Subtitles/.../Stream.vtt` injected as `<Track>`; selection flips text-track mode | [src/components/PlayerOverlay.tsx](src/components/PlayerOverlay.tsx) |
| Audio tracks | ✓ | Re-stream via `AudioStreamIndex` parameter; position preserved across reload | [src/components/PlayerOverlay.tsx](src/components/PlayerOverlay.tsx) |
| Player slider colours | ✗ | Track-fill on scrubber + volume slider should render in the accent colour | Currently shows white; vidstack `--media-slider-track-fill-bg` override not landing |
| Player settings end-to-end | ⚠ | Quality / container / codec selections produce a working transcoded stream | Memoised src + canPlay-gated restore + load/error logging landed 2026-05-06; needs final QA against the live server to confirm Jellyfin returns a playing stream for each preset |
| Settings rows alignment | ✗ | "Current value" column right-aligned in settings menu rows | Two `Auto` labels misaligned |
| Playback progress | ✓ | `Sessions/Playing/Progress` and `/Stopped` reported via vidstack events; throttled | [src/components/PlayerOverlay.tsx](src/components/PlayerOverlay.tsx) |
| Sync feedback | ✓ | Floating SyncDock shows count and elapsed time during library sync | [src/components/SyncDock.tsx](src/components/SyncDock.tsx) |
| Logging | ✓ | Six levels (silent → trace), persisted; in-app Logs view; opt-in floating Live Log dock | [src/logger.ts](src/logger.ts), [src/components/LogsPanel.tsx](src/components/LogsPanel.tsx), [src/components/LiveLogDock.tsx](src/components/LiveLogDock.tsx) |
| No demo data | ✓ | `media.ts` exports no fake items; Hero/ContinueRail/LibraryPanel/MediaCard render explicit empty states; quality chips derived from real `MediaStreams` | [src/media.ts](src/media.ts), [src/components/HeroSection.tsx](src/components/HeroSection.tsx), [src/App.tsx](src/App.tsx) |
| TV / remote | ✓ | Focus-visible rings on tiles; arrow-key roving focus on rails; vidstack keyboard shortcuts | [src/styles.css](src/styles.css), [src/hooks/useRovingFocus.ts](src/hooks/useRovingFocus.ts), [src/components/PlayerOverlay.tsx](src/components/PlayerOverlay.tsx) |
| Plugins | ✓ | Manifest, registry with per-plugin theme key tracking, dynamic-import loader, Sunset reference plugin, install/uninstall UI, panels rendered inline | [src/plugins.ts](src/plugins.ts), [src/plugins/](src/plugins/), [src/components/SettingsPage.tsx](src/components/SettingsPage.tsx) |
| Plugin install persistence | ✓ | Installed plugin set persists across page refresh | `glassfin.plugins.installed` written by `registry.install`/`uninstall`; `restorePersistedBuiltIns()` runs on boot from `main.tsx`. Verified: install→reload→stays installed; uninstall→reload→stays uninstalled |
| Error visibility | ✓ | No swallowed `.catch(() => [])`; 30s `AbortController` timeout per request; partial-success reflected in status | [src/jellyfin.ts](src/jellyfin.ts), [src/App.tsx](src/App.tsx) |
| Library load (intermittent) | ✓ | `client.getBackdropUrl is not a function` reported in some sessions; downstream effect: hero "Your library is empty" | Root cause was [public/sw.js](public/sw.js) blanket cache-first strategy serving stale hashed bundles after deploys. SW rewritten 2026-05-06: network-first for HTML + `/config.js`, cache-first only for `/assets/*`, CACHE_NAME bumped to `v2` to evict legacy caches |
| Runtime config | ✓ | `JELLYFIN_URL`, `PUBLIC_APP_URL`, `REMOTE_ACCESS_MODE` injected at container start; no rebuild required | [docker-entrypoint.sh](docker-entrypoint.sh), [src/runtimeConfig.ts](src/runtimeConfig.ts), [public/config.js](public/config.js) |
| PWA | ✓ | Manifest, install metadata, app icon, service worker present | [public/manifest.webmanifest](public/manifest.webmanifest), [public/sw.js](public/sw.js), [src/main.tsx](src/main.tsx) |
| Docker | ✓ | Multi-stage Nginx image with runtime config injection | [Dockerfile](Dockerfile), [nginx.conf](nginx.conf) |
| Remote access docs | ✓ | LAN, Tailscale, Cloudflare Tunnel each documented and configurable at runtime | [deploy/REMOTE_ACCESS.md](deploy/REMOTE_ACCESS.md), [deploy/tailscale/README.md](deploy/tailscale/README.md), [deploy/cloudflare-tunnel/](deploy/cloudflare-tunnel/) |
| Build verification | ✓ | `npm run build` passes (TypeScript + Vite); main bundle code-splits vidstack providers | Build output |
| Bundle size | ✓ | Main JS at 400 KB / 124 KB gzip (down from 689 / 204). Vidstack (179 KB / 54 KB gzip) lazy-loads only on first Play. SettingsPage, DetailPage, LibraryPage, FacetPage, ArtworkPanel, RequestPanel, PlayerOverlay all split into per-route/per-modal chunks. No more >500 KB warning | [src/App.tsx](src/App.tsx) lazy + Suspense |
| Real-server smoke | ✓ | Verified end-to-end against `192.168.1.6:8096` Jellyfin server (8,540 items) | Captured in `Settings → Logs` |
| Security headers | ✓ | Static X-Content-Type-Options, X-Frame-Options DENY, Referrer-Policy, Permissions-Policy, HSTS in `nginx.conf`. Templated CSP via `docker-entrypoint.sh` with `connect-src` derived from `JELLYFIN_URL` / `SONARR_URL` / `RADARR_URL`. `script-src 'self'` strict. Verified via shell dry-run | [nginx.conf](nginx.conf), [docker-entrypoint.sh](docker-entrypoint.sh) |
| Version endpoint | ✓ | `/version.json` written at container start from `GLASSFIN_VERSION` / `GLASSFIN_GIT_SHA` / `GLASSFIN_BUILT_AT` build-args. Settings → About surfaces it; falls back to "Development build" outside the container | [docker-entrypoint.sh](docker-entrypoint.sh), [Dockerfile](Dockerfile), [src/components/SettingsPage.tsx](src/components/SettingsPage.tsx) |
| CORS guidance | ✓ | `deploy/REMOTE_ACCESS.md` covers same-host preferred path, explicit allow-list path, and a reverse-proxy header-injection example | [deploy/REMOTE_ACCESS.md](deploy/REMOTE_ACCESS.md) |
| Unraid template | ✓ | `deploy/unraid/glassfin.xml` Community Apps template + install README. All env vars exposed; API keys masked | [deploy/unraid/glassfin.xml](deploy/unraid/glassfin.xml) |
| Cloudflare Access guide | ✓ | Worked example covering app definitions, policies, CORS across same-domain XHRs, service tokens, failure modes | [deploy/cloudflare-tunnel/ACCESS.md](deploy/cloudflare-tunnel/ACCESS.md) |
| Reverse-proxy auth | ✓ | Compatibility matrix for Authelia / Cloudflare Access / Caddy / nginx / Traefik / Pomerium / Tailscale, with diagnosis playbook | [deploy/PROXY_AUTH.md](deploy/PROXY_AUTH.md) |
| Release process | ✓ | Semver scheme, git tag flow, GHCR tag scheme, GitHub Actions reference shape, release checklist, hotfix + rollback flows | [deploy/RELEASE.md](deploy/RELEASE.md) |
| Design system reference | ✓ | Distilled visual language doc capturing tokens, type ramp, motion, components, accessibility — usable as a Claude-design prompt | [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md) |
| Test infrastructure | ✗ | Vitest for mappers/router; Playwright smoke tests | Phase 9 work, not yet started |

## Outstanding gate priorities

The ✗ / ⚠ rows above represent the active backlog. Roughly in order:

1. **Player settings end-to-end QA** — code is in place; needs a real-server pass to confirm each preset/container/codec produces a working stream.
2. **Player slider colours** — visible bug, small CSS fix.
3. **Settings rows alignment** — small CSS fix.
4. **Bundle size mitigation** — dynamic-import PlayerOverlay.
5. **Security headers** — Phase 7.
6. **Test infrastructure** — Phase 9.

## Review Cadence

1. **UI review** after any visual change — visual hierarchy, focus states, mobile/responsive layout, motion restraint, empty-state clarity.
2. **Integration review** after any new Jellyfin call — does it go through `JellyfinClient.request()` so it picks up logging + timeout?
3. **Error-visibility review** before merge — is every failure path either logged at `error` level or visible in the UI?
4. **Deployment review** after any container change — does runtime config still propagate without rebuilds?
5. **Completion audit** before a release tag — every Definition-of-Done bullet in `PROJECT_GOALS_ROADMAP.md` should map to evidence in this file.
