# Unraid deployment

Glassfin ships an Unraid Community Apps template at [`glassfin.xml`](glassfin.xml).

## Quick install (manual)

1. Open Unraid → Apps → near the top, click **Add Container**.
2. Set **Template** to *URL* and paste:
   ```
   https://raw.githubusercontent.com/nerkza/glassfin/main/deploy/unraid/glassfin.xml
   ```
3. Fill in:
   - **WebUI Port**: pick a free port (default `8088`).
   - **JELLYFIN_URL**: the Jellyfin URL the *browser* will hit. Usually `http://<unraid-ip>:8096` for a same-host install, or your Tailscale / Cloudflare hostname for remote.
   - **PUBLIC_APP_URL**: the URL you'll bookmark for Glassfin.
   - (Optional) **SONARR_URL** + **SONARR_API_KEY**, **RADARR_URL** + **RADARR_API_KEY** to enable request-from-search.
4. Click **Apply**. Glassfin pulls from GHCR, starts on the chosen port, and is reachable at `http://<unraid-ip>:<port>/`.

## Listed in Community Apps

Once the repository goes public and the template is reviewed, this XML can be submitted to the [Community Applications](https://forums.unraid.net/topic/38582-plug-in-community-applications/) plugin so users find Glassfin in the standard Apps tab without pasting a URL. Submission process: PR the XML into the [unRAID-CA-templates](https://github.com/Squidly271/community.applications) repo following their template requirements.

## Updating

The template uses the `:latest` tag from GHCR. Pull-on-update will pick up new images. To pin a specific version, edit the **Repository** field in the container settings:

```
ghcr.io/nerkza/glassfin:0.2.0
```

See [RELEASE.md](../RELEASE.md) for the tag scheme.

## Storage

Glassfin doesn't persist anything inside the container — all state is in the user's browser localStorage (sessions, plugin install state, prefs). No volume mappings needed.

## Networking

Default install uses the `bridge` network and exposes port 8080 inside the container. If you run Jellyfin on a custom Docker network, set Glassfin to that same network so it can resolve `http://jellyfin:8096` — but remember **the browser still has to reach `JELLYFIN_URL` directly**, so the URL you put in `JELLYFIN_URL` must be one the browser can resolve, not a Docker-internal hostname.

A common Unraid pattern:

```
JELLYFIN_URL=http://192.168.1.10:8096   # the LAN IP of Unraid
PUBLIC_APP_URL=http://192.168.1.10:8088
REMOTE_ACCESS_MODE=lan
```
