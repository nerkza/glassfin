/*
  Plugin system foundation.

  Scope (this commit):
  - Manifest schema (PluginManifest).
  - Runtime registry (themes + settings panels).
  - Loader that dynamic-imports plugin URLs from window.__GLASSFIN_PLUGINS__.
  - Per-plugin tracking of theme keys so uninstall cleanly reverts.
  - Logger integration (no direct console use; entries appear in Settings → Logs).

  Out of scope (Phase 6 follow-ups, intentionally deferred):
  - Per-plugin sandboxing.
  - Per-plugin isolated storage.
  - Data-source plugins (alternative metadata providers).
  - React component panels (current contract is HTML strings; OK for static
    settings, deliberately under-powered for stateful UIs until the API is
    proven by real plugins).

  Why this much, this early:
  - We want third-party authors to be able to publish a plugin without forking
    Glassfin. That requires a stable manifest and a small public API surface.
  - Theme + settings-panel covers ~80% of useful early plugins (custom palettes,
    integrations like "scrobble to last.fm", IMDb deep-link enrichment, etc.).
*/

import { logger } from "./logger";

const log = logger.scope("plugins");

export type PluginManifest = {
  /** Stable id used as a key. Avoid renaming. */
  id: string;
  /** Human-friendly name shown in Settings → Plugins. */
  name: string;
  /** Short description shown in Settings. */
  description: string;
  /** Semver-style. */
  version: string;
  /** Optional author/email/URL — purely informational. */
  author?: string;
};

export type ThemeOverrides = Record<string, string>;

export type SettingsPanel = {
  id: string;
  label: string;
  /** Plugins return raw HTML for now. A future revision can swap this for
   *  React components once the plugin contract is stable. */
  render: () => string;
};

export type PluginApi = {
  registerTheme: (overrides: ThemeOverrides) => void;
  registerSettingsPanel: (panel: SettingsPanel) => void;
};

export type Plugin = {
  manifest: PluginManifest;
  /** Called once when the plugin is first loaded. */
  register: (api: PluginApi) => void | Promise<void>;
};

declare global {
  interface Window {
    __GLASSFIN_PLUGINS__?: string[];
  }
}

type Listener = () => void;

const INSTALLED_STORAGE_KEY = "glassfin.plugins.installed";

function readInstalledIds(): Set<string> {
  try {
    const raw = window.localStorage.getItem(INSTALLED_STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((x): x is string => typeof x === "string"));
  } catch {
    return new Set();
  }
}

function writeInstalledIds(ids: Set<string>) {
  try {
    window.localStorage.setItem(INSTALLED_STORAGE_KEY, JSON.stringify(Array.from(ids)));
  } catch (error) {
    log.warn("Failed to persist plugin install state", error);
  }
}

/** IDs of plugins the user previously installed. The runtime is responsible
 *  for resolving each ID to a Plugin (e.g., the built-in directory) and
 *  reinstalling it on app boot. Runtime-loaded plugins (window.__GLASSFIN_PLUGINS__)
 *  follow their own load path and don't need this. */
export function getPersistedInstalledIds(): string[] {
  return Array.from(readInstalledIds());
}

class PluginRegistry {
  private plugins = new Map<string, Plugin>();
  private themes = new Map<string, ThemeOverrides>();
  private panels = new Map<string, SettingsPanel[]>();
  private listeners = new Set<Listener>();

  list(): Plugin[] {
    return Array.from(this.plugins.values());
  }

  has(id: string): boolean {
    return this.plugins.has(id);
  }

  themeOverrides(): ThemeOverrides {
    const merged: ThemeOverrides = {};
    for (const overrides of this.themes.values()) {
      Object.assign(merged, overrides);
    }
    return merged;
  }

  /** All registered settings panels, in install order. */
  settingsPanels(): SettingsPanel[] {
    return Array.from(this.panels.values()).flat();
  }

  /** Settings panels registered by a specific plugin. Used by the Settings UI
   *  to render panels grouped under their owning plugin. */
  panelsFor(pluginId: string): SettingsPanel[] {
    return this.panels.get(pluginId) ?? [];
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  async install(plugin: Plugin) {
    if (this.plugins.has(plugin.manifest.id)) {
      log.warn(`${plugin.manifest.id} already installed; skipping.`);
      return;
    }
    log.info(`Installing ${plugin.manifest.id} v${plugin.manifest.version}`);
    this.plugins.set(plugin.manifest.id, plugin);
    const api: PluginApi = {
      registerTheme: (overrides) => {
        log.debug(`${plugin.manifest.id}: registerTheme`, overrides);
        this.themes.set(plugin.manifest.id, overrides);
      },
      registerSettingsPanel: (panel) => {
        log.debug(`${plugin.manifest.id}: registerSettingsPanel`, { id: panel.id, label: panel.label });
        const existing = this.panels.get(plugin.manifest.id) ?? [];
        existing.push(panel);
        this.panels.set(plugin.manifest.id, existing);
      },
    };
    try {
      await plugin.register(api);
      log.info(`Installed ${plugin.manifest.id}`);
    } catch (error) {
      log.error(`register() failed for ${plugin.manifest.id}`, error);
    }
    // Persist the installed-plugin set so the next page load can re-install
    // built-ins. Runtime-loaded plugins (window.__GLASSFIN_PLUGINS__) appear
    // here too — that's harmless: at boot we only re-install IDs that match
    // an entry in the built-in directory, and runtime plugins are reloaded
    // independently from their URLs.
    const installed = readInstalledIds();
    installed.add(plugin.manifest.id);
    writeInstalledIds(installed);
    this.notify();
  }

  uninstall(id: string) {
    if (!this.plugins.has(id)) return;
    log.info(`Uninstalling ${id}`);
    // Capture the keys this plugin owned so we can revert them in the DOM.
    const themeKeys = Object.keys(this.themes.get(id) ?? {});
    this.plugins.delete(id);
    this.themes.delete(id);
    this.panels.delete(id);
    const installed = readInstalledIds();
    installed.delete(id);
    writeInstalledIds(installed);
    // Clear the CSS variables that this plugin was the sole writer of. Other
    // plugins may still set the same variable; applyThemeOverrides will rewrite
    // those after we notify.
    if (themeKeys.length > 0) {
      const remaining = this.themeOverrides();
      const root = document.documentElement;
      for (const key of themeKeys) {
        const cssKey = key.startsWith("--") ? key : `--${key}`;
        if (!(key in remaining) && !(`--${key}` in remaining)) {
          root.style.removeProperty(cssKey);
        }
      }
    }
    this.notify();
  }

  private notify() {
    for (const listener of this.listeners) listener();
  }
}

export const registry = new PluginRegistry();

/**
 * Dynamic-import every URL in `window.__GLASSFIN_PLUGINS__`. Each module is
 * expected to default-export a `Plugin`.
 */
export async function loadPluginsFromRuntime() {
  const urls = window.__GLASSFIN_PLUGINS__ ?? [];
  if (urls.length === 0) return;
  log.info(`Loading ${urls.length} plugin(s) from runtime config`);
  for (const url of urls) {
    try {
      const mod = await import(/* @vite-ignore */ url);
      const plugin = (mod.default ?? mod) as Plugin;
      if (!plugin?.manifest?.id) {
        log.warn(`${url} did not export a Plugin; skipping.`);
        continue;
      }
      await registry.install(plugin);
    } catch (error) {
      log.error(`failed to load ${url}`, error);
    }
  }
}

/** Apply currently-registered theme overrides to <html> via CSS variables. */
export function applyThemeOverrides() {
  const overrides = registry.themeOverrides();
  const root = document.documentElement;
  for (const [key, value] of Object.entries(overrides)) {
    root.style.setProperty(key.startsWith("--") ? key : `--${key}`, value);
  }
}
