import { useEffect, useState } from "react";
import { JellyfinClient, type JellyfinPublicUser } from "../jellyfin";

/*
  User picker.

  Fetches /Users/Public (no auth required by Jellyfin) for a given server URL
  and renders an avatar grid. Clicking a user fires onPick — the parent decides
  whether to pre-fill the form, prompt for a password, or auto-sign-in if the
  user has no password.

  Lives inside the Connection settings panel; could also be lifted to a launch
  screen when the roadmap's Phase 5 (multi-user) gets a dedicated route.
*/
function UserPicker({
  serverUrl,
  onPick,
  onError,
  autoDiscover = false,
}: {
  serverUrl: string;
  onPick: (user: JellyfinPublicUser) => void;
  onError?: (message: string) => void;
  /** When true, fetch /Users/Public on mount/serverUrl-change instead of waiting
   * for a manual "Discover" click. Used by the onboarding flow. */
  autoDiscover?: boolean;
}) {
  const [users, setUsers] = useState<JellyfinPublicUser[] | null>(null);
  const [loading, setLoading] = useState(false);

  async function discover() {
    if (!serverUrl) return;
    setLoading(true);
    try {
      const client = new JellyfinClient({ serverUrl });
      const list = await client.getUsers();
      setUsers(list);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Could not load users";
      onError?.(msg);
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setUsers(null);
    if (autoDiscover && serverUrl) {
      void discover();
    }
    // discover is stable for our purposes; avoiding the useCallback ceremony.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverUrl, autoDiscover]);

  if (users === null) {
    return (
      <button
        className="secondary-button"
        type="button"
        onClick={discover}
        disabled={!serverUrl || loading}
      >
        {loading ? "Discovering…" : "Discover users on this server"}
      </button>
    );
  }

  if (users.length === 0) {
    return (
      <div className="empty-state">
        <strong>No public users found.</strong>
        <p>
          Either no users exist on this server, public discovery is disabled, or the URL is unreachable.
          Sign in manually below.
        </p>
      </div>
    );
  }

  return (
    <div className="user-picker-grid">
      {users.map((user) => (
        <button
          key={user.Id}
          className="user-tile"
          type="button"
          onClick={() => onPick(user)}
          aria-label={`Sign in as ${user.Name}`}
        >
          <div className="user-tile-avatar">
            {user.PrimaryImageTag ? (
              <img
                src={`${serverUrl.replace(/\/$/, "")}/Users/${user.Id}/Images/Primary?tag=${user.PrimaryImageTag}&fillHeight=160&quality=92`}
                alt=""
                style={{ width: "100%", height: "100%", borderRadius: "50%", objectFit: "cover" }}
              />
            ) : (
              user.Name.slice(0, 1).toUpperCase()
            )}
          </div>
          <span className="user-tile-name">{user.Name}</span>
          <span className="user-tile-role">{user.HasPassword ? "Password" : "Open"}</span>
        </button>
      ))}
    </div>
  );
}

export default UserPicker;
