# Release Process

This is the **definitive source of truth** for all release procedures. CLAUDE.md points here.

## Prerequisites

- You have push access to the repository
- You are logged into npm (`npm whoami`)
- You are logged into GitHub CLI (`gh auth status`)

## Branch and Version Conventions

- **Beta branches**: `beta/vX.Y.Z` for version `X.Y.Z-beta.N` releases
  - Example: `beta/v2.8.0` branch for `2.8.0-beta.1`, `2.8.0-beta.2`, etc.
- **Stable releases**: Work on `master` branch for stable `X.Y.Z` releases
- **Never mix**: Don't work on `beta/v2.7.0` branch while releasing `2.8.0-beta.x` versions
- **Never commit beta features directly to master**

**Before any release work**:
1. Check current branch: `git branch`
2. Verify branch name matches target version
3. Create correct branch if needed: `git checkout -b beta/vX.Y.Z`

## npm Authentication

This repository uses **passkey authentication** for npm publishing. Sessions expire frequently.

**If npm publish fails** with "Access token expired or revoked", run `npm login` first.

**Automated publishing with expect (recommended for AI assistants)**:

```bash
# For beta releases:
expect -c '
set timeout 300
spawn npm publish --tag beta
expect {
    -re "Press ENTER" { send "\r"; exp_continue }
    -re "one-time password" { puts "OTP mode - web auth not available"; exit 1 }
    eof
}
wait
'

# For stable releases:
expect -c '
set timeout 300
spawn npm publish
expect {
    -re "Press ENTER" { send "\r"; exp_continue }
    -re "one-time password" { puts "OTP mode - web auth not available"; exit 1 }
    eof
}
wait
'
```

How it works:
1. Spawns `npm publish` with a pseudo-TTY (required for web auth mode)
2. If auth cached: publish completes directly without prompting
3. If auth needed: waits for "Press ENTER" prompt, sends ENTER, opens browser
4. User completes passkey auth in browser (if prompted)
5. Publish completes automatically

**Manual publishing**: Run `npm publish --tag beta` (or `npm publish`) directly and press ENTER when prompted.

## Tagging Rules

**CRITICAL**: Always tag AFTER npm publish, using the commit npm actually published from. Never create tags before publishing — if anything goes wrong, you'll have a tag pointing to unpublished code.

**Never let `gh release create` auto-create tags** — it may tag the wrong commit (e.g., if you switched branches). Always use `--verify-tag`.

```bash
# After any npm publish, tag like this:
PUBLISHED_SHA=$(npm view homebridge-pentair-intellicenter-ai@VERSION gitHead)
echo "npm published from: $PUBLISHED_SHA"
echo "current HEAD: $(git rev-parse HEAD)"
# These MUST match. If they don't, investigate before proceeding.
git tag vVERSION $PUBLISHED_SHA
git push origin vVERSION

# Verify
git rev-parse vVERSION  # must equal $PUBLISHED_SHA
```

**If a tag is wrong**, fix it:
```bash
git tag -d vX.Y.Z && git push origin :refs/tags/vX.Y.Z
PUBLISHED_SHA=$(npm view homebridge-pentair-intellicenter-ai@X.Y.Z gitHead)
git tag vX.Y.Z $PUBLISHED_SHA && git push origin vX.Y.Z
```

## Quality Gates

Before any release, all quality checks must pass:

```bash
npm run prepublishOnly
```

This runs: lint → format check → security check → outdated check → build → test (with coverage).

**All must pass before proceeding.** No test quality compromises for release deadlines.

## Stable Release Process

### 1. Verify Current State

```bash
git checkout master && git pull origin master
git status
git log --oneline $(git describe --tags --abbrev=0)..HEAD
```

### 2. Update Version

Edit `package.json`:
```json
"version": "X.Y.Z",
```

Follow [Semantic Versioning](https://semver.org/):
- **MAJOR (X)**: Breaking changes
- **MINOR (Y)**: New features, backward compatible
- **PATCH (Z)**: Bug fixes, backward compatible

### 3. Run Quality Checks

```bash
npm run prepublishOnly
```

### 4. Commit and Push

```bash
git add -A
git commit -m "$(cat <<'EOF'
chore(release): release vX.Y.Z

- Summary of main changes

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"

# Push commit (NO tag yet)
git push origin master
```

### 5. Publish to npm

```bash
npm publish
```

### 6. Tag the Published Commit

```bash
PUBLISHED_SHA=$(npm view homebridge-pentair-intellicenter-ai@X.Y.Z gitHead)
echo "npm published from: $PUBLISHED_SHA"
echo "current HEAD: $(git rev-parse HEAD)"
git tag vX.Y.Z $PUBLISHED_SHA
git push origin vX.Y.Z
# Verify
git rev-parse vX.Y.Z  # must equal $PUBLISHED_SHA
```

### 7. Create GitHub Release

```bash
gh release create vX.Y.Z --title "vX.Y.Z - Short Description" --verify-tag --notes "$(cat <<'EOF'
## What's New

- Feature/fix descriptions

**Full Changelog**: https://github.com/astrostl/homebridge-pentair-intellicenter-ai/compare/vPREVIOUS...vX.Y.Z
EOF
)"
```

### 8. Verify

- [ ] `npm view homebridge-pentair-intellicenter-ai dist-tags` shows correct `latest`
- [ ] GitHub release visible at correct tag
- [ ] `git rev-parse vX.Y.Z` matches `npm view homebridge-pentair-intellicenter-ai@X.Y.Z gitHead`

## Beta Release Process

### 1. Create or Switch to Beta Branch

```bash
git checkout -b beta/vX.Y.Z   # new branch from master
# or
git checkout beta/vX.Y.Z      # existing branch
git push -u origin beta/vX.Y.Z
```

### 2. Make Changes, Bump Version

Edit `package.json` to `X.Y.Z-beta.N`.

### 3. Run Quality Checks

```bash
npm run prepublishOnly
```

### 4. Commit and Push

```bash
git add -A && git commit -m "chore(release): bump version to X.Y.Z-beta.N"
git push origin beta/vX.Y.Z
```

### 5. Publish to npm with Beta Tag

```bash
npm publish --tag beta
```

**Important**: The `--tag beta` flag ensures beta versions are only installed when users explicitly request `@beta`.

### 6. Tag the Published Commit

```bash
PUBLISHED_SHA=$(npm view homebridge-pentair-intellicenter-ai@X.Y.Z-beta.N gitHead)
echo "npm published from: $PUBLISHED_SHA"
echo "current HEAD: $(git rev-parse HEAD)"
git tag vX.Y.Z-beta.N $PUBLISHED_SHA
git push origin vX.Y.Z-beta.N
# Verify
git rev-parse vX.Y.Z-beta.N  # must equal $PUBLISHED_SHA
```

### 7. Create GitHub Pre-release

```bash
gh release create vX.Y.Z-beta.N --prerelease --title "vX.Y.Z-beta.N" --verify-tag --notes "..."
```

### 8. Verify

```bash
npm view homebridge-pentair-intellicenter-ai dist-tags
# beta should point to new version, latest should be unchanged
```

### Promote Beta to Stable

```bash
git checkout master
git merge beta/vX.Y.Z
# Update version in package.json (remove -beta.N suffix)
# Follow Stable Release Process from step 3
```

## Troubleshooting

### npm publish fails with 404 or auth error
- Run `npm login` to refresh authentication
- Check `npm whoami` to verify login

### GitHub release fails
- Check `gh auth status`
- Verify tag was pushed: `git ls-remote --tags origin`

### Tests fail during prepublishOnly
- Fix failing tests before release
- Never skip tests for releases

## Quick Reference

```bash
# Full stable release
git checkout master && git pull
npm run prepublishOnly
# Edit package.json version
git add -A && git commit -m "chore(release): release vX.Y.Z"
git push origin master
npm publish
PUBLISHED_SHA=$(npm view homebridge-pentair-intellicenter-ai@X.Y.Z gitHead)
git tag vX.Y.Z $PUBLISHED_SHA && git push origin vX.Y.Z
gh release create vX.Y.Z --title "vX.Y.Z - Description" --verify-tag --notes "..."

# Full beta release
git checkout beta/vX.Y.Z
npm run prepublishOnly
# Edit package.json version
git add -A && git commit -m "chore(release): bump version to X.Y.Z-beta.N"
git push origin beta/vX.Y.Z
npm publish --tag beta
PUBLISHED_SHA=$(npm view homebridge-pentair-intellicenter-ai@X.Y.Z-beta.N gitHead)
git tag vX.Y.Z-beta.N $PUBLISHED_SHA && git push origin vX.Y.Z-beta.N
gh release create vX.Y.Z-beta.N --prerelease --title "vX.Y.Z-beta.N" --verify-tag --notes "..."
```
