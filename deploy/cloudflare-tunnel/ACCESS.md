# Cloudflare Access — worked example

Putting Glassfin and Jellyfin behind Cloudflare Access turns the public URL into one that requires a verified email (or hardware key, or TOTP) before serving any HTML. Useful when you want family/household access from anywhere without exposing a media library to the open internet.

This is **end-to-end** — what to configure on Cloudflare's side, how to keep CORS happy, and the failure modes to expect.

## What you'll have at the end

```
[user] → glassfin.example.com → Cloudflare Access (login wall) → Cloudflare Tunnel → Glassfin container (Unraid)
                                                                                       ↓ browser fetches
                                                                                       jellyfin.example.com → same Access policy → Jellyfin
```

The browser opens Glassfin. Glassfin's static HTML loads (cached behind Access's policy). The browser then makes XHR/fetch calls to `JELLYFIN_URL=https://jellyfin.example.com`. Cloudflare Access intercepts those too — but because the user is already authenticated for `*.example.com`, the requests pass through silently with the Access JWT cookie.

## Prerequisites

- A Cloudflare account.
- A domain on Cloudflare (e.g. `example.com`).
- Cloudflare Tunnel set up with an active connector (cloudflared running on Unraid). The existing [config.example.yml](config.example.yml) covers the tunnel itself.

## Step 1 — App definition

In the Cloudflare dashboard:

1. **Zero Trust → Access → Applications → Add an application → Self-hosted.**
2. Name: **Glassfin**.
3. Application domain: `glassfin.example.com`. Add a second application for `jellyfin.example.com` — both need the same policy so the JWT works for cross-origin XHRs.

   Or: define one application with subdomain wildcard `*.example.com` if you want the policy to cover everything in your tunnel.

4. **Identity providers**: pick whatever you've configured (Google, GitHub, OTP-by-email is the easy path).

## Step 2 — Policies

The simplest policy for a household:

| Field | Value |
|---|---|
| Action | Allow |
| Rule | `Emails` is one of `you@gmail.com, partner@gmail.com, kid@gmail.com` |
| Session duration | 30 days |

Tighter:

| Field | Value |
|---|---|
| Action | Allow |
| Rule | `Email domain` is `example.com` AND `Country` is `United Kingdom` |
| Require | One of: TOTP, hardware key |
| Session duration | 24 hours |

## Step 3 — CORS implications

Cloudflare Access **adds an Origin check** to cross-domain XHRs. With both Glassfin and Jellyfin under the same parent domain (`*.example.com`) and one policy covering both, this just works.

**Watchouts:**

- If Glassfin is on `example.com` but Jellyfin is on `jellyfin.example.com`, the JWT cookie scope is wrong — set the cookie scope explicitly on the Jellyfin app to `.example.com`.
- If you put Glassfin and Jellyfin on different parent domains, the user has to log in twice and the second-domain XHR will fail unless you add the first domain to **Service tokens** or use **Mutual TLS** between them. Not worth it — keep them under one parent domain.

## Step 4 — Service Auth for the API key path

If you also use `JELLYFIN_API_KEY` (so Glassfin can hit Jellyfin without a user-side login — rare, mostly for headless dashboards), you need a **Service Token**:

1. **Zero Trust → Access → Service Auth → Create service token.**
2. Name: `glassfin-server`. Save the `CF-Access-Client-Id` and `CF-Access-Client-Secret`.
3. On the Jellyfin app's policy, add a rule: `Service token` is `glassfin-server`. Action: Allow.
4. Glassfin doesn't currently inject these headers automatically — if you need this path, file an issue or add a tiny `connect()`-time interceptor that forwards them.

For the normal flow (user signs in to Jellyfin with a username + password via Glassfin's auth-by-name), no service token is needed — the user's Cloudflare login covers both apps.

## Step 5 — `REMOTE_ACCESS_MODE`

Set this so the in-app status reflects reality:

```bash
REMOTE_ACCESS_MODE=cloudflare
```

It's just a label; it doesn't change networking.

## Failure modes to expect

| Symptom | Likely cause |
|---|---|
| Login loop | Cookie scope on the Jellyfin app doesn't include both subdomains. Set it to `.example.com`. |
| `Failed to fetch` in console after login | Cloudflare WAF / Bot Fight Mode is challenging the XHR. Whitelist `example.com` from Bot Fight Mode or move both apps to a managed-challenge-free path. |
| 403 on `/Users/AuthenticateByName` | Jellyfin reachable but Cloudflare strips the `X-Emby-Authorization` header. In the Tunnel ingress rule, ensure no header overrides; in nginx (if you proxy further) `proxy_pass_request_headers on`. |
| Player loads then video silent / black | Media segments are large; some Cloudflare plans throttle aggressively. Watch the Cloudflare analytics for cached vs uncached MIME-type ratios. |

## Related

- [REMOTE_ACCESS.md](../REMOTE_ACCESS.md) — full remote-access guide.
- [config.example.yml](config.example.yml) — tunnel ingress config.
- [docker-compose.example.yml](docker-compose.example.yml) — running Glassfin + cloudflared together.
