# Tailscale Access

Glassfin does not need special server code for Tailnet access. Run the container on Unraid, then expose the mapped host port with Tailscale.

## Private Tailnet Only

```bash
docker run -d --name glassfin --restart unless-stopped \
  -p 8088:8080 \
  -e JELLYFIN_URL=http://jellyfin:8096 \
  -e PUBLIC_APP_URL=http://unraid-host:8088 \
  -e REMOTE_ACCESS_MODE=tailscale \
  glassfin:latest

tailscale serve --bg http://127.0.0.1:8088
```

Use a Tailnet Jellyfin URL for `JELLYFIN_URL` when Jellyfin is also only reachable over Tailscale, for example `http://jellyfin-server.tailnet-name.ts.net:8096`.

## Public Funnel

If you intentionally want public internet access through Tailscale Funnel, point Funnel at the same host port and set:

```bash
REMOTE_ACCESS_MODE=tailscale
PUBLIC_APP_URL=https://your-machine.tailnet-name.ts.net
```

Prefer private Tailnet access for media libraries unless you have a clear reason to expose the app publicly.
