import { motion } from "framer-motion";
import { type MediaItem } from "../media";

function PosterTile({
  item,
  index,
  onSelect,
}: {
  item: MediaItem;
  index: number;
  onSelect: () => void;
}) {
  return (
    <motion.button
      className="poster-tile"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04, type: "spring", stiffness: 120, damping: 18 }}
      onClick={onSelect}
      type="button"
    >
      <img src={item.image} alt="" />
      <span>{item.title}</span>
      <small>{item.rating}</small>
    </motion.button>
  );
}

export default PosterTile;
