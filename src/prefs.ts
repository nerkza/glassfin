/*
  Persisted UI preferences.

  Single localStorage key with a versioned schema. Each new field needs a
  default in DEFAULTS and a fallback in readRaw's migration block so older
  saved payloads keep working.

  This is for purely local choices (theme accents, default playback quality,
  hidden libraries). Server config lives in jellyfin.ts, session state in
  App.tsx, plugin install state in plugins.ts.
*/

import { logger } from "./logger";
import type { LibraryTab } from "./router";

const log = logger.scope("prefs");

const STORAGE_KEY = "glassfin.prefs";
const STORAGE_VERSION = 2;

export type QualityPresetId = "auto" | "p2160" | "p1440" | "p1080" | "p720" | "p480";
export type LayoutDensity = "compact" | "default" | "spacious";
export type SubtitleMode = "off" | "auto" | "forced";

export type Prefs = {
  version: number;

  /** IDs of library tabs the user has hidden from the side rail. The Home tab
   *  cannot be hidden. */
  hiddenLibraryTabs: LibraryTab[];

  /** Jellyfin library (View) IDs the user has hidden across the app. Empty
   *  list = show everything. Drives library list filtering when the View
   *  metadata is available; ignored when it's not. */
  hiddenLibraryIds: string[];

  /** Default quality preset applied on player open. "auto" = direct play. */
  defaultQualityPreset: QualityPresetId;

  /** ISO 639-2 lowercase language code (e.g. "eng", "spa"). Empty string
   *  means "no preference — use track marked default". */
  preferredAudioLanguage: string;

  /** ISO 639-2 lowercase language code for subtitles. Empty = no preference. */
  preferredSubtitleLanguage: string;

  /** off: never auto-show subs; auto: show track matching preferredSubtitleLanguage;
   *  forced: only show subs flagged Forced. */
  subtitleMode: SubtitleMode;

  /** Custom accent CSS color (hex like "#ff8a4c") or null to use the theme
   *  default. Drives `--accent` on `:root`. */
  accentColor: string | null;

  /** Layout density — affects spacing/sizing across rails and cards. Drives
   *  `data-density` on `<html>`. */
  layoutDensity: LayoutDensity;

  /** Honour `prefers-reduced-motion` media query is automatic; this lets the
   *  user force-disable motion regardless of OS setting. */
  reduceMotion: boolean;
};

const DEFAULTS: Prefs = {
  version: STORAGE_VERSION,
  hiddenLibraryTabs: [],
  hiddenLibraryIds: [],
  defaultQualityPreset: "auto",
  preferredAudioLanguage: "",
  preferredSubtitleLanguage: "",
  subtitleMode: "auto",
  accentColor: null,
  layoutDensity: "default",
  reduceMotion: false,
};

const VALID_QUALITY_PRESETS: QualityPresetId[] = ["auto", "p2160", "p1440", "p1080", "p720", "p480"];
const VALID_DENSITY: LayoutDensity[] = ["compact", "default", "spacious"];
const VALID_SUBTITLE_MODE: SubtitleMode[] = ["off", "auto", "forced"];

function pickEnum<T extends string>(value: unknown, allowed: T[], fallback: T): T {
  return typeof value === "string" && (allowed as string[]).includes(value) ? (value as T) : fallback;
}

function pickString(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

function pickHexColor(value: unknown): string | null {
  if (typeof value !== "string") return null;
  // Accept #abc, #aabbcc, #aabbccdd. Anything else falls back to null so we
  // never ship a malformed colour into a CSS variable.
  return /^#[0-9a-fA-F]{3,8}$/.test(value) ? value : null;
}

function readRaw(): Prefs {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return { ...DEFAULTS };

    // Migration: v1 → v2 simply fills in the new fields with defaults; no
    // saved values are lost. Add additional `if (parsed.version < 3)` blocks
    // here when the schema evolves further.
    return {
      version: STORAGE_VERSION,
      hiddenLibraryTabs: Array.isArray(parsed.hiddenLibraryTabs)
        ? parsed.hiddenLibraryTabs.filter(
            (t: unknown): t is LibraryTab =>
              t === "movies" || t === "shows" || t === "music" || t === "live",
          )
        : [],
      hiddenLibraryIds: Array.isArray(parsed.hiddenLibraryIds)
        ? parsed.hiddenLibraryIds.filter((x: unknown): x is string => typeof x === "string")
        : [],
      defaultQualityPreset: pickEnum(parsed.defaultQualityPreset, VALID_QUALITY_PRESETS, "auto"),
      preferredAudioLanguage: pickString(parsed.preferredAudioLanguage, ""),
      preferredSubtitleLanguage: pickString(parsed.preferredSubtitleLanguage, ""),
      subtitleMode: pickEnum(parsed.subtitleMode, VALID_SUBTITLE_MODE, "auto"),
      accentColor: pickHexColor(parsed.accentColor),
      layoutDensity: pickEnum(parsed.layoutDensity, VALID_DENSITY, "default"),
      reduceMotion: parsed.reduceMotion === true,
    };
  } catch (error) {
    log.warn("Failed to read prefs; using defaults", error);
    return { ...DEFAULTS };
  }
}

function writeRaw(prefs: Prefs) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch (error) {
    log.warn("Failed to persist prefs", error);
  }
}

type Listener = (prefs: Prefs) => void;
const listeners = new Set<Listener>();
let cached: Prefs | null = null;

export function getPrefs(): Prefs {
  if (cached === null) cached = readRaw();
  return cached;
}

export function setPrefs(next: Prefs) {
  cached = next;
  writeRaw(next);
  for (const listener of listeners) listener(next);
}

export function updatePrefs(updater: (current: Prefs) => Prefs) {
  setPrefs(updater(getPrefs()));
}

export function subscribePrefs(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function setLibraryTabHidden(tab: LibraryTab, hidden: boolean) {
  updatePrefs((current) => {
    const set = new Set(current.hiddenLibraryTabs);
    if (hidden) set.add(tab);
    else set.delete(tab);
    return { ...current, hiddenLibraryTabs: Array.from(set) };
  });
}

export function setLibraryIdHidden(id: string, hidden: boolean) {
  updatePrefs((current) => {
    const set = new Set(current.hiddenLibraryIds);
    if (hidden) set.add(id);
    else set.delete(id);
    return { ...current, hiddenLibraryIds: Array.from(set) };
  });
}

/**
 * Apply visual prefs (accent, density, reduce-motion) to <html>. Called once
 * at app boot from main.tsx, then again whenever prefs change via the
 * subscriber wired in App.tsx. Safe to call repeatedly.
 */
export function applyVisualPrefs(prefs: Prefs = getPrefs()) {
  const root = document.documentElement;
  if (prefs.accentColor) {
    root.style.setProperty("--accent", prefs.accentColor);
  } else {
    root.style.removeProperty("--accent");
  }
  root.dataset.density = prefs.layoutDensity;
  if (prefs.reduceMotion) {
    root.dataset.reduceMotion = "true";
  } else {
    delete root.dataset.reduceMotion;
  }
}
