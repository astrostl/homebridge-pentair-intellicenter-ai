# Release Process

This is the **definitive source of truth** for all release procedures. CLAUDE.md
points here.

## What ships

This package is a thin JS shim plus **prebuilt Go sidecar binaries** (pentameter,
one per platform). The npm `files` allowlist bundles `index.js`, `config.schema.json`,
and `pentameter/<os>-<arch>`. The binaries are gitignored — they are **built fresh
at release time** by `make build` and bundled into the tarball; they are never
committed.

## Prerequisites

- You have push access to the repository.
- You are logged into npm (`npm whoami`).
- You are logged into GitHub CLI (`gh auth status`).
- A local pentameter checkout is available (default `../pentameter`). The bundled
  binaries are compiled from it, so **check out the pentameter version you intend to
  ship** (a tagged release is strongly preferred for traceability).

## Branch and Version Conventions

- **Alpha branches**: `alpha/vX.Y.Z` for `X.Y.Z-alpha.N` releases (the 3.x rework
  lives here for now).
- **Beta branches**: `beta/vX.Y.Z` for `X.Y.Z-beta.N` releases.
- **Stable releases**: `master`, for `X.Y.Z`.
- **Never mix**: don't work on one version's branch while releasing another.

The three npm dist-tags are independent lanes:

| dist-tag | who gets it |
| --- | --- |
| `latest` | default `npm install` (stable) |
| `beta` | `@beta` opt-in |
| `alpha` | `@alpha` opt-in (the rework) |

Prerelease versions are never auto-installed; only an explicit `@alpha` / `@beta` /
exact-version request serves them.

## npm Authentication

This repository uses **passkey authentication** for npm publishing. Sessions expire
frequently. If `npm publish` fails with "Access token expired or revoked", run
`npm login` first.

**Automated publishing with expect** (useful for AI assistants):

```bash
expect -c '
set timeout 300
spawn npm publish --tag alpha
expect {
    -re "Press ENTER" { send "\r"; exp_continue }
    -re "one-time password" { puts "OTP mode - web auth not available"; exit 1 }
    eof
}
wait
'
```

(Swap `--tag alpha` for `--tag beta`, or drop the flag entirely for a stable
`latest` publish.) `publishConfig.tag` in `package.json` defaults the tag to `alpha`,
so a bare `npm publish` will NOT clobber `latest` while the rework is alpha — but pass
`--tag` explicitly anyway to be sure.

## Quality Gates

There is no JS build/test pipeline in this repo (that's the point — the toolchain
lives in Go). Before any release:

1. **Engine tests pass** — in the pentameter checkout: `make test` (or `go test ./...`).
2. **`make build`** completes and produces all expected `pentameter/<os>-<arch>`
   binaries.
3. **`npm pack --dry-run`** shows the expected tarball: `index.js`,
   `config.schema.json`, and every `pentameter/<os>-<arch>` binary — and nothing
   stray (no dev config, no `.DS_Store`).

## Tagging Rules

**CRITICAL**: Always tag AFTER `npm publish`, using the commit npm actually published
from. Never create tags before publishing — if anything goes wrong you'll have a tag
pointing at unpublished code.

**Never let `gh release create` auto-create tags** — always use `--verify-tag`.

```bash
PUBLISHED_SHA=$(npm view homebridge-pentair-intellicenter-ai@VERSION gitHead)
echo "npm published from: $PUBLISHED_SHA"
echo "current HEAD: $(git rev-parse HEAD)"   # these MUST match
git tag vVERSION "$PUBLISHED_SHA"
git push origin vVERSION
git rev-parse vVERSION   # must equal $PUBLISHED_SHA
```

## Alpha Release Process

### 1. Switch to the alpha branch

```bash
git checkout alpha/vX.Y.Z   # or: git checkout -b alpha/vX.Y.Z origin/master
```

### 2. Bump version

Edit `package.json` to `X.Y.Z-alpha.N`.

### 3. Build the bundled sidecar

```bash
# ensure ../pentameter is on the intended (tagged) version first
make build
```

Record the pentameter version/commit the binaries came from — put it in the GitHub
release notes for traceability.

> **Known gap — bundled binary reports `dev`.** `make build` compiles with
> `-ldflags="-s -w"` only; it does **not** inject `-X main.version`, so the
> bundled sidecar prints `pentameter dev` at runtime. Version traceability is
> therefore docs-only (this step + the CLAUDE.md "bundles vX.Y.Z" line + the
> GitHub release notes). **TODO (future alpha): inject the pentameter version**
> into the plugin's `build` target so `pentameter --version` is authoritative —
> e.g. pass `-X main.version=$(git -C $(PENTAMETER_DIR) describe --tags)` and
> require `../pentameter` to be on a clean tag at build time. Until then, the
> only guarantee that the binaries are the intended version is that they were
> built from the checked-out tag.

### 4. Quality gates

Run the three checks under **Quality Gates** above.

### 5. Commit and push

```bash
git add -A
git commit -m "chore(release): bump version to X.Y.Z-alpha.N"
git push origin alpha/vX.Y.Z      # push commit, NO tag yet
```

### 6. Publish to npm (alpha tag)

```bash
npm publish --tag alpha
```

### 7. Tag the published commit

Follow **Tagging Rules** above with `vX.Y.Z-alpha.N`.

### 8. Create a GitHub pre-release

```bash
gh release create vX.Y.Z-alpha.N --prerelease --title "vX.Y.Z-alpha.N" \
  --verify-tag --notes "...(include the pentameter version bundled)..."
```

### 9. Verify

```bash
npm view homebridge-pentair-intellicenter-ai dist-tags
# alpha -> new version; latest and beta unchanged
```

## Beta / Stable

Same flow, with the tag and branch swapped:

- **Beta**: branch `beta/vX.Y.Z`, version `X.Y.Z-beta.N`, `npm publish --tag beta`,
  GitHub pre-release.
- **Stable**: branch `master`, version `X.Y.Z`, `npm publish` (tag `latest`),
  full GitHub release. Update `publishConfig.tag` (or pass `--tag latest`) so the
  stable publish actually moves `latest`.

### Promoting the rework

When the 3.x rework is ready to graduate, move it up the lanes with dist-tags rather
than re-publishing:

```bash
# point a higher lane at an already-published version
npm dist-tag add homebridge-pentair-intellicenter-ai@3.0.0-beta.0 beta
npm dist-tag add homebridge-pentair-intellicenter-ai@3.0.0 latest
```

## Troubleshooting

### npm publish fails with 404 or auth error
- Run `npm login` to refresh authentication; check `npm whoami`.

### A binary is missing from the tarball
- Re-run `make build`; confirm with `npm pack --dry-run`. Remember `pentameter/` is
  gitignored, so the binaries must exist locally at publish time.

### GitHub release fails
- Check `gh auth status`; verify the tag was pushed (`git ls-remote --tags origin`).

## Quick Reference

```bash
# Full alpha release
git checkout alpha/vX.Y.Z
# (ensure ../pentameter is on the intended version)
make build
make -C ../pentameter test
npm pack --dry-run                       # verify tarball contents
# edit package.json version -> X.Y.Z-alpha.N
git add -A && git commit -m "chore(release): bump version to X.Y.Z-alpha.N"
git push origin alpha/vX.Y.Z
npm publish --tag alpha
PUBLISHED_SHA=$(npm view homebridge-pentair-intellicenter-ai@X.Y.Z-alpha.N gitHead)
git tag vX.Y.Z-alpha.N "$PUBLISHED_SHA" && git push origin vX.Y.Z-alpha.N
gh release create vX.Y.Z-alpha.N --prerelease --title "vX.Y.Z-alpha.N" --verify-tag --notes "..."
```
