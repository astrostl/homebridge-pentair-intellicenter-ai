# Release Process

This document outlines the steps to cut a new release for homebridge-pentair-intellicenter-ai.

## Prerequisites

- You have push access to the repository
- You are logged into npm (`npm whoami`)
- You are logged into GitHub CLI (`gh auth status`)

**npm Authentication Note**: npm is aggressive with session expiration and requires recent authentication with passkeys to publish. If `npm publish` fails with "Access token expired or revoked", run `npm login` first.

## Release Steps

### 1. Verify Current State

```bash
# Check you're on master and up to date
git checkout master
git pull origin master

# Check for uncommitted changes
git status

# View commits since last release
git log --oneline $(git describe --tags --abbrev=0)..HEAD
```

### 2. Run Quality Checks

```bash
# Run the full quality pipeline
npm run prepublishOnly
```

This runs:
- `npm run lint` - ESLint with zero warnings policy
- `npm run format:check` - Prettier formatting validation
- `npm run security-check` - npm audit + audit-ci vulnerability scanning
- `npm run outdated-check` - Check for outdated dependencies (informational)
- `npm run build` - TypeScript compilation
- `npm run test` - Jest test suite with coverage

**All checks must pass before proceeding.**

### 3. Update Version

Edit `package.json` and update the version number:

```json
"version": "X.Y.Z",
```

Follow [Semantic Versioning](https://semver.org/):
- **MAJOR (X)**: Breaking changes
- **MINOR (Y)**: New features, backward compatible
- **PATCH (Z)**: Bug fixes, backward compatible

### 4. Update CHANGELOG.md

Add a new section at the top (after `## [Unreleased]`):

```markdown
## [X.Y.Z] - YYYY-MM-DD

### Added
- New features

### Changed
- Changes to existing functionality

### Fixed
- Bug fixes

### Updated
- Dependency updates

### Technical
- Internal improvements
```

Include:
- All new features with clear descriptions
- Bug fixes with context
- Dependency updates (production and development)
- Test coverage and quality metrics

### 5. Commit and Push

```bash
# Stage all changes
git add -A

# Commit with descriptive message
git commit -m "$(cat <<'EOF'
feat: release vX.Y.Z

- Summary of main changes
- Additional notable changes

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"

# Push commit (NO tag yet — tag after npm publish)
git push origin master
```

### 6. Publish to npm

```bash
npm publish
```

This automatically runs `prepublishOnly` again before publishing.

### 7. Tag the Published Commit

**CRITICAL**: Always tag AFTER npm publish, using the commit npm actually published from.
Never create tags before publishing — if anything goes wrong, you'll have a tag pointing to unpublished code.

```bash
# Get the exact commit npm published
PUBLISHED_SHA=$(npm view homebridge-pentair-intellicenter-ai@X.Y.Z gitHead)
echo "npm published from: $PUBLISHED_SHA"
echo "current HEAD: $(git rev-parse HEAD)"

# These MUST match. If they don't, investigate before proceeding.
git tag vX.Y.Z $PUBLISHED_SHA
git push origin vX.Y.Z

# Verify
git rev-parse vX.Y.Z  # must equal $PUBLISHED_SHA
```

### 8. Create GitHub Release

```bash
# --verify-tag ensures the tag already exists (won't auto-create a wrong one)
gh release create vX.Y.Z --title "vX.Y.Z - Short Description" --verify-tag --notes "$(cat <<'EOF'
## What's New

### Feature Category
- Feature details

### Dependency Updates
- List of updates

**Full Changelog**: https://github.com/astrostl/homebridge-pentair-intellicenter-ai/compare/vPREVIOUS...vX.Y.Z
EOF
)"
```

### 9. Verify Release

- [ ] npm package visible: https://www.npmjs.com/package/homebridge-pentair-intellicenter-ai
- [ ] GitHub release visible: https://github.com/astrostl/homebridge-pentair-intellicenter-ai/releases
- [ ] `git rev-parse vX.Y.Z` matches `npm view homebridge-pentair-intellicenter-ai@X.Y.Z gitHead`

## Beta Releases

For pre-release/beta versions:

### Version Format
```
X.Y.Z-beta.N
```

### Branch Strategy
```bash
# Create beta branch
git checkout -b beta/vX.Y.Z
git push -u origin beta/vX.Y.Z
```

### Publish with Beta Tag
```bash
npm publish --tag beta
```

### Tag and Create GitHub Pre-release

**Same rule as stable: tag AFTER npm publish, verify the SHA matches.**

```bash
PUBLISHED_SHA=$(npm view homebridge-pentair-intellicenter-ai@X.Y.Z-beta.N gitHead)
echo "npm published from: $PUBLISHED_SHA"
echo "current HEAD: $(git rev-parse HEAD)"
git tag vX.Y.Z-beta.N $PUBLISHED_SHA
git push origin vX.Y.Z-beta.N

# Verify tag matches
git rev-parse vX.Y.Z-beta.N  # must equal $PUBLISHED_SHA

# Create release with --verify-tag
gh release create vX.Y.Z-beta.N --prerelease --title "vX.Y.Z-beta.N" --verify-tag --notes "..."
```

### Verify dist-tags
```bash
npm view homebridge-pentair-intellicenter-ai dist-tags
# beta should point to new version, latest should be unchanged
```

### Promote Beta to Stable
```bash
# Merge to master
git checkout master
git merge beta/vX.Y.Z

# Update version (remove -beta.N suffix)
# Update CHANGELOG.md
# Follow normal release process (steps 5-9 above)
```

## Troubleshooting

### npm publish fails
- Check `npm whoami` - must be logged in
- If "Access token expired", run `npm login` first
- Verify version doesn't already exist

### GitHub release fails
- Check `gh auth status`
- Verify tag was pushed: `git ls-remote --tags origin`

### Git tag doesn't match npm gitHead
- Delete the wrong tag: `git tag -d vX.Y.Z && git push origin :refs/tags/vX.Y.Z`
- Re-tag with correct SHA from `npm view ... gitHead`
- Update GitHub release if needed

### Tests fail during prepublishOnly
- Fix failing tests before release
- Never skip tests for releases

### Pre-commit hook fails
- Tests run automatically on commit
- Fix any failures before proceeding

## Quick Reference

```bash
# Full stable release
git checkout master && git pull
npm run prepublishOnly
# Edit package.json version, CHANGELOG.md
git add -A && git commit -m "feat: release vX.Y.Z"
git push origin master
npm publish
PUBLISHED_SHA=$(npm view homebridge-pentair-intellicenter-ai@X.Y.Z gitHead)
git tag vX.Y.Z $PUBLISHED_SHA && git push origin vX.Y.Z
gh release create vX.Y.Z --title "vX.Y.Z - Description" --verify-tag --notes "..."

# Full beta release
git checkout beta/vX.Y.Z
npm run prepublishOnly
npm publish --tag beta
PUBLISHED_SHA=$(npm view homebridge-pentair-intellicenter-ai@X.Y.Z-beta.N gitHead)
git tag vX.Y.Z-beta.N $PUBLISHED_SHA && git push origin vX.Y.Z-beta.N
gh release create vX.Y.Z-beta.N --prerelease --title "vX.Y.Z-beta.N" --verify-tag --notes "..."
```
