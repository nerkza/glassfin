import { useEffect, useState } from "react";
import { IconArrowTrianglehead2Clockwise } from "symbols-react";

export type SyncState = {
  active: boolean;
  loaded: number;
  total: number;
  elapsedMs: number;
};

/*
  Inline sync chip that lives in the top bar between the search input and
  the right-side action chips. Replaces the previous floating SyncDock
  pattern as of 2026-05-05 (per Claude Design prototype). See
  PRODUCT_GUIDELINES.md §3.1 for the layout rules.

  Visibility: visible only while sync is active. The moment a sync finishes
  the chip collapses (no transient "Library synced" view). Idle is silence —
  the user doesn't need a toast for an event they didn't trigger.

  The collapse animation drives `is-off` (opacity 0 + scale 0.94 + blur 2 +
  flat padding) so the layout shifts smoothly rather than snapping.

  Filename ticker is illustrative — the SyncState we get from App.tsx today is
  loaded/total counts only, not per-file events. The chip cycles a placeholder
  set so the meta line never sits empty during long syncs. Swap to real
  filenames when /Sessions or /ScheduledTasks polling lands.
*/

const PLACEHOLDER_FILES = [
  { lib: "Library", file: "Querying Jellyfin…" },
  { lib: "Movies", file: "Loading recent additions" },
  { lib: "Shows", file: "Resolving series metadata" },
  { lib: "Music", file: "Indexing albums" },
  { lib: "Artwork", file: "Fetching backdrop tiles" },
];

function SyncChip({ state }: { state: SyncState }) {
  const [tickerIndex, setTickerIndex] = useState(0);

  // Cycle a placeholder filename while a sync is active so the meta line
  // doesn't sit on the same string for the whole transfer.
  useEffect(() => {
    if (!state.active) return;
    const id = window.setInterval(() => {
      setTickerIndex((i) => (i + 1) % PLACEHOLDER_FILES.length);
    }, 1800);
    return () => window.clearInterval(id);
  }, [state.active]);

  const hasTotal = state.total > 0;
  const pct = hasTotal ? Math.min(100, Math.round((state.loaded / state.total) * 100)) : 0;

  const isActive = state.active;
  const ticker = PLACEHOLDER_FILES[tickerIndex];
  const className = `sync-chip${isActive ? "" : " is-off"}`;

  return (
    <div className={className} role="status" aria-live="polite" aria-hidden={!isActive}>
      <div className="sync-icon" aria-hidden="true">
        <span className="sync-spinner">
          <IconArrowTrianglehead2Clockwise width={14} height={14} />
        </span>
      </div>
      <div className="sync-meta">
        <div className="sync-line">
          <span className="sync-label">Syncing {ticker.lib}</span>
          <span className="sync-file">{ticker.file}</span>
        </div>
        <div className="sync-bar" aria-hidden="true">
          <span
            className="sync-bar-fill"
            style={{ transform: `scaleX(${pct / 100})` }}
          />
        </div>
      </div>
      <span className="sync-pct">{pct}%</span>
    </div>
  );
}

export default SyncChip;
