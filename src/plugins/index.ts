/*
  Built-in plugin directory.

  Lists plugins that ship with Glassfin and can be installed from
  Settings → Plugins without configuring a plugin URL. Each entry holds the
  metadata shown in the install card plus a `load` factory that dynamic-imports
  the plugin module — same code path as a third-party plugin loaded via
  window.__GLASSFIN_PLUGINS__, so the loader is exercised identically.

  To add a built-in: drop a new file at src/plugins/<id>.ts that default-exports
  a Plugin, then add an entry here.
*/

import { getPersistedInstalledIds, registry, type Plugin } from "../plugins";
import { logger } from "../logger";

const log = logger.scope("plugins");

export type BuiltInPlugin = {
  id: string;
  name: string;
  description: string;
  load: () => Promise<Plugin>;
};

export const builtInPlugins: BuiltInPlugin[] = [
  {
    id: "glassfin.sunset",
    name: "Sunset",
    description: "Warm orange/pink accent palette. Reference plugin demonstrating the public API.",
    load: () => import("./sunset-theme").then((m) => m.default),
  },
];

/**
 * Re-install any built-in plugins the user installed in a previous session.
 * Called once at app boot from main.tsx, after runtime plugins have loaded.
 * IDs not present in the built-in directory are ignored — those are either
 * stale entries (a plugin that was renamed) or runtime URL plugins that
 * follow a different load path.
 */
export async function restorePersistedBuiltIns() {
  const ids = getPersistedInstalledIds();
  if (ids.length === 0) return;
  const matching = ids
    .map((id) => builtInPlugins.find((b) => b.id === id))
    .filter((entry): entry is BuiltInPlugin => entry !== undefined);
  if (matching.length === 0) return;
  log.info(`Restoring ${matching.length} persisted built-in plugin(s)`);
  for (const entry of matching) {
    if (registry.has(entry.id)) continue;
    try {
      const plugin = await entry.load();
      await registry.install(plugin);
    } catch (error) {
      log.error(`Failed to restore ${entry.id}`, error);
    }
  }
}
