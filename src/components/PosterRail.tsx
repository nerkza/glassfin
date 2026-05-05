import { useRef } from "react";
import { type MediaItem } from "../media";
import { useRovingFocus } from "../hooks/useRovingFocus";
import PosterTile from "./PosterTile";
import SectionTitle from "./SectionTitle";

/*
  Generic poster row used by the dashboard for Recently Added, Favorites,
  and any future "list of items" rail. Distinct from ContinueRail (which
  uses landscape MediaCards with progress bars) and from LibraryPanel
  (which is the full grid with infinite-scroll). When a rail's empty/loading
  story diverges meaningfully, fork it — but for now the same skeleton +
  honest empty state covers Recently Added and Favorites cleanly.
*/

function PosterRail({
  label,
  items,
  isLoading,
  isConnected,
  limit = 12,
  onSelect,
}: {
  label: string;
  items: MediaItem[];
  isLoading?: boolean;
  isConnected: boolean;
  limit?: number;
  onSelect: (item: MediaItem) => void;
}) {
  const rowRef = useRef<HTMLDivElement>(null);
  useRovingFocus(rowRef);

  // Hide the rail entirely when offline or empty — pointless headers and
  // "Sign in to see X" copy clutter the home page when the connect prompt
  // is already showing in the hero. Loading still renders a skeleton so
  // the user knows something is coming.
  if (!isConnected) return null;

  if (isLoading) {
    return (
      <section className="rail-section poster-rail" aria-label={label}>
        <SectionTitle label={label} action="Loading…" />
        <div className="poster-row" aria-hidden="true">
          {Array.from({ length: 6 }).map((_, i) => (
            <div className="skeleton-card" key={i} />
          ))}
        </div>
      </section>
    );
  }

  if (items.length === 0) return null;

  const visible = items.slice(0, limit);

  return (
    <section className="rail-section poster-rail" aria-label={label}>
      <SectionTitle label={label} action={`${visible.length} items`} />
      <div className="poster-row" ref={rowRef} role="list">
        {visible.map((item, index) => (
          <PosterTile
            item={item}
            index={index}
            key={item.id}
            onSelect={() => onSelect(item)}
          />
        ))}
      </div>
    </section>
  );
}

export default PosterRail;
