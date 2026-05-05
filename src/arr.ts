/*
  Sonarr / Radarr API clients.

  Sonarr (TV) and Radarr (movies) expose nearly-identical REST surfaces at
  /api/v3. We share a small base class for request boilerplate (auth header,
  timeout, logging) and override only the type-specific paths.

  Why both: most self-hosters running Jellyfin run *arrs alongside it. When a
  user searches Glassfin and we don't have the title, the ideal next click
  is "request it" — without leaving the app. The integration is opt-in via
  runtime config (SONARR_URL + SONARR_API_KEY for one, RADARR_URL +
  RADARR_API_KEY for the other). When both vars are set for a service, the
  service is "enabled" and the request affordance lights up.

  This is NOT a full *arr client — it's the minimum surface for the
  request-from-search flow:
    - lookup(term)        : ask the *arr to search its metadata source
    - getQualityProfiles  : list quality profiles for the dropdown
    - getRootFolders      : list root folders (needed for add)
    - add(payload)        : POST a new series/movie record
    - testConnection      : ping the system endpoint, used by Settings
*/

import { logger } from "./logger";
import { getRuntimeConfig } from "./runtimeConfig";

const REQUEST_TIMEOUT_MS = 20_000;

export type ArrService = "sonarr" | "radarr";

export type ArrConnection = {
  service: ArrService;
  baseUrl: string;
  apiKey: string;
};

export type ArrLookupResult = {
  /** TVDB id (Sonarr) or TMDB id (Radarr). Used as the primary identifier
   *  when adding the item. */
  externalId: number;
  title: string;
  year?: number;
  overview?: string;
  posterUrl?: string;
  /** Already exists in the *arr instance (so probably already requested
   *  or downloaded) — UI can disable the Add button for these. */
  alreadyAdded: boolean;
  /** Raw lookup payload — passed back into add() so we don't have to
   *  reconstruct fields the *arr expects. */
  raw: unknown;
};

export type QualityProfile = { id: number; name: string };
export type RootFolder = { id: number; path: string; freeSpace?: number };

export type AddOptions = {
  qualityProfileId: number;
  rootFolderPath: string;
  monitored: boolean;
  /** Sonarr only — search now after add (true) vs. just add to monitored
   *  list (false). Radarr accepts the same flag in its add payload. */
  searchOnAdd: boolean;
};

class ArrClient {
  protected readonly log;
  constructor(public readonly connection: ArrConnection) {
    this.log = logger.scope(connection.service);
  }

  get isEnabled() {
    return !!(this.connection.baseUrl && this.connection.apiKey);
  }

  protected get baseUrl() {
    return this.connection.baseUrl.replace(/\/$/, "");
  }

  protected async request(path: string, init?: RequestInit) {
    const url = `${this.baseUrl}${path}`;
    const headers = new Headers(init?.headers);
    headers.set("X-Api-Key", this.connection.apiKey);
    headers.set("Content-Type", "application/json");

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    const startedAt = performance.now();
    const method = init?.method ?? "GET";

    this.log.debug(`→ ${method} ${path}`);
    try {
      const response = await fetch(url, { ...init, headers, signal: controller.signal });
      const durationMs = Math.round(performance.now() - startedAt);
      if (!response.ok) {
        const body = await response.text().catch(() => "");
        this.log.error(`← ${method} ${path} failed`, {
          status: response.status,
          durationMs,
          body: body.slice(0, 280),
        });
        throw new Error(`${this.connection.service} request failed: ${response.status}`);
      }
      this.log.debug(`← ${method} ${path} ${response.status} (${durationMs}ms)`);
      return response.json();
    } catch (error) {
      if ((error as Error).name === "AbortError") {
        this.log.error(`× ${method} ${path} timed out after ${REQUEST_TIMEOUT_MS}ms`);
        throw new Error(`${this.connection.service} request timed out`);
      }
      throw error;
    } finally {
      window.clearTimeout(timeoutId);
    }
  }

  /**
   * Cheap unauthenticated-ish ping that we use to verify the URL + key are
   * good. /system/status returns a small JSON blob with the *arr's version.
   */
  async testConnection(): Promise<{ version?: string }> {
    return this.request(`/api/v3/system/status`);
  }

  async getQualityProfiles(): Promise<QualityProfile[]> {
    return this.request(`/api/v3/qualityprofile`);
  }

  async getRootFolders(): Promise<RootFolder[]> {
    return this.request(`/api/v3/rootfolder`);
  }
}

export class SonarrClient extends ArrClient {
  constructor(connection: Omit<ArrConnection, "service">) {
    super({ ...connection, service: "sonarr" });
  }

  async lookup(term: string): Promise<ArrLookupResult[]> {
    if (!term.trim()) return [];
    const params = new URLSearchParams({ term: term.trim() });
    const raw = (await this.request(
      `/api/v3/series/lookup?${params.toString()}`,
    )) as Array<Record<string, unknown>>;
    return raw.map((entry) => ({
      externalId: Number(entry.tvdbId ?? 0),
      title: String(entry.title ?? "Unknown"),
      year: typeof entry.year === "number" ? entry.year : undefined,
      overview: typeof entry.overview === "string" ? entry.overview : undefined,
      posterUrl: this.pickPoster(entry),
      alreadyAdded: Number((entry as { id?: number }).id ?? 0) > 0,
      raw: entry,
    }));
  }

  async addSeries(item: ArrLookupResult, options: AddOptions): Promise<void> {
    const raw = item.raw as Record<string, unknown>;
    const payload = {
      ...raw,
      qualityProfileId: options.qualityProfileId,
      rootFolderPath: options.rootFolderPath,
      monitored: options.monitored,
      addOptions: {
        searchForMissingEpisodes: options.searchOnAdd,
        searchForCutoffUnmetEpisodes: false,
        monitor: "all",
      },
    };
    await this.request(`/api/v3/series`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  private pickPoster(entry: Record<string, unknown>): string | undefined {
    const images = entry.images as Array<{ coverType?: string; remoteUrl?: string; url?: string }> | undefined;
    if (!Array.isArray(images)) return undefined;
    const poster = images.find((i) => i.coverType === "poster");
    return poster?.remoteUrl || poster?.url;
  }
}

export class RadarrClient extends ArrClient {
  constructor(connection: Omit<ArrConnection, "service">) {
    super({ ...connection, service: "radarr" });
  }

  async lookup(term: string): Promise<ArrLookupResult[]> {
    if (!term.trim()) return [];
    const params = new URLSearchParams({ term: term.trim() });
    const raw = (await this.request(
      `/api/v3/movie/lookup?${params.toString()}`,
    )) as Array<Record<string, unknown>>;
    return raw.map((entry) => ({
      externalId: Number(entry.tmdbId ?? 0),
      title: String(entry.title ?? "Unknown"),
      year: typeof entry.year === "number" ? entry.year : undefined,
      overview: typeof entry.overview === "string" ? entry.overview : undefined,
      posterUrl: this.pickPoster(entry),
      alreadyAdded: Number((entry as { id?: number }).id ?? 0) > 0,
      raw: entry,
    }));
  }

  async addMovie(item: ArrLookupResult, options: AddOptions): Promise<void> {
    const raw = item.raw as Record<string, unknown>;
    const payload = {
      ...raw,
      qualityProfileId: options.qualityProfileId,
      rootFolderPath: options.rootFolderPath,
      monitored: options.monitored,
      addOptions: {
        searchForMovie: options.searchOnAdd,
      },
    };
    await this.request(`/api/v3/movie`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  private pickPoster(entry: Record<string, unknown>): string | undefined {
    const images = entry.images as Array<{ coverType?: string; remoteUrl?: string; url?: string }> | undefined;
    if (!Array.isArray(images)) return undefined;
    const poster = images.find((i) => i.coverType === "poster");
    return poster?.remoteUrl || poster?.url;
  }
}

/**
 * Build configured clients from runtime config. Returns null for any service
 * that's not configured (URL or key missing). Callers handle the null case
 * by hiding their UI.
 */
export function getArrClients(): { sonarr: SonarrClient | null; radarr: RadarrClient | null } {
  const cfg = getRuntimeConfig();
  const sonarr =
    cfg.sonarrUrl && cfg.sonarrApiKey
      ? new SonarrClient({ baseUrl: cfg.sonarrUrl, apiKey: cfg.sonarrApiKey })
      : null;
  const radarr =
    cfg.radarrUrl && cfg.radarrApiKey
      ? new RadarrClient({ baseUrl: cfg.radarrUrl, apiKey: cfg.radarrApiKey })
      : null;
  return { sonarr, radarr };
}
