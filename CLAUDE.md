# Developer Guide

This file provides comprehensive guidance for Claude Code (claude.ai/code) and human developers when working with this repository.

**IMPORTANT**: This document serves as the definitive source of truth for development workflows, processes, and standards. When making changes to development workflows, CI/CD processes, testing approaches, or any other development practices, **always update this document** to reflect the changes. This ensures consistency across all development work and maintains accurate guidance for both AI assistants and human developers.

## Table of Contents

- [Common Commands](#common-commands)
- [Release Process](#release-process)
- [Architecture Overview](#architecture-overview)
- [Testing](#testing)
- [Dependency Management Strategy](#dependency-management-strategy)
- [Development Notes](#development-notes)
- [Maintaining This Document](#maintaining-this-document)

## Common Commands

- **Build**: `npm run build` - Compiles TypeScript to JavaScript in `dist/`
- **Lint**: `npm run lint` - Runs ESLint with zero warnings policy
- **Fix linting**: `npm run fix` - Auto-fixes ESLint issues
- **Format**: `npm run format` - Auto-formats code with Prettier
- **Format check**: `npm run format:check` - Verifies code formatting without changes
- **Security audit**: `npm run security-audit` - Runs npm audit for moderate+ vulnerabilities
- **Security CI**: `npm run audit-ci` - Enforces security audit with detailed reporting
- **Security check**: `npm run security-check` - Runs both security audit and audit-ci
- **Outdated check**: `npm run outdated-check` - Checks for outdated dependencies
- **Test**: `npm run test` - Runs Jest test suite with coverage reporting
- **Development**: `npm run watch` - Builds, links, and watches for changes with nodemon
- **Prepare for publish**: `npm run prepublishOnly` - Runs lint, format check, security check, outdated check, build, and test in sequence

## Release Process

**MANUAL RELEASE SYSTEM**: This repository uses manual releases for full control and reliability.

### Branch and Version Consistency

**CRITICAL**: Always ensure branch names match release versions to maintain clear git flow:

- **Beta branches**: `beta/vX.Y.Z` for version `X.Y.Z-beta.N` releases
  - Example: `beta/v2.8.0` branch for `2.8.0-beta.1`, `2.8.0-beta.2`, etc.
- **Stable releases**: Work on `master` branch for stable `X.Y.Z` releases
- **Never mix**: Don't work on `beta/v2.7.0` branch while releasing `2.8.0-beta.x` versions

**Before any release work**:
1. Check current branch: `git branch` 
2. Verify branch name matches target version
3. Create correct branch if needed: `git checkout -b beta/vX.Y.Z`
4. Push branch to origin: `git push origin beta/vX.Y.Z`

### Pre-Release Quality Gates

Before any release, ensure all quality checks pass:

1. **Run full quality pipeline**: `npm run prepublishOnly`
   - This runs: lint → format check → security check → build → test (with coverage)
   - **All must pass** before proceeding
2. **Verify test coverage**: Check that coverage remains at ~99%+ in console output
3. **Review changes**: Ensure all changes are intentional and documented

### Beta Release Process

1. **Create beta branch**: `git checkout -b beta/vX.Y.Z` from master
2. **Verify branch consistency**: Ensure branch name `beta/vX.Y.Z` matches target version `X.Y.Z-beta.N`
3. **Make changes**: Implement features, tests, bug fixes on beta branch
4. **Version bump**: Update package.json to `X.Y.Z-beta.N`
5. **Quality check**: Run `npm run prepublishOnly` (must pass)
6. **Commit and push**: `git push origin beta/vX.Y.Z`
7. **Publish to npm**: `npm publish --tag beta`
8. **Create GitHub release**: `gh release create vX.Y.Z-beta.N --prerelease`

### Stable Release Process

1. **Merge to master**: `git checkout master && git merge beta/vX.Y.Z`
2. **Version bump**: Update package.json to `X.Y.Z` (remove beta suffix)
3. **Quality check**: Run `npm run prepublishOnly` (must pass)
4. **Commit and push**: `git push origin master`
5. **Create git tag**: `git tag vX.Y.Z && git push origin vX.Y.Z`
6. **Publish to npm**: `npm publish` (defaults to latest tag)
7. **Create GitHub release**: `gh release create vX.Y.Z --title "vX.Y.Z - Description"`

### Release Quality Requirements

**CRITICAL**:

- Never commit beta features directly to master
- Always use beta branches for experimental features, major changes, or integration testing improvements
- Always run `npm run prepublishOnly` before any release
- Ensure both npm and GitHub releases succeed before considering release complete
- Manual verification that all tests pass (~99%+ coverage)
- No test quality compromises are acceptable for release deadlines

## Architecture Overview

This is a **Homebridge plugin** that connects to Pentair IntelliCenter pool control systems via Telnet (port 6681). The plugin exposes pool circuits, heaters, pumps, and temperature sensors as HomeKit accessories.

### Design Philosophy

**IMPORTANT**: This project should be held to **Homebridge plugin standards**, not enterprise software standards. Key principles:

- **Simplicity over complexity**: Home automation users want things that just work
- **Local-first**: Runs on local networks (Pi, NAS, local server) for 1-2 users
- **Binary operation**: Either works or doesn't - no complex monitoring needed
- **Clear logging**: Helpful logs for troubleshooting, not metrics dashboards
- **Reliability**: Stable connections and graceful failures, not performance optimization
- **Homebridge ecosystem fit**: Follows Homebridge patterns and conventions

**Avoid over-engineering**: Don't apply enterprise patterns (metrics collection, complex monitoring, distributed system tools) that don't fit the home automation use case. Focus on reliability, clear error messages, and ease of setup.

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
- **Pump Integration**: Maps pump circuits to regular circuits for variable speed control via HomeKit fan accessories with highly accurate power consumption and flow rate calculations using fourth-degree polynomial formulas calibrated from real IntelliCenter data
- **Temperature Sensors**: Conditional registration based on heater presence and configuration (skips water temp sensors when heaters exist)

### Configuration

Plugin requires IntelliCenter IP address, username, and password. Supports temperature unit selection, VSP pump control toggle, and air temperature sensor enable/disable.

### Testing

This repository maintains comprehensive test coverage with world-class testing standards:

**Current Test Suite:**

- Comprehensive test suite with extensive coverage
- ~99%+ line coverage with realistic testing scenarios
- Zero test failures as a mandatory requirement
- Clean Jest execution without timer leaks or open handles

**Test Quality Standards:**

- ✅ All tests verify real functionality with proper assertions
- ✅ Edge cases and error conditions comprehensively tested
- ✅ Complex async operations and timing scenarios properly tested
- ✅ Configuration validation covers all validation paths
- ✅ Integration tests use realistic scenarios with proper mocking
- ✅ Error handling includes circuit breakers, retry logic, and health monitoring
- ✅ Proper test cleanup prevents resource leaks
- ❌ No artificial coverage boosters or dummy tests
- ❌ No forced test passes or skipped assertions
- ❌ No shortcuts that compromise test integrity

**Test Types:**

- **Unit tests**: `test/unit/` - Individual component testing
- **Integration tests**: `test/integration/` - Cross-component functionality
- **Utility tests**: `test/` - Helper function validation
- **Comprehensive tests**: Real-world scenario validation

**Coverage Verification:**

- Use `npm test` to run full test suite with coverage reporting
- Coverage reports generated in `coverage/lcov-report/index.html`
- Jest configuration enforces coverage thresholds
- All platform instances properly cleaned up to prevent timer leaks

**Before any code changes:**

1. Run `npm test` to establish baseline (all tests must pass)
2. Ensure changes maintain high test coverage and quality
3. Add meaningful tests for new functionality
4. Verify proper test cleanup (no open handles or timer leaks)
5. Never compromise test quality for convenience

**Release Quality Gates:**

- `npm run prepublishOnly` must pass completely (lint + format + security + build + test)
- All tests must pass without any skipped or modified tests
- High test coverage must be maintained across all files
- Code formatting must pass Prettier validation
- Security audit must pass moderate+ vulnerability checks
- Jest must exit cleanly without force exit or timer leaks
- No test quality compromises are acceptable for release deadlines

**Manual Release Pipeline:**

All releases use the manual process with quality gates:

1. **Code formatting check** - Prettier validation via `npm run format:check`
2. **Linting** - ESLint with zero warnings policy via `npm run lint`
3. **Security audit** - npm audit + audit-ci for vulnerability scanning via `npm run security-check`
4. **Testing** - Full Jest test suite with coverage reporting via `npm run test`
5. **Building** - TypeScript compilation to JavaScript via `npm run build`
6. **Release** - Manual npm publish and GitHub release creation

**IMPORTANT**: Ensure both npm and GitHub releases are completed successfully. If either fails, investigate and resolve before considering the release complete.

## Dependency Management Strategy

When updating dependencies, follow this version strategy:

### **🌍 Engines (User-Controlled) - Conservative**

- **homebridge**: Support from 1.8.0+ (users control this)
- **node**: Support LTS versions 20+, 22+, 24+ (users control this)

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

## Development Notes

### Jest Test Cleanup (Fixed in v2.5.2+)

- **Issue resolved**: Platform instances were leaving timer handles open during tests
- **Solution implemented**: Proper cleanup in integration test `afterEach` blocks
- **Result**: Jest now exits cleanly without `forceExit: true` workaround
- **Best practice**: All platform instances must be tracked and cleaned up in tests

### Code Quality Achievements

- **Prettier formatting**: Integrated with build pipeline for consistent code style
- **Jest cleanup**: Eliminated all timer leaks and open handles in test suite
- **Coverage excellence**: Maintains ~99%+ line coverage with meaningful tests
- **Zero warnings**: ESLint configuration enforces zero-warning policy
- **Cyclomatic complexity**: ESLint enforces maximum complexity of 15 per function
- **ESLint configuration**: Modern flat config format in `eslint.config.js` with TypeScript support
- **Security scanning**: Integrated audit-ci and eslint-plugin-security for vulnerability detection
- **Protocol-specific security**: Balanced security rules that account for legitimate dynamic property access
- **Manual release process**: Reliable manual workflow with comprehensive quality gates
- **Supply chain security**: npm audit and dependency vulnerability scanning

### Release System Evolution (v2.5.2+)

- **Manual release workflow**: Structured manual process with quality gates
- **Version management**: Manual version bumping with clear beta/stable distinction
- **Quality assurance**: Comprehensive prepublishOnly script ensures release readiness
- **Branch strategy**: Separate handling for stable (master) and pre-release (beta) branches
- **Security first**: Integrated security scanning in release pipeline
- **Reliable releases**: Manual verification ensures both npm and GitHub releases succeed

### Pump Performance Curve Calculations

**Mathematical Implementation**: The plugin implements highly accurate pump performance calculations using fourth-degree polynomial formulas calibrated from real IntelliCenter data:

**Power Consumption (WATTS)**:
- **Formula**: `W = a*r⁴ + b*r³ + c*r² + d*r` where `r = RPM/MAX_RPM`
- **Calibration**: Coefficients derived from multiple real-world data points from actual IntelliCenter systems
- **Accuracy**: Zero deviation accuracy between calibration points with smooth interpolation
- **Implementation**: Located in `src/constants.ts` within `PUMP_PERFORMANCE_CURVES` object

**Flow Rate (GPM)**:
- **VSF/VF Pumps**: Fourth-degree polynomial formulas for precise flow rate calculations
- **VS Pumps**: Linear approximation formulas based on manufacturer specifications
- **Range Validation**: All calculations include proper RPM range checking and boundary conditions

**Key Features**:
- **Real-world calibration**: Formulas derived from actual pump performance data, not theoretical specifications
- **Efficiency modeling**: Different pump types (VS, VF, VSF) have distinct efficiency characteristics
- **Mathematical precision**: Fourth-degree polynomials provide smooth, accurate curves between data points
- **Performance optimization**: Calculations are mathematically optimized for speed while maintaining accuracy

**When updating pump curves**:
1. Use real IntelliCenter data points for calibration whenever possible
2. Implement fourth-degree polynomial formulas for maximum accuracy
3. Validate calculations across full RPM range (typically 450-3450 RPM)
4. Update both power (WATTS) and flow rate (GPM) calculations simultaneously
5. Test accuracy against known data points to ensure zero deviation

### Development Standards Context

**Remember**: When evaluating improvements or suggestions for this project, always consider the **Homebridge plugin context**:

**✅ Appropriate for Homebridge plugins:**

- Comprehensive testing and code quality
- Clear documentation and setup instructions
- Reliable connection handling and error recovery
- Security best practices for credential handling
- Proper HomeKit integration patterns
- Manual release processes for maintainability and control

**❌ Inappropriate over-engineering:**

- Performance metrics collection and dashboards
- Complex monitoring and observability systems
- Enterprise-grade distributed system patterns
- Scalability optimizations for thousands of users
- Heavy telemetry and analytics systems
- Complex automated deployment systems

**Focus areas for improvements:**

- User setup experience (configuration UI, clear error messages)
- Developer experience (easier contribution, better debugging)
- Reliability (connection stability, graceful failures)
- Security (credential protection, dependency scanning)
- Maintainability (comprehensive testing, structured release processes)

### Local Development with Docker

For testing changes in a realistic Homebridge environment, this repository includes Docker Compose configuration for local development:

**Setup:**
```bash
# Copy template config and add your credentials
cp homebridge-config/config.template.json homebridge-config/config.json
# Edit config.json with your IntelliCenter IP, username, password

# Build and start Homebridge in Docker
npm run build
docker-compose up -d
```

**Development Workflow:**
```bash
# After making code changes
npm run build
docker-compose restart homebridge

# View logs
docker-compose logs -f homebridge
```

**Key Benefits:**
- **Realistic testing environment**: Full Homebridge with UI at http://localhost:8581
- **Credential security**: Your `config.json` is gitignored, only template is committed
- **Fast iteration**: Direct file mounting means changes are immediate after rebuild
- **Integration testing**: Test real IntelliCenter connections and HomeKit behavior

**When to use Docker testing:**
- Testing new features with actual IntelliCenter hardware
- Debugging connection or authentication issues
- Validating HomeKit accessory behavior
- Testing configuration changes
- Reproducing user-reported issues

**Important**: Docker testing complements but doesn't replace the comprehensive Jest test suite. Use both for complete validation.

## Maintaining This Document

This CLAUDE.md file is a living document that must be kept up-to-date as the project evolves. **Always update this document when making changes to:**

### Development Workflows

- **Adding new npm scripts**: Update the [Common Commands](#common-commands) section
- **Changing build processes**: Update build-related commands and descriptions
- **Modifying development tools**: Update tool configurations and usage instructions

### Release and Quality Processes

- **Release workflow changes**: Update the [Release Process](#release-process) section
- **Quality pipeline modifications**: Update manual pipeline descriptions
- **New quality gates**: Add to the Release Quality Gates section
- **Security scanning changes**: Update security-related processes and tools

### Testing Approaches

- **New testing frameworks**: Update the [Testing](#testing) section
- **Coverage threshold changes**: Update coverage requirements and standards
- **Test organization changes**: Update test structure and organization guidance

### Architecture Changes

- **New components**: Update the [Architecture Overview](#architecture-overview) section
- **Protocol changes**: Update IntelliCenter integration details
- **New accessory types**: Update accessory descriptions and patterns

### Dependency Management

- **New dependency strategies**: Update the [Dependency Management Strategy](#dependency-management-strategy) section
- **Version policy changes**: Update versioning approaches and rationale

### Development Standards

- **Code quality tools**: Update linting, formatting, and analysis tool configurations
- **New best practices**: Add to the [Development Notes](#development-notes) section
- **Security practices**: Update security-related guidance and tools

### When to Update

**Required Updates:**

- ✅ Before committing changes that modify workflows or processes
- ✅ When adding new development tools or scripts
- ✅ When changing quality pipelines or release gates
- ✅ When modifying testing approaches or coverage requirements
- ✅ When updating dependency management strategies

**Best Practices:**

- Update the document as part of the same PR/commit that implements the changes
- Include a brief changelog entry noting the documentation update
- Review the entire document periodically to ensure accuracy
- Use conventional commit format: `docs(claude): update development workflow guidance`

**Commit Message Examples:**

```
docs(claude): update manual release workflow documentation
docs(claude): update testing standards and coverage requirements
docs(claude): add security scanning process to quality pipeline
```

This approach ensures that the documentation remains accurate, comprehensive, and useful for both AI assistants and human developers working with the codebase.