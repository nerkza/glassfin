import { useEffect, useMemo, useRef, useState } from "react";
import { LOG_LEVELS, type LogLevel, formatLogEntry, logger } from "../logger";

const LEVEL_LABEL: Record<LogLevel, string> = {
  silent: "Silent — no logs",
  error: "Errors only",
  warn: "Warnings + errors",
  info: "Info (recommended)",
  debug: "Debug — request URLs + lifecycle",
  trace: "Trace — full response bodies (verbose)",
};

const LEVEL_TONE: Record<string, string> = {
  ERROR: "var(--danger)",
  WARN: "var(--warning)",
  INFO: "var(--text)",
  DEBUG: "var(--text-secondary)",
  TRACE: "var(--text-tertiary)",
};

function LogsPanel() {
  const [level, setLevelState] = useState<LogLevel>(logger.getLevel());
  const [entries, setEntries] = useState(logger.entries());
  const [filter, setFilter] = useState("");
  const [autoScroll, setAutoScroll] = useState(true);
  const [copyState, setCopyState] = useState<"idle" | "copied">("idle");
  const tailRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    return logger.subscribe(() => setEntries(logger.entries()));
  }, []);

  useEffect(() => {
    if (autoScroll && tailRef.current) {
      tailRef.current.scrollTop = tailRef.current.scrollHeight;
    }
  }, [entries, autoScroll]);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter((entry) =>
      `${entry.scope} ${entry.message}`.toLowerCase().includes(q),
    );
  }, [entries, filter]);

  function changeLevel(next: LogLevel) {
    logger.setLevel(next);
    setLevelState(next);
  }

  async function copyAll() {
    const text = entries.map(formatLogEntry).join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopyState("copied");
      setTimeout(() => setCopyState("idle"), 1500);
    } catch {
      // Clipboard blocked (insecure context, etc.) — fall back to a hidden textarea.
      const textarea = document.createElement("textarea");
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopyState("copied");
      setTimeout(() => setCopyState("idle"), 1500);
    }
  }

  return (
    <div className="settings-section">
      <h2>Logs</h2>
      <p className="settings-note">
        In-app log buffer (last 1000 entries). Set the level higher when something's wrong, then{" "}
        <strong>retry the failing action</strong> and copy the logs.
      </p>

      <label className="connect-form" style={{ display: "grid", gap: 6 }}>
        Verbosity
        <select
          className="logs-select"
          value={level}
          onChange={(event) => changeLevel(event.target.value as LogLevel)}
        >
          {LOG_LEVELS.map((lvl) => (
            <option key={lvl} value={lvl}>
              {LEVEL_LABEL[lvl]}
            </option>
          ))}
        </select>
      </label>

      <div className="logs-toolbar">
        <input
          className="logs-filter"
          placeholder="Filter — scope or message"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
        />
        <label className="logs-checkbox">
          <input
            type="checkbox"
            checked={autoScroll}
            onChange={(event) => setAutoScroll(event.target.checked)}
          />
          Auto-scroll
        </label>
        <button className="secondary-button" type="button" onClick={copyAll}>
          {copyState === "copied" ? "Copied" : "Copy all"}
        </button>
        <button
          className="secondary-button"
          type="button"
          onClick={() => {
            logger.clear();
          }}
        >
          Clear
        </button>
        <button
          className="secondary-button"
          type="button"
          onClick={() => window.dispatchEvent(new Event("glassfin:show-live-log"))}
        >
          Show live dock
        </button>
      </div>

      <div className="logs-tail" ref={tailRef} role="log" aria-live="polite">
        {filtered.length === 0 ? (
          <div className="logs-empty">
            <strong>No log entries match.</strong>
            <p>
              {entries.length === 0
                ? "Increase verbosity above and retry the action you're investigating."
                : "Nothing matches the current filter. Clear it or widen the search."}
            </p>
          </div>
        ) : (
          filtered.map((entry, index) => {
            const time = new Date(entry.ts).toISOString().slice(11, 23);
            const levelKey = entry.level.toUpperCase();
            return (
              <div className="logs-row" key={`${entry.ts}-${index}`}>
                <span className="logs-time">{time}</span>
                <span className="logs-level" style={{ color: LEVEL_TONE[levelKey] }}>
                  {levelKey.padEnd(5)}
                </span>
                <span className="logs-scope">[{entry.scope}]</span>
                <span className="logs-message">
                  {entry.message}
                  {entry.data !== undefined && (
                    <span className="logs-data"> {safeJson(entry.data)}</span>
                  )}
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function safeJson(value: unknown): string {
  try {
    if (value instanceof Error) {
      return JSON.stringify({ name: value.name, message: value.message });
    }
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export default LogsPanel;
