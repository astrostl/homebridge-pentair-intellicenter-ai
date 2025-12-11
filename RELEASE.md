# Release Process

This document outlines the steps to cut a new release for homebridge-pentair-intellicenter-ai.

## Prerequisites

- You have push access to the repository
- You are logged into npm (`npm whoami`)
- You are logged into GitHub CLI (`gh auth status`)

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

### 5. Commit and Tag

```bash
# Stage all changes
git add -A

# Commit with descriptive message
git commit -m "$(cat <<'EOF'
feat: release vX.Y.Z

- Summary of main changes
- Additional notable changes

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"

# Create tag
git tag vX.Y.Z

# Push commit and tag
git push origin master
git push origin vX.Y.Z
```

### 6. Publish to npm

```bash
npm publish
```

This automatically runs `prepublishOnly` again before publishing.

Verify publication:
```bash
npm view homebridge-pentair-intellicenter-ai version
```

### 7. Create GitHub Release

```bash
gh release create vX.Y.Z --title "vX.Y.Z - Short Description" --notes "$(cat <<'EOF'
## What's New

### Feature Category
- Feature details

### 📦 Dependency Updates
- List of updates

### Technical
- Internal improvements

---

**Full Changelog**: https://github.com/astrostl/homebridge-pentair-intellicenter-ai/compare/vPREVIOUS...vX.Y.Z

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

### 8. Verify Release

- [ ] npm package visible: https://www.npmjs.com/package/homebridge-pentair-intellicenter-ai
- [ ] GitHub release visible: https://github.com/astrostl/homebridge-pentair-intellicenter-ai/releases
- [ ] Version numbers match everywhere

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
git push origin beta/vX.Y.Z
```

### Publish with Beta Tag
```bash
npm publish --tag beta
```

### GitHub Pre-release
```bash
gh release create vX.Y.Z-beta.N --prerelease --title "vX.Y.Z-beta.N" --notes "..."
```

### Promote Beta to Stable
```bash
# Merge to master
git checkout master
git merge beta/vX.Y.Z

# Update version (remove -beta.N suffix)
# Update CHANGELOG.md
# Follow normal release process
```

## Troubleshooting

### npm publish fails
- Check `npm whoami` - must be logged in
- Check npm 2FA if enabled
- Verify version doesn't already exist

### GitHub release fails
- Check `gh auth status`
- Verify tag was pushed: `git ls-remote --tags origin`

### Tests fail during prepublishOnly
- Fix failing tests before release
- Never skip tests for releases

### Pre-commit hook fails
- Tests run automatically on commit
- Fix any failures before proceeding

## Quick Reference

```bash
# Full release in one session
git checkout master && git pull
npm run prepublishOnly
# Edit package.json version
# Edit CHANGELOG.md
git add -A && git commit -m "feat: release vX.Y.Z"
git tag vX.Y.Z
git push origin master && git push origin vX.Y.Z
npm publish
gh release create vX.Y.Z --title "vX.Y.Z - Description" --notes "Release notes..."
```
