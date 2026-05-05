import { useEffect, useState } from "react";
import {
  IconArrowLeftToLineCircleFill,
  IconChevronLeft,
  IconGearshape,
  IconRectangleAndArrowUpRightAndArrowDownLeft,
} from "symbols-react";
import { JellyfinClient, type JellyfinPublicUser } from "../jellyfin";
import { logger } from "../logger";

const log = logger.scope("profiles");

/*
  Standalone profile picker page. Reachable from the TopBar profile chip and
  via the /profiles hash route.

  Anatomy:
  - A hero card showing the currently signed-in user (avatar, name, server URL).
  - "Available profiles on this server" grid — public users from
    /Users/Public on the current server. Active session is marked.
  - Bottom row: Open settings / Sign out.

  Switching profiles: clicking a non-active profile signs out the current
  session and routes back to onboarding/settings with the picked username
  prefilled. Authentication itself happens through the existing flow — we
  don't try to log a new user in directly from here. That keeps the
  authentication surface area in one place (Onboarding + Settings → Connection)
  and avoids re-implementing it.
*/

function avatarUrl(serverUrl: string, user: JellyfinPublicUser): string | null {
  if (!user.PrimaryImageTag) return null;
  return `${serverUrl.replace(/\/$/, "")}/Users/${user.Id}/Images/Primary?tag=${user.PrimaryImageTag}&fillHeight=180&quality=92`;
}

function ProfilePicker({
  serverUrl,
  currentUserId,
  currentUsername,
  isConnected,
  onBack,
  onOpenSettings,
  onSignOut,
  onSwitchTo,
}: {
  serverUrl: string;
  currentUserId?: string;
  currentUsername?: string;
  isConnected: boolean;
  onBack: () => void;
  onOpenSettings: () => void;
  onSignOut: () => void;
  /** Caller decides what "switch to user" means (sign out + prefill +
   *  show login form). We just pass back the picked user. */
  onSwitchTo: (user: JellyfinPublicUser) => void;
}) {
  const [users, setUsers] = useState<JellyfinPublicUser[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!serverUrl) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    log.info("Discovering public users", { server: serverUrl });
    const client = new JellyfinClient({ serverUrl });
    client
      .getUsers()
      .then((list) => {
        if (cancelled) return;
        setUsers(list);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : "Could not load users";
        log.error("Public users fetch failed", err);
        setError(msg);
        setUsers([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [serverUrl]);

  const initials = (currentUsername || "?").slice(0, 1).toUpperCase();

  return (
    <section className="profile-picker-page page-anim" aria-labelledby="profile-picker-heading">
      <div className="profile-picker-toolbar">
        <button className="back-button" type="button" onClick={onBack} aria-label="Back">
          <IconChevronLeft width={14} height={14} />
          <span>Back</span>
        </button>
      </div>

      <div className="profile-picker-hero glass-panel">
        <div className="profile-picker-hero-avatar">{initials}</div>
        <div className="profile-picker-hero-meta">
          <span className="t-eyebrow">{isConnected ? "Signed in" : "Not connected"}</span>
          <h1 id="profile-picker-heading">{currentUsername || "No active session"}</h1>
          <p className="profile-picker-server">{serverUrl}</p>
        </div>
        <div className="profile-picker-hero-actions">
          <button className="secondary-button" type="button" onClick={onOpenSettings}>
            <IconGearshape width={14} height={14} />
            Settings
          </button>
          <button
            className="secondary-button danger"
            type="button"
            onClick={onSignOut}
            disabled={!isConnected}
          >
            <IconRectangleAndArrowUpRightAndArrowDownLeft width={14} height={14} />
            Sign out
          </button>
        </div>
      </div>

      <div className="profile-picker-section">
        <h2 className="t-h2">Available profiles on this server</h2>
        {error && (
          <div className="profile-picker-error" role="alert">
            <strong>Couldn't load profiles.</strong>
            <p>{error}</p>
          </div>
        )}
        {loading && !users && (
          <div className="profile-picker-grid" aria-busy="true">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="profile-card profile-card-skeleton" aria-hidden="true">
                <div className="profile-avatar-skeleton" />
                <div className="profile-name-skeleton" />
              </div>
            ))}
          </div>
        )}
        {users && users.length === 0 && !error && (
          <div className="empty-state">
            <strong>No public users found.</strong>
            <p>
              Either no users exist on this server, public discovery is disabled, or the URL is unreachable.
              Sign in manually from settings.
            </p>
          </div>
        )}
        {users && users.length > 0 && (
          <div className="profile-picker-grid">
            {users.map((user) => {
              const isActive = user.Id === currentUserId;
              const url = avatarUrl(serverUrl, user);
              return (
                <button
                  key={user.Id}
                  className={`profile-card ${isActive ? "is-active" : ""}`}
                  type="button"
                  onClick={() => {
                    if (isActive) return;
                    onSwitchTo(user);
                  }}
                  aria-current={isActive ? "true" : undefined}
                  title={isActive ? "Active session" : `Switch to ${user.Name}`}
                >
                  <div className="profile-avatar">
                    {url ? (
                      <img src={url} alt="" />
                    ) : (
                      <span>{user.Name.slice(0, 1).toUpperCase()}</span>
                    )}
                    {isActive && (
                      <span className="profile-active-dot" aria-hidden="true">
                        <IconArrowLeftToLineCircleFill width={12} height={12} />
                      </span>
                    )}
                  </div>
                  <span className="profile-name">{user.Name}</span>
                  <span className="profile-role">
                    {isActive ? "Active" : user.HasPassword ? "Password" : "Open"}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}

export default ProfilePicker;
