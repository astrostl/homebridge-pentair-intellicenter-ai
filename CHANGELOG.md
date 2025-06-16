# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [2.6.0] - 2025-06-16

### Added
- **Development Infrastructure Overhaul**
  - Added `.nvmrc` for Node.js version consistency (Node 20 LTS)
  - Added `.editorconfig` for cross-editor formatting consistency
  - Added `.prettierrc` configuration for code formatting
  - Added comprehensive ESLint security scanning with `eslint-plugin-security`
  - Added security audit tools (`audit-ci`) for vulnerability detection
  - Added new npm scripts: `format`, `format:check`, `security-audit`, `audit-ci`, `security-check`

- **Code Quality Enhancements**
  - Fixed Jest timer leaks - added proper cleanup in platform instances during tests
  - Resolved Jest configuration issues - converted to CommonJS syntax for compatibility
  - Fixed TypeScript configuration syntax error (trailing comma)
  - Added comprehensive test coverage improvements (525 tests, ~100% statement coverage)

- **Package Management Improvements**
  - Updated `package.json` to modern standards:
    - Fixed repository URL from deprecated `git://` to `https://`
    - Added `"type": "commonjs"` declaration
    - Added `"files"` array to control npm publishing (only `dist/` and `config.schema.json`)
    - Added `"funding"` field linking to GitHub Sponsors
  - Updated Node.js engine requirements for better consistency

- **Security and Build Pipeline**
  - Integrated Prettier formatting into build pipeline
  - Added security scanning to `prepublishOnly` workflow
  - Enhanced ESLint configuration with protocol-specific security rules
  - Added dependency freshness checking to quality pipeline (`outdated-check` script)
  - Improved error handling and validation throughout codebase

### Changed
- **Documentation Updates**
  - Completely rewrote `CLAUDE.md` to accurately reflect manual release processes
  - Removed references to non-existent automation (semantic-release, GitHub Actions)
  - Added comprehensive development guide with proper Homebridge plugin context
  - Updated test statistics to be dynamic rather than hardcoded counts
  - Added design philosophy emphasizing simplicity over enterprise complexity

- **Test Suite Improvements**
  - Resolved Jest timer leak issues causing "worker process failed to exit gracefully" warnings
  - Enhanced integration test cleanup with proper platform instance tracking
  - Improved test reliability and execution speed
  - Added comprehensive error handling tests

- **Build Process Refinements**
  - Updated `prepublishOnly` script to include format checking and security auditing
  - Streamlined development workflow with better script organization
  - Improved TypeScript compilation settings

### Fixed
- **Critical Configuration Issues**
  - Fixed Jest configuration incompatibility with CommonJS modules
  - Resolved TypeScript syntax errors preventing clean builds
  - Fixed platform timer leak issues in test suite
  - Corrected package.json repository URL protocol

- **Code Quality Issues**
  - Enhanced error handling throughout the codebase
  - Improved type safety and null checking
  - Fixed edge cases in utility functions and accessory handling

### Updated
- **Development Dependencies**
  - Updated `@types/jest` from 29.5.14 to 30.0.0
  - Updated `@types/node` from 24.0.1 to 24.0.3
  - Updated `@semantic-release/commit-analyzer` from 12.0.0 to 13.0.1
  - Updated `@semantic-release/github` from 10.3.5 to 11.0.3
  - Updated `@semantic-release/release-notes-generator` from 12.1.0 to 14.0.3
  - Updated `jest` from 29.x to 30.0.0

### Removed
- **Unused Infrastructure**
  - Removed incomplete GitHub Actions workflow files
  - Cleaned up unused automation references in documentation
  - Removed misleading automation claims from development docs

## [2.5.1] - Previous Release

### Note
Version 2.5.1 was the baseline for this major development infrastructure overhaul. The changes above represent a comprehensive modernization of the development workflow, code quality standards, and documentation accuracy while maintaining the core plugin functionality and excellent test coverage that made this plugin reliable.

### Key Metrics (v2.6.0)
- **Test Coverage**: 100% statement coverage, 97%+ branch coverage
- **Test Suite**: 525 comprehensive tests across 23 test suites
- **Code Quality**: Zero ESLint warnings, Prettier formatted, security scanned
- **Build Process**: Complete quality gates with lint, format, security, dependency checking, build, and test validation
- **Node.js Support**: Node 18+, 20+, 22+, 24+ LTS versions
- **Homebridge Compatibility**: 1.8.0+ and 2.0.0+ beta support
- **Development Dependencies**: All updated to latest versions (Jest 30, TypeScript types, semantic-release tools)