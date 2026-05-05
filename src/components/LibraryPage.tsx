import { useEffect, useMemo, useRef, useState } from "react";
import { IconTvFill } from "symbols-react";
import {
  type JellyfinClient,
  type JellyfinItem,
  type LibraryFilter,
  DEFAULT_LIBRARY_PAGE_SIZE,
} from "../jellyfin";
import { type MediaItem } from "../media";
import { type LibraryTab, navigate } from "../router";
import { useRovingFocus } from "../hooks/useRovingFocus";
import { logger } from "../logger";
import PosterTile from "./PosterTile";
import SectionTitle from "./SectionTitle";

const log = logger.scope("library-page");

/*
  Self-contained library page rendered for /movies, /shows, /music, /live.
  Each page owns its own pagination state so flipping between tabs doesn't
  share-and-clobber the dashboard's library slice in App.tsx.

  Live is a placeholder for now — Jellyfin Live TV sits behind a separate
  API surface (channels, EPG, recordings) that deserves its own phase.
*/

type SortKey = "name" | "added" | "year";

const SORT_OPTIONS: { id: SortKey; label: string; sortBy: string; sortOrder: "Ascending" | "Descending" }[] = [
  { id: "name", label: "Name (A→Z)", sortBy: "SortName", sortOrder: "Ascending" },
  { id: "added", label: "Recently added", sortBy: "DateCreated", sortOrder: "Descending" },
  { id: "year", label: "Year (newest)", sortBy: "ProductionYear,SortName", sortOrder: "Descending" },
];

const TAB_CONFIG: Record<
  LibraryTab,
  { title: string; eyebrow: string; filter: LibraryFilter | null; emptyTitle: string; emptyBody: string }
> = {
  movies: {
    title: "Movies",
    eyebrow: "Films across your library",
    filter: "movies",
    emptyTitle: "No movies in your library yet.",
    emptyBody: "Add a Movies library in Jellyfin and run a scan, then refresh this page.",
  },
  shows: {
    title: "Shows",
    eyebrow: "Series and seasons",
    filter: "series",
    emptyTitle: "No shows in your library yet.",
    emptyBody: "Add a TV Shows library in Jellyfin and run a scan, then refresh this page.",
  },
  music: {
    title: "Music",
    eyebrow: "Albums and tracks",
    filter: "music",
    emptyTitle: "No music in your library yet.",
    emptyBody: "Add a Music library in Jellyfin and run a scan, then refresh this page.",
  },
  live: {
    title: "Live TV",
    eyebrow: "Channels and recordings",
    filter: null,
    emptyTitle: "Live TV isn't wired up yet.",
    emptyBody:
      "Jellyfin Live TV sits behind a separate API surface (channels, EPG, recordings). " +
      "It's on the roadmap — for now this tab is a placeholder.",
  },
};

function LibraryPage({
  tab,
  client,
  searchQuery,
  isConnected,
  mapItem,
  filterItems,
  canRequest,
  onPlay,
  onRequestMissing,
}: {
  tab: LibraryTab;
  client: JellyfinClient | null;
  searchQuery: string;
  isConnected: boolean;
  mapItem: (item: JellyfinItem, client: JellyfinClient) => MediaItem;
  /** Optional post-map filter (e.g., to hide items from libraries the user
   *  has hidden in Settings → Libraries). Identity by default. */
  filterItems?: (items: MediaItem[]) => MediaItem[];
  /** True when at least one *arr is configured — controls the request CTA
   *  in the empty-search state. */
  canRequest?: boolean;
  onPlay?: (item: MediaItem) => void;
  onRequestMissing?: (term: string) => void;
}) {
  const applyFilter = filterItems ?? ((items: MediaItem[]) => items);
  const config = TAB_CONFIG[tab];
  const [items, setItems] = useState<MediaItem[]>([]);
  const [total, setTotal] = useState(0);
  const [nextStartIndex, setNextStartIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("name");

  const reqIdRef = useRef(0);
  const rowRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  useRovingFocus(rowRef);

  const sort = useMemo(() => SORT_OPTIONS.find((s) => s.id === sortKey) ?? SORT_OPTIONS[0], [sortKey]);
  const hasMore = items.length < total;

  // Reset + fetch page 0 whenever the inputs that define the result set change.
  // Live tab never queries — its config.filter is null and we render a
  // placeholder body instead.
  useEffect(() => {
    if (!client || !config.filter) {
      setItems([]);
      setTotal(0);
      setNextStartIndex(0);
      setError(null);
      return;
    }
    const reqId = ++reqIdRef.current;
    setIsLoading(true);
    setError(null);
    log.info("Loading library page 0", { tab, sort: sort.id, search: searchQuery });

    void client
      .getLibraryItems({
        startIndex: 0,
        limit: DEFAULT_LIBRARY_PAGE_SIZE,
        filter: config.filter,
        searchTerm: searchQuery,
        sortBy: sort.sortBy,
        sortOrder: sort.sortOrder,
      })
      .then((page) => {
        if (reqId !== reqIdRef.current) return;
        const mapped = applyFilter(page.items.map((item) => mapItem(item, client)));
        setItems(mapped);
        setTotal(page.total);
        setNextStartIndex(page.items.length);
        setIsLoading(false);
      })
      .catch((err) => {
        if (reqId !== reqIdRef.current) return;
        const msg = err instanceof Error ? err.message : "Library fetch failed";
        log.error("Library page 0 failed", err);
        setError(msg);
        setIsLoading(false);
      });
  }, [client, config.filter, sort.sortBy, sort.sortOrder, searchQuery, mapItem, tab, sort.id]);

  // Infinite scroll: when the sentinel intersects, fetch the next page and
  // append. Same stale-response guard as the dashboard.
  useEffect(() => {
    if (!isConnected || !client || !config.filter) return;
    if (!hasMore || isLoading || isLoadingMore) return;
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const reqId = ++reqIdRef.current;
          setIsLoadingMore(true);
          void client
            .getLibraryItems({
              startIndex: nextStartIndex,
              limit: DEFAULT_LIBRARY_PAGE_SIZE,
              filter: config.filter!,
              searchTerm: searchQuery,
              sortBy: sort.sortBy,
              sortOrder: sort.sortOrder,
            })
            .then((page) => {
              if (reqId !== reqIdRef.current) return;
              const mapped = applyFilter(page.items.map((item) => mapItem(item, client)));
              setItems((prev) => [...prev, ...mapped]);
              setTotal(page.total);
              setNextStartIndex((prev) => prev + page.items.length);
              setIsLoadingMore(false);
            })
            .catch((err) => {
              if (reqId !== reqIdRef.current) return;
              log.error("Library next page failed", err);
              setIsLoadingMore(false);
            });
          break;
        }
      },
      { rootMargin: "400px 0px 400px 0px", threshold: 0 },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [
    isConnected,
    client,
    config.filter,
    hasMore,
    isLoading,
    isLoadingMore,
    nextStartIndex,
    searchQuery,
    sort.sortBy,
    sort.sortOrder,
    mapItem,
  ]);

  if (tab === "live") {
    return (
      <section className="library-page" aria-label="Live TV">
        <header className="library-page-header">
          <div>
            <span className="eyebrow">{config.eyebrow}</span>
            <h1>{config.title}</h1>
          </div>
        </header>
        <div className="empty-state library-page-placeholder">
          <IconTvFill width={28} height={28} />
          <strong>{config.emptyTitle}</strong>
          <p>{config.emptyBody}</p>
        </div>
      </section>
    );
  }

  if (!isConnected) {
    return (
      <section className="library-page" aria-label={config.title}>
        <header className="library-page-header">
          <div>
            <span className="eyebrow">{config.eyebrow}</span>
            <h1>{config.title}</h1>
          </div>
        </header>
        <div className="empty-state">
          <strong>Library is offline.</strong>
          <p>Sign in to your Jellyfin server in Settings → Connection.</p>
        </div>
      </section>
    );
  }

  const action =
    items.length === 0
      ? isLoading
        ? "Loading"
        : error
          ? "Error"
          : "Empty"
      : items.length < total
        ? `${items.length} of ${total.toLocaleString()}`
        : `${items.length} items`;

  return (
    <section className="library-page" aria-label={config.title}>
      <header className="library-page-header">
        <div>
          <span className="eyebrow">{config.eyebrow}</span>
          <h1>{config.title}</h1>
        </div>
        <label className="library-sort">
          <span>Sort</span>
          <select
            value={sortKey}
            onChange={(event) => setSortKey(event.target.value as SortKey)}
            aria-label="Sort library by"
          >
            {SORT_OPTIONS.map((opt) => (
              <option value={opt.id} key={opt.id}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
      </header>

      <SectionTitle
        label={searchQuery ? `Search results: "${searchQuery}"` : `${config.title} library`}
        action={action}
      />

      {isLoading && items.length === 0 && (
        <div className="poster-row" aria-hidden="true">
          {Array.from({ length: 12 }).map((_, i) => (
            <div className="skeleton-card" key={i} />
          ))}
        </div>
      )}

      {!isLoading && items.length === 0 && (
        <div className="empty-state">
          <strong>
            {error
              ? "Library failed to load."
              : searchQuery
                ? "No matches for that search."
                : config.emptyTitle}
          </strong>
          <p>{error ?? (searchQuery ? "Try a different term." : config.emptyBody)}</p>
          {!error && searchQuery && canRequest && onRequestMissing && (
            <button
              type="button"
              className="primary-button"
              onClick={() => onRequestMissing(searchQuery)}
              style={{ marginTop: 14 }}
            >
              Request "{searchQuery}" via Sonarr / Radarr
            </button>
          )}
        </div>
      )}

      {items.length > 0 && (
        <div className="poster-row" ref={rowRef} role="list">
          {items.map((item, index) => (
            <PosterTile
              item={item}
              index={index}
              key={item.id}
              onSelect={() => {
                if (item.jellyfinId) navigate(`/item/${item.jellyfinId}`);
                onPlay?.(item);
              }}
            />
          ))}
        </div>
      )}

      {hasMore && (
        <div className="library-sentinel" ref={sentinelRef} aria-hidden="true">
          {isLoadingMore ? <span className="library-loading-more">Loading more…</span> : null}
        </div>
      )}
      {!hasMore && items.length > 0 && total > 0 && (
        <p className="library-end-marker">End of {config.title.toLowerCase()} — {total.toLocaleString()} items.</p>
      )}
      {error && items.length > 0 && (
        <p className="library-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}

export default LibraryPage;
