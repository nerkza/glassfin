import { getRuntimeConfig } from "./runtimeConfig";
import { logger } from "./logger";

const log = logger.scope("jellyfin");
const REQUEST_TIMEOUT_MS = 30_000;
export const DEFAULT_LIBRARY_PAGE_SIZE = 60;

// Fields shared between the library list and per-item detail fetch so direct
// URL hits / refreshes on /item/{id} get the same metadata depth as cards
// loaded via the rail.
const ITEM_FIELDS = [
  "Overview",
  "Tagline",
  "RunTimeTicks",
  "ProductionYear",
  "CommunityRating",
  "CriticRating",
  "OfficialRating",
  "Genres",
  "Studios",
  "ProviderIds",
  "People",
  "UserData",
  "MediaSources",
  // ChildCount surfaces "X seasons" / "X episodes" without an extra request.
  // SeriesId/SeasonId/IndexNumber/ParentIndexNumber are returned by default
  // for Episode/Season items but listing them keeps intent explicit.
  "ChildCount",
].join(",");

export type LibraryFilter = "all" | "movies" | "series" | "music";

const FILTER_TO_INCLUDE_TYPES: Record<LibraryFilter, string> = {
  all: "Movie,Series,Audio,MusicAlbum",
  movies: "Movie",
  series: "Series",
  music: "Audio,MusicAlbum",
};

export type LibraryQuery = {
  startIndex?: number;
  limit?: number;
  filter?: LibraryFilter;
  searchTerm?: string;
  sortBy?: string;
  sortOrder?: "Ascending" | "Descending";
  /** Filter to items tagged with ALL of these genre names (e.g. ["Drama"]).
   *  Used by the Genre facet page. */
  genres?: string[];
  /** Filter to items featuring ALL of these person ids (cast/crew). Used
   *  by the Person facet page. */
  personIds?: string[];
};

export type JellyfinConnection = {
  serverUrl: string;
  apiKey?: string;
  userId?: string;
  username?: string;
  password?: string;
  accessToken?: string;
};

export type JellyfinAuthResult = {
  User: {
    Id: string;
    Name: string;
    ServerId?: string;
  };
  AccessToken: string;
  ServerId?: string;
};

export type JellyfinPlaybackTarget = {
  itemId: string;
  deviceId?: string;
  startPositionTicks?: number;
};

export type ImageType = "Primary" | "Backdrop" | "Logo" | "Banner" | "Thumb";

export type JellyfinRemoteImage = {
  ProviderName: string;
  Url: string;
  ThumbnailUrl?: string;
  Width?: number;
  Height?: number;
  Language?: string;
  CommunityRating?: number;
  VoteCount?: number;
  Type: string;
};

export type JellyfinPublicUser = {
  Id: string;
  Name: string;
  HasPassword?: boolean;
  PrimaryImageTag?: string;
  ServerId?: string;
};

export type JellyfinPublicInfo = {
  Id?: string;
  ServerName?: string;
  Version?: string;
  ProductName?: string;
  OperatingSystem?: string;
  StartupWizardCompleted?: boolean;
};

export type JellyfinMediaStreamType = "Video" | "Audio" | "Subtitle" | "Embedded" | string;

export type JellyfinMediaStream = {
  Index: number;
  Type: JellyfinMediaStreamType;
  Codec?: string;
  Language?: string;
  Title?: string;
  DisplayTitle?: string;
  DisplayLanguage?: string;
  IsDefault?: boolean;
  IsForced?: boolean;
  IsExternal?: boolean;
  IsTextSubtitleStream?: boolean;
  Channels?: number;
  ChannelLayout?: string;
  Width?: number;
  Height?: number;
  // Subtitle delivery info — populated by Jellyfin when subtitles can be served
  // as VTT/SRT to a browser. Used to build a <track> URL when present.
  DeliveryUrl?: string;
  DeliveryMethod?: string;
};

export type JellyfinMediaSource = {
  Id: string;
  Name?: string;
  Container?: string;
  Bitrate?: number;
  RunTimeTicks?: number;
  MediaStreams?: JellyfinMediaStream[];
  DefaultAudioStreamIndex?: number;
  DefaultSubtitleStreamIndex?: number;
};

export type JellyfinItem = {
  Id: string;
  Name: string;
  Type: string;
  Overview?: string;
  Tagline?: string;
  ProductionYear?: number;
  RunTimeTicks?: number;
  CommunityRating?: number;
  CriticRating?: number;
  OfficialRating?: string;
  Genres?: string[];
  Studios?: { Name: string; Id?: string }[];
  AlbumArtist?: string;
  SeriesId?: string;
  SeriesName?: string;
  SeasonId?: string;
  SeasonName?: string;
  ChildCount?: number;
  IndexNumber?: number;
  ParentIndexNumber?: number;
  ProviderIds?: {
    Imdb?: string;
    Tmdb?: string;
    Tvdb?: string;
    [key: string]: string | undefined;
  };
  People?: { Name: string; Role?: string; Type?: string; Id?: string }[];
  UserData?: {
    PlaybackPositionTicks?: number;
    PlayedPercentage?: number;
    Played?: boolean;
    PlayCount?: number;
    IsFavorite?: boolean;
  };
  MediaSources?: JellyfinMediaSource[];
  // Image-tag bookkeeping. ImageTags carries the cache-busting tag for
  // each image type; BackdropImageTags is an array because items can have
  // multiple backdrops (Jellyfin returns the first one by default).
  ImageTags?: { Primary?: string; Logo?: string; Thumb?: string; [key: string]: string | undefined };
  BackdropImageTags?: string[];
  /** Immediate parent's id (a folder, season, library, etc.). Default Items
   *  endpoint always returns this. Used by Settings → Libraries to filter
   *  out items whose root view the user has hidden. */
  ParentId?: string;
};

export type PlaybackUrlOptions = {
  /** Force a re-stream with this audio track index. Disables `static=true`
   *  so Jellyfin will remux/transcode as needed to reorder tracks. */
  audioStreamIndex?: number;
  /** Specific media source id (multi-version items). Defaults to the first
   *  media source attached to the item. */
  mediaSourceId?: string;
  /** Force a target container (e.g. "mp4", "webm"). Triggers transcoding when
   *  the source container differs. */
  container?: string;
  /** Force a target video codec (e.g. "h264", "hevc", "av1"). Triggers
   *  transcoding when the source codec differs. */
  videoCodec?: string;
  /** Cap the streaming bitrate in bits per second. Triggers transcoding when
   *  the source bitrate is higher. Used by quality presets. */
  maxStreamingBitrate?: number;
  /** Cap the maximum streaming width in pixels. Paired with maxHeight via the
   *  quality presets. Triggers transcoding when the source is larger. */
  maxWidth?: number;
  /** Cap the maximum streaming height in pixels. */
  maxHeight?: number;
};

/** Whether the URL options imply transcoding (i.e. should drop static=true). */
function urlOptionsTranscodes(o?: PlaybackUrlOptions): boolean {
  if (!o) return false;
  return (
    o.audioStreamIndex !== undefined ||
    !!o.container ||
    !!o.videoCodec ||
    !!o.maxStreamingBitrate ||
    !!o.maxWidth ||
    !!o.maxHeight
  );
}

export class JellyfinClient {
  private readonly connection: JellyfinConnection;

  constructor(connection: JellyfinConnection) {
    this.connection = connection;
  }

  get imageBaseUrl() {
    return `${this.connection.serverUrl.replace(/\/$/, "")}/Items`;
  }

  getImageUrl(itemId: string) {
    return `${this.imageBaseUrl}/${itemId}/Images/Primary?fillHeight=1200&quality=92`;
  }

  /** 16:9 backdrop URL — much better suited to a wide hero than the
   *  portrait poster. Returns null when the item has no backdrop tagged
   *  so callers can fall back to a blurred-poster treatment. */
  getBackdropUrl(itemId: string, hasBackdrop: boolean): string | null {
    if (!hasBackdrop) return null;
    return `${this.imageBaseUrl}/${itemId}/Images/Backdrop/0?fillWidth=1920&quality=88`;
  }

  getPlaybackUrl(item: JellyfinItem, options?: PlaybackUrlOptions) {
    const base = this.connection.serverUrl.replace(/\/$/, "");
    const mediaPath = item.Type === "Audio" || item.Type === "MusicAlbum" ? "Audio" : "Videos";
    const apiKey = this.connection.accessToken || this.connection.apiKey;
    const params = new URLSearchParams();

    // Any transcoding option drops static=true so Jellyfin can remux. Direct
    // play is only requested when none of the override knobs are touched.
    if (!urlOptionsTranscodes(options)) {
      params.set("static", "true");
    }
    if (options?.audioStreamIndex !== undefined) {
      params.set("AudioStreamIndex", String(options.audioStreamIndex));
    }
    if (options?.container) {
      params.set("Container", options.container);
    }
    if (options?.videoCodec) {
      params.set("VideoCodec", options.videoCodec);
    }
    if (options?.maxStreamingBitrate) {
      params.set("MaxStreamingBitrate", String(options.maxStreamingBitrate));
    }
    if (options?.maxWidth) {
      params.set("MaxWidth", String(options.maxWidth));
    }
    if (options?.maxHeight) {
      params.set("MaxHeight", String(options.maxHeight));
    }
    if (options?.mediaSourceId) {
      params.set("MediaSourceId", options.mediaSourceId);
    }
    if (apiKey) {
      params.set("api_key", apiKey);
    }
    return `${base}/${mediaPath}/${item.Id}/stream?${params.toString()}`;
  }

  /**
   * URL for a subtitle stream rendered as WebVTT (browser-compatible). The
   * stream index identifies the subtitle inside the file's MediaStreams.
   * Browsers happily attach this via <track src="...">.
   */
  getSubtitleUrl(opts: {
    itemId: string;
    mediaSourceId: string;
    streamIndex: number;
    format?: "vtt" | "srt";
    startPositionTicks?: number;
  }): string {
    const base = this.connection.serverUrl.replace(/\/$/, "");
    const apiKey = this.connection.accessToken || this.connection.apiKey;
    const fmt = opts.format ?? "vtt";
    const start = opts.startPositionTicks ?? 0;
    const url = `${base}/Videos/${opts.itemId}/${opts.mediaSourceId}/Subtitles/${opts.streamIndex}/${start}/Stream.${fmt}`;
    return apiKey ? `${url}?api_key=${encodeURIComponent(apiKey)}` : url;
  }

  async getLibraryItems(
    queryOrUserId: LibraryQuery | string = {},
    legacyUserId?: string,
  ): Promise<{ items: JellyfinItem[]; total: number; startIndex: number; limit: number }> {
    // Backwards-compat: earlier callers passed `userId` as the first arg.
    const query: LibraryQuery =
      typeof queryOrUserId === "string" || queryOrUserId === undefined ? {} : queryOrUserId;
    const userId =
      typeof queryOrUserId === "string" ? queryOrUserId : legacyUserId ?? this.connection.userId;

    if (!userId) {
      throw new Error("A Jellyfin user ID is required to load a personal library.");
    }

    const filter = query.filter ?? "all";
    const startIndex = Math.max(0, query.startIndex ?? 0);
    const limit = Math.max(1, query.limit ?? DEFAULT_LIBRARY_PAGE_SIZE);
    const sortBy = query.sortBy ?? "SortName";
    const sortOrder = query.sortOrder ?? "Ascending";
    const includeItemTypes = FILTER_TO_INCLUDE_TYPES[filter];

    const params = new URLSearchParams({
      Recursive: "true",
      IncludeItemTypes: includeItemTypes,
      StartIndex: String(startIndex),
      Limit: String(limit),
      SortBy: sortBy,
      SortOrder: sortOrder,
      Fields: ITEM_FIELDS,
    });
    if (query.searchTerm && query.searchTerm.trim()) {
      params.set("SearchTerm", query.searchTerm.trim());
    }
    if (query.genres && query.genres.length > 0) {
      // Jellyfin expects pipe-delimited names: Genres=Drama|Comedy
      params.set("Genres", query.genres.join("|"));
    }
    if (query.personIds && query.personIds.length > 0) {
      params.set("PersonIds", query.personIds.join(","));
    }

    log.info("Fetching library page", {
      userId,
      startIndex,
      limit,
      filter,
      searchTerm: query.searchTerm,
      genres: query.genres,
      personIds: query.personIds,
    });
    const response = await this.request(`/Users/${userId}/Items?${params.toString()}`);
    const items: JellyfinItem[] = response.Items ?? [];
    // TotalRecordCount tells us how many items exist on the server even when
    // we're only displaying the current page. Surfaced to the UI so users see
    // "60 of 4,873 items" rather than an unanchored 60.
    const total: number = response.TotalRecordCount ?? items.length;
    log.info(`Library page received: ${items.length} (offset ${startIndex} of ${total})`);
    return { items, total, startIndex, limit };
  }

  /**
   * Children of a container item — Series→Seasons, Season→Episodes,
   * BoxSet→Movies. SortBy defaults to SortName for movies/audio and
   * IndexNumber for episodes, which matches Jellyfin's own ordering rules
   * (callers can override via the second argument). Returns ALL children;
   * containers rarely exceed a few dozen items so we don't paginate yet.
   */
  async getChildren(
    parentId: string,
    options: { userId?: string; sortBy?: string; sortOrder?: "Ascending" | "Descending" } = {},
  ): Promise<JellyfinItem[]> {
    const userId = options.userId ?? this.connection.userId;
    if (!userId) {
      throw new Error("A Jellyfin user ID is required to load children.");
    }
    const params = new URLSearchParams({
      ParentId: parentId,
      Fields: ITEM_FIELDS,
      SortBy: options.sortBy ?? "SortName",
      SortOrder: options.sortOrder ?? "Ascending",
    });
    log.info("Fetching children", { parentId });
    const response = await this.request(`/Users/${userId}/Items?${params.toString()}`);
    const items: JellyfinItem[] = response.Items ?? [];
    log.info(`Children received: ${items.length}`, { parentId });
    return items;
  }

  async getResumeItems(userId = this.connection.userId): Promise<JellyfinItem[]> {
    if (!userId) {
      throw new Error("A Jellyfin user ID is required to load resume rows.");
    }

    log.info("Fetching resume items", { userId });
    const response = await this.request(`/Users/${userId}/Items/Resume?MediaTypes=Video,Audio&Limit=20`);
    const items = response.Items ?? [];
    log.info(`Resume items received: ${items.length}`);
    return items;
  }

  /**
   * Recently added items. Jellyfin's `/Items/Latest` endpoint returns groups by
   * library, but we flatten and dedupe in the caller. `IsPlayed=false` filters
   * out things the user has already finished — "recently added" should mean
   * "new and unwatched" in practice.
   */
  async getLatestItems(opts: { limit?: number; userId?: string } = {}): Promise<JellyfinItem[]> {
    const userId = opts.userId ?? this.connection.userId;
    if (!userId) {
      throw new Error("A Jellyfin user ID is required to load recently added items.");
    }
    const params = new URLSearchParams({
      Limit: String(opts.limit ?? 20),
      Fields: ITEM_FIELDS,
      IncludeItemTypes: "Movie,Series,Episode,MusicAlbum",
      EnableUserData: "true",
      IsPlayed: "false",
    });
    log.info("Fetching latest items", { userId, limit: opts.limit ?? 20 });
    const response = await this.request(`/Users/${userId}/Items/Latest?${params.toString()}`);
    // /Items/Latest can return a flat array OR an object — varies by version.
    const items: JellyfinItem[] = Array.isArray(response) ? response : (response.Items ?? []);
    log.info(`Latest items received: ${items.length}`);
    return items;
  }

  /** Favorited items across the library. Used by the Home favorites rail. */
  async getFavoriteItems(opts: { limit?: number; userId?: string } = {}): Promise<JellyfinItem[]> {
    const userId = opts.userId ?? this.connection.userId;
    if (!userId) {
      throw new Error("A Jellyfin user ID is required to load favorites.");
    }
    const params = new URLSearchParams({
      Recursive: "true",
      Filters: "IsFavorite",
      IncludeItemTypes: "Movie,Series,Episode,MusicAlbum,Audio",
      Fields: ITEM_FIELDS,
      Limit: String(opts.limit ?? 30),
      SortBy: "DateCreated",
      SortOrder: "Descending",
    });
    log.info("Fetching favorites", { userId });
    const response = await this.request(`/Users/${userId}/Items?${params.toString()}`);
    const items = response.Items ?? [];
    log.info(`Favorites received: ${items.length}`);
    return items;
  }

  /**
   * Up-Next: the next unwatched episode in a series the user has been
   * watching. With `seriesId` it's scoped to that show; without, it returns
   * the next-up across all shows (useful for a Home rail later).
   */
  async getNextUp(opts: { seriesId?: string; limit?: number; userId?: string } = {}): Promise<JellyfinItem[]> {
    const userId = opts.userId ?? this.connection.userId;
    if (!userId) {
      throw new Error("A Jellyfin user ID is required to load Up Next.");
    }
    const params = new URLSearchParams({
      UserId: userId,
      Limit: String(opts.limit ?? 1),
      Fields: ITEM_FIELDS,
    });
    if (opts.seriesId) params.set("SeriesId", opts.seriesId);
    log.info("Fetching Up Next", opts);
    const response = await this.request(`/Shows/NextUp?${params.toString()}`);
    const items = response.Items ?? [];
    log.info(`Up Next items received: ${items.length}`);
    return items;
  }

  /**
   * "Recommended for you" — Jellyfin computes suggestions from the user's
   * play history. Returns a flat list of items; we cap to ~20 for the rail.
   * Older Jellyfin versions return a wrapper object, newer ones a flat
   * array — handle both shapes the same way as `getLatestItems`.
   */
  async getRecommendedItems(opts: { limit?: number; userId?: string } = {}): Promise<JellyfinItem[]> {
    const userId = opts.userId ?? this.connection.userId;
    if (!userId) {
      throw new Error("A Jellyfin user ID is required to load recommendations.");
    }
    const params = new URLSearchParams({
      Limit: String(opts.limit ?? 20),
      Fields: ITEM_FIELDS,
    });
    log.info("Fetching recommended items", { userId });
    const response = await this.request(`/Users/${userId}/Suggestions?${params.toString()}`);
    const items: JellyfinItem[] = Array.isArray(response) ? response : (response.Items ?? []);
    log.info(`Recommended items received: ${items.length}`);
    return items;
  }

  /**
   * BoxSets / Collections — user-curated groupings (e.g. "MCU", "Studio Ghibli").
   * Lives at its own endpoint shape via `IncludeItemTypes=BoxSet`. Containers
   * don't play directly; the detail page renders their contents instead.
   */
  async getCollections(opts: { limit?: number; userId?: string } = {}): Promise<JellyfinItem[]> {
    const userId = opts.userId ?? this.connection.userId;
    if (!userId) {
      throw new Error("A Jellyfin user ID is required to load collections.");
    }
    const params = new URLSearchParams({
      Recursive: "true",
      IncludeItemTypes: "BoxSet",
      Fields: ITEM_FIELDS,
      Limit: String(opts.limit ?? 50),
      SortBy: "SortName",
      SortOrder: "Ascending",
    });
    log.info("Fetching collections", { userId });
    const response = await this.request(`/Users/${userId}/Items?${params.toString()}`);
    const items = response.Items ?? [];
    log.info(`Collections received: ${items.length}`);
    return items;
  }

  /**
   * Toggle favorite on/off. Jellyfin uses POST to favorite, DELETE to
   * unfavorite — same path either way. The server echoes back the updated
   * UserData payload which the caller can fold into its local copy of the item.
   */
  async setFavorite(itemId: string, isFavorite: boolean, userId = this.connection.userId): Promise<void> {
    if (!userId) {
      throw new Error("A Jellyfin user ID is required to update favorites.");
    }
    log.info(`${isFavorite ? "Favoriting" : "Unfavoriting"} item`, { itemId });
    await this.request(`/Users/${userId}/FavoriteItems/${itemId}`, {
      method: isFavorite ? "POST" : "DELETE",
    });
  }

  async startPlayback(target: JellyfinPlaybackTarget) {
    return this.request("/Sessions/Playing", {
      method: "POST",
      body: JSON.stringify({
        ItemId: target.itemId,
        PlayMethod: "DirectPlay",
        PositionTicks: target.startPositionTicks ?? 0,
        DeviceId: target.deviceId,
      }),
    });
  }

  async reportProgress(itemId: string, positionSeconds: number, isPaused = false) {
    return this.request("/Sessions/Playing/Progress", {
      method: "POST",
      body: JSON.stringify({
        ItemId: itemId,
        PlayMethod: "DirectPlay",
        PositionTicks: Math.round(positionSeconds * 10_000_000),
        IsPaused: isPaused,
        EventName: "timeupdate",
      }),
    });
  }

  async reportStopped(itemId: string, positionSeconds: number) {
    return this.request("/Sessions/Playing/Stopped", {
      method: "POST",
      body: JSON.stringify({
        ItemId: itemId,
        PositionTicks: Math.round(positionSeconds * 10_000_000),
      }),
    });
  }

  async getItemDetail(itemId: string, userId = this.connection.userId): Promise<JellyfinItem> {
    if (!userId) {
      throw new Error("A Jellyfin user ID is required to load item details.");
    }
    return this.request(`/Users/${userId}/Items/${itemId}?Fields=${ITEM_FIELDS}`);
  }

  /**
   * Person metadata — name, biography, primary photo. Used by the Person
   * facet page header. The same item can be looked up via the standard
   * Items endpoint because Jellyfin treats Person as just another item type.
   */
  async getPerson(personId: string, userId = this.connection.userId): Promise<JellyfinItem> {
    if (!userId) {
      throw new Error("A Jellyfin user ID is required to load person details.");
    }
    return this.request(`/Users/${userId}/Items/${personId}?Fields=Overview`);
  }

  async getUsers(): Promise<JellyfinPublicUser[]> {
    return this.request("/Users/Public");
  }

  /**
   * Probes the server's public-info endpoint. Used during onboarding to confirm
   * the URL points at a real Jellyfin server before asking for credentials.
   * Doesn't require authentication.
   */
  async getPublicInfo(): Promise<JellyfinPublicInfo> {
    return this.request("/System/Info/Public");
  }

  /**
   * The user's views — i.e., the libraries they're allowed to see (Movies,
   * TV Shows, Music, etc.). Used by Settings → Libraries to render hide/show
   * toggles per library.
   */
  async getViews(userId = this.connection.userId): Promise<JellyfinItem[]> {
    if (!userId) {
      throw new Error("A Jellyfin user ID is required to load views.");
    }
    log.info("Fetching user views", { userId });
    const response = await this.request(`/Users/${userId}/Views`);
    return response.Items ?? [];
  }

  async getRemoteImages(itemId: string, type: ImageType = "Primary"): Promise<JellyfinRemoteImage[]> {
    const response = await this.request(
      `/Items/${itemId}/RemoteImages?Type=${type}&Limit=30&IncludeAllLanguages=false`,
    );
    return response.Images ?? [];
  }

  async downloadRemoteImage(itemId: string, imageUrl: string, type: ImageType = "Primary") {
    const base = this.connection.serverUrl.replace(/\/$/, "");
    const headers = new Headers();
    if (this.connection.accessToken || this.connection.apiKey) {
      headers.set("X-Emby-Token", this.connection.accessToken || this.connection.apiKey!);
    }
    const url = `${base}/Items/${itemId}/RemoteImages/Download?Type=${type}&ImageUrl=${encodeURIComponent(imageUrl)}`;
    const response = await fetch(url, { method: "POST", headers });
    if (!response.ok) {
      throw new Error(`Image download failed: ${response.status}`);
    }
  }

  async uploadImage(itemId: string, file: File, type: ImageType = "Primary") {
    const base64 = await fileToBase64(file);
    const base = this.connection.serverUrl.replace(/\/$/, "");
    const headers = new Headers();
    headers.set("Content-Type", file.type || "image/jpeg");
    if (this.connection.accessToken || this.connection.apiKey) {
      headers.set("X-Emby-Token", this.connection.accessToken || this.connection.apiKey!);
    }
    const response = await fetch(`${base}/Items/${itemId}/Images/${type}`, {
      method: "POST",
      headers,
      body: base64,
    });
    if (!response.ok) {
      throw new Error(`Image upload failed: ${response.status}`);
    }
  }

  async authenticateByName(username: string, password: string): Promise<JellyfinAuthResult> {
    const base = this.connection.serverUrl.replace(/\/$/, "");
    const headers = new Headers();
    headers.set("Content-Type", "application/json");
    headers.set("X-Emby-Authorization", `MediaBrowser Client="Glassfin", Device="Browser", DeviceId="glassfin-pwa", Version="0.1.0"`);

    const response = await fetch(`${base}/Users/AuthenticateByName`, {
      method: "POST",
      headers,
      body: JSON.stringify({ Username: username, Pw: password }),
    });

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        throw new Error("Invalid username or password.");
      }
      throw new Error(`Authentication failed: ${response.status}`);
    }

    return response.json();
  }

  private async request(path: string, init?: RequestInit) {
    const base = this.connection.serverUrl.replace(/\/$/, "");
    const headers = new Headers(init?.headers);
    headers.set("Content-Type", "application/json");

    if (this.connection.accessToken || this.connection.apiKey) {
      headers.set("X-Emby-Token", this.connection.accessToken || this.connection.apiKey!);
    }

    const url = `${base}${path}`;
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    const startedAt = performance.now();
    const method = init?.method ?? "GET";

    log.debug(`→ ${method} ${path}`);

    try {
      const response = await fetch(url, { ...init, headers, signal: controller.signal });
      const durationMs = Math.round(performance.now() - startedAt);

      if (!response.ok) {
        log.error(`← ${method} ${path} failed`, { status: response.status, durationMs });
        throw new Error(`Jellyfin request failed: ${response.status}`);
      }

      log.debug(`← ${method} ${path} ${response.status} (${durationMs}ms)`);
      const json = await response.json();
      log.trace(`response body for ${path}`, json);
      return json;
    } catch (error) {
      const durationMs = Math.round(performance.now() - startedAt);
      if ((error as Error).name === "AbortError") {
        log.error(`× ${method} ${path} timed out after ${REQUEST_TIMEOUT_MS}ms`, { durationMs });
        throw new Error(
          `Jellyfin request timed out after ${REQUEST_TIMEOUT_MS / 1000}s: ${path}. ` +
            "The server is reachable but slow, or the response is very large.",
        );
      }
      log.error(`× ${method} ${path} threw`, error);
      throw error;
    } finally {
      window.clearTimeout(timeoutId);
    }
  }
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Strip the "data:<mime>;base64," prefix — Jellyfin expects raw base64.
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

const runtimeConfig = getRuntimeConfig();

export const defaultConnection: JellyfinConnection = {
  serverUrl:
    runtimeConfig.jellyfinUrl ||
    import.meta.env.VITE_JELLYFIN_URL ||
    "http://jellyfin.local:8096",
  apiKey: runtimeConfig.jellyfinApiKey || import.meta.env.VITE_JELLYFIN_API_KEY,
  userId: runtimeConfig.jellyfinUserId || import.meta.env.VITE_JELLYFIN_USER_ID,
};
