import type { Plugin } from "../plugins";

/*
  Reference plugin: "Sunset" theme.

  Two reasons this exists:
    1. Validates the plugin API surface end-to-end against a real artifact —
       theme override AND a settings panel. If the public API is broken, the
       reference plugin is the canary.
    2. Gives plugin authors a working example to copy. Single file, no build
       step required, dependency-free, ~50 lines of plugin code.

  What it does:
    - Repaints the accent palette warm (orange/pink) by overriding the
      --accent / --accent-strong CSS variables.
    - Adds a settings panel rendering the plugin's load timestamp and the
      effective theme overrides. (Useful as a sanity check for new plugin
      authors: "is my plugin actually applied?")

  How to install:
    Settings → Plugins → "Built-in plugins" → click "Install" next to Sunset.
    The Install action dynamic-imports this file via `await import("./plugins/sunset-theme")`
    so the loader path is exercised the same way third-party plugins would be.

  How to write your own:
    Default-export an object matching the `Plugin` shape. Inside register()
    call any of the `api.register*` methods. Return synchronously or via a
    Promise — both are awaited.
*/

const loadedAt = new Date();

const sunsetTheme: Plugin = {
  manifest: {
    id: "glassfin.sunset",
    name: "Sunset",
    description: "Warm orange/pink accent palette. Demonstrates the plugin theme override API.",
    version: "0.1.0",
    author: "Glassfin",
  },
  register(api) {
    api.registerTheme({
      "--accent": "#ff8a4c",
      "--accent-strong": "#ff7a3c",
      "--accent-soft": "rgba(255, 138, 76, 0.20)",
      "--accent-quiet": "rgba(255, 138, 76, 0.08)",
    });

    api.registerSettingsPanel({
      id: "sunset-stats",
      label: "Sunset Stats",
      render() {
        // Plugin panels return raw HTML strings. Glassfin renders them via
        // dangerouslySetInnerHTML — plugins are user-installed code that ran
        // arbitrary JS during register(), so the trust boundary is the
        // install action itself, not the panel HTML.
        const elapsed = Math.round((Date.now() - loadedAt.getTime()) / 1000);
        return `
          <div class="plugin-panel">
            <p>This panel is rendered from the <strong>Sunset</strong> reference plugin
            to prove the settings-panel API works end-to-end.</p>
            <dl class="plugin-stats">
              <dt>Loaded at</dt><dd>${escapeHtml(loadedAt.toLocaleString())}</dd>
              <dt>Time installed</dt><dd>${elapsed}s</dd>
              <dt>Theme overrides</dt>
              <dd><code>--accent</code>, <code>--accent-strong</code>, <code>--accent-soft</code>, <code>--accent-quiet</code></dd>
            </dl>
          </div>
        `.trim();
      },
    });
  },
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export default sunsetTheme;
