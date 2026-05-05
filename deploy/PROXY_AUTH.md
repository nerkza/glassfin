# Reverse-proxy auth compatibility

Glassfin doesn't authenticate users itself — it forwards a Jellyfin sign-in. But many self-hosters wrap their stack in a reverse proxy that adds its own auth layer (Authelia, Cloudflare Access, Caddy `basicauth`, nginx `auth_basic`, Traefik forward-auth, etc.).

This doc explains how Glassfin behaves under each, and what to do when something breaks.

## TL;DR

| Proxy auth | Works out of the box? | Notes |
|---|---|---|
| **Cloudflare Access** (one policy covering both apps) | ✓ | See [cloudflare-tunnel/ACCESS.md](cloudflare-tunnel/ACCESS.md) |
| **Authelia + nginx** | ✓ | Needs both apps under the same domain; Authelia cookie scope `.example.com` |
| **Caddy `basicauth`** | ⚠ | Browser sends `Authorization: Basic …` to Jellyfin too — Jellyfin rejects with 401 |
| **nginx `auth_basic`** | ⚠ | Same issue as Caddy |
| **Traefik ForwardAuth** | ✓ | When auth happens before the connection reaches Glassfin / Jellyfin, behaves like Authelia |
| **Pomerium** | ✓ | OIDC-style, behaves like Cloudflare Access |
| **Tailscale Funnel + serve** | ✓ | No proxy auth — Tailscale auth covers it |

## The core constraint

Glassfin makes browser→Jellyfin XHRs from the Glassfin origin. If the Jellyfin origin requires HTTP Basic auth (or any auth header that the browser would only send on direct user interaction), the XHR fails because the browser doesn't volunteer credentials for cross-origin fetches.

Two paths around this:

1. **Move auth one layer up** — protect both Glassfin and Jellyfin behind the same SSO (Authelia, Cloudflare Access, Pomerium). The proxy auth is satisfied once at login; the XHR rides on session cookies that the browser DOES include in cross-origin requests.

2. **Don't auth Jellyfin's origin at all** — let Jellyfin's own login screen be the only auth, and rely on network-level access control (Tailscale, LAN, VPN) to keep it private. Glassfin signs the user in via auth-by-name; no proxy auth on Jellyfin's hostname.

Avoid Path 3: HTTP Basic on Jellyfin while Glassfin is on a sibling hostname. The XHRs will not work.

## Authelia worked example

Same domain, both apps:

```
glassfin.example.com  →  authelia → glassfin container
jellyfin.example.com  →  authelia → jellyfin container
auth.example.com      →  authelia portal
```

Authelia configuration:

```yaml
# configuration.yml
session:
  domain: example.com    # CRITICAL — covers all subdomains so the cookie travels with XHRs

access_control:
  default_policy: deny
  rules:
    - domain:
        - "glassfin.example.com"
        - "jellyfin.example.com"
      policy: one_factor    # or two_factor for sensitive setups
      subject: "group:family"
```

nginx integration: standard Authelia pattern with `auth_request /authelia` on both apps.

## Tailscale serve

```bash
tailscale serve --bg --https=443 --set-path=/ http://localhost:8088
```

No app-layer auth needed — Tailscale ACLs gate who reaches the host. Glassfin and Jellyfin both ride on the Tailnet; the user signs into Jellyfin via auth-by-name as normal.

## What about plain Basic Auth?

If you absolutely must put Basic Auth in front of Glassfin (e.g. you want a household-shared password that doesn't involve Jellyfin accounts), put it ONLY on the Glassfin origin. Jellyfin must be reachable from the browser without any extra auth header beyond Jellyfin's own.

Caddy:

```
glassfin.example.com {
  basicauth {
    family $2a$14$abcd…   # bcrypt hash
  }
  reverse_proxy localhost:8088
}

jellyfin.example.com {
  reverse_proxy localhost:8096
}
```

The browser sends Basic credentials when fetching Glassfin's HTML. After login, the user signs in to Jellyfin via Glassfin's form; XHRs go to `jellyfin.example.com` which has no Basic Auth, so they succeed.

This works but it's a weak setup — anyone with the household password can hit Jellyfin's API directly via curl. Prefer Path 1 (Authelia / Cloudflare Access) for any setup more sensitive than "media library no one cares about".

## Diagnosing

When XHRs to Jellyfin fail under a proxy, check the browser console:

- **CORS error** → Jellyfin isn't allowing the Glassfin origin. See [REMOTE_ACCESS.md](REMOTE_ACCESS.md) §CORS.
- **401 with `WWW-Authenticate: Basic` in response headers** → Jellyfin's origin requires Basic Auth. Move the auth one layer up (Path 1) or remove it (Path 2).
- **Network failure with no response** → Either the URL doesn't resolve from where the browser is, or a Cloudflare WAF rule challenged the request. Check the Cloudflare events / proxy access log.

## Proxy headers Glassfin doesn't care about

Glassfin doesn't read `X-Forwarded-User`, `X-Auth-Email`, or any reverse-proxy "forwarded user" header. Jellyfin's session is what's used for identity. If you'd like Glassfin to auto-sign-in based on a proxy-injected user header, file an issue — it's a viable feature, just not built.
