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
} & PlatformConfig;

export class ConfigValidator {
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

    // Required field validation
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

    // Temperature units validation
    if (!config.temperatureUnits) {
      warnings.push('temperatureUnits not specified, defaulting to Fahrenheit');
      sanitizedConfig.temperatureUnits = TemperatureUnits.F;
    } else if (!Object.values(TemperatureUnits).includes(config.temperatureUnits as TemperatureUnits)) {
      errors.push(`temperatureUnits must be '${TemperatureUnits.F}' or '${TemperatureUnits.C}'`);
    } else {
      sanitizedConfig.temperatureUnits = config.temperatureUnits as TemperatureUnits;
    }

    // Temperature range validation
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

    // Boolean field validation with defaults
    sanitizedConfig.supportVSP = this.validateBoolean(config.supportVSP, false);
    sanitizedConfig.airTemp = this.validateBoolean(config.airTemp, true);
    sanitizedConfig.includeAllCircuits = this.validateBoolean(config.includeAllCircuits, false);

    // Buffer size validation
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

    // Security warnings
    if (config.ipAddress && this.isPrivateNetwork(config.ipAddress)) {
      // This is good - internal network
    } else if (config.ipAddress) {
      warnings.push('IP address appears to be on a public network. Ensure your IntelliCenter is properly secured.');
    }

    // Final sanitization for IP address
    if (sanitizedConfig.ipAddress) {
      sanitizedConfig.ipAddress = sanitizedConfig.ipAddress.trim();
    }

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

  private static validateTemperatureRange(
    min: unknown,
    max: unknown,
    units: TemperatureUnits,
  ): { isValid: boolean; error?: string; sanitizedMin?: number; sanitizedMax?: number } {
    let minTemp: number;
    let maxTemp: number;

    // Convert and validate minimum temperature
    if (typeof min === 'string') {
      minTemp = parseFloat(min);
    } else if (typeof min === 'number') {
      minTemp = min;
    } else {
      // Set defaults based on units
      minTemp = units === TemperatureUnits.F ? 40 : 4;
    }

    // Convert and validate maximum temperature
    if (typeof max === 'string') {
      maxTemp = parseFloat(max);
    } else if (typeof max === 'number') {
      maxTemp = max;
    } else {
      // Set defaults based on units
      maxTemp = units === TemperatureUnits.F ? 104 : 40;
    }

    if (isNaN(minTemp) || isNaN(maxTemp)) {
      return { isValid: false, error: 'Temperature values must be valid numbers' };
    }

    if (minTemp >= maxTemp) {
      return { isValid: false, error: 'Minimum temperature must be less than maximum temperature' };
    }

    // Validate reasonable ranges based on units
    if (units === TemperatureUnits.F) {
      if (minTemp < 32 || minTemp > 120) {
        return { isValid: false, error: 'Minimum temperature must be between 32°F and 120°F' };
      }
      if (maxTemp < 50 || maxTemp > 120) {
        return { isValid: false, error: 'Maximum temperature must be between 50°F and 120°F' };
      }
    } else {
      if (minTemp < 0 || minTemp > 50) {
        return { isValid: false, error: 'Minimum temperature must be between 0°C and 50°C' };
      }
      if (maxTemp < 10 || maxTemp > 50) {
        return { isValid: false, error: 'Maximum temperature must be between 10°C and 50°C' };
      }
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
      return {
        isConsistent: true, // No data to analyze yet
        detectedUnit: null,
        configuredUnit,
        analysisCount: 0,
      };
    }

    // Filter out invalid readings
    const validReadings = temperatureReadings.filter(
      temp => !isNaN(temp) && temp !== null && temp !== undefined && temp > -50 && temp < 200,
    );

    if (validReadings.length < 3) {
      return {
        isConsistent: true, // Insufficient data for reliable analysis
        detectedUnit: null,
        configuredUnit,
        analysisCount: validReadings.length,
      };
    }

    const avgTemp = validReadings.reduce((sum, temp) => sum + temp, 0) / validReadings.length;
    const minTemp = Math.min(...validReadings);
    const maxTemp = Math.max(...validReadings);

    // Determine likely temperature unit based on typical pool/spa temperature ranges
    let detectedUnit: TemperatureUnits;
    let confidence = 0;

    // Fahrenheit detection (typical pool: 70-90°F, spa: 95-104°F)
    if (avgTemp >= 65 && avgTemp <= 110 && minTemp >= 50 && maxTemp <= 120) {
      detectedUnit = TemperatureUnits.F;
      confidence = this.calculateConfidence(validReadings, TemperatureUnits.F);
    } else if (avgTemp >= 15 && avgTemp <= 45 && minTemp >= 5 && maxTemp <= 50) {
      // Celsius detection (typical pool: 21-32°C, spa: 35-40°C)
      detectedUnit = TemperatureUnits.C;
      confidence = this.calculateConfidence(validReadings, TemperatureUnits.C);
    } else {
      // Ambiguous range - could be either unit
      return {
        isConsistent: true, // Can't determine, assume it's correct
        detectedUnit: null,
        configuredUnit,
        analysisCount: validReadings.length,
      };
    }

    const isConsistent = detectedUnit === configuredUnit;

    // Only report inconsistency if we have high confidence
    if (!isConsistent && confidence > 0.7) {
      const expectedRange = configuredUnit === TemperatureUnits.F ? '70-104°F for pools/spas' : '21-40°C for pools/spas';
      const actualRange = `${minTemp.toFixed(1)}-${maxTemp.toFixed(1)}°${detectedUnit}`;

      return {
        isConsistent: false,
        detectedUnit,
        configuredUnit,
        analysisCount: validReadings.length,
        warning:
          `Temperature unit mismatch detected. Configured: ${configuredUnit}, ` +
          `but readings appear to be in ${detectedUnit} (${actualRange}). ` +
          `Expected range: ${expectedRange}. Please verify your temperatureUnits setting.`,
      };
    }

    return {
      isConsistent: true,
      detectedUnit,
      configuredUnit,
      analysisCount: validReadings.length,
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

    if (unit === TemperatureUnits.F) {
      // High confidence for typical pool/spa Fahrenheit ranges
      if (avgTemp >= 70 && avgTemp <= 104) {
        return 0.9;
      }
      if (avgTemp >= 65 && avgTemp <= 110) {
        return 0.8;
      }
      if (avgTemp >= 60 && avgTemp <= 115) {
        return 0.6;
      }
      return 0.3;
    } else {
      // High confidence for typical pool/spa Celsius ranges
      if (avgTemp >= 21 && avgTemp <= 40) {
        return 0.9;
      }
      if (avgTemp >= 18 && avgTemp <= 43) {
        return 0.8;
      }
      if (avgTemp >= 15 && avgTemp <= 45) {
        return 0.6;
      }
      return 0.3;
    }
  }
}
