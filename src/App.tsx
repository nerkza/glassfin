import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { localPlaybackDevice, mapJellyfinItem, type DeviceTarget, type MediaItem } from "./media";
import {
  JellyfinClient,
  defaultConnection,
  DEFAULT_LIBRARY_PAGE_SIZE,
  type JellyfinConnection,
  type LibraryFilter,
} from "./jellyfin";
import { getRuntimeConfig } from "./runtimeConfig";
import { logger } from "./logger";
import { useHashRoute, navigate, goBack, navTabForRoute } from "./router";
import { getPrefs, subscribePrefs } from "./prefs";
import { getArrClients } from "./arr";

const log = logger.scope("app");

// Eager: shell + the home dashboard's primary surfaces. These render on
// every cold start so loading them lazily would just trade a tiny bundle
// win for a flash of empty layout.
import SideRail from "./components/SideRail";
import TopBar from "./components/TopBar";
import HeroSection from "./components/HeroSection";
import ContinueRail from "./components/ContinueRail";
import LibraryPanel from "./components/LibraryPanel";
import PosterRail from "./components/PosterRail";
import LiveLogDock from "./components/LiveLogDock";
import SyncDock from "./components/SyncDock";
import Onboarding, { type OnboardingSession } from "./components/Onboarding";

// Lazy: route-only or modal-only components. Splitting these keeps the
// main bundle lean — vidstack (the player engine) is the biggest single
// dependency in the app and only loads when the user clicks Play. The
// RequestPanel pulls in the *arr clients only when the user actually
// triggers a request. Settings pulls in the ColorWheel + plugin UI.
const PlayerOverlay = lazy(() => import("./components/PlayerOverlay"));
const RequestPanel = lazy(() => import("./components/RequestPanel"));
const ArtworkPanel = lazy(() => import("./components/ArtworkPanel"));
const SettingsPage = lazy(() => import("./components/SettingsPage"));
const DetailPage = lazy(() => import("./components/DetailPage"));
const LibraryPage = lazy(() => import("./components/LibraryPage"));
const FacetPage = lazy(() => import("./components/FacetPage"));

const savedSessionKey = "glassfin.session";
const onboardingCompleteKey = "glassfin.onboardingComplete";

type SavedSession = {
  serverUrl: string;
  accessToken: string;
  userId: string;
  username: string;
};

export default function App() {
  const runtimeConfig = getRuntimeConfig();
  const savedSession = readSavedSession();
  const [selectedItem, setSelectedItem] = useState<MediaItem | null>(null);
  const [selectedDevice, setSelectedDevice] = useState<DeviceTarget>(localPlaybackDevice);
  const [query, setQuery] = useState("");
  const [isPlayerOpen, setIsPlayerOpen] = useState(false);
  const [detailItem, setDetailItem] = useState<MediaItem | null>(null);
  const [artworkItemId, setArtworkItemId] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);

  // URL-driven routing: dashboard / library tab / item detail / settings.
  // Browser back/forward arrows move between these naturally, and refreshing
  // on a detail page restores it (with a server fetch via the sync effect
  // below).
  const route = useHashRoute();
  const activeNavTab = navTabForRoute(route);
  const showSettings = route.kind === "settings";
  const isLibraryRoute = route.kind === "library";
  const isFacetRoute = route.kind === "facet";

  // User-prefs subscription so SideRail updates immediately when toggles
  // flip in Settings → Display.
  const [prefs, setPrefsState] = useState(() => getPrefs());
  useEffect(() => subscribePrefs((next) => setPrefsState(next)), []);

  // Items belonging to a hidden library are stripped after fetch. We do this
  // client-side because Jellyfin's /Items endpoint takes one ParentId, not a
  // visibility list — issuing N parallel scoped queries would break pagination
  // semantics and the perf is negligible at typical home-library sizes.
  // ParentId on the item is the immediate parent (folder/season/library);
  // top-level items in a library carry the library id directly, which is the
  // common case the toggle is meant to handle.
  const hiddenLibrarySet = useMemo(
    () => new Set(prefs.hiddenLibraryIds),
    [prefs.hiddenLibraryIds],
  );
  const filterByLibrary = useCallback(
    (items: MediaItem[]) =>
      hiddenLibrarySet.size === 0
        ? items
        : items.filter((item) => !item.parentId || !hiddenLibrarySet.has(item.parentId)),
    [hiddenLibrarySet],
  );

  // *arr clients are derived once from runtime config; they're either
  // configured (URL + API key set) or null. Used to gate the "Request a
  // title" affordance in the search empty state.
  const arrClients = useMemo(() => getArrClients(), []);
  const arrConfigured = !!(arrClients.sonarr || arrClients.radarr);
  const [requestPanelQuery, setRequestPanelQuery] = useState<string | null>(null);
  const [connection, setConnection] = useState<JellyfinConnection>(
    savedSession
      ? {
          serverUrl: savedSession.serverUrl,
          accessToken: savedSession.accessToken,
          userId: savedSession.userId,
          username: savedSession.username,
        }
      : {
          serverUrl: defaultConnection.serverUrl,
          apiKey: defaultConnection.apiKey || undefined,
          userId: defaultConnection.userId || undefined,
          username: "",
          password: "",
        },
  );
  const [connectionStatus, setConnectionStatus] = useState(
    savedSession ? "Restoring session..." : "Not connected",
  );
  // First-run onboarding: shown when there's no saved session AND the user
  // hasn't completed (or skipped) onboarding before. The flag persists in
  // localStorage so we don't nag returning users.
  const [needsOnboarding, setNeedsOnboarding] = useState<boolean>(() => {
    if (savedSession) return false;
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(onboardingCompleteKey) !== "true";
  });
  const [library, setLibrary] = useState<{
    items: MediaItem[];
    total: number;
    nextStartIndex: number;
    isLoading: boolean;
    isLoadingMore: boolean;
    error: string | null;
  }>({ items: [], total: 0, nextStartIndex: 0, isLoading: false, isLoadingMore: false, error: null });
  const [libraryFilter, setLibraryFilter] = useState<LibraryFilter>("all");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  // Used to discard stale responses when the user types fast or flips filters
  // mid-flight. Each fetch increments this; only the latest may write to state.
  const libraryReqId = useRef(0);
  const [resumeItems, setResumeItems] = useState<MediaItem[]>([]);
  const [isResumeLoading, setIsResumeLoading] = useState(false);
  const [recentlyAdded, setRecentlyAdded] = useState<MediaItem[]>([]);
  const [favorites, setFavorites] = useState<MediaItem[]>([]);
  const [recommended, setRecommended] = useState<MediaItem[]>([]);
  const [collections, setCollections] = useState<MediaItem[]>([]);
  const [isHomeRailsLoading, setIsHomeRailsLoading] = useState(false);
  const [activeClient, setActiveClient] = useState<JellyfinClient | null>(null);
  const [syncStatus, setSyncStatus] = useState<{
    active: boolean;
    loaded: number;
    total: number;
    elapsedMs: number;
  }>({ active: false, loaded: 0, total: 0, elapsedMs: 0 });

  const remoteMode = runtimeConfig.remoteAccessMode ?? "lan";
  const remoteModeLabel =
    remoteMode === "cloudflare" ? "Cloudflare Tunnel" : remoteMode === "tailscale" ? "Tailscale" : "LAN";

  const hasMoreLibrary = library.items.length < library.total;

  async function connectToJellyfin() {
    if (!connection.username) {
      setConnectionStatus("Enter a username to sign in.");
      return;
    }

    log.info("Sign-in started", { server: connection.serverUrl, username: connection.username });
    setIsConnecting(true);
    setConnectionStatus("Signing in...");

    try {
      const authClient = new JellyfinClient(connection);
      const authResult = await authClient.authenticateByName(
        connection.username,
        connection.password ?? "",
      );
      log.info("Authentication ok", { userId: authResult.User.Id, name: authResult.User.Name });

      const authenticated: JellyfinConnection = {
        serverUrl: connection.serverUrl,
        accessToken: authResult.AccessToken,
        userId: authResult.User.Id,
        username: authResult.User.Name,
      };

      setConnection(authenticated);

      const session: SavedSession = {
        serverUrl: authenticated.serverUrl,
        accessToken: authResult.AccessToken,
        userId: authResult.User.Id,
        username: authResult.User.Name,
      };
      window.localStorage.setItem(savedSessionKey, JSON.stringify(session));

      setConnectionStatus(`Authenticated as ${authResult.User.Name}. Loading library...`);

      const client = new JellyfinClient(authenticated);
      setActiveClient(client);
      await loadLibraryAndResume(client, authResult.User.Name);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Connection failed";
      log.error("Sign-in failed", error);

      if (msg.includes("Failed to fetch") || msg.includes("NetworkError") || msg.includes("fetch")) {
        setConnectionStatus(
          `Connection refused: Could not reach ${connection.serverUrl}. ` +
          "Make sure the server is running and accessible from this browser. " +
          "If using a different hostname, CORS must be enabled on Jellyfin.",
        );
      } else {
        setConnectionStatus(msg);
      }
    } finally {
      setIsConnecting(false);
    }
  }

  async function loadLibraryPage(
    client: JellyfinClient,
    opts: {
      append: boolean;
      startIndex: number;
      filter?: LibraryFilter;
      searchTerm?: string;
    },
  ): Promise<{ ok: boolean; loaded: number; total: number; error?: string }> {
    const filter = opts.filter ?? libraryFilter;
    const searchTerm = opts.searchTerm ?? debouncedQuery;
    const reqId = ++libraryReqId.current;

    setLibrary((prev) => ({
      ...prev,
      isLoading: !opts.append,
      isLoadingMore: opts.append,
      error: null,
    }));

    try {
      const page = await client.getLibraryItems({
        startIndex: opts.startIndex,
        limit: DEFAULT_LIBRARY_PAGE_SIZE,
        filter,
        searchTerm,
      });

      // Stale response — a newer request has been issued. Drop this one.
      if (reqId !== libraryReqId.current) {
        return { ok: false, loaded: 0, total: 0, error: "stale" };
      }

      const mapped = page.items.map((item) => mapJellyfinItem(item, client));
      setLibrary((prev) => {
        const items = opts.append ? [...prev.items, ...mapped] : mapped;
        return {
          items,
          total: page.total,
          nextStartIndex: opts.startIndex + page.items.length,
          isLoading: false,
          isLoadingMore: false,
          error: null,
        };
      });

      // Seed the hero only when there's no current selection (don't override
      // an existing one as the user pages or re-filters).
      if (!opts.append && mapped.length > 0) {
        setSelectedItem((current) => current ?? mapped[0]);
      }

      return { ok: true, loaded: mapped.length, total: page.total };
    } catch (error) {
      if (reqId !== libraryReqId.current) {
        return { ok: false, loaded: 0, total: 0, error: "stale" };
      }
      const msg = error instanceof Error ? error.message : "Library fetch failed";
      log.error("Library page load failed", error);
      setLibrary((prev) => ({
        ...prev,
        isLoading: false,
        isLoadingMore: false,
        error: msg,
      }));
      return { ok: false, loaded: 0, total: 0, error: msg };
    }
  }

  async function loadMoreLibrary() {
    if (!activeClient) return;
    if (library.isLoadingMore || library.isLoading) return;
    if (library.items.length >= library.total) return;
    await loadLibraryPage(activeClient, {
      append: true,
      startIndex: library.nextStartIndex,
    });
  }

  async function reloadFavorites(client: JellyfinClient) {
    try {
      const favs = await client.getFavoriteItems({ limit: 30 });
      setFavorites(favs.map((item) => mapJellyfinItem(item, client)));
    } catch (error) {
      log.error("Favorites reload failed", error);
    }
  }

  async function loadLibraryAndResume(client: JellyfinClient, displayName: string) {
    log.info("Loading library + resume + home rails", { user: displayName });
    const startedAt = performance.now();
    setIsResumeLoading(true);
    setIsHomeRailsLoading(true);
    setSyncStatus({ active: true, loaded: 0, total: 0, elapsedMs: 0 });

    // Tick the elapsed counter while requests are in flight so the chip
    // doesn't look frozen on slow servers.
    const tickInterval = window.setInterval(() => {
      setSyncStatus((current) =>
        current.active
          ? { ...current, elapsedMs: Math.round(performance.now() - startedAt) }
          : current,
      );
    }, 200);

    try {
      const [
        libraryResult,
        resumeResult,
        latestResult,
        favoritesResult,
        recommendedResult,
        collectionsResult,
      ] = await Promise.allSettled([
        loadLibraryPage(client, { append: false, startIndex: 0 }),
        client.getResumeItems(),
        client.getLatestItems({ limit: 20 }),
        client.getFavoriteItems({ limit: 30 }),
        client.getRecommendedItems({ limit: 20 }),
        client.getCollections({ limit: 30 }),
      ]);

      // We map → filter (by hidden libraries) → set state for each rail.
      // The filter is a no-op when no libraries are hidden.
      if (latestResult.status === "fulfilled") {
        setRecentlyAdded(latestResult.value.map((item) => mapJellyfinItem(item, client)));
      } else {
        log.error("Latest items fetch failed", latestResult.reason);
        setRecentlyAdded([]);
      }
      if (favoritesResult.status === "fulfilled") {
        setFavorites(favoritesResult.value.map((item) => mapJellyfinItem(item, client)));
      } else {
        log.error("Favorites fetch failed", favoritesResult.reason);
        setFavorites([]);
      }
      if (recommendedResult.status === "fulfilled") {
        setRecommended(recommendedResult.value.map((item) => mapJellyfinItem(item, client)));
      } else {
        log.error("Recommended fetch failed", recommendedResult.reason);
        setRecommended([]);
      }
      if (collectionsResult.status === "fulfilled") {
        setCollections(collectionsResult.value.map((item) => mapJellyfinItem(item, client)));
      } else {
        log.error("Collections fetch failed", collectionsResult.reason);
        setCollections([]);
      }
      // The filterByLibrary closure is captured in the JSX render so we don't
      // need to apply it here too — the rails read the raw arrays and the
      // render filters them through filterByLibrary at consume time. That's
      // important: when the user toggles a library on/off in Settings, the
      // home rails need to refilter immediately, without re-fetching.
      setIsHomeRailsLoading(false);

      const resumeRaw = resumeResult.status === "fulfilled" ? resumeResult.value : [];
      const libraryOutcome =
        libraryResult.status === "fulfilled"
          ? libraryResult.value
          : { ok: false as const, loaded: 0, total: 0, error: "Library fetch failed" };

      if (libraryResult.status === "rejected") {
        log.error("Library fetch failed", libraryResult.reason);
      }
      if (resumeResult.status === "rejected") {
        log.error("Resume fetch failed", resumeResult.reason);
      }

      const mappedResume = resumeRaw.slice(0, 8).map((item) => mapJellyfinItem(item, client));
      setResumeItems(mappedResume);
      setSelectedItem((current) => current ?? mappedResume[0] ?? null);

      // Surface partial success / total failure in the visible status string
      // so the user isn't stuck staring at "Loading library...".
      const libraryOk = libraryOutcome.ok;
      const resumeOk = resumeResult.status === "fulfilled";

      if (!libraryOk && !resumeOk) {
        const reason =
          libraryResult.status === "rejected"
            ? libraryResult.reason instanceof Error
              ? libraryResult.reason.message
              : "Unknown error"
            : libraryOutcome.error ?? "Unknown error";
        setConnectionStatus(
          `Authenticated as ${displayName}, but library/resume fetch failed. ${reason} See Settings → Logs.`,
        );
      } else if (!libraryOk) {
        const reason = libraryOutcome.error ?? "Unknown error";
        setConnectionStatus(
          `Connected as ${displayName} · ${mappedResume.length} resuming · library failed: ${reason}`,
        );
      } else if (!resumeOk) {
        setConnectionStatus(
          `Connected as ${displayName} · ${libraryOutcome.loaded} of ${libraryOutcome.total} items · resume rail unavailable`,
        );
      } else {
        setConnectionStatus(
          `Connected as ${displayName} · ${libraryOutcome.loaded} of ${libraryOutcome.total} items · ${mappedResume.length} resuming`,
        );
      }

      const elapsedMs = Math.round(performance.now() - startedAt);
      log.info("Library load complete", {
        library: libraryOutcome.loaded,
        libraryTotal: libraryOutcome.total,
        resume: mappedResume.length,
        elapsedMs,
      });
      setSyncStatus({
        active: false,
        loaded: libraryOutcome.loaded,
        total: libraryOutcome.total,
        elapsedMs,
      });
    } finally {
      window.clearInterval(tickInterval);
      setIsResumeLoading(false);
    }
  }

  // Debounce the search box: 300ms after the last keystroke, push the term
  // through to the server. Empty string clears immediately.
  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setDebouncedQuery("");
      return;
    }
    const id = window.setTimeout(() => setDebouncedQuery(trimmed), 300);
    return () => window.clearTimeout(id);
  }, [query]);

  // When the filter or debounced search changes (and we're connected), reset
  // pagination and reload page 0. Skipped on the very first render — the
  // mount/connect path handles that.
  const hasInitializedRef = useRef(false);
  useEffect(() => {
    if (!activeClient) return;
    if (!hasInitializedRef.current) {
      hasInitializedRef.current = true;
      return;
    }
    void loadLibraryPage(activeClient, {
      append: false,
      startIndex: 0,
      filter: libraryFilter,
      searchTerm: debouncedQuery,
    });
    // loadLibraryPage is stable enough for this purpose; including it would
    // require useCallback gymnastics that don't add safety here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeClient, libraryFilter, debouncedQuery]);

  // Sync the detail page from the URL. Three paths:
  //   - route is not /item/...    → clear detailItem
  //   - cache hit (from rail/grid) → use it (instant, no network)
  //   - cache miss + activeClient → fetch via getItemDetail (refresh / deep link)
  // Cache miss without an activeClient (yet) is fine — we'll re-run when the
  // client comes online and pick up from there.
  useEffect(() => {
    if (route.kind !== "item") {
      setDetailItem(null);
      return;
    }
    const cached =
      library.items.find((i) => i.jellyfinId === route.id) ??
      resumeItems.find((i) => i.jellyfinId === route.id) ??
      recentlyAdded.find((i) => i.jellyfinId === route.id) ??
      favorites.find((i) => i.jellyfinId === route.id) ??
      recommended.find((i) => i.jellyfinId === route.id) ??
      collections.find((i) => i.jellyfinId === route.id) ??
      (selectedItem?.jellyfinId === route.id ? selectedItem : undefined);
    if (cached) {
      setDetailItem(cached);
      return;
    }
    if (!activeClient) return;

    let cancelled = false;
    log.info("Fetching detail item from URL", { itemId: route.id });
    void activeClient
      .getItemDetail(route.id)
      .then((jItem) => {
        if (cancelled) return;
        setDetailItem(mapJellyfinItem(jItem, activeClient));
      })
      .catch((error) => {
        if (cancelled) return;
        log.error("Failed to load item from URL — returning to dashboard", error);
        navigate("/");
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route, activeClient, library.items, resumeItems, recentlyAdded, favorites, recommended, collections]);

  async function handleToggleFavorite(item: MediaItem) {
    if (!activeClient || !item.jellyfinId) return;
    const next = !item.isFavorite;
    // Optimistic flip on the detail item so the heart updates instantly.
    setDetailItem((current) => (current && current.id === item.id ? { ...current, isFavorite: next } : current));
    try {
      await activeClient.setFavorite(item.jellyfinId, next);
      // Refetch the rail so it reflects the new state. Cheap call (~30 items).
      void reloadFavorites(activeClient);
    } catch (error) {
      log.error("Favorite toggle failed; reverting", error);
      setDetailItem((current) => (current && current.id === item.id ? { ...current, isFavorite: !next } : current));
    }
  }

  useEffect(() => {
    if (!savedSession) return;
    const client = new JellyfinClient({
      serverUrl: savedSession.serverUrl,
      accessToken: savedSession.accessToken,
      userId: savedSession.userId,
      username: savedSession.username,
    });
    setActiveClient(client);
    void loadLibraryAndResume(client, savedSession.username).catch((error) => {
      const msg = error instanceof Error ? error.message : "Could not restore session";
      setConnectionStatus(msg);
    });
    // Only run on mount; savedSession is read once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleConnectionChange = (next: JellyfinConnection) => {
    setConnection(next);
    setLibrary({ items: [], total: 0, nextStartIndex: 0, isLoading: false, isLoadingMore: false, error: null });
    setResumeItems([]);
    setActiveClient(null);
    setSelectedItem(null);
    setConnectionStatus("Not connected");
    // Re-arm the init flag so the next sign-in's loadLibraryAndResume gets to
    // run without the filter/search effect double-firing.
    hasInitializedRef.current = false;
    window.localStorage.removeItem(savedSessionKey);
  };

  function handleOnboardingComplete(session: OnboardingSession) {
    log.info("Onboarding complete — handing off to dashboard", { user: session.username });
    window.localStorage.setItem(savedSessionKey, JSON.stringify(session));
    window.localStorage.setItem(onboardingCompleteKey, "true");

    const authenticated: JellyfinConnection = {
      serverUrl: session.serverUrl,
      accessToken: session.accessToken,
      userId: session.userId,
      username: session.username,
    };
    setConnection(authenticated);
    setConnectionStatus(`Authenticated as ${session.username}. Loading library...`);

    const client = new JellyfinClient(authenticated);
    setActiveClient(client);
    setNeedsOnboarding(false);
    void loadLibraryAndResume(client, session.username);
  }

  function handleOnboardingSkip() {
    log.info("Onboarding skipped");
    window.localStorage.setItem(onboardingCompleteKey, "true");
    setNeedsOnboarding(false);
  }

  function handleResetOnboarding() {
    log.info("Onboarding reset requested");
    window.localStorage.removeItem(onboardingCompleteKey);
    window.localStorage.removeItem(savedSessionKey);
    // Clear in-memory state so the dashboard can't keep showing stale data
    // behind the onboarding overlay if the user returns mid-flow.
    setLibrary({ items: [], total: 0, nextStartIndex: 0, isLoading: false, isLoadingMore: false, error: null });
    setResumeItems([]);
    setActiveClient(null);
    setSelectedItem(null);
    setConnection({
      serverUrl: defaultConnection.serverUrl,
      apiKey: defaultConnection.apiKey || undefined,
      userId: defaultConnection.userId || undefined,
      username: "",
      password: "",
    });
    setConnectionStatus("Not connected");
    hasInitializedRef.current = false;
    navigate("/");
    setNeedsOnboarding(true);
  }

  if (needsOnboarding) {
    return (
      <main className="app-shell onboarding-shell">
        <div className="ambient ambient-a" />
        <div className="ambient ambient-b" />
        <Onboarding
          initialServerUrl={connection.serverUrl}
          onComplete={handleOnboardingComplete}
          onSkip={handleOnboardingSkip}
        />
        <LiveLogDock />
      </main>
    );
  }

  if (showSettings) {
    return (
      <main className="app-shell">
        <div className="ambient ambient-a" />
        <div className="ambient ambient-b" />
        <SideRail
          activeTab="settings"
          hiddenTabs={prefs.hiddenLibraryTabs}
          onSettings={() => {}}
        />
        <Suspense fallback={<div className="settings-page" aria-busy="true" />}>
          <SettingsPage
            connection={connection}
            connectionStatus={connectionStatus}
            remoteModeLabel={remoteModeLabel}
            publicAppUrl={runtimeConfig.publicAppUrl}
            isConnecting={isConnecting}
            client={activeClient}
            onConnectionChange={handleConnectionChange}
            onConnect={connectToJellyfin}
            selectedDevice={selectedDevice}
            onSelectDevice={setSelectedDevice}
            onBack={() => goBack()}
            onResetOnboarding={handleResetOnboarding}
          />
        </Suspense>
        <SyncDock state={syncStatus} />
        <LiveLogDock />
      </main>
    );
  }

  if (isLibraryRoute && route.kind === "library") {
    const tab = route.tab;
    return (
      <main className="app-shell">
        <div className="ambient ambient-a" />
        <div className="ambient ambient-b" />
        <SideRail
          activeTab={activeNavTab}
          hiddenTabs={prefs.hiddenLibraryTabs}
          onSettings={() => navigate("/settings")}
        />
        <section className="content-shell">
          <TopBar
            query={query}
            onQueryChange={setQuery}
            isConnected={!!(connection.accessToken && connection.userId)}
            username={connection.username}
            onProfile={() => navigate("/settings")}
          />
          <Suspense fallback={<div className="library-page" aria-busy="true" />}>
            <LibraryPage
              tab={tab}
              client={activeClient}
              searchQuery={debouncedQuery}
              isConnected={!!(connection.accessToken && connection.userId)}
              mapItem={mapJellyfinItem}
              filterItems={filterByLibrary}
              canRequest={arrConfigured}
              onPlay={(item) => setSelectedItem(item)}
              onRequestMissing={(term) => setRequestPanelQuery(term)}
            />
          </Suspense>
        </section>
        <AnimatePresence>
          {isPlayerOpen && selectedItem && (
            <PlayerOverlay
              device={selectedDevice}
              item={selectedItem}
              client={activeClient}
              onClose={() => setIsPlayerOpen(false)}
            />
          )}
        </AnimatePresence>
        <SyncDock state={syncStatus} />
        <LiveLogDock />
      </main>
    );
  }

  if (isFacetRoute && route.kind === "facet") {
    return (
      <main className="app-shell">
        <div className="ambient ambient-a" />
        <div className="ambient ambient-b" />
        <SideRail
          activeTab={activeNavTab}
          hiddenTabs={prefs.hiddenLibraryTabs}
          onSettings={() => navigate("/settings")}
        />
        <section className="content-shell">
          <TopBar
            query={query}
            onQueryChange={setQuery}
            isConnected={!!(connection.accessToken && connection.userId)}
            username={connection.username}
            onProfile={() => navigate("/settings")}
          />
          <Suspense fallback={<div className="library-page" aria-busy="true" />}>
            <FacetPage
              facet={route.facet}
              value={route.value}
              client={activeClient}
              searchQuery={debouncedQuery}
              isConnected={!!(connection.accessToken && connection.userId)}
              mapItem={mapJellyfinItem}
              filterItems={filterByLibrary}
            />
          </Suspense>
        </section>
        <SyncDock state={syncStatus} />
        <LiveLogDock />
      </main>
    );
  }

  return (
    <main className="app-shell">
      <div className="ambient ambient-a" />
      <div className="ambient ambient-b" />
      <SideRail
        activeTab={activeNavTab}
        hiddenTabs={prefs.hiddenLibraryTabs}
        onSettings={() => navigate("/settings")}
      />
      <section className="content-shell">
        <TopBar
          query={query}
          onQueryChange={setQuery}
          isConnected={!!(connection.accessToken && connection.userId)}
          username={connection.username}
          onProfile={() => navigate("/settings")}
        />
        {detailItem ? (
          <Suspense fallback={<div className="detail-page" aria-busy="true" />}>
            <DetailPage
              // Re-mount when the item changes so the entry animation replays
              // and effects (scroll-to-top, ESC handler) reset cleanly.
              key={detailItem.id}
              item={detailItem}
              client={activeClient}
              onPlay={() => { setSelectedItem(detailItem); setIsPlayerOpen(true); }}
              onBack={() => goBack()}
              onEditArtwork={
                activeClient && detailItem.jellyfinId
                  ? () => setArtworkItemId(detailItem.jellyfinId!)
                  : undefined
              }
              onToggleFavorite={() => handleToggleFavorite(detailItem)}
              onPlayChild={(child) => {
                setSelectedItem(child);
                setIsPlayerOpen(true);
              }}
            />
          </Suspense>
        ) : (
          <>
            <HeroSection
              // Carousel pool: resume rail first (the user's already-started
              // items rank high), then library page. The component picks 5
              // at random and rotates them.
              candidates={filterByLibrary([...resumeItems, ...library.items])}
              selectedDevice={selectedDevice}
              isConnected={!!(connection.accessToken && connection.userId)}
              onPlay={(item) => { setSelectedItem(item); setIsPlayerOpen(true); }}
              onSelect={(item) => {
                setSelectedItem(item);
                if (item.jellyfinId) navigate(`/item/${item.jellyfinId}`);
              }}
              onOpenSettings={() => navigate("/settings")}
            />
            <ContinueRail
              items={filterByLibrary(resumeItems)}
              isLoading={isResumeLoading && resumeItems.length === 0}
              isConnected={!!(connection.accessToken && connection.userId)}
              onPlay={(item) => { setSelectedItem(item); setIsPlayerOpen(true); }}
              onSelect={(item) => {
                setSelectedItem(item);
                if (item.jellyfinId) navigate(`/item/${item.jellyfinId}`);
              }}
            />
            <PosterRail
              label="Recently added"
              items={filterByLibrary(recentlyAdded)}
              isLoading={isHomeRailsLoading && recentlyAdded.length === 0}
              isConnected={!!(connection.accessToken && connection.userId)}
              onSelect={(item) => {
                setSelectedItem(item);
                if (item.jellyfinId) navigate(`/item/${item.jellyfinId}`);
              }}
            />
            <PosterRail
              label="Recommended for you"
              items={filterByLibrary(recommended)}
              isLoading={isHomeRailsLoading && recommended.length === 0}
              isConnected={!!(connection.accessToken && connection.userId)}
              onSelect={(item) => {
                setSelectedItem(item);
                if (item.jellyfinId) navigate(`/item/${item.jellyfinId}`);
              }}
            />
            <PosterRail
              label="Favorites"
              items={filterByLibrary(favorites)}
              isLoading={isHomeRailsLoading && favorites.length === 0}
              isConnected={!!(connection.accessToken && connection.userId)}
              onSelect={(item) => {
                setSelectedItem(item);
                if (item.jellyfinId) navigate(`/item/${item.jellyfinId}`);
              }}
            />
            <PosterRail
              label="Collections"
              items={filterByLibrary(collections)}
              isLoading={isHomeRailsLoading && collections.length === 0}
              isConnected={!!(connection.accessToken && connection.userId)}
              onSelect={(item) => {
                setSelectedItem(item);
                if (item.jellyfinId) navigate(`/item/${item.jellyfinId}`);
              }}
            />
            <LibraryPanel
              items={filterByLibrary(library.items)}
              total={library.total}
              sectionLabel={debouncedQuery ? `Search results: "${debouncedQuery}"` : "Jellyfin library"}
              isConnected={!!(connection.accessToken && connection.userId)}
              isLoading={library.isLoading}
              isLoadingMore={library.isLoadingMore}
              hasMore={hasMoreLibrary}
              error={library.error}
              filter={libraryFilter}
              searchQuery={debouncedQuery}
              canRequest={arrConfigured}
              onFilterChange={setLibraryFilter}
              onLoadMore={loadMoreLibrary}
              onSelect={(item) => {
                setSelectedItem(item);
                if (item.jellyfinId) navigate(`/item/${item.jellyfinId}`);
              }}
              onRequestMissing={(term) => setRequestPanelQuery(term)}
            />
          </>
        )}
      </section>
      {/* Lazy-loaded modals: each is wrapped in its own Suspense so a slow
          chunk for one doesn't block the others. fallback={null} is correct
          here — a brief invisible delay between click and modal render is
          imperceptible vs. the network fetch the modal itself will trigger. */}
      <AnimatePresence>
        {artworkItemId && activeClient && (
          <Suspense fallback={null}>
            <ArtworkPanel
              client={activeClient}
              itemId={artworkItemId}
              onClose={() => setArtworkItemId(null)}
              onSaved={() => {
                if (activeClient && connection.username) {
                  void loadLibraryAndResume(activeClient, connection.username);
                }
              }}
            />
          </Suspense>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {isPlayerOpen && selectedItem && (
          <Suspense fallback={null}>
            <PlayerOverlay
              device={selectedDevice}
              item={selectedItem}
              client={activeClient}
              onClose={() => setIsPlayerOpen(false)}
            />
          </Suspense>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {requestPanelQuery !== null && (
          <Suspense fallback={null}>
            <RequestPanel
              query={requestPanelQuery}
              sonarr={arrClients.sonarr}
              radarr={arrClients.radarr}
              onClose={() => setRequestPanelQuery(null)}
            />
          </Suspense>
        )}
      </AnimatePresence>
      <SyncDock state={syncStatus} />
      <LiveLogDock />
    </main>
  );
}

function readSavedSession(): SavedSession | null {
  try {
    const raw = window.localStorage.getItem(savedSessionKey);
    return raw ? (JSON.parse(raw) as SavedSession) : null;
  } catch {
    return null;
  }
}

