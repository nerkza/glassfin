# Remote Access Guide

Glassfin is a browser PWA served by Nginx. Remote access has two separate URLs:

| URL | Purpose |
| --- | --- |
| `PUBLIC_APP_URL` | Where users open Glassfin |
| `JELLYFIN_URL` | Where the browser reaches Jellyfin API/media |

For remote playback to work, the browser must be able to reach `JELLYFIN_URL`. If Glassfin is public but Jellyfin is only on LAN, the UI loads but real Jellyfin requests will fail until Jellyfin is exposed through the same private network, Tailscale, Cloudflare Tunnel, or another reverse proxy.

## Modes

| Mode | `REMOTE_ACCESS_MODE` | Typical use |
| --- | --- | --- |
| LAN | `lan` | Unraid and Jellyfin on the same home network |
| Tailscale | `tailscale` | Private access across your Tailnet |
| Cloudflare Tunnel | `cloudflare` | HTTPS app URL through Cloudflare Zero Trust/Tunnel |

## Cloudflare Tunnel

Use `deploy/cloudflare-tunnel/config.example.yml` as the starting point. Recommended shape:

```bash
JELLYFIN_URL=https://jellyfin.example.com
PUBLIC_APP_URL=https://glassfin.example.com
REMOTE_ACCESS_MODE=cloudflare
```

For private media libraries, put Cloudflare Access in front of the Glassfin hostname and consider putting Jellyfin behind a separate Access policy.

## Tailscale

Use `deploy/tailscale/README.md` for Tailnet examples. Recommended shape:

```bash
JELLYFIN_URL=http://jellyfin-server.tailnet-name.ts.net:8096
PUBLIC_APP_URL=https://unraid-server.tailnet-name.ts.net
REMOTE_ACCESS_MODE=tailscale
```

## Reverse Proxy Notes

Glassfin should be served from a hostname or subdomain root, for example `https://glassfin.example.com`. Subpath mounting such as `/glassfin/` is not currently a supported deployment target.

## CORS — make Jellyfin reachable from the browser

The browser opens Glassfin from the Glassfin hostname and makes XHR/fetch calls directly to Jellyfin from there. That's a cross-origin request, so the Jellyfin server has to allow it.

Two ways to handle this:

### Option A — same parent host or subdomain (recommended)

When Glassfin and Jellyfin sit behind the same reverse proxy on related hostnames (e.g. `glassfin.example.com` and `jellyfin.example.com`), modern browsers don't require a CORS preflight for simple GETs to most Jellyfin endpoints, and the auth POST works because Jellyfin echoes back permissive CORS headers when called with `X-Emby-Authorization`.

In practice this just works. If you hit CORS errors anyway, jump to Option B.

### Option B — explicit CORS allow-list

Open Jellyfin's `Dashboard → Networking → Known proxies / CORS` (or edit `network.xml`) and add the Glassfin origin to **Known web origins**:

```
https://glassfin.example.com
http://glassfin.local:8080
```

Restart Jellyfin. Browser console will stop logging CORS errors.

If you run Jellyfin behind your own reverse proxy and the CORS headers still don't make it through, add at the proxy layer:

```nginx
# nginx — relay to Jellyfin
location / {
  proxy_pass http://jellyfin:8096;
  proxy_set_header Host $host;
  proxy_set_header X-Real-IP $remote_addr;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  proxy_set_header X-Forwarded-Proto $scheme;
  add_header Access-Control-Allow-Origin "$http_origin" always;
  add_header Access-Control-Allow-Credentials "true" always;
  add_header Access-Control-Allow-Methods "GET, POST, OPTIONS, DELETE, PUT" always;
  add_header Access-Control-Allow-Headers "Authorization, Content-Type, X-Emby-Authorization, X-Emby-Token" always;
  if ($request_method = OPTIONS) { return 204; }
}
```

## Security headers

Glassfin's nginx ships strict security headers by default:

| Header | Value | Why |
| --- | --- | --- |
| `Content-Security-Policy` | Templated per-deployment from env vars | `connect-src` is auto-derived from `JELLYFIN_URL`, `SONARR_URL`, `RADARR_URL` so the browser is only allowed to talk to those servers — nothing else |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` | Once a user reaches Glassfin over HTTPS, the browser pins HTTPS for a year |
| `X-Frame-Options` | `DENY` | Prevents Glassfin from being iframe'd anywhere — clickjacking defence |
| `X-Content-Type-Options` | `nosniff` | Browsers must respect declared `Content-Type` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | URL paths don't leak in the Referer header to other origins |
| `Permissions-Policy` | Deny everything except fullscreen + PiP for the player | Lock down powerful APIs the app doesn't use |

The CSP `script-src` is `'self'` — no inline scripts, no `eval`. Plugins follow the same rule (they're served as same-origin JS modules via the loader, never inline).

If you're running behind Cloudflare and want HSTS preload, configure that at the Cloudflare edge in addition to the upstream header.

## /version.json

Generated at container start with build metadata:

```json
{
  "name": "glassfin",
  "version": "0.1.0",
  "gitSha": "abc1234",
  "builtAt": "2026-05-06T12:34:56Z",
  "remoteAccessMode": "cloudflare"
}
```

CI populates `GLASSFIN_VERSION` / `GLASSFIN_GIT_SHA` / `GLASSFIN_BUILT_AT` as Docker `--build-arg` values. The Settings → About surface in-app reads this endpoint to confirm what's deployed.
