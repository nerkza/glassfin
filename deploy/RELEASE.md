# Release process

How Glassfin gets from a git commit to a tagged Docker image users can pull.

## Versioning

Semver: `MAJOR.MINOR.PATCH`.

| Bump | When |
|---|---|
| `MAJOR` | Breaking config change, breaking plugin API change, breaking runtime-config format. |
| `MINOR` | New features, new env vars, new settings categories. |
| `PATCH` | Bug fixes, dependency bumps, doc-only changes. |

Pre-1.0 we're loose with this; treat current `0.x` as "everything could change". Once `1.0` ships, stick to semver strictly.

## Git tags

A release is a signed git tag of the form `v0.2.0`. CI watches for tag pushes and builds an image. To release:

```bash
# Make sure main is green
git checkout main && git pull
git diff main..HEAD  # nothing surprising

# Tag — message includes a one-paragraph release summary
git tag -s v0.2.0 -m "0.2.0 — Sonarr/Radarr request integration + ColorWheel + lazy-loaded chunks"

# Push the tag (this is the only push to the remote that matters for a release)
git push origin v0.2.0
```

CI takes over from there.

## Image registry

Images publish to:

```
ghcr.io/nerkza/glassfin
```

Per release we tag:

| Tag | Tracks |
|---|---|
| `latest` | The most recent stable release. Most users pull this. |
| `0.2.0` | The exact release. Pin in production for reproducibility. |
| `0.2` | Floating to the latest `0.2.x`. Useful for "I want patches but not breaking changes". |
| `main` | Cutting-edge from the `main` branch. Not for end users. |
| `sha-abc1234` | Per-commit. Used by `main` builds. |

## CI build (GitHub Actions)

A typical `.github/workflows/release.yml` (not yet committed; reference shape):

```yaml
name: release
on:
  push:
    tags: ["v*"]
jobs:
  build-and-push:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
    steps:
      - uses: actions/checkout@v4
      - uses: docker/setup-buildx-action@v3
      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - id: meta
        uses: docker/metadata-action@v5
        with:
          images: ghcr.io/${{ github.repository }}
          tags: |
            type=semver,pattern={{version}}
            type=semver,pattern={{major}}.{{minor}}
            type=raw,value=latest,enable={{is_default_branch}}
      - uses: docker/build-push-action@v5
        with:
          context: .
          push: true
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
          build-args: |
            GLASSFIN_VERSION=${{ github.ref_name }}
            GLASSFIN_GIT_SHA=${{ github.sha }}
            GLASSFIN_BUILT_AT=${{ github.event.head_commit.timestamp }}
          platforms: linux/amd64,linux/arm64
```

The build-args populate `/version.json` so deployed instances surface what they're running.

## Release checklist

Before tagging:

- [ ] All CI workflows on `main` are green.
- [ ] [PROJECT_REVIEW.md](../PROJECT_REVIEW.md) gates that should be ✓ are ✓ (any ⚠ must have a tracked issue).
- [ ] [PROJECT_GOALS_ROADMAP.md](../PROJECT_GOALS_ROADMAP.md) has a "Recent Sessions Summary" entry covering what's in the release.
- [ ] `npm run build` runs clean locally with no console warnings beyond expected ones.
- [ ] If `prefs.ts` schema changed, the migration block in `readRaw()` covers all earlier versions.
- [ ] If `nginx.conf` or `docker-entrypoint.sh` changed, build the image and curl `/version.json`, `/health`, and a sample security header to verify.
- [ ] Verified end-to-end against a real Jellyfin server.
- [ ] If Sonarr/Radarr code paths changed, verified against real *arr instances.

After tagging:

- [ ] Watch the CI build to completion.
- [ ] `docker pull ghcr.io/nerkza/glassfin:<version>` and run a sanity check.
- [ ] Update Unraid template if it pinned a previous tag.
- [ ] Cut a GitHub Release with the same notes as the tag message.

## Hotfix process

For a production-breaking bug:

1. Branch from the affected tag: `git checkout -b hotfix/0.2.1 v0.2.0`.
2. Make the minimum fix.
3. Bump version + tag: `git tag -s v0.2.1 -m "0.2.1 — fix CSP missing connect-src for Sonarr"`.
4. Push the tag. CI publishes.
5. Cherry-pick the fix back into `main`.

## Rollback

If a release introduces a regression and a hotfix isn't ready:

```bash
# Repoint the floating tag at the previous release. Don't touch the
# version-pinned tag — that tag means exactly what it shipped as.
docker tag ghcr.io/nerkza/glassfin:0.1.9 ghcr.io/nerkza/glassfin:latest
docker push ghcr.io/nerkza/glassfin:latest
```

Users on `:latest` get the previous release on their next pull. Users on `:0.2.0` (or whoever's `:0.2`) still get the broken version — they need to manually pin to `:0.1.9`.

For a really bad release (security regression), delete the version-pinned tag from GHCR and document it in the release notes. This is rare; prefer hotfixing.
