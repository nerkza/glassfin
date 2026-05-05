import { motion } from "framer-motion";
import { IconPlayFill } from "symbols-react";
import { type MediaItem } from "../media";

function MediaCard({
  item,
  index,
  onPlay,
  onSelect,
}: {
  item: MediaItem;
  index: number;
  onPlay: () => void;
  onSelect: () => void;
}) {
  return (
    <motion.button
      className="media-card glass-panel"
      type="button"
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.06, type: "spring", stiffness: 100, damping: 20 }}
      onClick={onSelect}
      aria-label={`Open ${item.title}`}
    >
      <img src={item.image} alt="" />
      <div className="media-card-copy">
        <span className="eyebrow">{item.eyebrow}</span>
        <h3>{item.title}</h3>
        <p>{item.runtime}</p>
        {/* Only render the progress track when we actually have progress.
            An empty grey bar on every card looks like a placeholder. */}
        {typeof item.progress === "number" && item.progress > 0 && (
          <div className="progress-track">
            <span style={{ width: `${item.progress}%`, backgroundColor: item.color }} />
          </div>
        )}
      </div>
      <span
        className="floating-play"
        role="button"
        tabIndex={0}
        onClick={(event) => { event.stopPropagation(); onPlay(); }}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            event.stopPropagation();
            onPlay();
          }
        }}
        title={`Play ${item.title}`}
        aria-label={`Play ${item.title}`}
      >
        <IconPlayFill width={15} height={15} />
      </span>
    </motion.button>
  );
}

export default MediaCard;
