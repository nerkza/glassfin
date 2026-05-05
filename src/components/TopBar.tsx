import {
  IconMagnifyingglass,
  IconPersonCropCircleFill,
} from "symbols-react";
import SyncChip, { type SyncState } from "./SyncChip";

function TopBar({
  query,
  onQueryChange,
  isConnected,
  username,
  onProfile,
  syncState,
}: {
  query: string;
  onQueryChange: (query: string) => void;
  isConnected: boolean;
  username?: string;
  onProfile?: () => void;
  syncState?: SyncState;
}) {
  return (
    <header className="top-bar">
      <label className="search glass-panel">
        <IconMagnifyingglass width={16} height={16} />
        <input
          aria-label="Search library"
          placeholder="Search films, shows, music, live channels"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
        />
        <kbd className="search-kbd" aria-hidden="true">⌘K</kbd>
      </label>
      {syncState ? (
        <SyncChip state={syncState} />
      ) : (
        // Empty placeholder column so the grid keeps three columns and
        // the right-side actions sit flush right.
        <span aria-hidden="true" />
      )}
      <div className="top-actions">
        <button
          className={`chip-button glass-panel status-chip ${isConnected ? "is-online" : "is-offline"}`}
          type="button"
          aria-label={isConnected ? "Server online" : "Server offline"}
        >
          <span className="status-dot" aria-hidden="true" />
          {isConnected ? "Online" : "Offline"}
        </button>
        {/* Notification bell removed — there are no real notifications wired
            up yet. Avoid shipping inert UI that looks interactive. */}
        <button
          className="chip-button glass-panel profile-chip"
          title={username ? `Signed in as ${username} — manage profile` : "Sign in"}
          type="button"
          onClick={onProfile}
        >
          <IconPersonCropCircleFill width={18} height={18} />
          <span className="profile-chip-name">{username || "Sign in"}</span>
        </button>
      </div>
    </header>
  );
}

export default TopBar;
