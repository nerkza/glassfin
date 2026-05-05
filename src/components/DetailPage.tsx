import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  IconArrowUpForward,
  IconChevronLeft,
  IconHeart,
  IconHeartFill,
  IconPhotoOnRectangle,
  IconPlayFill,
} from "symbols-react";
import { mapJellyfinItem, type MediaItem } from "../media";
import { type JellyfinClient } from "../jellyfin";
import { navigate } from "../router";
import { logger } from "../logger";

const log = logger.scope("detail-page");

/*
  Item detail page.

  Branches on item.kind:
    - movie / episode / music    play button + cast + provider links
    - series                     play button suppressed; renders a Seasons grid
    - season                     play button suppressed; renders an Episodes list

  All variants share the hero + meta block. Children (seasons / episodes) are
  fetched via JellyfinClient.getChildren when client is available.
*/
function DetailPage({
  item,
  client,
  onPlay,
  onBack,
  onEditArtwork,
  onToggleFavorite,
  onPlayChild,
}: {
  item: MediaItem;
  client: JellyfinClient | null;
  onPlay: () => void;
  onBack: () => void;
  onEditArtwork?: () => void;
  onToggleFavorite?: () => void;
  onPlayChild?: (child: MediaItem) => void;
}) {
  const isReal = !!item.jellyfinId;
  const isContainer = item.kind === "series" || item.kind === "season" || item.kind === "boxset";

  // Escape returns to the previous view. Same affordance the modal used to
  // have, and remote-friendly (most TV remotes map "Back" to Escape).
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onBack();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onBack]);

  // Scroll to top when a new item opens — otherwise users land mid-page if
  // they were halfway down the previous detail view.
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [item.id]);

  // Show-hierarchy eyebrow: Episode shows "Series · S2 · E5", Season shows
  // "Series · Season N", Series falls back to the raw eyebrow ("Series").
  const eyebrow = (() => {
    if (item.kind === "episode") {
      const parts: string[] = [];
      if (item.seriesName) parts.push(item.seriesName);
      if (typeof item.seasonNumber === "number") parts.push(`S${item.seasonNumber}`);
      if (typeof item.episodeNumber === "number") parts.push(`E${item.episodeNumber}`);
      return parts.length > 0 ? parts.join(" · ") : item.eyebrow;
    }
    if (item.kind === "season") {
      return item.seriesName ?? item.eyebrow;
    }
    return item.eyebrow;
  })();

  return (
    <motion.section
      className="detail-page"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 220, damping: 26 }}
      aria-label={item.title}
    >
      <div className="detail-page-topbar">
        <button className="back-button" onClick={onBack} type="button" aria-label="Back">
          <IconChevronLeft width={18} height={18} />
          Back
        </button>
      </div>

      <div className="detail-hero">
        <img src={item.image} alt="" />
        <div className="detail-hero-vignette" />
        <div className="detail-hero-copy">
          <span className="eyebrow">{eyebrow}</span>
          <h2>{item.title}</h2>
          {item.tagline && <p className="detail-tagline">{item.tagline}</p>}
          <div className="meta-row">
            <span>{item.year}</span>
            <span>{item.runtime}</span>
            {item.kind === "series" && typeof item.childCount === "number" && (
              <span>{item.childCount} season{item.childCount === 1 ? "" : "s"}</span>
            )}
            {item.kind === "season" && typeof item.childCount === "number" && (
              <span>{item.childCount} episode{item.childCount === 1 ? "" : "s"}</span>
            )}
            {item.officialRating && <span>{item.officialRating}</span>}
            {typeof item.communityRating === "number" && (
              <span title="Community rating (TMDB / OMDb)">★ {item.communityRating.toFixed(1)}</span>
            )}
            {typeof item.criticRating === "number" && (
              <span title="Critic rating (Rotten Tomatoes via OMDb)">🍅 {item.criticRating}%</span>
            )}
          </div>
        </div>
      </div>

      <div className="detail-body">
        <p>{item.description}</p>

        {(item.genres?.length ?? 0) > 0 && (
          <div className="meta-row">
            {item.genres!.map((g) => (
              <button
                key={g}
                type="button"
                className="meta-row-chip"
                onClick={() => navigate(`/genre/${encodeURIComponent(g)}`)}
                title={`Browse ${g}`}
              >
                {g}
              </button>
            ))}
          </div>
        )}

        <div className="detail-meta-list">
          <div className="detail-meta-item">
            <span>Type</span>
            <strong style={{ textTransform: "capitalize" }}>{item.kind}</strong>
          </div>
          <div className="detail-meta-item">
            <span>Year</span>
            <strong>{item.year}</strong>
          </div>
          <div className="detail-meta-item">
            <span>Runtime</span>
            <strong>{item.runtime}</strong>
          </div>
          <div className="detail-meta-item">
            <span>Source</span>
            <strong>Jellyfin</strong>
          </div>
          {item.studios && item.studios.length > 0 && (
            <div className="detail-meta-item">
              <span>Studio</span>
              <strong>{item.studios.slice(0, 2).join(", ")}</strong>
            </div>
          )}
          {typeof item.progress === "number" && item.progress > 0 && (
            <div className="detail-meta-item">
              <span>Progress</span>
              <strong>{item.progress}%</strong>
            </div>
          )}
        </div>

        {item.cast && item.cast.length > 0 && (
          <div className="detail-cast">
            <span className="detail-section-label">Cast</span>
            <p>
              {item.cast.map((c, i) => {
                const sep = i < item.cast!.length - 1 ? " · " : "";
                return c.id ? (
                  <span key={`${c.id}-${i}`}>
                    <button
                      type="button"
                      className="cast-link"
                      onClick={() => navigate(`/person/${c.id}`)}
                      title={c.role ? `${c.name} as ${c.role}` : `Browse ${c.name}'s filmography`}
                    >
                      {c.name}
                    </button>
                    {sep}
                  </span>
                ) : (
                  <span key={`${c.name}-${i}`}>
                    {c.name}
                    {sep}
                  </span>
                );
              })}
            </p>
          </div>
        )}

        <div className="detail-actions">
          {!isContainer && (
            <button
              className="primary-button"
              onClick={onPlay}
              type="button"
              disabled={!item.playbackUrl}
              title={!item.playbackUrl ? "No playback URL for this item — try refreshing the library." : undefined}
            >
              <IconPlayFill width={16} height={16} />
              Play
            </button>
          )}
          {onToggleFavorite && isReal && (
            <button
              className={`favorite-button ${item.isFavorite ? "is-active" : ""}`}
              onClick={onToggleFavorite}
              type="button"
              aria-pressed={!!item.isFavorite}
              aria-label={item.isFavorite ? "Remove from favorites" : "Add to favorites"}
              title={item.isFavorite ? "Remove from favorites" : "Add to favorites"}
            >
              {item.isFavorite ? (
                <IconHeartFill width={16} height={16} />
              ) : (
                <IconHeart width={16} height={16} />
              )}
              {item.isFavorite ? "Favorited" : "Favorite"}
            </button>
          )}
          {onEditArtwork && isReal && (
            <button className="secondary-button" onClick={onEditArtwork} type="button">
              <IconPhotoOnRectangle width={16} height={16} />
              Override artwork
            </button>
          )}
          {item.providerLinks && item.providerLinks.length > 0 && (
            <div className="provider-links">
              {item.providerLinks.map((link) => (
                <a
                  className="secondary-button"
                  key={link.label}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <IconArrowUpForward width={14} height={14} />
                  {link.label}
                </a>
              ))}
            </div>
          )}
        </div>

        {item.kind === "series" && client && item.jellyfinId && (
          <UpNextCard client={client} seriesId={item.jellyfinId} onPlay={onPlayChild} />
        )}

        {item.kind === "series" && client && item.jellyfinId && (
          <SeasonsSection client={client} seriesId={item.jellyfinId} />
        )}

        {item.kind === "season" && client && item.jellyfinId && (
          <EpisodesSection client={client} seasonId={item.jellyfinId} />
        )}

        {item.kind === "boxset" && client && item.jellyfinId && (
          <BoxSetItemsSection client={client} boxSetId={item.jellyfinId} />
        )}
      </div>
    </motion.section>
  );
}

/**
 * "Up Next" — surfaces the next unwatched episode of a series so the user
 * can resume in one click. Hidden when there's nothing to play (fresh
 * series with no progress, or a finished series).
 */
function UpNextCard({
  client,
  seriesId,
  onPlay,
}: {
  client: JellyfinClient;
  seriesId: string;
  onPlay?: (item: MediaItem) => void;
}) {
  const [next, setNext] = useState<MediaItem | null>(null);

  useEffect(() => {
    let cancelled = false;
    setNext(null);
    log.info("Fetching Up Next", { seriesId });
    void client
      .getNextUp({ seriesId, limit: 1 })
      .then((items) => {
        if (cancelled) return;
        const first = items[0];
        if (!first) {
          setNext(null);
          return;
        }
        setNext(mapJellyfinItem(first, client));
      })
      .catch((err) => {
        if (cancelled) return;
        log.error("Up Next fetch failed", err);
      });
    return () => {
      cancelled = true;
    };
  }, [client, seriesId]);

  if (!next) return null;
  const epLabel =
    typeof next.seasonNumber === "number" && typeof next.episodeNumber === "number"
      ? `S${next.seasonNumber} · E${next.episodeNumber}`
      : null;

  return (
    <section className="up-next-card glass-panel" aria-label="Up next">
      <div className="up-next-thumb">
        <img src={next.image} alt="" loading="lazy" />
        {typeof next.progress === "number" && next.progress > 0 && (
          <div className="episode-progress" aria-label={`${next.progress}% watched`}>
            <div style={{ width: `${next.progress}%` }} />
          </div>
        )}
      </div>
      <div className="up-next-copy">
        <span className="detail-section-label">Up next</span>
        <strong>{next.title}</strong>
        <small>
          {epLabel ? `${epLabel} · ` : ""}
          {next.runtime}
        </small>
        {next.description && <p>{next.description}</p>}
      </div>
      <div className="up-next-actions">
        <button
          type="button"
          className="primary-button"
          disabled={!next.playbackUrl}
          onClick={() => {
            if (next.playbackUrl) onPlay?.(next);
          }}
        >
          <IconPlayFill width={14} height={14} />
          Play
        </button>
        <button
          type="button"
          className="secondary-button"
          onClick={() => {
            if (next.jellyfinId) navigate(`/item/${next.jellyfinId}`);
          }}
        >
          Details
        </button>
      </div>
    </section>
  );
}

function SeasonsSection({ client, seriesId }: { client: JellyfinClient; seriesId: string }) {
  const [seasons, setSeasons] = useState<MediaItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setSeasons(null);
    setError(null);
    log.info("Fetching seasons", { seriesId });
    void client
      .getChildren(seriesId, { sortBy: "SortName" })
      .then((items) => {
        if (cancelled) return;
        const mapped = items
          .filter((i) => i.Type === "Season")
          .map((i) => mapJellyfinItem(i, client));
        setSeasons(mapped);
      })
      .catch((err) => {
        if (cancelled) return;
        log.error("Seasons fetch failed", err);
        setError(err instanceof Error ? err.message : "Failed to load seasons");
      });
    return () => {
      cancelled = true;
    };
  }, [client, seriesId]);

  return (
    <section className="detail-children" aria-label="Seasons">
      <span className="detail-section-label">Seasons</span>
      {seasons === null && !error && (
        <div className="poster-row" aria-hidden="true">
          {Array.from({ length: 4 }).map((_, i) => (
            <div className="skeleton-card" key={i} />
          ))}
        </div>
      )}
      {error && <p className="library-error" role="alert">{error}</p>}
      {seasons && seasons.length === 0 && (
        <p className="settings-note">This series has no seasons yet — check the Jellyfin scan.</p>
      )}
      {seasons && seasons.length > 0 && (
        <div className="seasons-grid" role="list">
          {seasons.map((season) => (
            <button
              key={season.id}
              type="button"
              role="listitem"
              className="season-tile"
              onClick={() => navigate(`/item/${season.jellyfinId}`)}
            >
              <img src={season.image} alt="" loading="lazy" />
              <div className="season-tile-copy">
                <strong>{season.title}</strong>
                {typeof season.childCount === "number" && (
                  <small>{season.childCount} episode{season.childCount === 1 ? "" : "s"}</small>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

function EpisodesSection({ client, seasonId }: { client: JellyfinClient; seasonId: string }) {
  const [episodes, setEpisodes] = useState<MediaItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setEpisodes(null);
    setError(null);
    log.info("Fetching episodes", { seasonId });
    // Episodes sort by IndexNumber (1, 2, 3…) which Jellyfin honours.
    void client
      .getChildren(seasonId, { sortBy: "IndexNumber" })
      .then((items) => {
        if (cancelled) return;
        const mapped = items
          .filter((i) => i.Type === "Episode")
          .map((i) => mapJellyfinItem(i, client));
        setEpisodes(mapped);
      })
      .catch((err) => {
        if (cancelled) return;
        log.error("Episodes fetch failed", err);
        setError(err instanceof Error ? err.message : "Failed to load episodes");
      });
    return () => {
      cancelled = true;
    };
  }, [client, seasonId]);

  return (
    <section className="detail-children" aria-label="Episodes">
      <span className="detail-section-label">Episodes</span>
      {episodes === null && !error && (
        <div className="episode-list" aria-hidden="true">
          {Array.from({ length: 4 }).map((_, i) => (
            <div className="episode-row episode-row-skeleton" key={i} />
          ))}
        </div>
      )}
      {error && <p className="library-error" role="alert">{error}</p>}
      {episodes && episodes.length === 0 && (
        <p className="settings-note">This season has no episodes yet — check the Jellyfin scan.</p>
      )}
      {episodes && episodes.length > 0 && (
        <ol className="episode-list">
          {episodes.map((ep) => (
            <li key={ep.id}>
              <button
                type="button"
                className="episode-row"
                onClick={() => navigate(`/item/${ep.jellyfinId}`)}
              >
                <div className="episode-thumb">
                  <img src={ep.image} alt="" loading="lazy" />
                  {typeof ep.progress === "number" && ep.progress > 0 && (
                    <div className="episode-progress" aria-label={`${ep.progress}% watched`}>
                      <div style={{ width: `${ep.progress}%` }} />
                    </div>
                  )}
                </div>
                <div className="episode-copy">
                  <span className="episode-index">
                    {typeof ep.episodeNumber === "number" ? `Episode ${ep.episodeNumber}` : "Episode"}
                  </span>
                  <strong>{ep.title}</strong>
                  <small>{ep.runtime}</small>
                  {ep.description && <p>{ep.description}</p>}
                </div>
              </button>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

/**
 * BoxSet contents — Movies (or other items) curated into a Jellyfin Collection.
 * Renders as a poster grid since collection items are typically Movies; click
 * navigates to their own detail page where Play lives.
 */
function BoxSetItemsSection({
  client,
  boxSetId,
}: {
  client: JellyfinClient;
  boxSetId: string;
}) {
  const [items, setItems] = useState<MediaItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setItems(null);
    setError(null);
    log.info("Fetching boxset items", { boxSetId });
    void client
      .getChildren(boxSetId, { sortBy: "SortName" })
      .then((result) => {
        if (cancelled) return;
        setItems(result.map((i) => mapJellyfinItem(i, client)));
      })
      .catch((err) => {
        if (cancelled) return;
        log.error("BoxSet items fetch failed", err);
        setError(err instanceof Error ? err.message : "Failed to load collection");
      });
    return () => {
      cancelled = true;
    };
  }, [client, boxSetId]);

  return (
    <section className="detail-children" aria-label="Items in this collection">
      <span className="detail-section-label">In this collection</span>
      {items === null && !error && (
        <div className="poster-row" aria-hidden="true">
          {Array.from({ length: 6 }).map((_, i) => (
            <div className="skeleton-card" key={i} />
          ))}
        </div>
      )}
      {error && <p className="library-error" role="alert">{error}</p>}
      {items && items.length === 0 && (
        <p className="settings-note">This collection is empty in Jellyfin.</p>
      )}
      {items && items.length > 0 && (
        <div className="poster-row" role="list">
          {items.map((it) => (
            <button
              key={it.id}
              type="button"
              role="listitem"
              className="season-tile"
              onClick={() => navigate(`/item/${it.jellyfinId}`)}
            >
              <img src={it.image} alt="" loading="lazy" />
              <div className="season-tile-copy">
                <strong>{it.title}</strong>
                <small>{it.year > 0 ? it.year : it.runtime}</small>
              </div>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

export default DetailPage;
