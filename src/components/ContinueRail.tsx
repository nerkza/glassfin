import { useRef } from "react";
import { type MediaItem } from "../media";
import { useRovingFocus } from "../hooks/useRovingFocus";
import MediaCard from "./MediaCard";
import SectionTitle from "./SectionTitle";

function ContinueRail({
  items,
  onPlay,
  onSelect,
  isLoading,
  isConnected,
}: {
  items: MediaItem[];
  onPlay: (item: MediaItem) => void;
  onSelect: (item: MediaItem) => void;
  isLoading?: boolean;
  isConnected: boolean;
}) {
  const railRef = useRef<HTMLDivElement>(null);
  useRovingFocus(railRef);

  // Hide the rail entirely when offline or empty. The hero's connect-prompt
  // covers the offline case; "nothing in progress yet" doesn't need its own
  // header on the dashboard. Loading still renders a skeleton so a slow
  // server doesn't look like a broken page.
  if (!isConnected) return null;

  if (isLoading) {
    return (
      <section className="rail-section" aria-label="Continue watching">
        <SectionTitle label="Continue watching" action="Loading…" />
        <div className="continue-grid">
          {[0, 1, 2, 3].map((i) => (
            <div className="skeleton-card" key={i} />
          ))}
        </div>
      </section>
    );
  }

  if (items.length === 0) return null;

  return (
    <section className="rail-section" aria-label="Continue watching">
      <SectionTitle label="Continue watching" action={`${items.length} items`} />
      <div className="continue-grid" ref={railRef} role="list">
        {items.slice(0, 4).map((item, index) => (
          <MediaCard
            item={item}
            index={index}
            key={item.id}
            onPlay={() => onPlay(item)}
            onSelect={() => onSelect(item)}
          />
        ))}
      </div>
    </section>
  );
}

export default ContinueRail;
