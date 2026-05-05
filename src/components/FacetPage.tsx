import { useEffect, useMemo, useRef, useState } from "react";
import {
  type JellyfinClient,
  type JellyfinItem,
  DEFAULT_LIBRARY_PAGE_SIZE,
} from "../jellyfin";
import { type MediaItem } from "../media";
import { type FacetKind, navigate } from "../router";
import { useRovingFocus } from "../hooks/useRovingFocus";
import { logger } from "../logger";
import PosterTile from "./PosterTile";
import SectionTitle from "./SectionTitle";

const log = logger.scope("facet-page");

/*
  Faceted library view rendered for /genre/{name} and /person/{id}. Same
  pagination + sort + infinite scroll behaviour as LibraryPage, but the
  query is faceted by either genre name or person id and the header carries
  facet-specific copy. Person facet additionally fetches and shows the
  person's photo + bio.
*/

type SortKey = "name" | "added" | "year";

const SORT_OPTIONS: { id: SortKey; label: string; sortBy: string; sortOrder: "Ascending" | "Descending" }[] = [
  { id: "name", label: "Name (A→Z)", sortBy: "SortName", sortOrder: "Ascending" },
  { id: "added", label: "Recently added", sortBy: "DateCreated", sortOrder: "Descending" },
  { id: "year", label: "Year (newest)", sortBy: "ProductionYear,SortName", sortOrder: "Descending" },
];

function FacetPage({
  facet,
  value,
  client,
  searchQuery,
  isConnected,
  mapItem,
  filterItems,
}: {
  facet: FacetKind;
  value: string;
  client: JellyfinClient | null;
  searchQuery: string;
  isConnected: boolean;
  mapItem: (item: JellyfinItem, client: JellyfinClient) => MediaItem;
  filterItems?: (items: MediaItem[]) => MediaItem[];
}) {
  const applyFilter = filterItems ?? ((items: MediaItem[]) => items);
  const [items, setItems] = useState<MediaItem[]>([]);
  const [total, setTotal] = useState(0);
  const [nextStartIndex, setNextStartIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [person, setPerson] = useState<MediaItem | null>(null);

  const reqIdRef = useRef(0);
  const rowRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  useRovingFocus(rowRef);

  const sort = useMemo(() => SORT_OPTIONS.find((s) => s.id === sortKey) ?? SORT_OPTIONS[0], [sortKey]);
  const hasMore = items.length < total;

  // Build the query params for whichever facet we're rendering.
  const facetParams = useMemo(
    () =>
      facet === "genre"
        ? { genres: [value] }
        : { personIds: [value] },
    [facet, value],
  );

  // Person facet: fetch the person's metadata once so we can show their
  // photo + bio above the grid. Genre needs no separate fetch.
  useEffect(() => {
    if (facet !== "person" || !client) {
      setPerson(null);
      return;
    }
    let cancelled = false;
    log.info("Fetching person", { id: value });
    void client
      .getPerson(value)
      .then((p) => {
        if (cancelled) return;
        setPerson(mapItem(p, client));
      })
      .catch((err) => {
        if (cancelled) return;
        log.error("Person fetch failed", err);
      });
    return () => {
      cancelled = true;
    };
  }, [facet, value, client, mapItem]);

  // Reset + fetch page 0 whenever the inputs that define the result set change.
  useEffect(() => {
    if (!client) {
      setItems([]);
      setTotal(0);
      setNextStartIndex(0);
      setError(null);
      return;
    }
    const reqId = ++reqIdRef.current;
    setIsLoading(true);
    setError(null);
    log.info("Loading facet page 0", { facet, value, sort: sort.id, search: searchQuery });

    void client
      .getLibraryItems({
        startIndex: 0,
        limit: DEFAULT_LIBRARY_PAGE_SIZE,
        searchTerm: searchQuery,
        sortBy: sort.sortBy,
        sortOrder: sort.sortOrder,
        ...facetParams,
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
        log.error("Facet page 0 failed", err);
        setError(msg);
        setIsLoading(false);
      });
  }, [client, facetParams, sort.sortBy, sort.sortOrder, searchQuery, mapItem, sort.id, facet, value]);

  useEffect(() => {
    if (!isConnected || !client) return;
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
              searchTerm: searchQuery,
              sortBy: sort.sortBy,
              sortOrder: sort.sortOrder,
              ...facetParams,
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
              log.error("Facet next page failed", err);
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
    facetParams,
    hasMore,
    isLoading,
    isLoadingMore,
    nextStartIndex,
    searchQuery,
    sort.sortBy,
    sort.sortOrder,
    mapItem,
  ]);

  const title = facet === "genre" ? value : person?.title ?? "Person";
  const eyebrow = facet === "genre" ? "Browse by genre" : "Filmography";

  if (!isConnected) {
    return (
      <section className="library-page" aria-label={title}>
        <header className="library-page-header">
          <div>
            <span className="eyebrow">{eyebrow}</span>
            <h1>{title}</h1>
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
    <section className="library-page" aria-label={title}>
      <header className="library-page-header">
        <div>
          <span className="eyebrow">{eyebrow}</span>
          <h1>{title}</h1>
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

      {facet === "person" && person && (
        <div className="person-card glass-panel">
          <img className="person-photo" src={person.image} alt="" />
          <div className="person-copy">
            {person.description && person.description !== "Loaded from your Jellyfin server." ? (
              <p>{person.description}</p>
            ) : (
              <p className="settings-note">No biography on file for this person.</p>
            )}
            <button
              type="button"
              className="text-button"
              onClick={() => navigate("/")}
            >
              ← Home
            </button>
          </div>
        </div>
      )}

      <SectionTitle
        label={
          searchQuery
            ? `Search results: "${searchQuery}"`
            : facet === "genre"
              ? `Items tagged "${value}"`
              : `Filmography of ${title}`
        }
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
                : facet === "genre"
                  ? `No items tagged "${value}".`
                  : "No items featuring this person."}
          </strong>
          <p>{error ?? (searchQuery ? "Try a different term." : "Check the metadata in Jellyfin.")}</p>
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
        <p className="library-end-marker">End — {total.toLocaleString()} items.</p>
      )}
      {error && items.length > 0 && (
        <p className="library-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}

export default FacetPage;
