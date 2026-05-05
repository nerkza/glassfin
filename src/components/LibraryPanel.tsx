import { useEffect, useRef } from "react";
import { type MediaItem } from "../media";
import { type LibraryFilter } from "../jellyfin";
import { useRovingFocus } from "../hooks/useRovingFocus";
import PosterTile from "./PosterTile";
import SectionTitle from "./SectionTitle";

const FILTER_OPTIONS: { value: LibraryFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "movies", label: "Movies" },
  { value: "series", label: "TV" },
  { value: "music", label: "Music" },
];

function LibraryPanel({
  items,
  total,
  sectionLabel,
  isConnected,
  isLoading,
  isLoadingMore,
  hasMore,
  error,
  filter,
  searchQuery,
  canRequest,
  onFilterChange,
  onLoadMore,
  onSelect,
  onRequestMissing,
}: {
  items: MediaItem[];
  total: number;
  sectionLabel: string;
  isConnected: boolean;
  isLoading: boolean;
  isLoadingMore: boolean;
  hasMore: boolean;
  error: string | null;
  filter: LibraryFilter;
  /** Current debounced search term (empty = no search). When the empty
   *  state appears mid-search, we offer the *arr request affordance. */
  searchQuery?: string;
  /** True when at least one *arr is configured. Gates the request CTA. */
  canRequest?: boolean;
  onFilterChange: (next: LibraryFilter) => void;
  onLoadMore: () => void;
  onSelect: (item: MediaItem) => void;
  onRequestMissing?: (term: string) => void;
}) {
  const rowRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  useRovingFocus(rowRef);

  // IntersectionObserver: when the sentinel scrolls into view, ask for more.
  // rootMargin pre-fetches before the user actually hits the end, so the grid
  // feels seamless rather than stuttering.
  useEffect(() => {
    if (!isConnected) return;
    if (!hasMore) return;
    if (isLoading || isLoadingMore) return;

    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            onLoadMore();
            break;
          }
        }
      },
      { rootMargin: "400px 0px 400px 0px", threshold: 0 },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [isConnected, hasMore, isLoading, isLoadingMore, onLoadMore]);

  const filterChips = (
    <div className="library-filters" role="tablist" aria-label="Library type">
      {FILTER_OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          role="tab"
          aria-selected={filter === option.value}
          className={`library-filter-chip${filter === option.value ? " is-active" : ""}`}
          onClick={() => {
            if (filter !== option.value) onFilterChange(option.value);
          }}
        >
          {option.label}
        </button>
      ))}
    </div>
  );

  if (!isConnected) {
    return (
      <section className="library-panel" aria-label={sectionLabel}>
        <SectionTitle label={sectionLabel} action="Offline" />
        {filterChips}
        <div className="empty-state">
          <strong>Library is offline.</strong>
          <p>Sign in to your Jellyfin server in Settings → Connection.</p>
        </div>
      </section>
    );
  }

  if (isLoading && items.length === 0) {
    return (
      <section className="library-panel" aria-label={sectionLabel}>
        <SectionTitle label={sectionLabel} action="Loading" />
        {filterChips}
        <div className="poster-row" aria-hidden="true">
          {Array.from({ length: 10 }).map((_, i) => (
            <div className="skeleton-card" key={i} />
          ))}
        </div>
      </section>
    );
  }

  if (items.length === 0) {
    const showRequestCta = !error && !!searchQuery && canRequest && onRequestMissing;
    return (
      <section className="library-panel" aria-label={sectionLabel}>
        <SectionTitle label={sectionLabel} action={error ? "Error" : "Empty"} />
        {filterChips}
        <div className="empty-state">
          <strong>{error ? "Library failed to load." : "No items match."}</strong>
          <p>
            {error
              ? error
              : "Try a different filter or search term. The server returned zero matches."}
          </p>
          {showRequestCta && (
            <button
              type="button"
              className="primary-button"
              onClick={() => onRequestMissing(searchQuery!)}
              style={{ marginTop: 14 }}
            >
              Request "{searchQuery}" via Sonarr / Radarr
            </button>
          )}
        </div>
      </section>
    );
  }

  const action =
    items.length < total ? `${items.length} of ${total.toLocaleString()}` : `${items.length} items`;

  return (
    <section className="library-panel" aria-label={sectionLabel}>
      <SectionTitle label={sectionLabel} action={action} />
      {filterChips}
      <div className="poster-row" ref={rowRef} role="list">
        {items.map((item, index) => (
          <PosterTile item={item} index={index} key={item.id} onSelect={() => onSelect(item)} />
        ))}
      </div>
      {hasMore && (
        <div className="library-sentinel" ref={sentinelRef} aria-hidden="true">
          {isLoadingMore ? <span className="library-loading-more">Loading more…</span> : null}
        </div>
      )}
      {!hasMore && items.length > 0 && total > 0 && (
        <p className="library-end-marker">End of library — {total.toLocaleString()} items.</p>
      )}
      {error && items.length > 0 && (
        <p className="library-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}

export default LibraryPanel;
