# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [2.8.3] - 2025-07-08

### Added
- **🌡️ Heat Pump Cooling Support**: Complete cooling functionality for heat pump equipped pools
  - **Dual setpoint thermostats** - separate heating and cooling threshold controls in HomeKit
  - **Intelligent mode detection** - devices with cooling show OFF/AUTO modes, heating-only shows OFF/HEAT
  - **Smart current state** - accurately reports HEATING, COOLING, or OFF based on temperature vs setpoints
  - **Automatic cooling threshold** - HIGH_TEMP parameter support for cooling setpoint management
  - **Comprehensive cooling logic** - proper deadband handling between heating and cooling setpoints

### Enhanced
- **🔧 Heater Accessory Architecture**: Sophisticated thermostat control for modern pool equipment
  - **Cooling capability detection** - automatically detects COOL parameter from IntelliCenter
  - **Dynamic mode configuration** - valid HomeKit modes adapt based on cooling capability
  - **Enhanced current state logic** - proper heating/cooling state detection for heat pumps
  - **Threshold temperature management** - separate heating and cooling setpoint controls
  - **Protocol integration** - seamless HIGH_TEMP and COOL parameter handling

### Fixed
- **🎯 Thermostat Mode Accuracy**: Corrected mode reporting for different heater types
  - **Heat pump detection** - proper AUTO mode for dual-capability devices
  - **Heating-only compatibility** - maintains existing HEAT mode behavior for standard heaters
  - **State synchronization** - current heating/cooling state matches actual equipment operation
  - **Temperature deadband** - prevents oscillation between heating and cooling states

### Technical
- **Comprehensive test coverage** - extensive cooling functionality test suite
- **Type safety** - proper TypeScript support for cooling-enabled heaters
- **Backward compatibility** - existing heating-only configurations unchanged
- **Protocol compliance** - full IntelliCenter COOL and HIGH_TEMP parameter support

## [2.8.2] - 2025-06-29

### Enhanced
- **Dependency Management**: Updated development dependencies for improved security and compatibility
  - **jest**: Updated to v30.0.3 for enhanced testing performance
  - **@types/node**: Updated to v24.0.4 for latest Node.js type definitions
  - **@typescript-eslint/eslint-plugin**: Updated to v8.35.0 for improved TypeScript linting
  - **prettier**: Updated to v3.6.2 for enhanced code formatting capabilities

### Added
- **Security Enhancements**: Added CodeQL security analysis workflow
  - **Automated security scanning**: CodeQL analyzes JavaScript/TypeScript code for security vulnerabilities
  - **Continuous monitoring**: Runs on push, pull requests, and weekly schedule
  - **Proper language configuration**: Focused on JavaScript/TypeScript to prevent scanning errors

### Fixed
- **Documentation Updates**: Corrected formatting issues and updated references
  - **Fixed missing parenthesis** in README.md Apple Home link
  - **Updated firmware testing reference** to clarify current testing timeframe
  - **Removed stale test metrics** from changelog to prevent maintenance overhead

### Technical
- **Automated dependency updates**: Leveraged Dependabot for secure, automated dependency management
- **Comprehensive quality pipeline**: All quality gates pass with excellent test coverage
- **Security compliance**: Zero vulnerabilities detected in dependency audit

## [2.8.1] - 2025-06-21

### Fixed
- **Reduced verbose logging**: Moved detailed pump and circuit update logs from `info` to `debug` level
  - **Pump circuit updates**: All `[PUMP CIRCUIT UPDATE]`, `[PUMP UPDATE]`, and `[PUMP UPDATE COMPLETE]` logs are now debug-only
  - **Standalone pump updates**: All `[STANDALONE PUMP UPDATE]` and `[STANDALONE PUMP SENSOR UPDATE]` logs are now debug-only
  - **Circuit updates**: All `[CIRCUIT UPDATE]` logs with detailed parameters are now debug-only
  - **Sensor updates**: All `[PUMP SENSOR UPDATE]` logs including individual sensor update confirmations are now debug-only
  - **Pump-circuit associations**: All association mapping logs are now debug-only
  - **Sensor restoration**: Cache restoration logs are now debug-only
  - **Result**: Much cleaner info-level logs while preserving full diagnostic capability at debug level

### Technical
- **Homebridge logs**: Info level now shows only essential operational messages (connections, errors, warnings)
- **Debug level**: Full diagnostic logging available when `"debug": true` is enabled in Homebridge config
- **No functional changes**: All pump sensor functionality remains identical, only logging verbosity reduced

## [2.8.0] - 2025-06-21

### Added
- **🌊 Pump GPM (Flow Rate) Sensors**: Real-time flow rate monitoring for all variable speed pumps
  - **Pump-level sensors** - one GPM sensor per physical pump (not per feature)
  - **Performance curve calculations** - accurate flow rates based on pump speed and type
  - **Multiple pump type support** - VS, VSF, and VF pumps with type-specific curves
  - **HomeKit light sensor display** - GPM values shown as lux (1:1 ratio) for easy monitoring
  - **Real-time updates** - flow rates update instantly when pump speeds change

- **⚡ Pump WATTS (Power Consumption) Sensors**: Smart power monitoring with active circuit detection
  - **Pump-level sensors** - one WATTS sensor per physical pump for accurate power tracking
  - **Active circuit detection** - uses highest active circuit speed instead of highest configured speed
  - **Fourth-degree polynomial power curves** - mathematically precise calibration to actual IntelliCenter data
  - **Multiple pump type support** - VS, VSF, and VF pumps with distinct efficiency characteristics
  - **Smart circuit filtering** - only considers circuits that are currently ON for power calculation
  - **Prevents power over-reporting** - fixes issue where inactive high-speed circuits inflated power readings

### Enhanced
- **WATTS Power Curve Perfection**: Fourth-degree polynomial formulas for zero deviation accuracy
  - **Perfect calibration**: 1800=217W, 2300=453W, 3100=1094W, 3450=1489W with 0.0W error at all points
  - **Mathematical precision**: W = a*r⁴ + b*r³ + c*r² + d*r where r = RPM/MAX_RPM
  - **Real-world validation**: Power curves calibrated from actual IntelliCenter system data
  - **Proportional efficiency**: VSF and VF curves derived with same polynomial structure
  - **Intermediate accuracy**: Smooth, realistic power curves between calibration points

- **Pump Performance Curve System**: Comprehensive pump characteristic modeling
  - **Type-specific calculations** - VS, VSF, and VF pumps have distinct performance profiles
  - **Accurate flow rates** - VS pumps: ~20GPM@1000RPM to ~110GPM@3450RPM
  - **Efficiency modeling** - VSF pumps are 10-15% more efficient than standard VS pumps

- **Pump Type Detection**: Intelligent mapping of telnet protocol pump types
  - **SPEED → VS** (Variable Speed)
  - **VSF → VSF** (Variable Speed/Flow) 
  - **FLOW → VF** (Variable Flow)
  - **Automatic fallback** - unknown types default to VS curves with logging

### Fixed
- **WATTS Sensor Persistence Issue**: Fixed WATTS sensor getting stuck at 217W after heater speed changes
  - **Separate update paths**: Distinguished between circuit-driven updates (`updateSpeed`) and system-driven updates (`updateSystemSpeed`)
  - **Persistent heater speeds**: System-driven speeds (heater) persist for 30 seconds and override circuit detection
  - **Smart fallback**: After 30 seconds, automatically falls back to active circuit detection
  - **Enhanced logging**: Added detailed debug logs showing speed source and timing
  - **Prevents conflicts**: Circuit updates no longer overwrite heater-driven speeds immediately

- **WATTS Sensor Heater Detection**: Enhanced WATTS sensor to properly detect heater-driven speed changes
  - **Smart speed detection**: WATTS sensor now uses the higher of active circuit speed OR updateSpeed parameter
  - **Heater speed capture**: When heater turns on and changes pump to 3000 RPM, WATTS sensor correctly reflects that power
  - **Fallback logic**: Preserves active circuit detection while allowing system-driven speed overrides
  - **Enhanced logging**: Added debug logs to show which speed source is being used (active circuits vs system updates)

- **WATTS Sensor Circuit Selection**: Critical fix for power consumption accuracy
  - **Root cause resolved** - WATTS sensors were using highest configured speed instead of active speed
  - **Active circuit filtering** - only circuits with CircuitStatus.On are considered for power calculation
  - **Realistic power readings** - accurate power consumption based on actual pump operation
  - **Multiple circuit handling** - correctly handles pumps with multiple circuits at different speeds

### Technical
- **Comprehensive test coverage** - excellent coverage for new pump sensor accessories
- **Type-safe implementations** - full TypeScript support for all pump sensor types
- **Memory efficient** - pump-level sensors reduce accessory count vs feature-level approach
- **Platform integration** - seamless discovery and update integration with existing architecture

## [2.7.0] - 2025-06-20

### Added
- **🚀 Complete RPM Sensor System**: Revolutionary real-time pump speed monitoring for all pool equipment
  - **Individual RPM sensors** for each controllable feature (Pool, Spa, Spa Jets, Fountain, Heaters)
  - **Feature-based naming** for intuitive identification (e.g., "Pool RPM", "Gas Heater RPM")
  - **Real-time updates** with immediate HomeKit characteristic updates (no refresh required)
  - **Dynamic speed tracking** - sensors update instantly when speeds change (2800→2900→3000 RPM)
  - **Smart heater detection** - heater RPM sensors show required pump speeds when heaters activate
  - **Comprehensive pump coverage** - supports both regular features and standalone pump configurations

- **Advanced Pump Circuit Management**: Sophisticated pump speed detection and control
  - **Intelligent circuit mapping** - automatically discovers and maps pump circuits to features
  - **Priority-based heater speed detection** - correctly identifies heater requirements vs. spa jets speeds
  - **Standalone pump support** - handles direct pump updates from IntelliCenter (heater speed changes)
  - **Dynamic circuit discovery** - works with any IntelliCenter configuration without hardcoding

- **Enhanced HomeKit Integration**: Seamless Apple Home app experience
  - **Light sensor visualization** - RPM displayed as lux values (1:1 ratio) for easy monitoring
  - **Immediate updates** - all sensors push changes to HomeKit instantly via direct characteristic updates
  - **Automatic cleanup** - orphaned RPM sensors removed when equipment is reconfigured
  - **Feature-based organization** - sensors grouped logically by pool equipment function

### Enhanced
- **🔧 Robust Update Architecture**: Multiple update paths for maximum reliability
  - **Feature-based updates** - regular pool equipment speed changes (Pool, Spa, Spa Jets, Fountain)
  - **Standalone pump updates** - direct heater speed requirement changes
  - **Enhanced search logic** - finds RPM sensors even with pump circuit ID mismatches
  - **Fallback mechanisms** - multiple strategies to locate and update correct sensors

- **📊 Comprehensive Testing**: Added extensive new tests for RPM sensor functionality
  - **PumpRpmAccessory tests** - complete coverage of RPM sensor behavior
  - **Heater RPM logic tests** - pump circuit selection priorities and mapping
  - **Integration tests** - real-world RPM update scenarios
  - **Edge case coverage** - error handling, missing circuits, invalid speeds

- **🏗️ Code Quality**: Maintained world-class standards throughout development
  - **Excellent test coverage** with comprehensive tests
  - **Complete function coverage** - every method tested
  - **Production-ready error handling** - graceful degradation for all edge cases
  - **TypeScript safety** - strict type checking for all new functionality

### Fixed
- **⚡ Immediate RPM Updates**: Resolved HomeKit refresh requirements
  - **Fixed update mechanism** - all RPM sensors now call `updateRpm()` directly for instant HomeKit updates
  - **Eliminated refresh dependency** - values update immediately without manual app refresh
  - **Consistent behavior** - all RPM sensors (heater, spa, pool, etc.) now update uniformly

- **🎯 Heater Speed Accuracy**: Corrected heater RPM detection for dynamic speed changes
  - **Standalone pump integration** - heater speed changes now properly detected from pump updates
  - **Dynamic speed tracking** - heater RPM sensors update when requirements change (3000→2800→2900 RPM)
  - **Status synchronization** - heater RPM shows correct values based on actual heater state

- **🔍 Circuit ID Resolution**: Solved pump circuit mapping inconsistencies
  - **Enhanced search logic** - RPM sensors found even when pump circuit IDs don't match feature IDs
  - **Dual lookup strategy** - tries both direct ID matching and pump circuit association
  - **Generic configuration support** - works with any IntelliCenter setup without hardcoded mappings

### Technical Improvements
- **Circuit Status Updates**: Enhanced circuit synchronization from external sources
  - Improved real-time detection of manual control changes (remote, physical switches)
  - Better circuit state synchronization between IntelliCenter and HomeKit
  - Fixed scenarios where external changes weren't reflected in Home app

- **Sponsor Integration**: Complete funding configuration
  - GitHub Sponsors and PayPal integration in both package.json and config schema
  - Visible sponsor links in Homebridge UI for project support

- **Dependency Updates**: Latest security and performance improvements
  - Updated TypeScript ESLint packages to latest versions
  - Updated Jest to latest version with enhanced performance
  - Resolved all security audit recommendations

### Developer Experience
- **Enhanced Debug Logging**: Comprehensive tracing for RPM sensor operations
  - Detailed pump circuit discovery and mapping logs
  - RPM sensor update tracking with before/after values
  - Clear identification of update paths (feature vs. standalone pump)

- **Improved Architecture**: Clean separation of RPM sensor concerns
  - Dedicated `PumpRpmAccessory` class for all RPM sensor functionality
  - Clear distinction between feature-based and heater-based sensors
  - Robust cleanup and lifecycle management

### Compatibility
- **Universal Configuration Support**: Works with any IntelliCenter setup
  - No hardcoded circuit IDs or pump mappings
  - Dynamic discovery of all pump circuits and features
  - Automatic adaptation to different pool equipment configurations

- **Homebridge Standards**: Maintains excellent plugin ecosystem compatibility
  - Follows Homebridge accessory lifecycle patterns
  - Proper UUID management and accessory registration
  - Clean integration with existing circuit, heater, and temperature accessories

### Performance
- **Efficient Update Handling**: Optimized for real-time responsiveness
  - Direct HomeKit characteristic updates bypass unnecessary overhead
  - Intelligent sensor matching reduces lookup time
  - Minimal resource usage for background RPM monitoring

---

## [2.7.0-beta.11] - 2025-06-20
*All beta functionality consolidated into v2.7.0 stable release above*

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
- **Test Coverage**: Excellent statement and branch coverage
- **Test Suite**: Comprehensive tests across multiple test suites
- **Code Quality**: Zero ESLint warnings, Prettier formatted, security scanned
- **Build Process**: Complete quality gates with lint, format, security, dependency checking, build, and test validation
- **Node.js Support**: Node 18+, 20+, 22+, 24+ LTS versions
- **Homebridge Compatibility**: 1.8.0+ and 2.0.0+ beta support
- **Development Dependencies**: All updated to latest versions (Jest 30, TypeScript types, semantic-release tools)