# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Common Commands

- **Build**: `npm run build` - Compiles TypeScript to JavaScript in `dist/`
- **Lint**: `npm run lint` - Runs ESLint with zero warnings policy
- **Fix linting**: `npm run fix` - Auto-fixes ESLint issues
- **Test**: `npm run test` - Runs Jest test suite
- **Development**: `npm run watch` - Builds, links, and watches for changes with nodemon
- **Prepare for publish**: `npm run prepublishOnly` - Runs lint, build, and test in sequence

## Release Process

**IMPORTANT**: Use proper branching strategy for beta vs stable releases:

### Beta Releases
1. **Create beta branch**: `git checkout -b beta/vX.X.X` from master
2. **Make changes**: Implement features, tests, bug fixes on beta branch
3. **Version bump**: Update package.json to `X.X.X-beta.Y`
4. **Commit and push**: `git push origin beta/vX.X.X`
5. **Publish to npm**: `npm publish --tag beta`
6. **Create GitHub release**: `gh release create vX.X.X-beta.Y --prerelease`

### Stable Releases
1. **Merge beta to master**: `git checkout master && git merge beta/vX.X.X`
2. **Version bump**: Update package.json to `X.X.X` (remove beta suffix)
3. **Commit and push**: `git push origin master --tags`
4. **Publish to npm**: `npm publish` (defaults to latest tag)
5. **Create GitHub release**: `gh release create vX.X.X --title "vX.X.X - Description"`

**CRITICAL**: Never commit beta features directly to master. Always use beta branches for experimental features, major changes, or integration testing improvements.

## Architecture Overview

This is a Homebridge plugin that connects to Pentair IntelliCenter pool control systems via Telnet (port 6681). The plugin exposes pool circuits, heaters, pumps, and temperature sensors as HomeKit accessories.

### Core Components

- **Platform** (`src/platform.ts`): Main plugin entry point that manages Telnet connection to IntelliCenter, handles device discovery, and processes real-time updates
- **Accessories**: Individual HomeKit accessory implementations:
  - `circuitAccessory.ts` - Pool circuits (lights, pumps, features) as switches/fans
  - `heaterAccessory.ts` - Pool/spa heaters as thermostats
  - `temperatureAccessory.ts` - Temperature sensors
- **Types** (`src/types.ts`): TypeScript definitions for IntelliCenter protocol and device structures
- **Utilities** (`src/util.ts`): Data transformation and response merging logic

### Key Architecture Patterns

- **Discovery Process**: Sends multiple `GetHardwareDefinition` commands to IntelliCenter, merges responses, then transforms raw data into structured device hierarchy (Panels → Modules → Circuits/Bodies/Features)
- **Real-time Updates**: Subscribes to parameter updates via `RequestParamList` commands, processes `NotifyList` responses to update accessory states
- **Connection Management**: Robust Telnet connection with automatic reconnection, heartbeat monitoring, and buffer management for partial message handling
- **Pump Integration**: Maps pump circuits to regular circuits for variable speed control via HomeKit fan accessories
- **Temperature Sensors**: Conditional registration based on heater presence and configuration (skips water temp sensors when heaters exist)

### Configuration

Plugin requires IntelliCenter IP address, username, and password. Supports temperature unit selection, VSP pump control toggle, and air temperature sensor enable/disable.

### Testing

**CRITICAL REQUIREMENT: MAINTAIN 100% TEST COVERAGE AND 100% TEST PASSES**

This repository maintains exceptional code quality standards:

- **100% Line Coverage**: Every single line of code must be tested
- **100% Test Passes**: All tests must pass without exceptions
- **Zero Tolerance Policy**: No shortcuts, workarounds, or compromises that artificially inflate coverage or force tests to pass
- **Real Testing Only**: All tests must be meaningful and verify actual functionality - no dummy tests or coverage cheats

**Test Quality Standards:**
- ✅ All tests must verify real functionality with proper assertions
- ✅ Edge cases and error conditions must be comprehensively tested
- ✅ Complex async operations and timing scenarios must be properly tested
- ✅ Configuration validation must cover all validation paths
- ✅ Integration tests must use realistic scenarios with proper mocking
- ❌ No artificial coverage boosters (empty tests, unreachable code coverage, etc.)
- ❌ No forced test passes (skipping assertions, mocking away failures, etc.)
- ❌ No shortcuts that compromise test integrity

**Coverage Verification:**
- Use `npm test` to run full test suite with coverage reporting
- Coverage reports generated in `coverage/lcov-report/index.html`
- All individual files must maintain 100% line coverage
- Test files located in `test/unit/`, `test/integration/`, and `test/` directories

**Before any code changes:**
1. Run `npm test` to establish baseline
2. Ensure all changes maintain 100% coverage
3. Verify all tests pass without modifications to make them pass artificially
4. Add meaningful tests for new functionality
5. Never compromise test quality for convenience

This standard ensures world-class code reliability and maintainability.

**IMPORTANT**: When publishing releases, ensure BOTH npm and GitHub releases are completed successfully. If either fails:
1. Investigate and fix the root cause 
2. Do not consider the release complete until both succeed
3. Address test failures immediately - prepublishOnly requires all tests to pass

**Release Quality Gates:**
- `npm run prepublishOnly` must pass completely (lint + build + test)
- All tests must pass without any skipped or modified tests
- 100% test coverage must be maintained
- No test quality compromises are acceptable for release deadlines

## Dependency Management Strategy

When updating dependencies, follow this version strategy:

### **🌍 Engines (User-Controlled) - Conservative**
- **homebridge**: Support from 1.8.0+ (users control this)
- **node**: Support LTS versions 18.17.0+, 20.15.1+, 22+, 24+ (users control this)

### **🔧 Dependencies (Bundled) - Latest Stable**
- **telnet-client**: Use latest stable (bundled with package)
- **uuid**: Use latest stable (bundled with package)

### **⚡ DevDependencies (Development) - Exact Versions We Test With**
- Set minimum versions to exactly what we're using/testing with
- For tools we completely control (ESLint, TypeScript, etc.), pin to tested versions
- Examples: `^8.34.0` not `^8.0.0`, `^5.8.3` not `^5.0.0`

**Rationale**: 
- USER ENVIRONMENT: Broad compatibility prevents installation issues
- BUNDLED DEPS: Latest versions for security and performance
- DEV DEPS: Predictable builds with tested tool versions

Always run `npm run prepublishOnly` after dependency updates to ensure compatibility.