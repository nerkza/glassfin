import {
  IconMagnifyingglass,
  IconPersonCropCircleFill,
} from "symbols-react";

function TopBar({
  query,
  onQueryChange,
  isConnected,
  username,
  onProfile,
}: {
  query: string;
  onQueryChange: (query: string) => void;
  isConnected: boolean;
  username?: string;
  onProfile?: () => void;
}) {
  return (
    <header className="top-bar">
      <div className="search glass-panel">
        <IconMagnifyingglass width={18} height={18} />
        <input
          aria-label="Search library"
          placeholder="Search films, shows, music, live channels"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
        />
      </div>
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
          <IconPersonCropCircleFill width={20} height={20} />
          <span className="profile-chip-name">{username || "Sign in"}</span>
        </button>
      </div>
    </header>
  );
}

export default TopBar;
