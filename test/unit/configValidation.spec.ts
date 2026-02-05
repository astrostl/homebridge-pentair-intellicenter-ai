import { ConfigValidator, ValidationResult } from '../../src/configValidation';
import { TemperatureUnits } from '../../src/types';
import { PlatformConfig } from 'homebridge';

describe('ConfigValidator', () => {
  let baseConfig: PlatformConfig;

  beforeEach(() => {
    // Note: username/password are no longer required from user config.
    // IntelliCenter telnet API does not require authentication.
    baseConfig = {
      platform: 'PentairIntelliCenter',
      name: 'Test Platform',
      ipAddress: '192.168.1.100',
      temperatureUnits: TemperatureUnits.F,
      minimumTemperature: 40,
      maximumTemperature: 104,
      supportVSP: false,
      airTemp: true,
    };
  });

  describe('Valid Configurations', () => {
    it('should validate a complete, valid configuration', () => {
      const result = ConfigValidator.validate(baseConfig);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.sanitizedConfig).toBeDefined();
    });

    it('should apply defaults for optional fields', () => {
      const configWithMissingOptionals = {
        platform: 'PentairIntelliCenter',
        name: 'Test Platform',
        ipAddress: '192.168.1.100',
      };

      const result = ConfigValidator.validate(configWithMissingOptionals);

      expect(result.isValid).toBe(true);
      expect(result.sanitizedConfig!.temperatureUnits).toBe(TemperatureUnits.F);
      expect(result.sanitizedConfig!.supportVSP).toBe(false);
      expect(result.sanitizedConfig!.airTemp).toBe(true);
      expect(result.sanitizedConfig!.includeAllCircuits).toBe(false);
      expect(result.sanitizedConfig!.maxBufferSize).toBe(1048576);
      // Username/password are hardcoded placeholders (auth not required)
      expect(result.sanitizedConfig!.username).toBe('unused_placeholder');
      expect(result.sanitizedConfig!.password).toBe('unused_placeholder_password');
    });

    it('should handle Celsius temperature units', () => {
      const celsiusConfig = {
        ...baseConfig,
        temperatureUnits: TemperatureUnits.C,
        minimumTemperature: 4,
        maximumTemperature: 40,
      };

      const result = ConfigValidator.validate(celsiusConfig);

      expect(result.isValid).toBe(true);
      expect(result.sanitizedConfig!.temperatureUnits).toBe(TemperatureUnits.C);
    });

    it('should sanitize input values', () => {
      const configWithDirtyInput = {
        ...baseConfig,
        ipAddress: '  192.168.1.100  ',
      };

      const result = ConfigValidator.validate(configWithDirtyInput);

      expect(result.isValid).toBe(true);
      expect(result.sanitizedConfig!.ipAddress).toBe('192.168.1.100');
      // Username/password are hardcoded placeholders (auth not required)
      expect(result.sanitizedConfig!.username).toBe('unused_placeholder');
      expect(result.sanitizedConfig!.password).toBe('unused_placeholder_password');
    });
  });

  describe('IP Address Validation', () => {
    it('should reject invalid IP addresses', () => {
      const invalidIPs = ['999.999.999.999', '192.168.1', 'not-an-ip', '192.168.1.256', ''];

      invalidIPs.forEach(ip => {
        const config = { ...baseConfig, ipAddress: ip };
        const result = ConfigValidator.validate(config);

        expect(result.isValid).toBe(false);
        expect(result.errors.some(error => error.includes('ipAddress'))).toBe(true);
      });
    });

    it('should accept valid IP addresses', () => {
      const validIPs = ['192.168.1.100', '10.0.0.1', '172.16.0.1', '127.0.0.1', '0.0.0.0', '255.255.255.255'];

      validIPs.forEach(ip => {
        const config = { ...baseConfig, ipAddress: ip };
        const result = ConfigValidator.validate(config);

        expect(result.isValid).toBe(true);
      });
    });

    it('should warn about public IP addresses', () => {
      const publicIP = '8.8.8.8';
      const config = { ...baseConfig, ipAddress: publicIP };

      const result = ConfigValidator.validate(config);

      expect(result.isValid).toBe(true);
      expect(result.warnings.some(warning => warning.includes('public network'))).toBe(true);
    });
  });

  // Note: Username/Password validation tests removed.
  // IntelliCenter telnet API does not require authentication.
  // Credentials are now hardcoded placeholders in configValidation.ts.

  describe('Temperature Validation', () => {
    it('should reject invalid temperature units', () => {
      const config = { ...baseConfig, temperatureUnits: 'K' as any };
      const result = ConfigValidator.validate(config);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(error => error.includes('temperatureUnits'))).toBe(true);
    });

    it('should reject invalid temperature ranges for Fahrenheit', () => {
      const invalidRanges = [
        { min: 20, max: 104 }, // Too low
        { min: 40, max: 150 }, // Too high
        { min: 80, max: 70 }, // Min > Max
      ];

      invalidRanges.forEach(({ min, max }) => {
        const config = {
          ...baseConfig,
          temperatureUnits: TemperatureUnits.F,
          minimumTemperature: min,
          maximumTemperature: max,
        };
        const result = ConfigValidator.validate(config);

        expect(result.isValid).toBe(false);
      });
    });

    it('should reject invalid temperature ranges for Celsius', () => {
      const invalidRanges = [
        { min: -5, max: 40 }, // Too low
        { min: 4, max: 60 }, // Too high
        { min: 30, max: 20 }, // Min > Max
      ];

      invalidRanges.forEach(({ min, max }) => {
        const config = {
          ...baseConfig,
          temperatureUnits: TemperatureUnits.C,
          minimumTemperature: min,
          maximumTemperature: max,
        };
        const result = ConfigValidator.validate(config);

        expect(result.isValid).toBe(false);
      });
    });

    it('should handle string temperature values', () => {
      const config = {
        ...baseConfig,
        minimumTemperature: '40' as any,
        maximumTemperature: '104' as any,
      };
      const result = ConfigValidator.validate(config);

      expect(result.isValid).toBe(true);
      expect(result.sanitizedConfig!.minimumTemperature).toBe(40);
      expect(result.sanitizedConfig!.maximumTemperature).toBe(104);
    });

    it('should round temperature values to 1 decimal place', () => {
      const config = {
        ...baseConfig,
        minimumTemperature: 40.123456,
        maximumTemperature: 104.987654,
      };
      const result = ConfigValidator.validate(config);

      expect(result.isValid).toBe(true);
      expect(result.sanitizedConfig!.minimumTemperature).toBe(40.1);
      expect(result.sanitizedConfig!.maximumTemperature).toBe(105.0);
    });
  });

  describe('Buffer Size Validation', () => {
    it('should reject buffer sizes that are too small', () => {
      const config = { ...baseConfig, maxBufferSize: 1000 };
      const result = ConfigValidator.validate(config);

      expect(result.isValid).toBe(true); // Should not fail, but should warn and use default
      expect(result.warnings.some(warning => warning.includes('Invalid maxBufferSize'))).toBe(true);
      expect(result.sanitizedConfig!.maxBufferSize).toBe(1048576);
    });

    it('should reject buffer sizes that are too large', () => {
      const config = { ...baseConfig, maxBufferSize: 20000000 };
      const result = ConfigValidator.validate(config);

      expect(result.isValid).toBe(true); // Should not fail, but should warn and use default
      expect(result.warnings.some(warning => warning.includes('Invalid maxBufferSize'))).toBe(true);
      expect(result.sanitizedConfig!.maxBufferSize).toBe(1048576);
    });

    it('should accept valid buffer sizes', () => {
      const validSizes = [65536, 1048576, 8388608]; // 64KB, 1MB, 8MB

      validSizes.forEach(size => {
        const config = { ...baseConfig, maxBufferSize: size };
        const result = ConfigValidator.validate(config);

        expect(result.isValid).toBe(true);
        expect(result.sanitizedConfig!.maxBufferSize).toBe(size);
      });
    });

    it('should handle string buffer sizes', () => {
      const config = { ...baseConfig, maxBufferSize: '2097152' as any };
      const result = ConfigValidator.validate(config);

      expect(result.isValid).toBe(true);
      expect(result.sanitizedConfig!.maxBufferSize).toBe(2097152);
    });
  });

  describe('Boolean Field Validation', () => {
    it('should handle string boolean values', () => {
      const config = {
        ...baseConfig,
        supportVSP: 'true' as any,
        airTemp: 'false' as any,
        includeAllCircuits: '1' as any,
      };
      const result = ConfigValidator.validate(config);

      expect(result.isValid).toBe(true);
      expect(result.sanitizedConfig!.supportVSP).toBe(true);
      expect(result.sanitizedConfig!.airTemp).toBe(false);
      expect(result.sanitizedConfig!.includeAllCircuits).toBe(true);
    });

    it('should use defaults for invalid boolean values', () => {
      const config = {
        ...baseConfig,
        supportVSP: 'maybe' as any,
        airTemp: null as any,
        includeAllCircuits: undefined as any,
      };
      const result = ConfigValidator.validate(config);

      expect(result.isValid).toBe(true);
      expect(result.sanitizedConfig!.supportVSP).toBe(false); // Default
      expect(result.sanitizedConfig!.airTemp).toBe(true); // Default
      expect(result.sanitizedConfig!.includeAllCircuits).toBe(false); // Default
    });
  });

  describe('heatModeOverride Validation', () => {
    it('should accept valid heatModeOverride values (2-15)', () => {
      const config = { ...baseConfig, heatModeOverride: 10 };
      const result = ConfigValidator.validate(config);

      expect(result.isValid).toBe(true);
      expect(result.sanitizedConfig!.heatModeOverride).toBe(10);
    });

    it('should treat 0 as auto-detect (undefined)', () => {
      const config = { ...baseConfig, heatModeOverride: 0 };
      const result = ConfigValidator.validate(config);

      expect(result.isValid).toBe(true);
      expect(result.sanitizedConfig!.heatModeOverride).toBeUndefined();
    });

    it('should accept heatModeOverride as string and convert to number', () => {
      const config = { ...baseConfig, heatModeOverride: '7' as any };
      const result = ConfigValidator.validate(config);

      expect(result.isValid).toBe(true);
      expect(result.sanitizedConfig!.heatModeOverride).toBe(7);
    });

    it('should leave heatModeOverride undefined when not provided', () => {
      const config = { ...baseConfig };
      const result = ConfigValidator.validate(config);

      expect(result.isValid).toBe(true);
      expect(result.sanitizedConfig!.heatModeOverride).toBeUndefined();
    });

    it('should warn and ignore invalid heatModeOverride values', () => {
      const config = { ...baseConfig, heatModeOverride: -5 };
      const result = ConfigValidator.validate(config);

      expect(result.isValid).toBe(true);
      expect(result.warnings.some(w => w.includes('heatModeOverride'))).toBe(true);
      expect(result.sanitizedConfig!.heatModeOverride).toBeUndefined();
    });

    it('should warn and ignore non-numeric heatModeOverride values', () => {
      const config = { ...baseConfig, heatModeOverride: 'invalid' as any };
      const result = ConfigValidator.validate(config);

      expect(result.isValid).toBe(true);
      expect(result.warnings.some(w => w.includes('heatModeOverride'))).toBe(true);
      expect(result.sanitizedConfig!.heatModeOverride).toBeUndefined();
    });

    it('should warn and reject heatModeOverride=1 (Heat Source OFF)', () => {
      const config = { ...baseConfig, heatModeOverride: 1 };
      const result = ConfigValidator.validate(config);

      expect(result.isValid).toBe(true);
      expect(result.warnings.some(w => w.includes('Heat Source OFF'))).toBe(true);
      expect(result.sanitizedConfig!.heatModeOverride).toBeUndefined();
    });

    it('should accept boundary value 2', () => {
      const config = { ...baseConfig, heatModeOverride: 2 };
      const result = ConfigValidator.validate(config);

      expect(result.isValid).toBe(true);
      expect(result.sanitizedConfig!.heatModeOverride).toBe(2);
    });

    it('should accept boundary value 15', () => {
      const config = { ...baseConfig, heatModeOverride: 15 };
      const result = ConfigValidator.validate(config);

      expect(result.isValid).toBe(true);
      expect(result.sanitizedConfig!.heatModeOverride).toBe(15);
    });

    it('should warn for values above 15', () => {
      const config = { ...baseConfig, heatModeOverride: 16 };
      const result = ConfigValidator.validate(config);

      expect(result.isValid).toBe(true);
      expect(result.warnings.some(w => w.includes('heatModeOverride'))).toBe(true);
      expect(result.sanitizedConfig!.heatModeOverride).toBeUndefined();
    });
  });

  describe('Missing Required Fields', () => {
    it('should reject configuration missing ipAddress', () => {
      const config = { ...baseConfig };
      delete config.ipAddress;

      const result = ConfigValidator.validate(config);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(error => error.includes('ipAddress is required'))).toBe(true);
    });

    // Note: Username/password tests removed - auth not required by IntelliCenter
  });

  describe('Edge Cases', () => {
    it('should handle null configuration', () => {
      const result = ConfigValidator.validate(null as any);

      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should handle empty configuration', () => {
      const result = ConfigValidator.validate({} as any);

      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should handle configuration with extra fields', () => {
      const configWithExtra = {
        ...baseConfig,
        extraField: 'should be ignored',
        anotherExtra: 123,
      };

      const result = ConfigValidator.validate(configWithExtra);

      expect(result.isValid).toBe(true);
      // Extra fields should not be in sanitized config
      expect((result.sanitizedConfig as any).extraField).toBeUndefined();
    });
  });

  describe('Additional Coverage Tests', () => {
    // Note: Password validation tests removed - auth not required by IntelliCenter

    it('should handle IP address octet validation', () => {
      const config = {
        ...baseConfig,
        ipAddress: '192.168.1.256', // Invalid octet > 255
      };
      const result = ConfigValidator.validate(config);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(error => error.includes('IP address octets must be between 0 and 255'))).toBe(true);
    });

    it('should handle non-numeric buffer size', () => {
      const config = {
        ...baseConfig,
        maxBufferSize: 'not-a-number' as any,
      };
      const result = ConfigValidator.validate(config);

      expect(result.isValid).toBe(true); // Should warn but not fail
      expect(result.warnings.some(warning => warning.includes('maxBufferSize'))).toBe(true);
      expect(result.sanitizedConfig!.maxBufferSize).toBe(1048576); // Default value
    });

    it('should handle additional edge cases for complete coverage', () => {
      // Test multiple edge cases to cover remaining uncovered lines
      const edgeCaseConfig = {
        ...baseConfig,
        minimumTemperature: 40.999999,
        maximumTemperature: 104.111111,
      };

      const result = ConfigValidator.validate(edgeCaseConfig);

      expect(result.isValid).toBe(true);
      // Username/password are hardcoded placeholders (auth not required)
      expect(result.sanitizedConfig!.username).toBe('unused_placeholder');
      expect(result.sanitizedConfig!.password).toBe('unused_placeholder_password');
      expect(result.sanitizedConfig!.minimumTemperature).toBe(41.0);
      expect(result.sanitizedConfig!.maximumTemperature).toBe(104.1);
    });

    it('should cover temperature rounding lines 280-281', () => {
      // Test precise floating point values that need rounding
      const config = {
        ...baseConfig,
        minimumTemperature: 40.96789,
        maximumTemperature: 104.03456,
      };

      const result = ConfigValidator.validate(config);

      expect(result.isValid).toBe(true);
      // These should be rounded to 1 decimal place, covering lines 280-281
      expect(result.sanitizedConfig!.minimumTemperature).toBe(41.0);
      expect(result.sanitizedConfig!.maximumTemperature).toBe(104.0);
    });

    it('should cover uncovered lines in configValidation', () => {
      // Cover lines 158-159: IP octet range validation
      // Test multiple invalid octet scenarios to ensure coverage
      const configWithInvalidOctet1 = {
        ...baseConfig,
        ipAddress: '192.168.1.256', // 256 is > 255, should trigger line 158-159
      };

      const result1 = ConfigValidator.validate(configWithInvalidOctet1);
      expect(result1.isValid).toBe(false);
      expect(result1.errors.some(error => error.includes('IP address octets must be between 0 and 255'))).toBe(true);

      // Test with very large octet as string (which parseInt handles but exceeds range)
      const configWithStringOctet = {
        ...baseConfig,
        ipAddress: '192.168.300.100', // 300 > 255, should trigger octet validation
      };

      const resultStr = ConfigValidator.validate(configWithStringOctet);
      expect(resultStr.isValid).toBe(false);
      expect(resultStr.errors.some(error => error.includes('IP address octets must be between 0 and 255'))).toBe(true);

      // Test with very large octet
      const configWithLargeOctet = {
        ...baseConfig,
        ipAddress: '999.168.1.100', // 999 is > 255, should trigger line 158-159
      };

      const resultLarge = ConfigValidator.validate(configWithLargeOctet);
      expect(resultLarge.isValid).toBe(false);
      expect(resultLarge.errors.some(error => error.includes('IP address octets must be between 0 and 255'))).toBe(true);

      // Cover lines 280-281: Buffer size type validation
      // Test with non-string, non-number buffer size
      const configWithInvalidBufferType = {
        ...baseConfig,
        maxBufferSize: {} as any, // Object type should trigger lines 280-281
      };

      const result2 = ConfigValidator.validate(configWithInvalidBufferType);
      expect(result2.isValid).toBe(true); // Should warn but not fail
      expect(result2.warnings.some(warning => warning.includes('maxBufferSize'))).toBe(true);
      expect(result2.sanitizedConfig!.maxBufferSize).toBe(1048576); // Default value

      // Test with array type for buffer size
      const configWithArrayBuffer = {
        ...baseConfig,
        maxBufferSize: [1024] as any, // Array type should trigger lines 280-281
      };

      const result3 = ConfigValidator.validate(configWithArrayBuffer);
      expect(result3.isValid).toBe(true);
      expect(result3.warnings.some(warning => warning.includes('maxBufferSize'))).toBe(true);

      // Test with null for buffer size
      const configWithNullBuffer = {
        ...baseConfig,
        maxBufferSize: null as any, // Null type should trigger lines 280-281
      };

      const result4 = ConfigValidator.validate(configWithNullBuffer);
      expect(result4.isValid).toBe(true);
      expect(result4.warnings.some(warning => warning.includes('maxBufferSize'))).toBe(true);

      // Test with boolean buffer size to trigger the else branch in validateBufferSize (lines 289-290)
      const configWithBooleanBuffer = {
        ...baseConfig,
        maxBufferSize: true as any, // Boolean type should trigger lines 289-290
      };

      const result5 = ConfigValidator.validate(configWithBooleanBuffer);
      expect(result5.isValid).toBe(true);
      expect(result5.warnings.some(warning => warning.includes('Buffer size must be a number'))).toBe(true);

      // Note: Password warning test removed - auth not required by IntelliCenter
    });
  });

  describe('Temperature Unit Consistency Validation', () => {
    describe('validateTemperatureUnitConsistency', () => {
      it('should return consistent when no readings provided', () => {
        const result = ConfigValidator.validateTemperatureUnitConsistency([], TemperatureUnits.F);

        expect(result.isConsistent).toBe(true);
        expect(result.detectedUnit).toBe(null);
        expect(result.configuredUnit).toBe(TemperatureUnits.F);
        expect(result.analysisCount).toBe(0);
        expect(result.warning).toBeUndefined();
      });

      it('should return consistent when insufficient valid readings', () => {
        const result = ConfigValidator.validateTemperatureUnitConsistency([78, NaN], TemperatureUnits.F);

        expect(result.isConsistent).toBe(true);
        expect(result.detectedUnit).toBe(null);
        expect(result.analysisCount).toBe(1);
      });

      it('should detect Fahrenheit temperatures correctly', () => {
        const fahrenheitReadings = [78, 82, 85, 79, 81, 83]; // Typical pool temperatures in F
        const result = ConfigValidator.validateTemperatureUnitConsistency(fahrenheitReadings, TemperatureUnits.F);

        expect(result.isConsistent).toBe(true);
        expect(result.detectedUnit).toBe(TemperatureUnits.F);
        expect(result.configuredUnit).toBe(TemperatureUnits.F);
        expect(result.analysisCount).toBe(6);
        expect(result.warning).toBeUndefined();
      });

      it('should detect Celsius temperatures correctly', () => {
        const celsiusReadings = [26, 28, 29, 27, 26.5, 28.5]; // Typical pool temperatures in C
        const result = ConfigValidator.validateTemperatureUnitConsistency(celsiusReadings, TemperatureUnits.C);

        expect(result.isConsistent).toBe(true);
        expect(result.detectedUnit).toBe(TemperatureUnits.C);
        expect(result.configuredUnit).toBe(TemperatureUnits.C);
        expect(result.analysisCount).toBe(6);
        expect(result.warning).toBeUndefined();
      });

      it('should detect Fahrenheit/Celsius mismatch with high confidence', () => {
        const fahrenheitReadings = [78, 82, 85, 79, 81, 83]; // F readings
        const result = ConfigValidator.validateTemperatureUnitConsistency(fahrenheitReadings, TemperatureUnits.C);

        expect(result.isConsistent).toBe(false);
        expect(result.detectedUnit).toBe(TemperatureUnits.F);
        expect(result.configuredUnit).toBe(TemperatureUnits.C);
        expect(result.warning).toContain('Temperature unit mismatch detected');
        expect(result.warning).toContain('Configured: C');
        expect(result.warning).toContain('but readings appear to be in F');
      });

      it('should detect Celsius/Fahrenheit mismatch with high confidence', () => {
        const celsiusReadings = [26, 28, 29, 27, 26.5, 28.5]; // C readings
        const result = ConfigValidator.validateTemperatureUnitConsistency(celsiusReadings, TemperatureUnits.F);

        expect(result.isConsistent).toBe(false);
        expect(result.detectedUnit).toBe(TemperatureUnits.C);
        expect(result.configuredUnit).toBe(TemperatureUnits.F);
        expect(result.warning).toContain('Temperature unit mismatch detected');
        expect(result.warning).toContain('Configured: F');
        expect(result.warning).toContain('but readings appear to be in C');
      });

      it('should handle spa temperatures in Fahrenheit', () => {
        const spaFahrenheitReadings = [101, 103, 102, 104, 100, 102]; // Spa temperatures in F
        const result = ConfigValidator.validateTemperatureUnitConsistency(spaFahrenheitReadings, TemperatureUnits.F);

        expect(result.isConsistent).toBe(true);
        expect(result.detectedUnit).toBe(TemperatureUnits.F);
        expect(result.analysisCount).toBe(6);
      });

      it('should handle spa temperatures in Celsius', () => {
        const spaCelsiusReadings = [38, 39, 38.5, 39.5, 37.5, 38]; // Spa temperatures in C
        const result = ConfigValidator.validateTemperatureUnitConsistency(spaCelsiusReadings, TemperatureUnits.C);

        expect(result.isConsistent).toBe(true);
        expect(result.detectedUnit).toBe(TemperatureUnits.C);
        expect(result.analysisCount).toBe(6);
      });

      it('should handle ambiguous temperature ranges', () => {
        const ambiguousReadings = [50, 51, 49, 52, 50.5]; // Could be hot C or cold F
        const result = ConfigValidator.validateTemperatureUnitConsistency(ambiguousReadings, TemperatureUnits.F);

        expect(result.isConsistent).toBe(true); // Assumes correct when ambiguous
        expect(result.detectedUnit).toBe(null);
        expect(result.warning).toBeUndefined();
      });

      it('should filter out invalid temperature readings', () => {
        const mixedReadings = [78, NaN, -100, 300, 82, 85]; // Mix of valid and invalid
        const result = ConfigValidator.validateTemperatureUnitConsistency(mixedReadings, TemperatureUnits.F);

        expect(result.analysisCount).toBe(3); // Only valid readings counted
        expect(result.detectedUnit).toBe(TemperatureUnits.F);
      });

      it('should handle extreme but valid temperature readings', () => {
        const extremeReadings = [120, 118, 115, 117]; // Very hot but valid F readings
        const result = ConfigValidator.validateTemperatureUnitConsistency(extremeReadings, TemperatureUnits.F);

        expect(result.isConsistent).toBe(true);
        expect(result.analysisCount).toBe(4);
      });

      it('should not report mismatch with low confidence', () => {
        const edgeCaseReadings = [60, 61, 62, 63]; // Edge case temperatures
        const result = ConfigValidator.validateTemperatureUnitConsistency(edgeCaseReadings, TemperatureUnits.C);

        // Should not report mismatch due to low confidence
        expect(result.isConsistent).toBe(true);
        expect(result.warning).toBeUndefined();
      });

      it('should handle confidence calculations for Fahrenheit ranges', () => {
        // Test the specific confidence calculation ranges for Fahrenheit (lines 447-448, 450-452, etc.)

        // Test mid-range for 0.6 confidence (lines 450-452)
        const midRangeF = [64, 66, 68]; // Average ~66F, should hit the 60-115 range for 0.6 confidence
        const result1 = ConfigValidator.validateTemperatureUnitConsistency(midRangeF, TemperatureUnits.F);
        expect(result1.isConsistent).toBe(true);

        // Test lower edge for 0.3 confidence (line 452 return)
        const lowRangeF = [55, 57, 59]; // Average ~57F, should hit the default 0.3 confidence
        const result2 = ConfigValidator.validateTemperatureUnitConsistency(lowRangeF, TemperatureUnits.F);
        expect(result2.isConsistent).toBe(true);
      });

      it('should handle confidence calculations for Celsius ranges', () => {
        // Test the specific confidence calculation ranges for Celsius (lines 459-460, 462-465)

        // Test mid-range for 0.6 confidence (lines 462-465)
        const midRangeC = [17, 19, 20]; // Average ~18.7C, should hit the 15-45 range for 0.6 confidence
        const result1 = ConfigValidator.validateTemperatureUnitConsistency(midRangeC, TemperatureUnits.C);
        expect(result1.isConsistent).toBe(true);

        // Test lower edge for 0.3 confidence (line 464 return)
        const lowRangeC = [10, 12, 14]; // Average ~12C, should hit the default 0.3 confidence
        const result2 = ConfigValidator.validateTemperatureUnitConsistency(lowRangeC, TemperatureUnits.C);
        expect(result2.isConsistent).toBe(true);
      });

      it('should handle empty readings array for confidence calculation', () => {
        // Test empty array handling (lines 436-437)
        const emptyReadings: number[] = [];
        const result = ConfigValidator.validateTemperatureUnitConsistency(emptyReadings, TemperatureUnits.F);

        expect(result.isConsistent).toBe(true);
        expect(result.analysisCount).toBe(0);
      });
    });
  });
});
