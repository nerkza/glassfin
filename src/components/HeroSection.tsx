import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { IconChevronLeft, IconChevronRight, IconPlayFill } from "symbols-react";
import { type MediaItem, type DeviceTarget } from "../media";
import MagneticButton from "./MagneticButton";

const ROTATE_INTERVAL_MS = 7000;
const PICK_COUNT = 5;

/*
  Rotating hero carousel.

  Used to be a single static panel locked to whatever was first in the library
  fetch — visually overpowering and dull on every page load. Now it picks
  PICK_COUNT items at random per session and auto-advances every
  ROTATE_INTERVAL_MS, with manual prev/next + indicator dots. Pause on hover so
  you can read the synopsis without it sliding away.
*/
function HeroSection({
  candidates,
  isConnected,
  onPlay,
  onSelect,
  onOpenSettings,
}: {
  /** Pool to draw the carousel from — typically library + resume merged. */
  candidates: MediaItem[];
  isConnected: boolean;
  /** Reserved for when we wire the cast-target picker. */
  selectedDevice?: DeviceTarget;
  onPlay: (item: MediaItem) => void;
  onSelect: (item: MediaItem) => void;
  onOpenSettings: () => void;
}) {
  // Pick once per mount so the carousel stays stable while the user watches
  // it. New random set on next page load — matching the "rotates around a few
  // of them" intent.
  const items = useMemo(() => pickRandom(candidates, PICK_COUNT), [candidates]);

  const [activeIndex, setActiveIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const intervalRef = useRef<number | null>(null);

  // Reset to first slide if the candidate pool shrinks past activeIndex.
  useEffect(() => {
    if (activeIndex >= items.length) setActiveIndex(0);
  }, [items.length, activeIndex]);

  // Auto-advance. Pauses on hover (set via onMouseEnter/onMouseLeave below).
  useEffect(() => {
    if (items.length < 2 || isPaused) return;
    intervalRef.current = window.setInterval(() => {
      setActiveIndex((i) => (i + 1) % items.length);
    }, ROTATE_INTERVAL_MS);
    return () => {
      if (intervalRef.current !== null) window.clearInterval(intervalRef.current);
    };
  }, [items.length, isPaused]);

  if (items.length === 0) {
    return (
      <motion.article
        className="hero hero-empty glass-panel"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 100, damping: 18 }}
      >
        <div className="hero-copy">
          <div className="eyebrow">{isConnected ? "Library" : "Welcome"}</div>
          <h1>{isConnected ? "Your library is empty" : "Connect your Jellyfin server"}</h1>
          <p>
            {isConnected
              ? "Glassfin is signed in but found no movies, shows, or music in this user's libraries. Add content in Jellyfin or check the library permissions."
              : "Sign in to your Jellyfin server to see your library, continue watching, and play to any device on your network."}
          </p>
          <div className="hero-actions">
            <MagneticButton onClick={onOpenSettings}>
              <IconPlayFill width={18} height={18} />
              {isConnected ? "Open settings" : "Connect server"}
            </MagneticButton>
          </div>
        </div>
      </motion.article>
    );
  }

  const active = items[activeIndex];

  function go(direction: 1 | -1) {
    setActiveIndex((i) => (i + direction + items.length) % items.length);
  }

  return (
    <motion.section
      className="hero hero-carousel glass-panel"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 100, damping: 18 }}
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      aria-roledescription="carousel"
      aria-label="Featured from your library"
    >
      <AnimatePresence mode="wait">
        <motion.div
          key={active.id}
          className="hero-slide"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.5 }}
        >
          {/* Background layers — backdrop if we have one, otherwise blur the
              poster across the whole frame as an ambient fill. */}
          {active.backdropImage ? (
            <img className="hero-image" src={active.backdropImage} alt="" />
          ) : (
            <div
              className="hero-image hero-image-blurred"
              style={{ backgroundImage: `url(${active.image})` }}
              aria-hidden="true"
            />
          )}
          <div className="hero-vignette" />

          {/* Foreground: copy on the left (gets most of the room), tags
              stacked vertically on the right against the poster. */}
          <div className="hero-content">
            <div className="hero-copy">
              <div className="eyebrow">{active.eyebrow}</div>
              <h1>{active.title}</h1>
              {active.description && <p>{active.description}</p>}
              <div className="hero-actions">
                <MagneticButton onClick={() => onPlay(active)}>
                  <IconPlayFill width={18} height={18} />
                  Play
                </MagneticButton>
                <button
                  className="text-button hero-details-button"
                  type="button"
                  onClick={() => onSelect(active)}
                >
                  Details
                </button>
              </div>
            </div>

            <div className="hero-side">
              <div className="hero-tags">
                <span className="hero-tag">{active.year}</span>
                <span className="hero-tag">{active.runtime}</span>
                <span className="hero-tag">{active.rating}</span>
                {/* Genre chips here are decorative labels only — the detail
                    page is where they become clickable navigation. See
                    PRODUCT_GUIDELINES.md §4.2 for the rationale. */}
                {active.genres && active.genres.slice(0, 3).map((g) => (
                  <span key={g} className="hero-tag" style={chipStyle(g)}>{g}</span>
                ))}
                {active.meta.slice(0, 4).map((tag) => (
                  <span key={tag} className="hero-tag" style={chipStyle(tag)}>{tag}</span>
                ))}
              </div>
              {/* Poster always visible on the right — gives the canonical
                  artwork a home regardless of whether we have a backdrop. */}
              <img className="hero-poster" src={active.image} alt="" />
            </div>
          </div>
        </motion.div>
      </AnimatePresence>

      {items.length > 1 && (
        <>
          <button
            className="hero-nav hero-nav-prev"
            type="button"
            aria-label="Previous slide"
            onClick={() => go(-1)}
          >
            <IconChevronLeft width={18} height={18} />
          </button>
          <button
            className="hero-nav hero-nav-next"
            type="button"
            aria-label="Next slide"
            onClick={() => go(1)}
          >
            <IconChevronRight width={18} height={18} />
          </button>
          <div className="hero-dots" role="tablist" aria-label="Carousel position">
            {items.map((it, i) => (
              <button
                key={it.id}
                role="tab"
                aria-selected={i === activeIndex}
                aria-label={`Go to ${it.title}`}
                className={`hero-dot ${i === activeIndex ? "is-active" : ""}`}
                onClick={() => setActiveIndex(i)}
              />
            ))}
          </div>
        </>
      )}
    </motion.section>
  );
}

/** Deterministic hue (0–359) from a string. Same input → same colour every
 *  render, so chips don't shimmer between renders. Uses a simple 32-bit
 *  rolling hash; fine for ~5-character tag names. */
function hueFromString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return ((h % 360) + 360) % 360;
}

/** Inline-style chip colours derived from a seed string. Returns
 *  border / background / text colour so each tag reads distinct but cohesive
 *  (same saturation + lightness, only hue rotates). */
function chipStyle(seed: string): React.CSSProperties {
  const hue = hueFromString(seed);
  return {
    borderColor: `hsla(${hue}, 60%, 62%, 0.38)`,
    background: `hsla(${hue}, 60%, 50%, 0.15)`,
    color: `hsla(${hue}, 80%, 90%, 1)`,
  };
}

/** Fisher–Yates partial shuffle: takes up to `count` random items without
 *  copying the whole pool when it's huge (8.5k items in user's library). */
function pickRandom<T>(pool: T[], count: number): T[] {
  if (pool.length <= count) return [...pool];
  const indices = new Set<number>();
  while (indices.size < count) {
    indices.add(Math.floor(Math.random() * pool.length));
  }
  return Array.from(indices, (i) => pool[i]);
}

export default HeroSection;
