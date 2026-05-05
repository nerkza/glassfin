import { useEffect, useState } from "react";
import { IconChevronDown, IconChevronUp, IconXmark } from "symbols-react";
import { logger, type LogEntry } from "../logger";

const STORAGE_KEY_VISIBLE = "glassfin.liveLog.visible";
const STORAGE_KEY_EXPANDED = "glassfin.liveLog.expanded";

const LEVEL_TONE: Record<string, string> = {
  error: "var(--danger)",
  warn: "var(--warning)",
  info: "var(--text)",
  debug: "var(--text-secondary)",
  trace: "var(--text-tertiary)",
};

function readBool(key: string, fallback: boolean): boolean {
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === "true") return true;
    if (raw === "false") return false;
  } catch {
    /* ignore */
  }
  return fallback;
}

function writeBool(key: string, value: boolean) {
  try {
    window.localStorage.setItem(key, String(value));
  } catch {
    /* ignore */
  }
}

/*
  Floating live-log dock.

  Sits in the bottom-right corner. Shows the last N log entries in real time
  so you can watch what's happening without opening Settings → Logs.

  - Toggle visibility from anywhere (the chip itself dismisses).
  - Collapsed: 1-line ticker showing only the most recent entry.
  - Expanded: full mini-tail (last 8 entries).
  - Hidden by default — appears once any error/warn lands, or when manually
    toggled from Settings → Logs.

  Visibility & expanded state both persist to localStorage.
*/
function LiveLogDock() {
  const [visible, setVisible] = useState(() => readBool(STORAGE_KEY_VISIBLE, false));
  const [expanded, setExpanded] = useState(() => readBool(STORAGE_KEY_EXPANDED, true));
  const [entries, setEntries] = useState<LogEntry[]>(logger.entries());

  // Subscribe to log entries to keep the displayed tail fresh. Notably this
  // is the ONLY place that updates state — auto-show on warn/error was
  // removed because it kept popping the dock back open after explicit
  // dismissal. The dock is now strictly opt-in: opened from
  // Settings → Logs (via the global "show-live-log" event), closed by the X.
  useEffect(() => {
    return logger.subscribe(() => {
      setEntries(logger.entries());
    });
  }, []);

  // Global "show" event fired from Settings → Logs etc.
  useEffect(() => {
    const onShow = () => {
      setVisible(true);
      writeBool(STORAGE_KEY_VISIBLE, true);
    };
    window.addEventListener("glassfin:show-live-log", onShow);
    return () => window.removeEventListener("glassfin:show-live-log", onShow);
  }, []);

  if (!visible) return null;

  const last = entries.at(-1);
  const tail = entries.slice(-8);

  return (
    <aside className="live-log-dock glass-panel" role="status" aria-live="polite">
      <header className="live-log-header">
        <span className="live-log-title">
          <span className="status-dot" style={{ background: "var(--accent-strong)" }} />
          Live log
        </span>
        <div className="live-log-actions">
          <button
            type="button"
            className="live-log-button"
            aria-label={expanded ? "Collapse" : "Expand"}
            onClick={() => {
              const next = !expanded;
              setExpanded(next);
              writeBool(STORAGE_KEY_EXPANDED, next);
            }}
          >
            {expanded ? <IconChevronDown width={14} height={14} /> : <IconChevronUp width={14} height={14} />}
          </button>
          <button
            type="button"
            className="live-log-button"
            aria-label="Hide live log"
            onClick={() => {
              setVisible(false);
              writeBool(STORAGE_KEY_VISIBLE, false);
            }}
          >
            <IconXmark width={14} height={14} />
          </button>
        </div>
      </header>
      {expanded ? (
        <div className="live-log-tail">
          {tail.length === 0 ? (
            <div className="live-log-empty">No log entries yet.</div>
          ) : (
            tail.map((entry, index) => {
              const time = new Date(entry.ts).toISOString().slice(11, 19);
              return (
                <div className="live-log-row" key={`${entry.ts}-${index}`}>
                  <span className="live-log-time">{time}</span>
                  <span className="live-log-level" style={{ color: LEVEL_TONE[entry.level] }}>
                    {entry.level.toUpperCase()}
                  </span>
                  <span className="live-log-scope">[{entry.scope}]</span>
                  <span className="live-log-message">{entry.message}</span>
                </div>
              );
            })
          )}
        </div>
      ) : (
        <div className="live-log-ticker">
          {last ? (
            <>
              <span className="live-log-level" style={{ color: LEVEL_TONE[last.level] }}>
                {last.level.toUpperCase()}
              </span>
              <span className="live-log-scope">[{last.scope}]</span>
              <span className="live-log-message">{last.message}</span>
            </>
          ) : (
            <span className="live-log-empty">No log entries yet.</span>
          )}
        </div>
      )}
    </aside>
  );
}

export default LiveLogDock;
