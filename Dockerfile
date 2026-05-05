FROM node:24-alpine AS build
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY docker-entrypoint.sh /docker-entrypoint.sh
COPY --from=build /app/dist /usr/share/nginx/html

# Build-time metadata baked into the runtime entrypoint and surfaced at
# /version.json. Pass --build-arg GLASSFIN_VERSION=… GLASSFIN_GIT_SHA=…
# GLASSFIN_BUILT_AT=… in CI to populate. Defaults are left intentionally
# vague so a hand-built image is identifiable as "not from CI".
ARG GLASSFIN_VERSION="0.1.0-dev"
ARG GLASSFIN_GIT_SHA="local"
ARG GLASSFIN_BUILT_AT="local"
ENV GLASSFIN_VERSION=${GLASSFIN_VERSION}
ENV GLASSFIN_GIT_SHA=${GLASSFIN_GIT_SHA}
ENV GLASSFIN_BUILT_AT=${GLASSFIN_BUILT_AT}

# Runtime-config env vars. All optional. The entrypoint writes empty
# strings into config.js when unset; the app treats those as "unconfigured".
ENV JELLYFIN_URL=""
ENV JELLYFIN_API_KEY=""
ENV JELLYFIN_USER_ID=""
ENV PUBLIC_APP_URL=""
ENV REMOTE_ACCESS_MODE="lan"
ENV SONARR_URL=""
ENV SONARR_API_KEY=""
ENV RADARR_URL=""
ENV RADARR_API_KEY=""

RUN chmod +x /docker-entrypoint.sh

EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/health || exit 1

ENTRYPOINT ["/docker-entrypoint.sh"]
