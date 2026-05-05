export type RuntimeConfig = {
  jellyfinUrl?: string;
  jellyfinApiKey?: string;
  jellyfinUserId?: string;
  publicAppUrl?: string;
  remoteAccessMode?: "lan" | "tailscale" | "cloudflare";
  // *arr companions — when both URL + API key are present for a service,
  // Glassfin surfaces a "Request via Sonarr/Radarr" affordance in the
  // search empty state.
  sonarrUrl?: string;
  sonarrApiKey?: string;
  radarrUrl?: string;
  radarrApiKey?: string;
};

declare global {
  interface Window {
    __GLASSFIN_CONFIG__?: RuntimeConfig;
  }
}

export function getRuntimeConfig(): RuntimeConfig {
  if (typeof window === "undefined") return {};
  return window.__GLASSFIN_CONFIG__ ?? {};
}
