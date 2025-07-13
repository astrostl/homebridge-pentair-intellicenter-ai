# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [2.10.1] - 2025-07-13

### Fixed
- **🌡️ Enhanced Heater State Detection**: Improved heating/cooling state accuracy for heat pump systems
  - **HTSRC-based state logic** - now properly uses heat source (HTSRC) parameter to determine if heater is assigned to body
  - **Fallback temperature logic** - graceful fallback to temperature comparison when HTSRC data unavailable
  - **Better OFF state detection** - correctly identifies when HTSRC = '00000' (heater completely OFF)
  - **Improved cooling detection** - enhanced HTMODE = 9 detection for heat pump cooling mode
  - **Cleaner state determination** - refactored getCurrentHeatingCoolingState logic into focused helper methods

### Enhanced
- **🔧 Heater Control Reliability**: More robust heater state management
  - **Better parameter validation** - enhanced checks for HTSRC and HTMODE data availability
  - **Enhanced debug logging** - detailed logging shows HTSRC, HTMODE, and temperature values for troubleshooting
  - **Improved fallback logic** - seamless transition between HTSRC-based and temperature-based state detection
  - **Type safety improvements** - better handling of string/number conversions for heater parameters

### Technical Improvements
- **Code organization** - split complex getCurrentHeatingCoolingState into focused helper methods:
  - `checkHeatSourceState()` - handles HTSRC-based state detection
  - `getStateFromHeatMode()` - processes HTMODE values for heating/cooling determination
  - `checkTemperatureState()` - fallback temperature comparison logic
- **Enhanced test coverage** - updated test suite to cover new heater state detection logic
- **Better maintainability** - clearer separation of concerns in heater state determination

## [2.10.0] - 2025-07-12

### Added
- **🌡️ Enhanced Heater Control System**: Major improvements to heat pump heating/cooling state detection
  - **HTMODE-based state detection** - uses proper IntelliCenter HTMODE values for accurate HEATING/COOLING/OFF state reporting
  - **Real-time temperature synchronization** - temperature range changes in Pentair app update immediately in HomeKit
  - **Enhanced parameter subscription** - added HTMODE_KEY to subscription list for better heater monitoring
  - **Immediate HomeKit updates** - current temperature and heating/cooling state update automatically when body data changes
  - **Type safety improvements** - added proper number conversion for HTMODE values to handle string/number inconsistencies

- **🏗️ Cross-Platform Development Environment**: Complete Docker-based development workflow
  - **Docker & nerdctl support** - development scripts work with both Docker Desktop and Rancher Desktop/nerdctl
  - **Local testing workflow** - new `test-local.sh` script for rapid development iteration without npm publishing
  - **Container optimization** - improved networking and volume mounting for reliable development environment
  - **Configuration templates** - secure credential handling with gitignored real config files

- **🧪 Enhanced Testing Infrastructure**: Expanded test coverage for edge cases and network scenarios
  - **Network edge case testing** - new `platform-network-edge-cases.spec.ts` for comprehensive error handling
  - **Enhanced heater testing** - improved test coverage for HTMODE-based state detection and cooling functionality
  - **Better test isolation** - improved test cleanup and resource management

### Enhanced
- **🔧 Heater Accuracy Improvements**: More precise heating/cooling state detection for heat pump systems
  - **Better current state logic** - more accurate reporting based on actual equipment operation
  - **Debug logging enhancements** - added detailed logging for troubleshooting heater state detection
  - **Improved temperature parameter mapping** - fixed TEMP vs LSTTMP parameter handling for accurate readings
  - **Enhanced cooling support** - improved detection and control of heat pump cooling functionality

- **📋 Development Infrastructure**: Streamlined development workflow and documentation
  - **Comprehensive CLAUDE.md updates** - added behavioral guidelines, local development workflows, and security best practices
  - **Development workflow documentation** - updated processes for Docker-based testing and contribution guidelines
  - **Enhanced documentation** - improved development setup instructions and contribution processes

### Fixed
- **🛡️ Security Improvements**: Enhanced credential protection and secure development practices
  - **Expanded .gitignore protection** - added exclusions for `homebridge-config/auth.json`, `homebridge-config/.uix-secrets`, `homebridge-config/persist/`, `homebridge-config/accessories/`, and `homebridge-config/backups/`
  - **Removed sensitive files** - cleaned up accidentally tracked sensitive files from repository history
  - **Better credential protection** - improved security for local development environments

- **🌡️ Temperature Management Fixes**: Resolved real-time temperature synchronization issues
  - **Parameter mapping corrections** - fixed temperature parameter handling for more accurate data processing
  - **Real-time update reliability** - improved synchronization between IntelliCenter and HomeKit
  - **HTMODE value handling** - proper conversion and validation of heater mode values

### Technical Improvements
- **Core system enhancements** - significant improvements to `src/heaterAccessory.ts`, `src/platform.ts`, `src/constants.ts`, `src/types.ts`, and `src/util.ts`
- **Enhanced type definitions** - improved TypeScript support for heater mode values and temperature parameters
- **Better error handling** - expanded error handling for network scenarios and edge cases
- **Improved debugging** - enhanced logging throughout the system for better troubleshooting

## [2.9.0] - 2025-07-12

### Added
- **🔄 Real-time Temperature Range Updates**: Heat pump temperature range changes now update immediately in HomeKit
  - **Idle state detection** - temperature range changes are detected even when heater is not active
  - **HITMP/LOTMP subscription** - proper parameter subscription for high/low temperature limits
  - **Dynamic range updates** - HomeKit characteristics update automatically when ranges change in Pentair app
  - **Instance tracking** - HeaterAccessory instances are tracked for dynamic updates
  - **Immediate feedback** - no restart required when temperature ranges are modified

- **🏠 Local Development Environment**: Complete Docker-based development workflow
  - **Cross-platform support** - works with both Docker Desktop and nerdctl (Rancher Desktop)
  - **Local testing without publishing** - test plugin changes directly in container environment
  - **Automated deployment scripts** - `./test-local.sh` for rapid development iteration
  - **Configuration template system** - secure credential handling with gitignored real configs
  - **Homebridge UI Fahrenheit display** - automatic Fahrenheit temperature units in web interface

### Enhanced
- **🛠️ Development Infrastructure**: Comprehensive local testing and deployment
  - **Platform detection** - automatic Docker vs nerdctl runtime detection
  - **File-based deployment** - direct dist/ file copying for immediate testing
  - **Container networking** - proper port mapping for internet access and external connectivity
  - **Secure credential management** - template-based configuration with real credentials gitignored
  - **Documentation updates** - CLAUDE.md and README updated with development workflows

### Fixed
- **🌡️ Temperature Range Synchronization**: Critical fix for heat pump range detection
  - **Missing parameter subscriptions** - added HIGH_TEMP_KEY and LOW_TEMP_KEY to subscription list
  - **Idle state bug** - temperature range changes now detected regardless of heater activity state
  - **Real-time updates** - eliminated need for heater restart when temperature ranges change
  - **HomeKit characteristic updates** - proper min/max value updates when ranges change dynamically

### Technical Improvements
- **📊 Instance Management**: HeaterAccessory tracking for dynamic updates
- **🔧 Parameter Monitoring**: Enhanced IntelliCenter parameter subscription coverage
- **🐳 Docker Configuration**: Optimized development container setup with proper networking
- **📝 Documentation**: Updated behavioral guidelines and development practices in CLAUDE.md

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