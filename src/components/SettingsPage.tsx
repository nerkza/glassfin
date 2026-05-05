import { useEffect, useMemo, useState } from "react";
import { IconChevronLeft } from "symbols-react";
import { type DeviceTarget, localPlaybackDevice } from "../media";
import {
  type JellyfinClient,
  type JellyfinConnection,
  type JellyfinItem,
  type JellyfinPublicInfo,
} from "../jellyfin";
import { registry, type Plugin } from "../plugins";
import { builtInPlugins } from "../plugins/index";
import { logger } from "../logger";
import { NAV_TABS, type LibraryTab } from "../router";
import {
  getPrefs,
  setLibraryIdHidden,
  setLibraryTabHidden,
  subscribePrefs,
  updatePrefs,
  type LayoutDensity,
  type QualityPresetId,
  type SubtitleMode,
} from "../prefs";
import { getArrClients, type ArrService } from "../arr";
import UserPicker from "./UserPicker";
import LogsPanel from "./LogsPanel";
import ColorWheel from "./ColorWheel";

const log = logger.scope("settings");

const QUALITY_PRESET_LABELS: Record<QualityPresetId, string> = {
  auto: "Auto · Direct play",
  p2160: "2160p · 4K (~25 Mbps)",
  p1440: "1440p · QHD (~12 Mbps)",
  p1080: "1080p · FHD (~8 Mbps)",
  p720: "720p · HD (~4 Mbps)",
  p480: "480p · SD (~2 Mbps)",
};

// ISO 639-2 codes Jellyfin uses, with friendly labels. Free-text fallback
// lets users enter codes we haven't listed.
const COMMON_LANGUAGES: { code: string; label: string }[] = [
  { code: "", label: "No preference" },
  { code: "eng", label: "English" },
  { code: "spa", label: "Spanish" },
  { code: "fre", label: "French" },
  { code: "ger", label: "German" },
  { code: "ita", label: "Italian" },
  { code: "jpn", label: "Japanese" },
  { code: "kor", label: "Korean" },
  { code: "chi", label: "Chinese" },
  { code: "rus", label: "Russian" },
  { code: "por", label: "Portuguese" },
  { code: "dut", label: "Dutch" },
  { code: "swe", label: "Swedish" },
  { code: "ara", label: "Arabic" },
  { code: "hin", label: "Hindi" },
];

const ACCENT_PRESETS: { value: string | null; label: string }[] = [
  { value: null, label: "Default blue" },
  { value: "#ff8a4c", label: "Sunset" },
  { value: "#a78bfa", label: "Lavender" },
  { value: "#34d399", label: "Mint" },
  { value: "#f472b6", label: "Rose" },
  { value: "#fbbf24", label: "Amber" },
  { value: "#22d3ee", label: "Cyan" },
];

const DENSITY_LABELS: Record<LayoutDensity, string> = {
  compact: "Compact — more rows, tighter spacing",
  default: "Default — balanced",
  spacious: "Spacious — bigger posters, more breathing room",
};

const SUBTITLE_MODE_LABELS: Record<SubtitleMode, string> = {
  off: "Off — never auto-show subtitles",
  auto: "Auto — match preferred language",
  forced: "Forced only — only show forced subtitle tracks",
};

const categories = [
  { id: "connection", label: "Connection" },
  { id: "playback", label: "Playback" },
  { id: "libraries", label: "Libraries" },
  { id: "servers", label: "Servers" },
  { id: "tasks", label: "Tasks" },
  { id: "display", label: "Display" },
  { id: "plugins", label: "Plugins" },
  { id: "logs", label: "Logs" },
  { id: "about", label: "About" },
] as const;

type CategoryId = (typeof categories)[number]["id"];

function SettingsPage({
  connection,
  connectionStatus,
  remoteModeLabel,
  publicAppUrl,
  isConnecting,
  client,
  onConnectionChange,
  onConnect,
  selectedDevice,
  onSelectDevice,
  onBack,
  onResetOnboarding,
}: {
  connection: JellyfinConnection;
  connectionStatus: string;
  remoteModeLabel: string;
  publicAppUrl: string | undefined;
  isConnecting: boolean;
  client: JellyfinClient | null;
  onConnectionChange: (connection: JellyfinConnection) => void;
  onConnect: () => void;
  selectedDevice: DeviceTarget;
  onSelectDevice: (device: DeviceTarget) => void;
  onBack: () => void;
  onResetOnboarding?: () => void;
}) {
  const [activeCategory, setActiveCategory] = useState<CategoryId>("connection");
  const [plugins, setPlugins] = useState<Plugin[]>(registry.list());
  const [installingId, setInstallingId] = useState<string | null>(null);
  // Bumps when plugin panels need re-rendering (e.g., after install/uninstall
  // or to refresh dynamic content like the Sunset stats panel's elapsed time).
  const [panelTick, setPanelTick] = useState(0);
  useEffect(() => registry.subscribe(() => {
    setPlugins(registry.list());
    setPanelTick((t) => t + 1);
  }), []);
  const [prefs, setPrefs] = useState(() => getPrefs());
  useEffect(() => subscribePrefs((next) => setPrefs(next)), []);
  const hiddenTabSet = new Set<string>(prefs.hiddenLibraryTabs);
  const hiddenLibrarySet = useMemo(() => new Set(prefs.hiddenLibraryIds), [prefs.hiddenLibraryIds]);
  const togglableNavTabs = NAV_TABS.filter((t) => t.togglable);

  // Lazily fetch Jellyfin views + server info. Both are cheap (small JSON
  // payloads) and the user explicitly opened a settings tab, so a one-shot
  // fetch on category change is fine; refresh button below re-runs it.
  const [views, setViews] = useState<JellyfinItem[] | null>(null);
  const [viewsError, setViewsError] = useState<string | null>(null);
  const [serverInfo, setServerInfo] = useState<JellyfinPublicInfo | null>(null);
  const [serverInfoError, setServerInfoError] = useState<string | null>(null);

  // /version.json is generated at container start (see docker-entrypoint.sh).
  // Local `npm run dev` won't have it, so a 404 is silently tolerated.
  type AppVersion = { version?: string; gitSha?: string; builtAt?: string };
  const [appVersion, setAppVersion] = useState<AppVersion | null>(null);

  useEffect(() => {
    if (activeCategory !== "libraries" || !client) return;
    let cancelled = false;
    setViews(null);
    setViewsError(null);
    void client
      .getViews()
      .then((items) => {
        if (cancelled) return;
        setViews(items);
      })
      .catch((err) => {
        if (cancelled) return;
        log.error("Views fetch failed", err);
        setViewsError(err instanceof Error ? err.message : "Failed to load libraries");
      });
    return () => {
      cancelled = true;
    };
  }, [activeCategory, client]);

  // *arr (Sonarr / Radarr) connection probes. We test only when the user
  // opens the Servers category to avoid burning requests on every settings
  // visit. Each test stores its outcome separately.
  type ArrStatus = { state: "idle" | "testing" | "ok" | "error"; message?: string };
  const [arrStatus, setArrStatus] = useState<Record<ArrService, ArrStatus>>({
    sonarr: { state: "idle" },
    radarr: { state: "idle" },
  });
  const arrClients = useMemo(() => getArrClients(), []);

  async function testArr(service: ArrService) {
    const arrClient = service === "sonarr" ? arrClients.sonarr : arrClients.radarr;
    if (!arrClient) return;
    setArrStatus((s) => ({ ...s, [service]: { state: "testing" } }));
    try {
      const info = await arrClient.testConnection();
      setArrStatus((s) => ({
        ...s,
        [service]: { state: "ok", message: info?.version ? `v${info.version}` : "OK" },
      }));
    } catch (error) {
      setArrStatus((s) => ({
        ...s,
        [service]: { state: "error", message: error instanceof Error ? error.message : "Failed" },
      }));
    }
  }

  useEffect(() => {
    if (activeCategory !== "about" || !client) return;
    let cancelled = false;
    setServerInfo(null);
    setServerInfoError(null);
    void client
      .getPublicInfo()
      .then((info) => {
        if (cancelled) return;
        setServerInfo(info);
      })
      .catch((err) => {
        if (cancelled) return;
        log.error("Server info fetch failed", err);
        setServerInfoError(err instanceof Error ? err.message : "Failed to load server info");
      });
    return () => {
      cancelled = true;
    };
  }, [activeCategory, client]);

  useEffect(() => {
    if (activeCategory !== "about") return;
    let cancelled = false;
    void fetch("/version.json", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((value) => {
        if (cancelled || !value) return;
        setAppVersion(value as AppVersion);
      })
      .catch(() => {
        // /version.json doesn't exist in dev — silent skip.
      });
    return () => {
      cancelled = true;
    };
  }, [activeCategory]);
  const isAuthenticated = !!(connection.accessToken && connection.userId);
  const hasError = connectionStatus.includes("failed") || connectionStatus.includes("Invalid") || connectionStatus.includes("Error") || connectionStatus.includes("refused") || connectionStatus.includes("CORS");

  return (
    <section className="settings-page">
      <header className="settings-top">
        <button className="back-button" onClick={onBack} type="button">
          <IconChevronLeft width={20} height={20} />
          Back
        </button>
        <h1>Settings</h1>
      </header>

      <div className="settings-layout">
        <nav className="settings-nav glass-panel">
          {categories.map((cat) => (
            <button
              className={`settings-nav-item ${activeCategory === cat.id ? "active" : ""}`}
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              type="button"
            >
              {cat.label}
            </button>
          ))}
        </nav>

        <div className="settings-content glass-panel">
          {activeCategory === "connection" && (
            <div className="settings-section">
              <h2>Jellyfin Server</h2>

              <div className={`server-card ${hasError ? "error" : ""}`}>
                <span>Status</span>
                <strong>{connectionStatus}</strong>
                {hasError && (
                  <small className="error-hint">
                    Check that your Jellyfin server is running and accessible from this browser.
                    If the server is on a different host, CORS must be enabled on Jellyfin.
                  </small>
                )}
              </div>

              {isConnecting && (
                <div className="progress-bar-container">
                  <div className="progress-bar-active" />
                  <small className="progress-label">Connecting to {connection.serverUrl}...</small>
                </div>
              )}

              <div className="server-card">
                <span>Endpoint</span>
                <strong>{connection.serverUrl}</strong>
              </div>

              <div className="access-card">
                <span>Remote access</span>
                <strong>{remoteModeLabel}</strong>
                <small>{publicAppUrl || "Set PUBLIC_APP_URL when exposed through a proxy."}</small>
              </div>

              {isAuthenticated && connection.username ? (
                <div className="server-card">
                  <span>Signed in as</span>
                  <strong>{connection.username}</strong>
                  <button
                    className="sign-out-button"
                    type="button"
                    onClick={() => onConnectionChange({
                      serverUrl: connection.serverUrl,
                      username: "",
                      password: "",
                    })}
                  >
                    Sign out
                  </button>
                </div>
              ) : (
                <>
                  {connection.serverUrl && (
                    <div className="settings-section">
                      <span className="detail-section-label">Quick sign-in</span>
                      <UserPicker
                        serverUrl={connection.serverUrl}
                        onPick={(user) => {
                          onConnectionChange({ ...connection, username: user.Name });
                          // If the user has no password, sign in immediately.
                          if (!user.HasPassword) {
                            // Defer one tick so state propagates before connect runs.
                            setTimeout(() => onConnect(), 0);
                          } else {
                            // Focus the password field for the human.
                            const pw = document.querySelector<HTMLInputElement>('input[type="password"]');
                            pw?.focus();
                          }
                        }}
                      />
                    </div>
                  )}

                  <form
                    className="connect-form"
                    onSubmit={(event) => {
                      event.preventDefault();
                      onConnect();
                    }}
                  >
                    <label>
                      Server URL
                      <input
                        value={connection.serverUrl}
                        onChange={(event) => onConnectionChange({ ...connection, serverUrl: event.target.value })}
                        placeholder="http://jellyfin.local:8096"
                        disabled={isConnecting}
                      />
                    </label>
                    <label>
                      Username
                      <input
                        value={connection.username ?? ""}
                        onChange={(event) => onConnectionChange({ ...connection, username: event.target.value })}
                        placeholder="Your Jellyfin username"
                        autoComplete="username"
                        disabled={isConnecting}
                      />
                    </label>
                    <label>
                      Password
                      <input
                        value={connection.password ?? ""}
                        onChange={(event) => onConnectionChange({ ...connection, password: event.target.value })}
                        placeholder="Your Jellyfin password"
                        type="password"
                        autoComplete="current-password"
                        disabled={isConnecting}
                      />
                    </label>
                    <button type="submit" disabled={isConnecting}>
                      {isConnecting ? "Connecting..." : "Sign in"}
                    </button>
                  </form>
                </>
              )}

              {onResetOnboarding && (
                <div className="settings-section settings-devtools">
                  <span className="detail-section-label">First-run setup</span>
                  <p className="settings-note">
                    Replay the welcome flow. This signs you out and clears the
                    "onboarding completed" flag so the next launch returns to
                    step 1.
                  </p>
                  <button
                    type="button"
                    className="text-button"
                    onClick={onResetOnboarding}
                  >
                    Show onboarding again
                  </button>
                </div>
              )}
            </div>
          )}

          {activeCategory === "playback" && (
            <div className="settings-section">
              <h2>Playback</h2>

              <div className="settings-subsection">
                <span className="detail-section-label">Default quality</span>
                <p className="settings-note">
                  Applied when you open the player. "Auto" lets the server
                  direct-play the original file; the others trigger Jellyfin
                  transcoding for that target resolution.
                </p>
                <div className="setting-row">
                  <label>
                    <span>Quality preset</span>
                    <select
                      value={prefs.defaultQualityPreset}
                      onChange={(event) => {
                        const value = event.target.value as QualityPresetId;
                        log.info("Default quality preset changed", { value });
                        updatePrefs((c) => ({ ...c, defaultQualityPreset: value }));
                      }}
                    >
                      {(Object.keys(QUALITY_PRESET_LABELS) as QualityPresetId[]).map((id) => (
                        <option key={id} value={id}>
                          {QUALITY_PRESET_LABELS[id]}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </div>

              <div className="settings-subsection">
                <span className="detail-section-label">Languages</span>
                <p className="settings-note">
                  When an item has multiple audio or subtitle tracks, the
                  player picks the one whose language matches your preference.
                  Items with only one track ignore these.
                </p>
                <div className="setting-row">
                  <label>
                    <span>Preferred audio</span>
                    <select
                      value={prefs.preferredAudioLanguage}
                      onChange={(event) => {
                        const value = event.target.value;
                        log.info("Preferred audio language changed", { value });
                        updatePrefs((c) => ({ ...c, preferredAudioLanguage: value }));
                      }}
                    >
                      {COMMON_LANGUAGES.map((lang) => (
                        <option key={lang.code || "none"} value={lang.code}>
                          {lang.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="setting-row">
                  <label>
                    <span>Preferred subtitles</span>
                    <select
                      value={prefs.preferredSubtitleLanguage}
                      onChange={(event) => {
                        const value = event.target.value;
                        log.info("Preferred subtitle language changed", { value });
                        updatePrefs((c) => ({ ...c, preferredSubtitleLanguage: value }));
                      }}
                    >
                      {COMMON_LANGUAGES.map((lang) => (
                        <option key={lang.code || "none"} value={lang.code}>
                          {lang.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="setting-row">
                  <label>
                    <span>Subtitle behaviour</span>
                    <select
                      value={prefs.subtitleMode}
                      onChange={(event) => {
                        const value = event.target.value as SubtitleMode;
                        log.info("Subtitle mode changed", { value });
                        updatePrefs((c) => ({ ...c, subtitleMode: value }));
                      }}
                    >
                      {(Object.keys(SUBTITLE_MODE_LABELS) as SubtitleMode[]).map((id) => (
                        <option key={id} value={id}>
                          {SUBTITLE_MODE_LABELS[id]}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </div>

              <div className="settings-subsection">
                <span className="detail-section-label">Devices</span>
                <p className="settings-note">
                  Glassfin can play to this browser today. Discovery of other
                  Jellyfin clients on your network (TVs, mobile apps) is on
                  the roadmap.
                </p>
                <div className="device-list">
                  <button
                    className={`device-row ${selectedDevice.id === localPlaybackDevice.id ? "active" : ""}`}
                    onClick={() => onSelectDevice(localPlaybackDevice)}
                    type="button"
                  >
                    <span>
                      <strong>{localPlaybackDevice.name}</strong>
                      <small>{localPlaybackDevice.type}</small>
                    </span>
                    <em>{localPlaybackDevice.status}</em>
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeCategory === "libraries" && (
            <div className="settings-section">
              <h2>Libraries</h2>
              {!isAuthenticated ? (
                <p className="settings-note">
                  Connect to a Jellyfin server first to manage your libraries.
                </p>
              ) : (
                <>
                  <p className="settings-note">
                    Each row is a library defined in your Jellyfin server. Hide
                    one to drop it from the dashboard, search, and filtered
                    library views — useful when an admin has shared more
                    libraries than you actually use.
                  </p>

                  {viewsError && (
                    <p className="library-error" role="alert">{viewsError}</p>
                  )}

                  {!views && !viewsError && (
                    <div className="nav-toggle-list">
                      {[0, 1, 2].map((i) => (
                        <div className="nav-toggle-row" key={i}>
                          <span>
                            <strong style={{ opacity: 0.4 }}>Loading…</strong>
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  {views && views.length === 0 && (
                    <div className="empty-state">
                      <strong>No libraries shared with this user.</strong>
                      <p>Ask the Jellyfin admin to grant access to a library.</p>
                    </div>
                  )}

                  {views && views.length > 0 && (
                    <div className="nav-toggle-list">
                      {views.map((view) => {
                        const hidden = hiddenLibrarySet.has(view.Id);
                        return (
                          <label className="nav-toggle-row" key={view.Id}>
                            <span>
                              <strong>{view.Name}</strong>
                              <small>{view.Type ?? "Library"}</small>
                            </span>
                            <input
                              type="checkbox"
                              checked={!hidden}
                              onChange={(event) => {
                                log.info("Toggle library visibility", {
                                  id: view.Id,
                                  name: view.Name,
                                  visible: event.target.checked,
                                });
                                setLibraryIdHidden(view.Id, !event.target.checked);
                              }}
                              aria-label={`Show ${view.Name}`}
                            />
                          </label>
                        );
                      })}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {activeCategory === "servers" && (
            <div className="settings-section">
              <h2>Companion servers</h2>
              <p className="settings-note">
                Glassfin can talk to Sonarr (TV) and Radarr (movies) so you
                can request titles when a search misses. Configure them via
                runtime config (<code>SONARR_URL</code>, <code>SONARR_API_KEY</code>,{" "}
                <code>RADARR_URL</code>, <code>RADARR_API_KEY</code>) — they appear
                here once both URL and key are set for a service.
              </p>

              {(["sonarr", "radarr"] as ArrService[]).map((service) => {
                const arr = service === "sonarr" ? arrClients.sonarr : arrClients.radarr;
                const status = arrStatus[service];
                const label = service === "sonarr" ? "Sonarr" : "Radarr";
                const purpose = service === "sonarr" ? "TV series" : "Movies";
                return (
                  <div className="server-card" key={service}>
                    <span>{label}</span>
                    {!arr ? (
                      <>
                        <strong>Not configured</strong>
                        <small>
                          Set <code>{service.toUpperCase()}_URL</code> and{" "}
                          <code>{service.toUpperCase()}_API_KEY</code> in runtime config to
                          enable {purpose} requests.
                        </small>
                      </>
                    ) : (
                      <>
                        <strong>{arr.connection.baseUrl}</strong>
                        <small>
                          {purpose} ·{" "}
                          {status.state === "idle" && "Click Test to verify."}
                          {status.state === "testing" && "Testing…"}
                          {status.state === "ok" && (
                            <span style={{ color: "#7be08c" }}>Connected — {status.message}</span>
                          )}
                          {status.state === "error" && (
                            <span style={{ color: "#ff8a8a" }}>{status.message}</span>
                          )}
                        </small>
                        <button
                          className="text-button"
                          type="button"
                          disabled={status.state === "testing"}
                          onClick={() => void testArr(service)}
                        >
                          Test connection
                        </button>
                      </>
                    )}
                  </div>
                );
              })}

              {!arrClients.sonarr && !arrClients.radarr && (
                <p className="settings-note">
                  Once at least one is configured, the search empty state
                  will offer to request missing titles.
                </p>
              )}
            </div>
          )}

          {activeCategory === "tasks" && (
            <div className="settings-section">
              <h2>Scheduled Tasks</h2>
              <p className="settings-note">Sync jobs, metadata scans, and library refresh scheduling will appear here. Requires Jellyfin admin access.</p>
            </div>
          )}

          {activeCategory === "display" && (
            <div className="settings-section">
              <h2>Display</h2>

              <div className="settings-subsection">
                <span className="detail-section-label">Navigation</span>
                <p className="settings-note">
                  Hide library tabs you don't use. Home and Settings are always
                  visible.
                </p>
                <div className="nav-toggle-list">
                  {togglableNavTabs.map((tab) => {
                    const hidden = hiddenTabSet.has(tab.id);
                    return (
                      <label className="nav-toggle-row" key={tab.id}>
                        <span>
                          <strong>{tab.label}</strong>
                          <small>{tab.path}</small>
                        </span>
                        <input
                          type="checkbox"
                          checked={!hidden}
                          onChange={(event) => {
                            log.info("Toggle nav tab visibility", {
                              tab: tab.id,
                              visible: event.target.checked,
                            });
                            setLibraryTabHidden(tab.id as LibraryTab, !event.target.checked);
                          }}
                          aria-label={`Show ${tab.label} tab`}
                        />
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="settings-subsection">
                <span className="detail-section-label">Accent</span>
                <p className="settings-note">
                  The colour of buttons, focus rings, and active states.
                  Drag the hue ring or the saturation/value square; presets
                  are below for one-click options. Plugins can override this
                  — see the Sunset built-in.
                </p>
                <ColorWheel
                  value={prefs.accentColor ?? "#4f9bff"}
                  onChange={(hex) => {
                    updatePrefs((c) => ({ ...c, accentColor: hex }));
                  }}
                />
                <div className="accent-grid">
                  {ACCENT_PRESETS.map((preset) => {
                    const isActive = (prefs.accentColor ?? null) === preset.value;
                    return (
                      <button
                        key={preset.label}
                        type="button"
                        className={`accent-swatch ${isActive ? "is-active" : ""}`}
                        style={
                          preset.value
                            ? { background: preset.value }
                            : { background: "linear-gradient(135deg, #4f9bff, #6ea8ff)" }
                        }
                        onClick={() => {
                          log.info("Accent preset picked", { color: preset.value });
                          updatePrefs((c) => ({ ...c, accentColor: preset.value }));
                        }}
                        aria-pressed={isActive}
                        aria-label={preset.label}
                        title={preset.label}
                      >
                        {isActive && <span className="accent-tick" aria-hidden="true">✓</span>}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="settings-subsection">
                <span className="detail-section-label">Layout density</span>
                <p className="settings-note">
                  Tunes spacing on the home rails and library grid. Doesn't
                  affect the player or detail page.
                </p>
                <div className="setting-row">
                  <label>
                    <span>Density</span>
                    <select
                      value={prefs.layoutDensity}
                      onChange={(event) => {
                        const value = event.target.value as LayoutDensity;
                        log.info("Layout density changed", { value });
                        updatePrefs((c) => ({ ...c, layoutDensity: value }));
                      }}
                    >
                      {(Object.keys(DENSITY_LABELS) as LayoutDensity[]).map((id) => (
                        <option key={id} value={id}>
                          {DENSITY_LABELS[id]}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </div>

              <div className="settings-subsection">
                <span className="detail-section-label">Motion</span>
                <p className="settings-note">
                  Glassfin already respects your OS reduce-motion setting.
                  Toggle this on to force motion off regardless.
                </p>
                <label className="nav-toggle-row">
                  <span>
                    <strong>Reduce motion</strong>
                    <small>Disable animations and transitions</small>
                  </span>
                  <input
                    type="checkbox"
                    checked={prefs.reduceMotion}
                    onChange={(event) => {
                      log.info("Reduce motion toggled", { value: event.target.checked });
                      updatePrefs((c) => ({ ...c, reduceMotion: event.target.checked }));
                    }}
                    aria-label="Reduce motion"
                  />
                </label>
              </div>
            </div>
          )}

          {activeCategory === "plugins" && (
            <div className="settings-section">
              <h2>Plugins</h2>
              <p className="settings-note">
                Plugins extend Glassfin with custom themes, settings panels, and integrations. Drop a
                plugin URL into <code>window.__GLASSFIN_PLUGINS__</code> via runtime config to load
                additional ones at startup, or install a built-in below. See <code>src/plugins.ts</code> for
                the public API.
              </p>

              <div className="plugin-section">
                <span className="detail-section-label">Installed</span>
                {plugins.length === 0 ? (
                  <div className="empty-state">
                    <strong>No plugins installed.</strong>
                    <p>Install a built-in plugin below or load one via runtime config.</p>
                  </div>
                ) : (
                  <div className="plugin-list">
                    {plugins.map((plugin) => {
                      const ownPanels = registry.panelsFor(plugin.manifest.id);
                      return (
                        <div className="plugin-card" key={plugin.manifest.id}>
                          <div className="plugin-card-head">
                            <div>
                              <strong>{plugin.manifest.name}</strong>
                              <small>{plugin.manifest.description}</small>
                              {plugin.manifest.author && (
                                <small>by {plugin.manifest.author}</small>
                              )}
                            </div>
                            <div className="plugin-card-actions">
                              <em>v{plugin.manifest.version}</em>
                              <button
                                type="button"
                                className="text-button"
                                onClick={() => {
                                  log.info("Uninstall plugin", { id: plugin.manifest.id });
                                  registry.uninstall(plugin.manifest.id);
                                }}
                              >
                                Uninstall
                              </button>
                            </div>
                          </div>
                          {ownPanels.length > 0 && (
                            <div className="plugin-card-panels">
                              {ownPanels.map((panel) => (
                                <div className="plugin-card-panel" key={panel.id}>
                                  <span className="detail-section-label">{panel.label}</span>
                                  <div
                                    className="plugin-panel-host"
                                    // Plugins are user-installed code that already
                                    // ran arbitrary JS at install. Trust boundary
                                    // is the install action; HTML output is fine.
                                    // Reads panelTick so a re-render refreshes
                                    // dynamic panel HTML (e.g., elapsed time).
                                    data-tick={panelTick}
                                    dangerouslySetInnerHTML={{ __html: panel.render() }}
                                  />
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="plugin-section">
                <span className="detail-section-label">Built-in plugins</span>
                <div className="plugin-list">
                  {builtInPlugins.map((entry) => {
                    const installed = registry.has(entry.id);
                    const busy = installingId === entry.id;
                    return (
                      <div className="plugin-card" key={entry.id}>
                        <div className="plugin-card-head">
                          <div>
                            <strong>{entry.name}</strong>
                            <small>{entry.description}</small>
                          </div>
                          <div className="plugin-card-actions">
                            <button
                              type="button"
                              className="secondary-button"
                              disabled={installed || busy}
                              onClick={async () => {
                                if (installed || busy) return;
                                setInstallingId(entry.id);
                                log.info("Install built-in plugin", { id: entry.id });
                                try {
                                  const plugin = await entry.load();
                                  await registry.install(plugin);
                                } catch (error) {
                                  log.error("Built-in plugin install failed", error);
                                } finally {
                                  setInstallingId(null);
                                }
                              }}
                            >
                              {installed ? "Installed" : busy ? "Installing…" : "Install"}
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {activeCategory === "logs" && <LogsPanel />}

          {activeCategory === "about" && (
            <div className="settings-section">
              <h2>About</h2>

              <div className="settings-subsection">
                <span className="detail-section-label">Glassfin</span>
                <div className="server-card">
                  <span>Version</span>
                  <strong>{appVersion?.version ?? "0.1.0"}</strong>
                  <small>
                    {appVersion?.gitSha && appVersion.gitSha !== "unknown"
                      ? `Build ${appVersion.gitSha}${appVersion.builtAt && appVersion.builtAt !== "unknown" ? ` · ${appVersion.builtAt}` : ""}`
                      : "Development build (no /version.json — running outside the container?)"}
                  </small>
                </div>
                <div className="server-card">
                  <span>Stack</span>
                  <strong>React + TypeScript + Vite</strong>
                  <small>Static PWA media client for Jellyfin</small>
                </div>
                <div className="server-card">
                  <span>Player engine</span>
                  <strong>@vidstack/react</strong>
                  <small>HLS-aware, custom glass-themed transport</small>
                </div>
              </div>

              <div className="settings-subsection">
                <span className="detail-section-label">Jellyfin server</span>
                {!isAuthenticated && (
                  <p className="settings-note">
                    Sign in under Connection to see server details.
                  </p>
                )}
                {isAuthenticated && serverInfoError && (
                  <p className="library-error" role="alert">{serverInfoError}</p>
                )}
                {isAuthenticated && !serverInfo && !serverInfoError && (
                  <p className="settings-note">Loading server info…</p>
                )}
                {isAuthenticated && serverInfo && (
                  <>
                    <div className="server-card">
                      <span>Server name</span>
                      <strong>{serverInfo.ServerName ?? "—"}</strong>
                    </div>
                    <div className="server-card">
                      <span>Jellyfin version</span>
                      <strong>{serverInfo.Version ?? "—"}</strong>
                      <small>{serverInfo.ProductName ?? "Jellyfin"}</small>
                    </div>
                    <div className="server-card">
                      <span>Operating system</span>
                      <strong>{serverInfo.OperatingSystem ?? "—"}</strong>
                    </div>
                    <div className="server-card">
                      <span>Server ID</span>
                      <strong style={{ fontFamily: "ui-monospace, Menlo, monospace", fontSize: "0.85rem" }}>
                        {serverInfo.Id ?? "—"}
                      </strong>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

export default SettingsPage;
