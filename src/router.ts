import { useEffect, useState } from "react";

/*
  Tiny hash-based router for Glassfin.

  Hash routing (vs the History API) was deliberate: Glassfin ships as a static
  PWA that has to work over file://, behind reverse proxies, and on hosts where
  rewriting unknown paths to index.html isn't guaranteed (Unraid templates,
  Cloudflare Pages bare buckets, GitHub Pages, etc.). The "#/foo" prefix never
  hits the server, so refresh/deep-link works everywhere without config.

  Routes:
    /              dashboard (Home)
    /movies        Movies library (type-locked)
    /shows         Shows library (type-locked)
    /music         Music library (type-locked)
    /live          Live TV (placeholder — not yet wired to Jellyfin Live TV)
    /genre/{name}  faceted library — items tagged with this genre
    /person/{id}   faceted library — items featuring this person
    /item/{id}     item detail page (id = Jellyfin item id)
    /profiles      profile picker (switch / sign out)
    /settings      settings

  We don't pull in react-router — the surface is small and this module stays
  lean. If routing grows beyond a handful of cases, swap this out for a real
  router; the existing call sites are designed to map cleanly.
*/

export type LibraryTab = "movies" | "shows" | "music" | "live";

export type FacetKind = "genre" | "person";

export type Route =
  | { kind: "dashboard" }
  | { kind: "library"; tab: LibraryTab }
  | { kind: "facet"; facet: FacetKind; value: string }
  | { kind: "item"; id: string }
  | { kind: "profiles" }
  | { kind: "settings" };

const LIBRARY_TABS: readonly LibraryTab[] = ["movies", "shows", "music", "live"];

export function parseHash(hash: string): Route {
  // Strip a leading "#" then optional "/" so "#/foo", "#foo", "/foo", "foo"
  // all parse identically. Empty hash → dashboard.
  const trimmed = hash.replace(/^#/, "");
  if (!trimmed || trimmed === "/") return { kind: "dashboard" };

  if (trimmed.startsWith("/item/")) {
    const id = trimmed.slice("/item/".length);
    if (id) return { kind: "item", id };
  }
  if (trimmed.startsWith("/genre/")) {
    const value = decodeURIComponent(trimmed.slice("/genre/".length));
    if (value) return { kind: "facet", facet: "genre", value };
  }
  if (trimmed.startsWith("/person/")) {
    const value = decodeURIComponent(trimmed.slice("/person/".length));
    if (value) return { kind: "facet", facet: "person", value };
  }
  if (trimmed === "/profiles") return { kind: "profiles" };
  if (trimmed === "/settings") return { kind: "settings" };

  for (const tab of LIBRARY_TABS) {
    if (trimmed === `/${tab}`) return { kind: "library", tab };
  }

  // Unknown route → dashboard. (Could surface a "not found" page later.)
  return { kind: "dashboard" };
}

export function routeToPath(route: Route): string {
  switch (route.kind) {
    case "dashboard":
      return "/";
    case "library":
      return `/${route.tab}`;
    case "facet":
      return `/${route.facet}/${encodeURIComponent(route.value)}`;
    case "item":
      return `/item/${route.id}`;
    case "profiles":
      return "/profiles";
    case "settings":
      return "/settings";
  }
}

/** Top-level navigation tabs as shown in the side rail. Order matters — it's
 *  the order they appear visually. Home is always rendered; the library tabs
 *  can be hidden via Settings → Display. */
export type NavTabId = "home" | LibraryTab | "settings";

export const NAV_TABS: { id: NavTabId; label: string; path: string; togglable: boolean }[] = [
  { id: "home", label: "Home", path: "/", togglable: false },
  { id: "movies", label: "Movies", path: "/movies", togglable: true },
  { id: "shows", label: "Shows", path: "/shows", togglable: true },
  { id: "music", label: "Music", path: "/music", togglable: true },
  { id: "live", label: "Live", path: "/live", togglable: true },
];

/** Maps the current parsed Route back to a NavTabId so the side rail can
 *  highlight the active tab. /item/{id} doesn't map to a top-level tab — we
 *  return null and the rail leaves nothing highlighted (matches the behavior
 *  before the rail was wired to routing). */
export function navTabForRoute(route: Route): NavTabId | null {
  if (route.kind === "dashboard") return "home";
  if (route.kind === "library") return route.tab;
  if (route.kind === "settings") return "settings";
  return null;
}

/** Tracks whether navigate() has fired this session. Used by goBack() to
 *  decide between native history.back() and a navigate('/') fallback so a
 *  user who entered the app on a deep link doesn't get punted out by Back. */
let hasNavigatedInSession = false;

export function navigate(path: string) {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  // Avoid pushing identical entries — fixes a feedback loop where setting the
  // hash to its current value would still fire hashchange in some browsers.
  if (window.location.hash === `#${normalized}`) return;
  hasNavigatedInSession = true;
  window.location.hash = normalized;
}

export function goBack(fallbackPath = "/") {
  if (hasNavigatedInSession) {
    window.history.back();
  } else {
    navigate(fallbackPath);
  }
}

/** React hook: returns the current parsed route, re-rendering on hashchange. */
export function useHashRoute(): Route {
  const [route, setRoute] = useState<Route>(() =>
    typeof window === "undefined" ? { kind: "dashboard" } : parseHash(window.location.hash),
  );

  useEffect(() => {
    const handler = () => setRoute(parseHash(window.location.hash));
    window.addEventListener("hashchange", handler);
    return () => window.removeEventListener("hashchange", handler);
  }, []);

  return route;
}
