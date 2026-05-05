#!/bin/sh
set -eu

# 1. Runtime config — read by window.__GLASSFIN_CONFIG__ at boot. Empty
#    strings are treated as "unconfigured" by the app.
cat > /usr/share/nginx/html/config.js <<EOF
window.__GLASSFIN_CONFIG__ = {
  jellyfinUrl: "${JELLYFIN_URL:-}",
  jellyfinApiKey: "${JELLYFIN_API_KEY:-}",
  jellyfinUserId: "${JELLYFIN_USER_ID:-}",
  publicAppUrl: "${PUBLIC_APP_URL:-}",
  remoteAccessMode: "${REMOTE_ACCESS_MODE:-lan}",
  sonarrUrl: "${SONARR_URL:-}",
  sonarrApiKey: "${SONARR_API_KEY:-}",
  radarrUrl: "${RADARR_URL:-}",
  radarrApiKey: "${RADARR_API_KEY:-}"
};
EOF

# 2. Build metadata — surfaced at /version.json. GLASSFIN_VERSION /
#    GLASSFIN_GIT_SHA / GLASSFIN_BUILT_AT are baked at image-build time
#    via Docker build args; defaults if not provided.
cat > /usr/share/nginx/html/version.json <<EOF
{
  "name": "glassfin",
  "version": "${GLASSFIN_VERSION:-0.1.0}",
  "gitSha": "${GLASSFIN_GIT_SHA:-unknown}",
  "builtAt": "${GLASSFIN_BUILT_AT:-unknown}",
  "remoteAccessMode": "${REMOTE_ACCESS_MODE:-lan}"
}
EOF

# 3. CSP. The browser fetches Jellyfin and (optionally) Sonarr/Radarr
#    directly, so connect-src + img-src + media-src all need to allow
#    those hosts. We extract the origin (scheme + host + port) from each
#    configured URL and stitch them into the CSP.
#
#    Why we don't just use 'self' + a wildcard: the wildcard either lets
#    in any host (defeating the point) or has to be tied to a single
#    domain. Templating from the actual URLs the user configured gives a
#    tight CSP without forcing them to write one by hand.
csp_origin() {
  printf '%s' "$1" | sed -E 's,^(https?://[^/]+).*$,\1,'
}

JELLYFIN_ORIGIN=""
SONARR_ORIGIN=""
RADARR_ORIGIN=""
[ -n "${JELLYFIN_URL:-}" ] && JELLYFIN_ORIGIN=$(csp_origin "$JELLYFIN_URL")
[ -n "${SONARR_URL:-}" ] && SONARR_ORIGIN=$(csp_origin "$SONARR_URL")
[ -n "${RADARR_URL:-}" ] && RADARR_ORIGIN=$(csp_origin "$RADARR_URL")

# Always allow data: + blob: for inline images and HLS media segments.
# Always allow 'self' so SPA assets keep working. Allow https: in img-src
# specifically because *arr lookup results return image URLs from TMDB,
# Fanart.tv, IMDb, etc. — the user can't reasonably enumerate every
# poster source they'll see, and posters are low-risk.
CONNECT_SRC="'self' $JELLYFIN_ORIGIN $SONARR_ORIGIN $RADARR_ORIGIN"
IMG_SRC="'self' data: blob: https: $JELLYFIN_ORIGIN"
MEDIA_SRC="'self' blob: $JELLYFIN_ORIGIN"

# 'unsafe-inline' on style-src is required for Vite's runtime style
# injection and our inline `style={{...}}` props on hero / settings
# components. Removing it would mean rewriting every inline style site
# and is deferred for now. script-src stays strict (no inline / no eval).
cat > /etc/nginx/conf.d/glassfin-csp.conf <<EOF
add_header Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src ${IMG_SRC}; media-src ${MEDIA_SRC}; connect-src ${CONNECT_SRC}; font-src 'self' data:; worker-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none';" always;
EOF

exec nginx -g "daemon off;"
