import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { IconCheckmarkCircleFill, IconXmark } from "symbols-react";

/*
  Floating sync indicator.

  Sits in the bottom-left corner (mirror of LiveLogDock on the right).

  - Visible while a library sync is active.
  - Briefly stays visible after success showing the final count + elapsed time,
    then auto-dismisses after 4 seconds.
  - Failure case keeps the dock until the user dismisses (so they don't miss
    the "library failed" status).
*/

export type SyncState = {
  active: boolean;
  loaded: number;
  total: number;
  elapsedMs: number;
};

function formatElapsed(ms: number): string {
  if (ms < 1000) return `${ms} ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const minutes = Math.floor(seconds / 60);
  const remainder = Math.round(seconds % 60);
  return `${minutes}m ${remainder}s`;
}

function SyncDock({ state }: { state: SyncState }) {
  const [dismissed, setDismissed] = useState(false);
  const [showCompleted, setShowCompleted] = useState(false);

  // Reset dismissal whenever a new sync begins.
  useEffect(() => {
    if (state.active) {
      setDismissed(false);
      setShowCompleted(false);
    }
  }, [state.active]);

  // Surface the "completed" view briefly after a sync finishes successfully.
  useEffect(() => {
    if (state.active) return;
    if (state.loaded === 0 && state.total === 0) return;
    setShowCompleted(true);
    const timeoutId = window.setTimeout(() => setShowCompleted(false), 4000);
    return () => window.clearTimeout(timeoutId);
  }, [state.active, state.loaded, state.total]);

  const visible = !dismissed && (state.active || showCompleted);
  if (!visible) return null;

  const hasTotal = state.total > 0;
  const pct = hasTotal ? Math.min(100, Math.round((state.loaded / state.total) * 100)) : 0;

  return (
    <AnimatePresence>
      <motion.aside
        className="sync-dock glass-panel"
        initial={{ opacity: 0, y: 16, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 16, scale: 0.97 }}
        transition={{ type: "spring", stiffness: 180, damping: 22 }}
        role="status"
        aria-live="polite"
      >
        <div className="sync-dock-header">
          <div className="sync-dock-title">
            {state.active ? (
              <span className="sync-spinner" aria-hidden="true" />
            ) : (
              <IconCheckmarkCircleFill width={16} height={16} style={{ color: "var(--positive)" }} />
            )}
            <span>{state.active ? "Syncing library" : "Library synced"}</span>
          </div>
          {!state.active && (
            <button
              type="button"
              className="sync-dock-close"
              aria-label="Dismiss"
              onClick={() => setDismissed(true)}
            >
              <IconXmark width={14} height={14} />
            </button>
          )}
        </div>

        <div className="sync-dock-body">
          <div className="sync-dock-counts">
            {state.active ? (
              hasTotal ? (
                <>
                  <strong>{state.loaded.toLocaleString()}</strong>
                  <span> of </span>
                  <strong>{state.total.toLocaleString()}</strong>
                  <span> items</span>
                </>
              ) : (
                <span>Contacting server…</span>
              )
            ) : (
              <>
                <strong>{state.loaded.toLocaleString()}</strong>
                <span> shown</span>
                {hasTotal && state.total !== state.loaded && (
                  <>
                    <span> · </span>
                    <strong>{state.total.toLocaleString()}</strong>
                    <span> on server</span>
                  </>
                )}
              </>
            )}
          </div>
          <div className="sync-dock-elapsed">{formatElapsed(state.elapsedMs)}</div>
        </div>

        <div
          className={`sync-dock-progress ${state.active && !hasTotal ? "is-indeterminate" : ""}`}
          aria-hidden="true"
        >
          <span style={{ width: hasTotal ? `${pct}%` : undefined }} />
        </div>
      </motion.aside>
    </AnimatePresence>
  );
}

export default SyncDock;
