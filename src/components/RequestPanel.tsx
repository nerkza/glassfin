import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { IconCheckmarkCircleFill, IconPlusCircle, IconXmark } from "symbols-react";
import {
  type ArrLookupResult,
  type ArrService,
  type QualityProfile,
  type RootFolder,
  type SonarrClient,
  type RadarrClient,
} from "../arr";
import { logger } from "../logger";

const log = logger.scope("request-panel");

/*
  Modal that surfaces Sonarr / Radarr lookup results when the user searches
  Glassfin and Jellyfin returned no matches. The user picks a result, picks
  a quality profile + root folder, hits Add — the *arr instance grabs the
  download. Jellyfin scans it later.

  Auth is handled in the *arr clients via runtime-config API keys; this
  component only orchestrates calls.
*/

type Service = {
  kind: ArrService;
  label: string;
  client: SonarrClient | RadarrClient;
};

type AddState =
  | { state: "idle" }
  | { state: "submitting"; itemId: number }
  | { state: "success"; itemId: number; title: string }
  | { state: "error"; itemId: number; message: string };

function RequestPanel({
  query,
  sonarr,
  radarr,
  onClose,
}: {
  query: string;
  sonarr: SonarrClient | null;
  radarr: RadarrClient | null;
  onClose: () => void;
}) {
  // The user can flip between Sonarr (TV) and Radarr (movies) when both
  // are configured. When only one is configured we lock to it.
  const services: Service[] = [];
  if (sonarr) services.push({ kind: "sonarr", label: "TV (Sonarr)", client: sonarr });
  if (radarr) services.push({ kind: "radarr", label: "Movies (Radarr)", client: radarr });

  const [activeService, setActiveService] = useState<Service | undefined>(services[0]);

  const [results, setResults] = useState<ArrLookupResult[] | null>(null);
  const [resultsError, setResultsError] = useState<string | null>(null);
  const [profiles, setProfiles] = useState<QualityProfile[]>([]);
  const [rootFolders, setRootFolders] = useState<RootFolder[]>([]);
  const [profileId, setProfileId] = useState<number | null>(null);
  const [rootPath, setRootPath] = useState<string | null>(null);
  const [searchOnAdd, setSearchOnAdd] = useState(true);
  const [addState, setAddState] = useState<AddState>({ state: "idle" });

  // Lookup. Keyed on (service, query) so flipping between services or
  // refining the query refetches without us holding stale results.
  useEffect(() => {
    if (!activeService) return;
    let cancelled = false;
    setResults(null);
    setResultsError(null);
    log.info("Looking up", { service: activeService.kind, query });
    void activeService.client
      .lookup(query)
      .then((items) => {
        if (cancelled) return;
        setResults(items);
      })
      .catch((err) => {
        if (cancelled) return;
        log.error("Lookup failed", err);
        setResultsError(err instanceof Error ? err.message : "Lookup failed");
      });
    return () => {
      cancelled = true;
    };
  }, [activeService, query]);

  // Profiles + root folders are server-config that rarely changes — we
  // fetch once per service open and cache locally.
  useEffect(() => {
    if (!activeService) return;
    let cancelled = false;
    setProfiles([]);
    setRootFolders([]);
    setProfileId(null);
    setRootPath(null);
    void Promise.all([
      activeService.client.getQualityProfiles(),
      activeService.client.getRootFolders(),
    ])
      .then(([qp, rf]) => {
        if (cancelled) return;
        setProfiles(qp);
        setRootFolders(rf);
        if (qp.length > 0) setProfileId(qp[0].id);
        if (rf.length > 0) setRootPath(rf[0].path);
      })
      .catch((err) => {
        if (cancelled) return;
        log.error("Profile / root folder fetch failed", err);
      });
    return () => {
      cancelled = true;
    };
  }, [activeService]);

  // Esc closes the panel — same convention as DetailPage / PlayerOverlay.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!activeService) {
    // Caller should already gate on having at least one service configured,
    // but defensively render nothing rather than crashing.
    return null;
  }

  async function submitAdd(item: ArrLookupResult) {
    if (!activeService || !profileId || !rootPath) return;
    setAddState({ state: "submitting", itemId: item.externalId });
    try {
      const options = {
        qualityProfileId: profileId,
        rootFolderPath: rootPath,
        monitored: true,
        searchOnAdd,
      };
      if (activeService.kind === "sonarr") {
        await (activeService.client as SonarrClient).addSeries(item, options);
      } else {
        await (activeService.client as RadarrClient).addMovie(item, options);
      }
      log.info("Add succeeded", { service: activeService.kind, title: item.title });
      setAddState({ state: "success", itemId: item.externalId, title: item.title });
    } catch (err) {
      log.error("Add failed", err);
      setAddState({
        state: "error",
        itemId: item.externalId,
        message: err instanceof Error ? err.message : "Add failed",
      });
    }
  }

  return (
    <motion.div
      className="request-backdrop"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <motion.section
        className="request-panel glass-panel"
        role="dialog"
        aria-label="Request a title"
        initial={{ opacity: 0, y: 16, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 8, scale: 0.98 }}
        transition={{ type: "spring", stiffness: 220, damping: 26 }}
      >
        <header className="request-header">
          <div>
            <span className="eyebrow">Request</span>
            <h2>Looking for "{query}"?</h2>
            <p>
              Search your Sonarr / Radarr instance for this title and queue
              it for download. Jellyfin will pick it up after the next scan.
            </p>
          </div>
          <button className="player-icon-button" type="button" onClick={onClose} aria-label="Close">
            <IconXmark width={18} height={18} />
          </button>
        </header>

        {services.length > 1 && (
          <div className="request-tabs" role="tablist">
            {services.map((s) => (
              <button
                key={s.kind}
                role="tab"
                type="button"
                aria-selected={s.kind === activeService.kind}
                className={`request-tab ${s.kind === activeService.kind ? "is-active" : ""}`}
                onClick={() => setActiveService(s)}
              >
                {s.label}
              </button>
            ))}
          </div>
        )}

        <div className="request-config">
          <label>
            <span>Quality profile</span>
            <select
              value={profileId ?? ""}
              onChange={(event) => setProfileId(Number(event.target.value) || null)}
              disabled={profiles.length === 0}
            >
              {profiles.length === 0 && <option value="">Loading…</option>}
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Root folder</span>
            <select
              value={rootPath ?? ""}
              onChange={(event) => setRootPath(event.target.value || null)}
              disabled={rootFolders.length === 0}
            >
              {rootFolders.length === 0 && <option value="">Loading…</option>}
              {rootFolders.map((rf) => (
                <option key={rf.id} value={rf.path}>
                  {rf.path}
                </option>
              ))}
            </select>
          </label>
          <label className="request-config-checkbox">
            <input
              type="checkbox"
              checked={searchOnAdd}
              onChange={(event) => setSearchOnAdd(event.target.checked)}
            />
            <span>Search and download immediately after adding</span>
          </label>
        </div>

        <div className="request-results">
          {resultsError && <p className="library-error" role="alert">{resultsError}</p>}
          {!results && !resultsError && (
            <div className="request-loading">Searching {activeService.label}…</div>
          )}
          {results && results.length === 0 && (
            <div className="empty-state">
              <strong>No results.</strong>
              <p>Try a different spelling or strip year / season info.</p>
            </div>
          )}
          {results && results.length > 0 && (
            <ul className="request-list">
              {results.slice(0, 12).map((item) => {
                const submitting =
                  addState.state === "submitting" && addState.itemId === item.externalId;
                const succeeded =
                  addState.state === "success" && addState.itemId === item.externalId;
                const errored =
                  addState.state === "error" && addState.itemId === item.externalId;
                const disabled =
                  item.alreadyAdded || submitting || succeeded || !profileId || !rootPath;
                return (
                  <li className="request-row" key={`${activeService.kind}-${item.externalId}`}>
                    <div className="request-poster">
                      {item.posterUrl ? (
                        <img src={item.posterUrl} alt="" loading="lazy" />
                      ) : (
                        <div className="request-poster-fallback" aria-hidden="true" />
                      )}
                    </div>
                    <div className="request-row-copy">
                      <strong>
                        {item.title}
                        {item.year ? <small> · {item.year}</small> : null}
                      </strong>
                      {item.overview && <p>{item.overview}</p>}
                      {errored && <p className="request-row-error">{addState.message}</p>}
                    </div>
                    <div className="request-row-action">
                      {item.alreadyAdded ? (
                        <span className="request-already">
                          <IconCheckmarkCircleFill width={14} height={14} />
                          Already added
                        </span>
                      ) : succeeded ? (
                        <span className="request-already" style={{ color: "#7be08c" }}>
                          <IconCheckmarkCircleFill width={14} height={14} />
                          Added
                        </span>
                      ) : (
                        <button
                          className="primary-button"
                          type="button"
                          disabled={disabled}
                          onClick={() => void submitAdd(item)}
                        >
                          <IconPlusCircle width={14} height={14} />
                          {submitting ? "Adding…" : "Add"}
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </motion.section>
    </motion.div>
  );
}

export default RequestPanel;
