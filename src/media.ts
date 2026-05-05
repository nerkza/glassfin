import type { JellyfinClient, JellyfinItem, JellyfinMediaStream } from "./jellyfin";

export type MediaKind = "movie" | "series" | "season" | "episode" | "music" | "live" | "boxset";

export type ProviderLink = {
  label: string;
  url: string;
};

export type MediaItem = {
  id: string;
  jellyfinId?: string;
  title: string;
  eyebrow: string;
  kind: MediaKind;
  year: number;
  runtime: string;
  rating: string;
  progress?: number;
  image: string;
  /** Wide 16:9 hero artwork from Jellyfin's Backdrop image type. Optional;
   *  when missing, UIs that need a banner-shaped image fall back to the
   *  portrait `image` heavily blurred. */
  backdropImage?: string;
  color: string;
  description: string;
  meta: string[];
  playbackUrl?: string;
  tagline?: string;
  genres?: string[];
  studios?: string[];
  cast?: { name: string; role?: string; id?: string }[];
  officialRating?: string;
  communityRating?: number;
  criticRating?: number;
  providerLinks?: ProviderLink[];
  // Player surface — only populated for items loaded from Jellyfin. Keeps the
  // PlayerOverlay self-sufficient (audio/subtitle menus, default tracks)
  // without forcing it to re-fetch the item on mount.
  mediaSourceId?: string;
  mediaStreams?: JellyfinMediaStream[];
  defaultAudioStreamIndex?: number;
  defaultSubtitleStreamIndex?: number;
  runTimeTicks?: number;
  // Show hierarchy — populated for Series/Season/Episode so DetailPage can
  // surface "Series · S2 · E5" context, navigate up the tree, and the player
  // can label the title bar correctly.
  seriesId?: string;
  seriesName?: string;
  seasonId?: string;
  seasonNumber?: number;
  episodeNumber?: number;
  childCount?: number;
  isFavorite?: boolean;
  /** Immediate parent's id from Jellyfin. Used to filter out content from
   *  libraries the user has hidden in Settings → Libraries. */
  parentId?: string;
};

export type DeviceTarget = {
  id: string;
  name: string;
  type: "Living room" | "Tablet" | "Mobile" | "Browser";
  status: "Ready" | "Watching" | "Offline";
};

/*
  Glassfin only renders real Jellyfin data. There is no demo fallback. When
  the app is disconnected or an empty library, the UI shows explicit empty
  states instead of inventing content.

  The "this browser" device is the only built-in target — it represents the
  current session itself. Real cast targets will be discovered from Jellyfin
  sessions in a future phase.
*/
export const localPlaybackDevice: DeviceTarget = {
  id: "this-browser",
  name: "This browser",
  type: "Browser",
  status: "Ready",
};

/**
 * Translate a Jellyfin item shape into the app's MediaItem. Lives at module
 * scope (rather than inside App) so multiple consumers — App's dashboard,
 * LibraryPage, future surfaces — share one reference and don't churn React
 * effect dependencies. Pure aside from `client.getImageUrl/getBackdropUrl`,
 * which are themselves derived strings.
 */
const KIND_BY_JELLYFIN_TYPE: Record<string, MediaKind> = {
  Movie: "movie",
  Series: "series",
  Season: "season",
  Episode: "episode",
  Audio: "music",
  MusicAlbum: "music",
  BoxSet: "boxset",
};

export function mapJellyfinItem(item: JellyfinItem, client: JellyfinClient): MediaItem {
  const runtime = item.RunTimeTicks
    ? `${Math.max(1, Math.round(item.RunTimeTicks / 600000000))} min`
    : item.Type === "Series"
      ? "Series"
      : item.Type === "Season"
        ? "Season"
        : item.Type === "BoxSet"
          ? "Collection"
          : "Library item";
  const progress = Math.round(item.UserData?.PlayedPercentage ?? 0);
  const kind: MediaKind = KIND_BY_JELLYFIN_TYPE[item.Type] ?? "movie";

  const providerLinks: ProviderLink[] = [];
  const ids = item.ProviderIds ?? {};
  if (ids.Imdb) providerLinks.push({ label: "IMDb", url: `https://www.imdb.com/title/${ids.Imdb}` });
  if (ids.Tmdb) {
    const tmdbType = item.Type === "Series" ? "tv" : "movie";
    providerLinks.push({ label: "TMDB", url: `https://www.themoviedb.org/${tmdbType}/${ids.Tmdb}` });
  }
  if (ids.Tvdb) providerLinks.push({ label: "TVDB", url: `https://thetvdb.com/?id=${ids.Tvdb}&tab=series` });

  const cast = (item.People ?? [])
    .filter((p) => p.Type === "Actor" || !p.Type)
    .slice(0, 8)
    .map((p) => ({ name: p.Name, role: p.Role, id: p.Id }));

  const primarySource = item.MediaSources?.[0];

  return {
    id: `jellyfin-${item.Id}`,
    jellyfinId: item.Id,
    title: item.Name,
    eyebrow: item.SeriesName || item.AlbumArtist || item.Type,
    kind,
    year: item.ProductionYear ?? new Date().getFullYear(),
    runtime,
    rating:
      item.OfficialRating ||
      (item.CommunityRating ? `${item.CommunityRating.toFixed(1)} rating` : "Jellyfin"),
    progress,
    image: client.getImageUrl(item.Id),
    backdropImage:
      client.getBackdropUrl(
        item.Id,
        !!item.BackdropImageTags && item.BackdropImageTags.length > 0,
      ) ?? undefined,
    color: "#4f9bff",
    description: item.Overview || "Loaded from your Jellyfin server.",
    meta: deriveQualityTags(primarySource?.MediaStreams),
    playbackUrl: client.getPlaybackUrl(item),
    tagline: item.Tagline,
    genres: item.Genres,
    studios: item.Studios?.map((s) => s.Name),
    cast,
    officialRating: item.OfficialRating,
    communityRating: item.CommunityRating,
    criticRating: item.CriticRating,
    providerLinks,
    mediaSourceId: primarySource?.Id,
    mediaStreams: primarySource?.MediaStreams,
    defaultAudioStreamIndex: primarySource?.DefaultAudioStreamIndex,
    defaultSubtitleStreamIndex: primarySource?.DefaultSubtitleStreamIndex,
    runTimeTicks: item.RunTimeTicks,
    seriesId: item.SeriesId,
    seriesName: item.SeriesName,
    seasonId: item.SeasonId,
    seasonNumber: item.ParentIndexNumber,
    episodeNumber: item.IndexNumber,
    childCount: item.ChildCount,
    isFavorite: item.UserData?.IsFavorite ?? false,
    parentId: item.ParentId,
  };
}

/**
 * Build the small set of "quality" chips that appear in the hero's strip
 * (e.g., "4K", "HDR", "HEVC", "5.1"). Pulls only from real media stream
 * metadata — if the item has no MediaStreams we return an empty array so the
 * UI can hide the strip entirely instead of falling back to fake labels.
 */
function deriveQualityTags(streams: JellyfinMediaStream[] | undefined): string[] {
  if (!streams || streams.length === 0) return [];
  const tags: string[] = [];
  const video = streams.find((s) => s.Type === "Video");
  if (video) {
    const w = video.Width ?? 0;
    const h = video.Height ?? 0;
    if (w >= 3840 || h >= 2160) tags.push("4K");
    else if (h >= 1080) tags.push("1080p");
    else if (h >= 720) tags.push("720p");
    else if (h > 0) tags.push("SD");
    const range = (video as { VideoRangeType?: string }).VideoRangeType;
    if (range && range !== "SDR") tags.push(range.replace(/^DOVI.*/, "Dolby Vision"));
    if (video.Codec) tags.push(video.Codec.toUpperCase());
  }
  const audio =
    streams.find((s) => s.Type === "Audio" && s.IsDefault) ??
    streams.find((s) => s.Type === "Audio");
  if (audio) {
    const layout = audio.ChannelLayout;
    if (layout) tags.push(layout);
    else if (audio.Channels) tags.push(`${audio.Channels}ch`);
  }
  return tags;
}
