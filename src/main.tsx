import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { applyThemeOverrides, loadPluginsFromRuntime, registry } from "./plugins";
import { restorePersistedBuiltIns } from "./plugins/index";
import { applyVisualPrefs, subscribePrefs } from "./prefs";
// Vidstack ships its own minimal stylesheet for the underlying media element
// + a few primitives (sliders, captions). We layer our glass theme on top
// via the .player-* classes in styles.css.
import "vidstack/player/styles/base.css";
import "vidstack/player/styles/default/sliders.css";
import "vidstack/player/styles/default/captions.css";
import "./styles.css";

// Visual prefs (accent, density, reduce-motion) apply before first paint so
// the user's customisation never flashes. Subscribe so subsequent toggles in
// Settings → Display take effect immediately without a reload.
applyVisualPrefs();
subscribePrefs((next) => applyVisualPrefs(next));

// Plugins load before paint so theme overrides take effect immediately.
// Runtime plugins from window.__GLASSFIN_PLUGINS__ load first, then any
// built-ins the user installed in a previous session. Failures never block
// the app — see plugins.ts for error handling.
void (async () => {
  await loadPluginsFromRuntime();
  await restorePersistedBuiltIns();
  applyThemeOverrides();
})();
registry.subscribe(applyThemeOverrides);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js");
  });
}
