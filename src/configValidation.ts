/**
 * Configuration validation and sanitization for Pentair Platform
 */

import { PlatformConfig } from 'homebridge';
import { TemperatureUnits } from './types';

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  sanitizedConfig?: PentairConfig;
}

export interface TemperatureUnitValidationResult {
  isConsistent: boolean;
  detectedUnit: TemperatureUnits | null;
  configuredUnit: TemperatureUnits;
  analysisCount: number;
  warning?: string;
}

interface TemperatureStats {
  avgTemp: number;
  minTemp: number;
  maxTemp: number;
}

interface TemperatureDetectionResult {
  unit: TemperatureUnits;
  confidence: number;
}

export type PentairConfig = {
  ipAddress: string;
  username: string;
  password: string;
  maxBufferSize: number;
  temperatureUnits: TemperatureUnits;
  minimumTemperature: number;
  maximumTemperature: number;
  supportVSP: boolean;
  airTemp: boolean;
  includeAllCircuits?: boolean;
  heatModeOverride?: number;
} & PlatformConfig;

export class ConfigValidator {
  private static validateRequiredFields(config: PlatformConfig, errors: string[], warnings: string[], sanitizedConfig: PentairConfig) {
    this.validateRequiredIpAddress(config, errors, sanitizedConfig);
    // Username/password are no longer required from user config.
    // IntelliCenter's telnet interface does not actually require authentication,
    // but the code structure remains in case auth is needed in the future.
    // Hardcoded dummy values satisfy the existing code paths.
    this.setDummyCredentials(sanitizedConfig);
  }

  private static setDummyCredentials(sanitizedConfig: PentairConfig) {
    // IntelliCenter telnet API does not require authentication.
    // These dummy values maintain code compatibility while removing user burden.
    // If auth becomes required in the future, restore validateRequiredUsername/Password calls
    // and add username/password back to config.schema.json.
    sanitizedConfig.username = 'unused_placeholder';
    sanitizedConfig.password = 'unused_placeholder_password';
  }

  private static validateRequiredIpAddress(config: PlatformConfig, errors: string[], sanitizedConfig: PentairConfig) {
    if (!config.ipAddress || typeof config.ipAddress !== 'string') {
      errors.push('ipAddress is required and must be a string');
    } else {
      const ipValidation = this.validateIpAddress(config.ipAddress);
      if (!ipValidation.isValid) {
        errors.push(`ipAddress is invalid: ${ipValidation.error}`);
      } else {
        sanitizedConfig.ipAddress = config.ipAddress;
      }
    }
  }

  private static validateRequiredUsername(config: PlatformConfig, errors: string[], sanitizedConfig: PentairConfig) {
    if (!config.username || typeof config.username !== 'string') {
      errors.push('username is required and must be a string');
    } else {
      const usernameValidation = this.validateUsername(config.username);
      if (!usernameValidation.isValid) {
        errors.push(`username is invalid: ${usernameValidation.error}`);
      } else {
        sanitizedConfig.username = usernameValidation.sanitized || config.username;
      }
    }
  }

  private static validateRequiredPassword(config: PlatformConfig, errors: string[], warnings: string[], sanitizedConfig: PentairConfig) {
    if (!config.password || typeof config.password !== 'string') {
      errors.push('password is required and must be a string');
    } else {
      const passwordValidation = this.validatePassword(config.password);
      if (!passwordValidation.isValid) {
        errors.push(`password is invalid: ${passwordValidation.error}`);
      } else {
        sanitizedConfig.password = passwordValidation.sanitized || config.password;
        if (passwordValidation.warning) {
          warnings.push(passwordValidation.warning);
        }
      }
    }
  }

  private static validateTemperatureUnits(config: PlatformConfig, errors: string[], warnings: string[], sanitizedConfig: PentairConfig) {
    if (!config.temperatureUnits) {
      warnings.push('temperatureUnits not specified, defaulting to Fahrenheit');
      sanitizedConfig.temperatureUnits = TemperatureUnits.F;
    } else if (!Object.values(TemperatureUnits).includes(config.temperatureUnits as TemperatureUnits)) {
      errors.push(`temperatureUnits must be '${TemperatureUnits.F}' or '${TemperatureUnits.C}'`);
    } else {
      sanitizedConfig.temperatureUnits = config.temperatureUnits as TemperatureUnits;
    }
  }

  private static validateTemperatureRangeConfig(config: PlatformConfig, errors: string[], sanitizedConfig: PentairConfig) {
    const tempValidation = this.validateTemperatureRange(
      config.minimumTemperature,
      config.maximumTemperature,
      (config.temperatureUnits as TemperatureUnits) || TemperatureUnits.F,
    );
    if (!tempValidation.isValid) {
      errors.push(tempValidation.error!);
    }
    if (tempValidation.sanitizedMin !== undefined) {
      sanitizedConfig.minimumTemperature = tempValidation.sanitizedMin;
    }
    if (tempValidation.sanitizedMax !== undefined) {
      sanitizedConfig.maximumTemperature = tempValidation.sanitizedMax;
    }
  }

  private static validateOptionalFields(config: PlatformConfig, warnings: string[], sanitizedConfig: PentairConfig) {
    // Boolean fields with defaults
    sanitizedConfig.supportVSP = this.validateBoolean(config.supportVSP, false);
    sanitizedConfig.airTemp = this.validateBoolean(config.airTemp, true);
    sanitizedConfig.includeAllCircuits = this.validateBoolean(config.includeAllCircuits, false);

    // Heat mode override for multi-mode heaters (0 = auto-detect, 2-15 = specific modes)
    // Note: MODE=1 means "Heat Source OFF" in IntelliCenter, so it is not a valid ON mode
    if (config.heatModeOverride !== undefined && config.heatModeOverride !== null && config.heatModeOverride !== '') {
      const modeValue = Number(config.heatModeOverride);
      if (!isNaN(modeValue) && modeValue >= 2 && modeValue <= 15) {
        sanitizedConfig.heatModeOverride = modeValue;
      } else if (modeValue === 0) {
        // 0 means auto-detect, don't set the override
        sanitizedConfig.heatModeOverride = undefined;
      } else if (modeValue === 1) {
        warnings.push('heatModeOverride=1 is "Heat Source OFF" and cannot be used as an ON mode, ignoring');
        sanitizedConfig.heatModeOverride = undefined;
      } else {
        warnings.push(`heatModeOverride must be 0 (auto) or a number between 2 and 15, ignoring value: ${config.heatModeOverride}`);
      }
    }

    // Buffer size validation
    this.validateBufferSizeConfig(config, warnings, sanitizedConfig);
  }

  private static validateBufferSizeConfig(config: PlatformConfig, warnings: string[], sanitizedConfig: PentairConfig) {
    if (config.maxBufferSize !== undefined) {
      const bufferValidation = this.validateBufferSize(config.maxBufferSize);
      if (!bufferValidation.isValid) {
        warnings.push(`Invalid maxBufferSize: ${bufferValidation.error}. Using default.`);
        sanitizedConfig.maxBufferSize = 1048576; // 1MB default
      } else {
        sanitizedConfig.maxBufferSize = bufferValidation.sanitizedValue!;
      }
    } else {
      sanitizedConfig.maxBufferSize = 1048576; // 1MB default
    }
  }

  private static performSecurityChecks(config: PlatformConfig, warnings: string[]) {
    if (config.ipAddress && this.isPrivateNetwork(config.ipAddress)) {
      // This is good - internal network
    } else if (config.ipAddress) {
      warnings.push('IP address appears to be on a public network. Ensure your IntelliCenter is properly secured.');
    }
  }

  private static finalizeSanitizedConfig(sanitizedConfig: PentairConfig) {
    if (sanitizedConfig.ipAddress) {
      sanitizedConfig.ipAddress = sanitizedConfig.ipAddress.trim();
    }
  }

  static validate(config: PlatformConfig): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Handle null or undefined config
    if (!config || typeof config !== 'object') {
      errors.push('Configuration is required and must be an object');
      return { isValid: false, errors, warnings };
    }

    // Create a working copy for sanitization - only copy known fields
    const sanitizedConfig = {
      platform: config.platform,
      name: config.name,
    } as PentairConfig;

    // Validate all sections
    this.validateRequiredFields(config, errors, warnings, sanitizedConfig);
    this.validateTemperatureUnits(config, errors, warnings, sanitizedConfig);
    this.validateTemperatureRangeConfig(config, errors, sanitizedConfig);
    this.validateOptionalFields(config, warnings, sanitizedConfig);
    this.performSecurityChecks(config, warnings);
    this.finalizeSanitizedConfig(sanitizedConfig);

    const isValid = errors.length === 0;

    return {
      isValid,
      errors,
      warnings,
      sanitizedConfig: isValid ? sanitizedConfig : undefined,
    };
  }

  private static validateIpAddress(ip: string): { isValid: boolean; error?: string } {
    // Basic format check - allow broader pattern to enable octet range validation
    const basicFormatRegex = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/;

    if (!basicFormatRegex.test(ip.trim())) {
      return { isValid: false, error: 'Must be a valid IPv4 address (e.g., 192.168.1.100)' };
    }

    const octets = ip.trim().split('.').map(Number);
    if (octets.some(octet => octet < 0 || octet > 255)) {
      return { isValid: false, error: 'IP address octets must be between 0 and 255' };
    }

    return { isValid: true };
  }

  private static validateUsername(username: string): { isValid: boolean; error?: string; sanitized?: string } {
    const sanitized = this.sanitizeInput(username);

    if (sanitized.length < 3) {
      return { isValid: false, error: 'Username must be at least 3 characters long' };
    }

    if (sanitized.length > 100) {
      return { isValid: false, error: 'Username must be less than 100 characters long' };
    }

    return { isValid: true, sanitized };
  }

  private static validatePassword(password: string): { isValid: boolean; error?: string; warning?: string; sanitized?: string } {
    // Check length before sanitization to catch overly long passwords
    if (password.length > 200) {
      return { isValid: false, error: 'Password must be less than 200 characters long' };
    }

    const sanitized = this.sanitizeInput(password);

    if (sanitized.length < 6) {
      return { isValid: false, error: 'Password must be at least 6 characters long' };
    }

    // Warn if password was significantly changed by sanitization
    const sanitizationReduction = password.length - sanitized.length;
    if (sanitizationReduction > 5) {
      return {
        isValid: true,
        sanitized,
        warning: `Password contained ${sanitizationReduction} potentially unsafe characters that were removed`,
      };
    }

    return { isValid: true, sanitized };
  }

  private static parseTemperatureValue(value: unknown, units: TemperatureUnits, isMin: boolean): number {
    if (typeof value === 'string') {
      return parseFloat(value);
    }
    if (typeof value === 'number') {
      return value;
    }
    // Set defaults based on units
    if (isMin) {
      return units === TemperatureUnits.F ? 40 : 4;
    }
    return units === TemperatureUnits.F ? 104 : 40;
  }

  private static validateTemperatureBounds(temp: number, units: TemperatureUnits, isMin: boolean): { isValid: boolean; error?: string } {
    if (units === TemperatureUnits.F) {
      const bounds = isMin ? { min: 32, max: 120, label: 'Minimum' } : { min: 50, max: 120, label: 'Maximum' };
      if (temp < bounds.min || temp > bounds.max) {
        return { isValid: false, error: `${bounds.label} temperature must be between ${bounds.min}°F and ${bounds.max}°F` };
      }
    } else {
      const bounds = isMin ? { min: 0, max: 50, label: 'Minimum' } : { min: 10, max: 50, label: 'Maximum' };
      if (temp < bounds.min || temp > bounds.max) {
        return { isValid: false, error: `${bounds.label} temperature must be between ${bounds.min}°C and ${bounds.max}°C` };
      }
    }
    return { isValid: true };
  }

  private static validateTemperatureRange(
    min: unknown,
    max: unknown,
    units: TemperatureUnits,
  ): { isValid: boolean; error?: string; sanitizedMin?: number; sanitizedMax?: number } {
    const minTemp = this.parseTemperatureValue(min, units, true);
    const maxTemp = this.parseTemperatureValue(max, units, false);

    if (isNaN(minTemp) || isNaN(maxTemp)) {
      return { isValid: false, error: 'Temperature values must be valid numbers' };
    }

    if (minTemp >= maxTemp) {
      return { isValid: false, error: 'Minimum temperature must be less than maximum temperature' };
    }

    const minValidation = this.validateTemperatureBounds(minTemp, units, true);
    if (!minValidation.isValid) {
      return minValidation;
    }

    const maxValidation = this.validateTemperatureBounds(maxTemp, units, false);
    if (!maxValidation.isValid) {
      return maxValidation;
    }

    return {
      isValid: true,
      sanitizedMin: Math.round(minTemp * 10) / 10, // Round to 1 decimal
      sanitizedMax: Math.round(maxTemp * 10) / 10,
    };
  }

  private static validateBoolean(value: unknown, defaultValue: boolean): boolean {
    if (typeof value === 'boolean') {
      return value;
    }
    if (typeof value === 'string') {
      const lower = value.toLowerCase();
      if (lower === 'true' || lower === '1' || lower === 'yes') {
        return true;
      }
      if (lower === 'false' || lower === '0' || lower === 'no') {
        return false;
      }
    }
    return defaultValue;
  }

  private static validateBufferSize(size: unknown): { isValid: boolean; error?: string; sanitizedValue?: number } {
    let bufferSize: number;

    if (typeof size === 'string') {
      bufferSize = parseInt(size, 10);
    } else if (typeof size === 'number') {
      bufferSize = size;
    } else {
      return { isValid: false, error: 'Buffer size must be a number' };
    }

    if (isNaN(bufferSize) || bufferSize <= 0) {
      return { isValid: false, error: 'Buffer size must be a positive number' };
    }

    // Minimum 64KB, maximum 16MB
    if (bufferSize < 65536) {
      return { isValid: false, error: 'Buffer size must be at least 64KB (65536 bytes)' };
    }

    if (bufferSize > 16777216) {
      return { isValid: false, error: 'Buffer size must be at most 16MB (16777216 bytes)' };
    }

    return { isValid: true, sanitizedValue: bufferSize };
  }

  private static isPrivateNetwork(ip: string): boolean {
    const octets = ip.split('.').map(Number);

    // 10.0.0.0/8
    if (octets[0] === 10) {
      return true;
    }

    // 172.16.0.0/12
    if (octets[0] === 172 && octets[1] !== undefined && octets[1] >= 16 && octets[1] <= 31) {
      return true;
    }

    // 192.168.0.0/16
    if (octets[0] === 192 && octets[1] !== undefined && octets[1] === 168) {
      return true;
    }

    // 127.0.0.0/8 (loopback)
    if (octets[0] === 127) {
      return true;
    }

    return false;
  }

  private static sanitizeInput(input: string): string {
    return input
      .trim()
      .replace(/[<>"'&]/g, '') // Remove potentially dangerous characters
      .substring(0, 200); // Limit length
  }

  /**
   * Runtime validation of temperature unit consistency with IntelliCenter
   * Analyzes temperature readings to detect if they match the configured units
   */
  static validateTemperatureUnitConsistency(
    temperatureReadings: number[],
    configuredUnit: TemperatureUnits,
  ): TemperatureUnitValidationResult {
    if (temperatureReadings.length === 0) {
      return this.createValidationResult(true, null, configuredUnit, 0);
    }

    const validReadings = this.filterValidTemperatureReadings(temperatureReadings);

    if (validReadings.length < 3) {
      return this.createValidationResult(true, null, configuredUnit, validReadings.length);
    }

    const processedReadings = this.processValidTemperatureReadings(validReadings);

    if (!processedReadings) {
      return this.createValidationResult(true, null, configuredUnit, validReadings.length);
    }

    return this.validateDetectedTemperatureUnit(processedReadings, configuredUnit, validReadings.length);
  }

  private static processValidTemperatureReadings(validReadings: number[]) {
    const tempStats = this.calculateTemperatureStats(validReadings);
    const detectionResult = this.detectTemperatureUnit(tempStats);

    return detectionResult ? { validReadings, tempStats, detectionResult } : null;
  }

  private static validateDetectedTemperatureUnit(
    processed: { validReadings: number[]; tempStats: TemperatureStats; detectionResult: TemperatureDetectionResult },
    configuredUnit: TemperatureUnits,
    validReadingsCount: number,
  ): TemperatureUnitValidationResult {
    const { tempStats, detectionResult } = processed;
    const isConsistent = detectionResult.unit === configuredUnit;
    const isHighConfidence = detectionResult.confidence > 0.7;

    if (!isConsistent && isHighConfidence) {
      return this.createInconsistentResult(detectionResult.unit, configuredUnit, validReadingsCount, tempStats);
    }

    return this.createValidationResult(true, detectionResult.unit, configuredUnit, validReadingsCount);
  }

  private static filterValidTemperatureReadings(readings: number[]): number[] {
    return readings.filter(temp => !isNaN(temp) && temp !== null && temp !== undefined && temp > -50 && temp < 200);
  }

  private static calculateTemperatureStats(readings: number[]): TemperatureStats {
    const avgTemp = readings.reduce((sum, temp) => sum + temp, 0) / readings.length;
    const minTemp = Math.min(...readings);
    const maxTemp = Math.max(...readings);
    return { avgTemp, minTemp, maxTemp };
  }

  private static detectTemperatureUnit(stats: TemperatureStats): TemperatureDetectionResult | null {
    const fahrenheitResult = this.tryDetectFahrenheit(stats);
    if (fahrenheitResult) {
      return fahrenheitResult;
    }

    const celsiusResult = this.tryDetectCelsius(stats);
    if (celsiusResult) {
      return celsiusResult;
    }

    return null;
  }

  private static tryDetectFahrenheit(stats: TemperatureStats): TemperatureDetectionResult | null {
    const { avgTemp, minTemp, maxTemp } = stats;
    const fahrenheitRanges = { avg: [65, 110] as [number, number], min: [50, 120] as [number, number], max: [50, 120] as [number, number] };

    if (this.isWithinTemperatureRanges(avgTemp, minTemp, maxTemp, fahrenheitRanges)) {
      return {
        unit: TemperatureUnits.F,
        confidence: this.calculateConfidence([avgTemp, minTemp, maxTemp], TemperatureUnits.F),
      };
    }

    return null;
  }

  private static tryDetectCelsius(stats: TemperatureStats): TemperatureDetectionResult | null {
    const { avgTemp, minTemp, maxTemp } = stats;
    const celsiusRanges = { avg: [15, 45] as [number, number], min: [5, 50] as [number, number], max: [5, 50] as [number, number] };

    if (this.isWithinTemperatureRanges(avgTemp, minTemp, maxTemp, celsiusRanges)) {
      return {
        unit: TemperatureUnits.C,
        confidence: this.calculateConfidence([avgTemp, minTemp, maxTemp], TemperatureUnits.C),
      };
    }

    return null;
  }

  private static isWithinTemperatureRanges(
    avgTemp: number,
    minTemp: number,
    maxTemp: number,
    ranges: { avg: [number, number]; min: [number, number]; max: [number, number] },
  ): boolean {
    return (
      avgTemp >= ranges.avg[0] &&
      avgTemp <= ranges.avg[1] &&
      minTemp >= ranges.min[0] &&
      minTemp <= ranges.min[1] &&
      maxTemp >= ranges.max[0] &&
      maxTemp <= ranges.max[1]
    );
  }

  private static createValidationResult(
    isConsistent: boolean,
    detectedUnit: TemperatureUnits | null,
    configuredUnit: TemperatureUnits,
    analysisCount: number,
  ): TemperatureUnitValidationResult {
    return {
      isConsistent,
      detectedUnit,
      configuredUnit,
      analysisCount,
    };
  }

  private static createInconsistentResult(
    detectedUnit: TemperatureUnits,
    configuredUnit: TemperatureUnits,
    analysisCount: number,
    stats: TemperatureStats,
  ): TemperatureUnitValidationResult {
    const expectedRange = configuredUnit === TemperatureUnits.F ? '70-104°F for pools/spas' : '21-40°C for pools/spas';
    const actualRange = `${stats.minTemp.toFixed(1)}-${stats.maxTemp.toFixed(1)}°${detectedUnit}`;
    const warning =
      `Temperature unit mismatch detected. Configured: ${configuredUnit}, ` +
      `but readings appear to be in ${detectedUnit} (${actualRange}). ` +
      `Expected range: ${expectedRange}. Please verify your temperatureUnits setting.`;

    return {
      isConsistent: false,
      detectedUnit,
      configuredUnit,
      analysisCount,
      warning,
    };
  }

  /**
   * Calculate confidence level for temperature unit detection
   */
  private static calculateConfidence(readings: number[], unit: TemperatureUnits): number {
    if (readings.length === 0) {
      return 0;
    }

    const avgTemp = readings.reduce((sum, temp) => sum + temp, 0) / readings.length;
    const confidenceRanges = this.getConfidenceRanges(unit);

    return this.determineConfidenceLevel(avgTemp, confidenceRanges);
  }

  private static getConfidenceRanges(unit: TemperatureUnits) {
    if (unit === TemperatureUnits.F) {
      return [
        { range: [70, 104] as [number, number], confidence: 0.9 },
        { range: [65, 110] as [number, number], confidence: 0.8 },
        { range: [60, 115] as [number, number], confidence: 0.6 },
      ];
    } else {
      return [
        { range: [21, 40] as [number, number], confidence: 0.9 },
        { range: [18, 43] as [number, number], confidence: 0.8 },
        { range: [15, 45] as [number, number], confidence: 0.6 },
      ];
    }
  }

  private static determineConfidenceLevel(avgTemp: number, ranges: Array<{ range: [number, number]; confidence: number }>): number {
    for (const { range, confidence } of ranges) {
      if (avgTemp >= range[0] && avgTemp <= range[1]) {
        return confidence;
      }
    }
    return 0.3;
  }
}
