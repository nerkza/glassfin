import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  FullscreenButton,
  MediaPlayer,
  type MediaPlayerInstance,
  MediaProvider,
  MuteButton,
  PIPButton,
  PlayButton,
  SeekButton,
  Time,
  TimeSlider,
  Track,
  VolumeSlider,
  useMediaState,
} from "@vidstack/react";
import {
  IconArrowDownBackwardAndArrowUpForward,
  IconArrowDownForwardAndArrowUpBackward,
  IconBackward,
  IconForward,
  IconGearshape,
  IconPauseFill,
  IconPlayFill,
  IconPlayRectangleOnRectangleFill,
  IconSpeakerSlashFill,
  IconSpeakerWave2Fill,
  IconXmark,
} from "symbols-react";
import { type DeviceTarget, type MediaItem } from "../media";
import { type JellyfinClient, type JellyfinMediaStream } from "../jellyfin";
import { getPrefs } from "../prefs";
import { logger } from "../logger";

const log = logger.scope("player");

/*
  Video player overlay built on @vidstack/react.

  Vidstack provides the engine — HLS support (auto-loaded when Jellyfin
  transcodes), buffer visualisation, gestures, fullscreen/PiP/keyboard
  shortcuts, auto-hide, and proper a11y semantics. We bring our own
  glass-themed chrome on top, plus the Jellyfin-specific bits that no
  generic player knows about:

    - Building the source URL with audio-track / quality / container /
      codec query params (Jellyfin-side transcode controls).
    - VTT subtitle delivery via /Subtitles/.../Stream.vtt.
    - Progress reporting (Sessions/Playing/Progress + Stopped).

  Vidstack handles play/pause, seek ±10s, mute, volume, fullscreen, PiP,
  the scrubber, and the time readout via its prebuilt action buttons +
  hooks. We keep our custom <SettingsMenu> for the Jellyfin-specific
  options because vidstack's audio-track menu queries the browser-native
  audioTracks API which Jellyfin's re-stream model bypasses.
*/

const PROGRESS_REPORT_THROTTLE_MS = 10_000;

type QualityPreset = "auto" | "p2160" | "p1440" | "p1080" | "p720" | "p480";

// Resolution + bitrate caps. Only "auto" is direct play; everything else
// triggers Jellyfin-side transcoding via MaxWidth/MaxHeight/MaxStreamingBitrate.
const QUALITY_PRESETS: Record<
  QualityPreset,
  { label: string; bitrate?: number; maxWidth?: number; maxHeight?: number }
> = {
  auto: { label: "Auto (direct play)" },
  p2160: { label: "2160p · 4K (~25 Mbps)", bitrate: 25_000_000, maxWidth: 3840, maxHeight: 2160 },
  p1440: { label: "1440p · QHD (~12 Mbps)", bitrate: 12_000_000, maxWidth: 2560, maxHeight: 1440 },
  p1080: { label: "1080p · FHD (~8 Mbps)", bitrate: 8_000_000, maxWidth: 1920, maxHeight: 1080 },
  p720: { label: "720p · HD (~4 Mbps)", bitrate: 4_000_000, maxWidth: 1280, maxHeight: 720 },
  p480: { label: "480p · SD (~2 Mbps)", bitrate: 2_000_000, maxWidth: 854, maxHeight: 480 },
};

const CONTAINER_OPTIONS: { value: string | undefined; label: string }[] = [
  { value: undefined, label: "Auto" },
  { value: "mp4", label: "MP4" },
  { value: "webm", label: "WebM" },
];

const VIDEO_CODEC_OPTIONS: { value: string | undefined; label: string }[] = [
  { value: undefined, label: "Auto" },
  { value: "h264", label: "H.264" },
  { value: "hevc", label: "HEVC (H.265)" },
  { value: "av1", label: "AV1" },
];

function PlayerOverlay({
  device,
  item,
  client,
  onClose,
}: {
  device: DeviceTarget;
  item: MediaItem;
  client: JellyfinClient | null;
  onClose: () => void;
}) {
  const playerRef = useRef<MediaPlayerInstance>(null);
  const lastReportedRef = useRef(0);
  const startedRef = useRef(false);

  // Audio + subtitle stream selection. Subtitles flip <Track> mode in-place;
  // audio changes rebuild the URL because Jellyfin needs to remux to reorder
  // streams (browser audioTracks API is too unreliable to lean on).
  const audioStreams = useMemo(
    () => (item.mediaStreams ?? []).filter((s) => s.Type === "Audio"),
    [item.mediaStreams],
  );
  const subtitleStreams = useMemo(
    () =>
      (item.mediaStreams ?? []).filter(
        (s) => s.Type === "Subtitle" && s.IsTextSubtitleStream !== false,
      ),
    [item.mediaStreams],
  );
  // Prefs read once at mount — they seed the initial state but the user can
  // still override via the in-player Settings menu without having that change
  // propagate back into prefs (the menu is "this session", prefs are
  // "every future session").
  const prefs = useMemo(() => getPrefs(), []);

  // Pick the audio/subtitle track that matches the user's preferred language
  // when one is set. Falls through to the item's own default if no match.
  function pickByLanguage(streams: JellyfinMediaStream[], lang: string): number | undefined {
    if (!lang) return undefined;
    const match = streams.find(
      (s) => (s.Language ?? "").toLowerCase() === lang.toLowerCase(),
    );
    return match?.Index;
  }

  const initialAudioIndex =
    pickByLanguage(audioStreams, prefs.preferredAudioLanguage) ??
    item.defaultAudioStreamIndex ??
    audioStreams.find((s) => s.IsDefault)?.Index ??
    audioStreams[0]?.Index;

  // Subtitle initial index honours the prefs subtitleMode:
  //   "off"     → undefined regardless of available tracks
  //   "auto"    → match preferredSubtitleLanguage, or the item's default
  //   "forced"  → pick a forced subtitle track if one exists, else undefined
  const initialSubtitleIndex = (() => {
    if (prefs.subtitleMode === "off") return undefined;
    if (prefs.subtitleMode === "forced") {
      return subtitleStreams.find((s) => s.IsForced)?.Index;
    }
    return (
      pickByLanguage(subtitleStreams, prefs.preferredSubtitleLanguage) ??
      item.defaultSubtitleStreamIndex ??
      subtitleStreams.find((s) => s.IsDefault)?.Index
    );
  })();

  const [activeAudioIndex, setActiveAudioIndex] = useState<number | undefined>(initialAudioIndex);
  const [activeSubtitleIndex, setActiveSubtitleIndex] = useState<number | undefined>(
    initialSubtitleIndex,
  );
  const [qualityPreset, setQualityPreset] = useState<QualityPreset>(
    prefs.defaultQualityPreset as QualityPreset,
  );
  const [containerOverride, setContainerOverride] = useState<string | undefined>(undefined);
  const [videoCodecOverride, setVideoCodecOverride] = useState<string | undefined>(undefined);

  const [openMenu, setOpenMenu] = useState<"settings" | null>(null);

  // Snapshot before src reload so we can restore position. Set by any of the
  // Jellyfin-transcode-triggering changes (audio / quality / container / codec).
  const lastSrcChangeRef = useRef<{ time: number; wasPlaying: boolean } | null>(null);

  // Build the playback URL from the current option set. Memoised on the
  // inputs so React only re-emits a new src when something actually changed.
  const playbackUrl = useMemo(() => {
    if (!client || !item.jellyfinId) return item.playbackUrl ?? null;
    const preset = QUALITY_PRESETS[qualityPreset];
    const audioOverride =
      activeAudioIndex !== undefined && activeAudioIndex !== initialAudioIndex
        ? activeAudioIndex
        : undefined;
    const url = client.getPlaybackUrl(
      { Id: item.jellyfinId, Name: item.title, Type: mediaTypeFromKind(item) },
      {
        audioStreamIndex: audioOverride,
        container: containerOverride,
        videoCodec: videoCodecOverride,
        maxStreamingBitrate: preset.bitrate,
        maxWidth: preset.maxWidth,
        maxHeight: preset.maxHeight,
        mediaSourceId: item.mediaSourceId,
      },
    );
    log.debug("Playback URL recomputed", {
      qualityPreset,
      containerOverride,
      videoCodecOverride,
      audioOverride,
      url,
    });
    return url;
  }, [
    client,
    item,
    activeAudioIndex,
    initialAudioIndex,
    containerOverride,
    videoCodecOverride,
    qualityPreset,
  ]);

  // Vidstack's `src` prop accepts string OR { src, type }. Pass an object so
  // the HTML5 provider attaches even when the URL has no extension (Jellyfin
  // streams end ?static=true&... and would otherwise fail auto-detect). The
  // object identity must be stable across renders that don't change the URL —
  // vidstack diffs the prop and re-emits on identity change, which would
  // restart the load every render and look like "settings don't apply".
  const playerSrc = useMemo(
    () => (playbackUrl ? { src: playbackUrl, type: "video/mp4" as const } : null),
    [playbackUrl],
  );

  // Restore currentTime + play state after a src reload. Subscribing to
  // `canPlay` directly is racy: the subscriber fires once with the CURRENT
  // state on attach, and that may still be `true` from the previous src
  // before vidstack has started loading the new one. Wait for canPlay to
  // flip false → true so we restore against the new source, not the old.
  useEffect(() => {
    const player = playerRef.current;
    if (!player) return;
    const snapshot = lastSrcChangeRef.current;
    if (!snapshot) return;
    let sawNotReady = !player.state.canPlay;
    return player.subscribe(({ canPlay }) => {
      if (!canPlay) {
        sawNotReady = true;
        return;
      }
      if (sawNotReady && lastSrcChangeRef.current === snapshot) {
        log.debug("Restoring position after src reload", snapshot);
        player.currentTime = snapshot.time;
        if (snapshot.wasPlaying) void player.play();
        lastSrcChangeRef.current = null;
      }
    });
  }, [playbackUrl]);

  // Apply subtitle selection by flipping the matching Track's mode. Vidstack
  // exposes textTracks via the same DOM API as HTMLMediaElement, so the same
  // `track.mode = "showing"` pattern works.
  useEffect(() => {
    const player = playerRef.current;
    if (!player) return;
    const tracks = player.textTracks;
    for (const track of tracks) {
      const id = (track as { id?: string }).id ?? "";
      const wantedId = activeSubtitleIndex !== undefined ? `sub-${activeSubtitleIndex}` : null;
      track.mode = wantedId && id === wantedId ? "showing" : "disabled";
    }
  }, [activeSubtitleIndex, playbackUrl]);

  // Jellyfin progress reporting. Vidstack fires play/pause/timeUpdate/end on
  // the MediaPlayer which we wire up below; the throttle keeps timeUpdate
  // from hammering the server.
  function handlePlay() {
    const itemId = item.jellyfinId;
    if (!client || !itemId) return;
    if (!startedRef.current) {
      startedRef.current = true;
      log.info("Playback started", { itemId });
      void client.startPlayback({ itemId, deviceId: device.id }).catch((e) =>
        log.warn("startPlayback report failed", e),
      );
    } else {
      const t = playerRef.current?.currentTime ?? 0;
      void client.reportProgress(itemId, t, false).catch((e) =>
        log.warn("reportProgress failed", e),
      );
    }
  }

  function handlePause() {
    const itemId = item.jellyfinId;
    if (!client || !itemId) return;
    const t = playerRef.current?.currentTime ?? 0;
    void client.reportProgress(itemId, t, true).catch((e) =>
      log.warn("reportProgress failed", e),
    );
  }

  function handleTimeUpdate() {
    const itemId = item.jellyfinId;
    if (!client || !itemId) return;
    const now = Date.now();
    if (now - lastReportedRef.current < PROGRESS_REPORT_THROTTLE_MS) return;
    lastReportedRef.current = now;
    const t = playerRef.current?.currentTime ?? 0;
    const paused = playerRef.current?.state.paused ?? false;
    void client.reportProgress(itemId, t, paused).catch((e) =>
      log.warn("reportProgress failed", e),
    );
  }

  function handleEnd() {
    const itemId = item.jellyfinId;
    if (!client || !itemId || !startedRef.current) return;
    const t = playerRef.current?.currentTime ?? 0;
    log.info("Playback ended", { itemId, position: t });
    void client.reportStopped(itemId, t).catch((e) =>
      log.warn("reportStopped failed", e),
    );
    startedRef.current = false;
  }

  // Final stopped report on unmount (close button, navigate away). Vidstack
  // doesn't fire a synthetic "ended" when the component unmounts, so we
  // explicitly send the report here.
  useEffect(() => {
    return () => {
      const itemId = item.jellyfinId;
      if (!client || !itemId || !startedRef.current) return;
      const t = playerRef.current?.currentTime ?? 0;
      log.info("Playback stopped (unmount)", { itemId, position: t });
      void client.reportStopped(itemId, t).catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Captures position + play state before a src reload. Used by every option
   *  change that triggers Jellyfin-side transcoding. */
  function snapshotForReload() {
    const player = playerRef.current;
    if (!player) return;
    lastSrcChangeRef.current = {
      time: player.currentTime,
      wasPlaying: !player.state.paused,
    };
  }

  function selectAudio(index: number) {
    if (index === activeAudioIndex) {
      setOpenMenu(null);
      return;
    }
    log.info("Switching audio track", { from: activeAudioIndex, to: index });
    snapshotForReload();
    setActiveAudioIndex(index);
    setOpenMenu(null);
  }

  function selectSubtitle(index: number | undefined) {
    setActiveSubtitleIndex(index);
    setOpenMenu(null);
    log.debug("Subtitle selection", { index });
  }

  if (!playerSrc) return null;

  return (
    <AnimatePresence>
      <motion.div
        className="player-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        <motion.div
          className="player"
          initial={{ opacity: 0, scale: 0.96, y: 24 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 24 }}
          transition={{ type: "spring", stiffness: 120, damping: 18 }}
        >
          <MediaPlayer
            ref={playerRef}
            // playerSrc is memoised — see the useMemo above. A new object
            // identity here triggers a full reload, so we keep it stable when
            // the URL hasn't changed.
            src={playerSrc}
            poster={item.image}
            title={item.title}
            autoPlay
            playsInline
            keyShortcuts={{
              togglePaused: "Space k",
              toggleMuted: "m",
              toggleFullscreen: "f",
              togglePictureInPicture: "i",
              toggleCaptions: "c",
              seekBackward: "ArrowLeft",
              seekForward: "ArrowRight",
              volumeUp: "ArrowUp",
              volumeDown: "ArrowDown",
            }}
            onPlay={handlePlay}
            onPause={handlePause}
            onTimeUpdate={handleTimeUpdate}
            onEnd={handleEnd}
            onError={(detail) =>
              log.error("Player error — Jellyfin transcode may have failed", detail)
            }
            onLoadStart={() => log.debug("Player load started")}
            onLoadedMetadata={() => log.info("Player loaded metadata for new src")}
          >
            <MediaProvider>
              {(() => {
                if (!client) return null;
                const itemId = item.jellyfinId;
                const mediaSourceId = item.mediaSourceId;
                if (!itemId || !mediaSourceId) return null;
                return subtitleStreams.map((stream) => (
                  <Track
                    id={`sub-${stream.Index}`}
                    key={`sub-${stream.Index}`}
                    src={client.getSubtitleUrl({
                      itemId,
                      mediaSourceId,
                      streamIndex: stream.Index,
                    })}
                    kind="subtitles"
                    language={stream.Language ?? "und"}
                    label={subtitleLabel(stream)}
                    default={stream.Index === activeSubtitleIndex}
                  />
                ));
              })()}
            </MediaProvider>

            {/* Chrome — rendered inside MediaPlayer so its hooks have context.
                Auto-hide is driven by vidstack's controlsVisible state which
                tracks pointer/keyboard activity. Auto-hide pauses while the
                settings menu is open via the menuOpen prop. */}
            <Chrome
              device={device}
              item={item}
              onClose={onClose}
              menuOpen={openMenu !== null}
              menuTrigger={
                <div className="player-menu-anchor">
                  <button
                    className={`player-icon-button ${openMenu === "settings" ? "is-active" : ""}`}
                    type="button"
                    onClick={() => setOpenMenu(openMenu === "settings" ? null : "settings")}
                    aria-label="Player settings"
                    aria-expanded={openMenu === "settings"}
                  >
                    <IconGearshape width={18} height={18} />
                  </button>
                  {openMenu === "settings" && (
                    <SettingsMenu
                      qualityPreset={qualityPreset}
                      onQualityPick={(preset) => {
                        if (preset === qualityPreset) return;
                        snapshotForReload();
                        setQualityPreset(preset);
                        log.info("Quality preset changed", { preset });
                      }}
                      audioStreams={audioStreams}
                      activeAudioIndex={activeAudioIndex}
                      onAudioPick={selectAudio}
                      subtitleStreams={subtitleStreams}
                      activeSubtitleIndex={activeSubtitleIndex}
                      onSubtitlePick={selectSubtitle}
                      containerOverride={containerOverride}
                      onContainerPick={(c) => {
                        if (c === containerOverride) return;
                        snapshotForReload();
                        setContainerOverride(c);
                        log.info("Container override changed", { container: c });
                      }}
                      videoCodecOverride={videoCodecOverride}
                      onVideoCodecPick={(c) => {
                        if (c === videoCodecOverride) return;
                        snapshotForReload();
                        setVideoCodecOverride(c);
                        log.info("Video codec override changed", { codec: c });
                      }}
                    />
                  )}
                </div>
              }
            />
          </MediaPlayer>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

/**
 * Chrome — top bar + bottom controls. Lives inside <MediaPlayer> so vidstack
 * hooks have context. Auto-hide reads vidstack's `controlsVisible` state
 * (which already tracks pointer/keyboard activity) and is forced visible
 * while the settings menu is open so closing the popover doesn't fight
 * the user.
 */
function Chrome({
  device,
  item,
  onClose,
  menuOpen,
  menuTrigger,
}: {
  device: DeviceTarget;
  item: MediaItem;
  onClose: () => void;
  menuOpen: boolean;
  menuTrigger: ReactNode;
}) {
  const controlsVisible = useMediaState("controlsVisible");
  const visible = menuOpen || controlsVisible;

  return (
    <>
      <div className="player-top-bar" data-visible={visible}>
        <div className="player-meta">
          <span className="eyebrow">Now playing on {device.name}</span>
          <h2>{item.title}</h2>
          <p>
            {item.runtime} · {item.rating}
          </p>
        </div>
        <button
          className="player-icon-button"
          onClick={onClose}
          type="button"
          aria-label="Close player"
        >
          <IconXmark width={18} height={18} />
        </button>
      </div>

      <div className="player-controls-bar" data-visible={visible}>
        {/* vds-slider classes are required — vidstack's drag/keyboard
            handling reads CSS variables it sets on these (e.g.
            --slider-fill) and binds pointer events to elements with
            specific selectors. Without them the slider renders but
            doesn't respond to clicks/drags. We override colours with CSS
            custom properties on the root. */}
        <TimeSlider.Root className="vds-slider player-scrubber">
          <TimeSlider.Track className="vds-slider-track">
            <TimeSlider.TrackFill className="vds-slider-track-fill" />
            <TimeSlider.Progress className="vds-slider-progress" />
          </TimeSlider.Track>
          <TimeSlider.Thumb className="vds-slider-thumb" />
        </TimeSlider.Root>

        <div className="player-controls-row">
          <div className="player-controls-left">
            <SeekButton
              seconds={-10}
              className="player-icon-button"
              aria-label="Skip backward 10 seconds"
            >
              <IconBackward width={20} height={20} />
            </SeekButton>
            <PlayPauseButton />
            <SeekButton
              seconds={10}
              className="player-icon-button"
              aria-label="Skip forward 10 seconds"
            >
              <IconForward width={20} height={20} />
            </SeekButton>

            <div className="player-volume">
              <MuteButton className="player-icon-button" aria-label="Mute">
                <MuteIcon />
              </MuteButton>
              <VolumeSlider.Root className="vds-slider player-volume-slider">
                <VolumeSlider.Track className="vds-slider-track">
                  <VolumeSlider.TrackFill className="vds-slider-track-fill" />
                </VolumeSlider.Track>
                <VolumeSlider.Thumb className="vds-slider-thumb" />
              </VolumeSlider.Root>
            </div>

            <span className="player-time-readout">
              <Time type="current" />
              <span aria-hidden="true">/</span>
              <Time type="duration" />
            </span>
          </div>

          <div className="player-controls-right">
            {menuTrigger}

            <PIPButton className="player-icon-button" aria-label="Picture in picture">
              <IconPlayRectangleOnRectangleFill width={18} height={18} />
            </PIPButton>

            <FullscreenButton className="player-icon-button" aria-label="Toggle fullscreen">
              <FullscreenIconSwap />
            </FullscreenButton>
          </div>
        </div>
      </div>
    </>
  );
}

/** Play/pause icon swap driven by vidstack's paused state. */
function PlayPauseButton() {
  const paused = useMediaState("paused");
  return (
    <PlayButton
      className="player-icon-button player-play-large"
      aria-label={paused ? "Play" : "Pause"}
    >
      {paused ? <IconPlayFill width={22} height={22} /> : <IconPauseFill width={22} height={22} />}
    </PlayButton>
  );
}

/** Mute icon swap. Reads volume + muted from vidstack so the icon stays in
 *  sync with state changes from anywhere (keyboard, slider, etc.). */
function MuteIcon() {
  const muted = useMediaState("muted");
  const volume = useMediaState("volume");
  if (muted || volume === 0) return <IconSpeakerSlashFill width={18} height={18} />;
  return <IconSpeakerWave2Fill width={18} height={18} />;
}

/** Fullscreen icon swap. */
function FullscreenIconSwap() {
  const isFullscreen = useMediaState("fullscreen");
  return isFullscreen ? (
    <IconArrowDownForwardAndArrowUpBackward width={18} height={18} />
  ) : (
    <IconArrowDownBackwardAndArrowUpForward width={18} height={18} />
  );
}

/**
 * Consolidated settings popover. Holds the Jellyfin-specific controls that
 * vidstack doesn't know about (audio re-stream, container, codec) plus
 * subtitle and quality picks rendered alongside them for one-stop access.
 */
type SettingsCategory = "quality" | "audio" | "subtitles" | "container" | "codec";

function SettingsMenu({
  qualityPreset,
  onQualityPick,
  audioStreams,
  activeAudioIndex,
  onAudioPick,
  subtitleStreams,
  activeSubtitleIndex,
  onSubtitlePick,
  containerOverride,
  onContainerPick,
  videoCodecOverride,
  onVideoCodecPick,
}: {
  qualityPreset: QualityPreset;
  onQualityPick: (preset: QualityPreset) => void;
  audioStreams: JellyfinMediaStream[];
  activeAudioIndex: number | undefined;
  onAudioPick: (index: number) => void;
  subtitleStreams: JellyfinMediaStream[];
  activeSubtitleIndex: number | undefined;
  onSubtitlePick: (index: number | undefined) => void;
  containerOverride: string | undefined;
  onContainerPick: (container: string | undefined) => void;
  videoCodecOverride: string | undefined;
  onVideoCodecPick: (codec: string | undefined) => void;
}) {
  const [section, setSection] = useState<SettingsCategory | null>(null);
  // Small grace timer between leaving a row and the submenu so the user can
  // move the cursor across the gap without losing the popover.
  const closeTimerRef = useRef<number | null>(null);

  function openSection(s: SettingsCategory) {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    setSection(s);
  }

  function scheduleClose() {
    if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current);
    closeTimerRef.current = window.setTimeout(() => setSection(null), 220);
  }

  // Current value labels shown next to each category in the main list.
  const currentQualityLabel = QUALITY_PRESETS[qualityPreset].label.split(" ·")[0];
  const currentAudio = audioStreams.find((s) => s.Index === activeAudioIndex);
  const currentSubtitle = subtitleStreams.find((s) => s.Index === activeSubtitleIndex);
  const currentContainer =
    CONTAINER_OPTIONS.find((o) => o.value === containerOverride)?.label ?? "Auto";
  const currentCodec =
    VIDEO_CODEC_OPTIONS.find((o) => o.value === videoCodecOverride)?.label ?? "Auto";

  const rows: { id: SettingsCategory; label: string; current: string; show: boolean }[] = [
    { id: "quality", label: "Quality", current: currentQualityLabel, show: true },
    {
      id: "audio",
      label: "Audio",
      current: currentAudio ? shortAudioLabel(currentAudio) : "—",
      show: audioStreams.length > 0,
    },
    {
      id: "subtitles",
      label: "Subtitles",
      current: currentSubtitle ? shortSubtitleLabel(currentSubtitle) : "Off",
      show: subtitleStreams.length > 0,
    },
    { id: "container", label: "Container", current: currentContainer, show: true },
    { id: "codec", label: "Video codec", current: currentCodec, show: true },
  ];

  return (
    <div
      className="player-menu player-settings-menu glass-panel"
      role="menu"
      aria-label="Player settings"
      onMouseLeave={scheduleClose}
    >
      <ul className="player-settings-rows">
        {rows.filter((r) => r.show).map((row) => (
          <li key={row.id}>
            <button
              type="button"
              role="menuitem"
              className={`player-settings-row ${section === row.id ? "is-active" : ""}`}
              onMouseEnter={() => openSection(row.id)}
              onFocus={() => openSection(row.id)}
              onClick={() => openSection(row.id)}
              aria-haspopup="menu"
              aria-expanded={section === row.id}
            >
              <span className="player-settings-label">{row.label}</span>
              <span className="player-settings-current">{row.current}</span>
              <span className="player-settings-chevron" aria-hidden="true">›</span>
            </button>
          </li>
        ))}
      </ul>

      {section && (
        <div
          className="player-settings-submenu glass-panel"
          role="menu"
          aria-label={`${section} options`}
          onMouseEnter={() => openSection(section)}
          onMouseLeave={scheduleClose}
        >
          {section === "quality" && (
            <ul>
              {(Object.keys(QUALITY_PRESETS) as QualityPreset[]).map((preset) => (
                <MenuItem
                  key={preset}
                  label={QUALITY_PRESETS[preset].label}
                  isActive={preset === qualityPreset}
                  onPick={() => onQualityPick(preset)}
                />
              ))}
            </ul>
          )}
          {section === "audio" && (
            <ul>
              {audioStreams.map((s) => (
                <MenuItem
                  key={s.Index}
                  label={audioLabel(s)}
                  isActive={s.Index === activeAudioIndex}
                  onPick={() => onAudioPick(s.Index)}
                />
              ))}
            </ul>
          )}
          {section === "subtitles" && (
            <ul>
              <MenuItem
                label="Off"
                isActive={activeSubtitleIndex === undefined}
                onPick={() => onSubtitlePick(undefined)}
              />
              {subtitleStreams.map((s) => (
                <MenuItem
                  key={s.Index}
                  label={subtitleLabel(s)}
                  isActive={s.Index === activeSubtitleIndex}
                  onPick={() => onSubtitlePick(s.Index)}
                />
              ))}
            </ul>
          )}
          {section === "container" && (
            <ul>
              {CONTAINER_OPTIONS.map((opt) => (
                <MenuItem
                  key={opt.label}
                  label={opt.label}
                  isActive={opt.value === containerOverride}
                  onPick={() => onContainerPick(opt.value)}
                />
              ))}
            </ul>
          )}
          {section === "codec" && (
            <ul>
              {VIDEO_CODEC_OPTIONS.map((opt) => (
                <MenuItem
                  key={opt.label}
                  label={opt.label}
                  isActive={opt.value === videoCodecOverride}
                  onPick={() => onVideoCodecPick(opt.value)}
                />
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function MenuItem({
  label,
  isActive,
  onPick,
}: {
  label: string;
  isActive: boolean;
  onPick: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        role="menuitemradio"
        aria-checked={isActive}
        className={`player-menu-item ${isActive ? "is-active" : ""}`}
        onClick={onPick}
      >
        <span className="player-menu-tick" aria-hidden="true">
          {isActive ? "✓" : ""}
        </span>
        <span>{label}</span>
      </button>
    </li>
  );
}

function subtitleLabel(s: JellyfinMediaStream): string {
  const parts: string[] = [];
  parts.push(s.DisplayTitle || s.Title || s.DisplayLanguage || s.Language || `Track ${s.Index}`);
  if (s.IsForced) parts.push("Forced");
  return parts.join(" · ");
}

function audioLabel(s: JellyfinMediaStream): string {
  const parts: string[] = [];
  parts.push(s.DisplayTitle || s.Title || s.DisplayLanguage || s.Language || `Track ${s.Index}`);
  const tail: string[] = [];
  if (s.Codec) tail.push(s.Codec.toUpperCase());
  if (s.ChannelLayout) tail.push(s.ChannelLayout);
  else if (s.Channels) tail.push(`${s.Channels}ch`);
  if (tail.length > 0) parts.push(`(${tail.join(" ")})`);
  return parts.join(" ");
}

/** Compact labels used in the settings-row "current value" column — full
 *  names like "English - Hearing Impaired - SUBRIP" don't fit the right
 *  column without ellipsing aggressively. */
function shortAudioLabel(s: JellyfinMediaStream): string {
  const tag = s.DisplayLanguage || s.Language || `Track ${s.Index}`;
  const layout = s.ChannelLayout ?? (s.Channels ? `${s.Channels}ch` : "");
  return layout ? `${tag} ${layout}` : tag;
}

function shortSubtitleLabel(s: JellyfinMediaStream): string {
  return s.DisplayLanguage || s.Language || s.Title || `Track ${s.Index}`;
}

function mediaTypeFromKind(item: MediaItem): string {
  if (item.kind === "music") return "Audio";
  if (item.kind === "series") return "Series";
  return "Movie";
}

export default PlayerOverlay;
