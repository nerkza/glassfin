import { type ReactNode } from "react";
import { motion } from "framer-motion";

function MagneticButton({
  children,
  onClick,
}: {
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <motion.button
      className="primary-button"
      onClick={onClick}
      type="button"
      whileHover={{ y: -2, scale: 1.015 }}
      whileTap={{ y: 1, scale: 0.985 }}
      transition={{ type: "spring", stiffness: 180, damping: 18 }}
    >
      {children}
    </motion.button>
  );
}

export default MagneticButton;
