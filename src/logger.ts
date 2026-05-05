/*
  Glassfin logger.

  Level ordering (least to most verbose):
    silent < error < warn < info < debug < trace

  - The active level filters BOTH console output and the in-app ring buffer.
  - The ring buffer is what Settings → Logs renders, so users can grab a
    snapshot to share when something's wrong.
  - Persisted to localStorage under "glassfin.logLevel".

  Why a custom logger and not just console.log?
  - Bug reports need a level slider and a "copy logs" button. console alone
    can't surface that to non-developer users.
  - Throughout this app we want consistent prefixes ([auth], [jellyfin], etc.)
    so we can grep one stream.
*/

export type LogLevel = "silent" | "error" | "warn" | "info" | "debug" | "trace";

export const LOG_LEVELS: LogLevel[] = ["silent", "error", "warn", "info", "debug", "trace"];

const ORDER: Record<LogLevel, number> = {
  silent: 0,
  error: 1,
  warn: 2,
  info: 3,
  debug: 4,
  trace: 5,
};

export type LogEntry = {
  ts: number;
  level: Exclude<LogLevel, "silent">;
  scope: string;
  message: string;
  data?: unknown;
};

const STORAGE_KEY = "glassfin.logLevel";
const BUFFER_LIMIT = 1000;

function readPersistedLevel(): LogLevel {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw && (LOG_LEVELS as string[]).includes(raw)) return raw as LogLevel;
  } catch {
    /* ignore — private browsing, etc. */
  }
  return "info";
}

class Logger {
  private level: LogLevel = readPersistedLevel();
  private buffer: LogEntry[] = [];
  private listeners = new Set<() => void>();

  getLevel(): LogLevel {
    return this.level;
  }

  setLevel(level: LogLevel) {
    this.level = level;
    try {
      window.localStorage.setItem(STORAGE_KEY, level);
    } catch {
      /* ignore */
    }
    this.notify();
  }

  entries(): LogEntry[] {
    return this.buffer.slice();
  }

  clear() {
    this.buffer = [];
    this.notify();
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  scope(scope: string) {
    return {
      error: (message: string, data?: unknown) => this.log("error", scope, message, data),
      warn: (message: string, data?: unknown) => this.log("warn", scope, message, data),
      info: (message: string, data?: unknown) => this.log("info", scope, message, data),
      debug: (message: string, data?: unknown) => this.log("debug", scope, message, data),
      trace: (message: string, data?: unknown) => this.log("trace", scope, message, data),
    };
  }

  private log(level: Exclude<LogLevel, "silent">, scope: string, message: string, data?: unknown) {
    if (ORDER[level] > ORDER[this.level]) return;

    const entry: LogEntry = { ts: Date.now(), level, scope, message, data };
    this.buffer.push(entry);
    if (this.buffer.length > BUFFER_LIMIT) {
      this.buffer.splice(0, this.buffer.length - BUFFER_LIMIT);
    }

    const prefix = `[${scope}]`;
    if (level === "error") console.error(prefix, message, data ?? "");
    else if (level === "warn") console.warn(prefix, message, data ?? "");
    else if (level === "info") console.info(prefix, message, data ?? "");
    else console.debug(prefix, message, data ?? "");

    this.notify();
  }

  private notify() {
    for (const listener of this.listeners) listener();
  }
}

export const logger = new Logger();

/** Format an entry for the in-app Logs view or for clipboard export. */
export function formatLogEntry(entry: LogEntry): string {
  const time = new Date(entry.ts).toISOString().slice(11, 23);
  const dataStr = entry.data === undefined ? "" : ` ${safeStringify(entry.data)}`;
  return `${time} ${entry.level.toUpperCase().padEnd(5)} [${entry.scope}] ${entry.message}${dataStr}`;
}

function safeStringify(value: unknown): string {
  try {
    if (value instanceof Error) {
      return JSON.stringify({ name: value.name, message: value.message, stack: value.stack });
    }
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
