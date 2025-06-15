import { PentairPlatform } from '../../src/platform';
import { API, Logger, PlatformConfig } from 'homebridge';

// Mock telnet-client
jest.mock('telnet-client');

const mockAPI = {
  hap: {
    Service: {},
    Characteristic: {},
    uuid: { generate: jest.fn((id: string) => `uuid-${id}`) },
  },
  on: jest.fn(),
  registerPlatformAccessories: jest.fn(),
  unregisterPlatformAccessories: jest.fn(),
  updatePlatformAccessories: jest.fn(),
  platformAccessory: jest.fn(),
} as unknown as API;

const mockLogger = {
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
} as unknown as Logger;

const baseConfig: PlatformConfig = {
  name: 'PentairIntelliCenter',
  platform: 'PentairIntelliCenter',
  ipAddress: '192.168.1.100',
  username: 'admin',
  password: 'password',
};

describe('Configuration Integration Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Required Configuration Validation', () => {
    it('should accept valid minimum configuration', () => {
      expect(() => {
        new PentairPlatform(mockLogger, baseConfig, mockAPI);
      }).not.toThrow();

      expect(mockLogger.error).not.toHaveBeenCalled();
    });

    it('should handle missing IP address', () => {
      const configWithoutIP = { ...baseConfig };
      delete (configWithoutIP as any).ipAddress;

      new PentairPlatform(mockLogger, configWithoutIP, mockAPI);

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('ipAddress is required and must be a string')
      );
    });

    it('should handle empty IP address', () => {
      const configWithEmptyIP = { ...baseConfig, ipAddress: '' };

      new PentairPlatform(mockLogger, configWithEmptyIP, mockAPI);

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('ipAddress is required and must be a string')
      );
    });

    it('should handle missing credentials gracefully', () => {
      const configWithoutCredentials = { ...baseConfig };
      delete (configWithoutCredentials as any).username;
      delete (configWithoutCredentials as any).password;

      // Should not error during construction, but will fail on connection
      expect(() => {
        new PentairPlatform(mockLogger, configWithoutCredentials, mockAPI);
      }).not.toThrow();
    });
  });

  describe('Optional Configuration Parameters', () => {
    it('should apply default values for optional parameters', () => {
      const platform = new PentairPlatform(mockLogger, baseConfig, mockAPI);
      
      // Platform should handle defaults internally
      expect(platform['maxBufferSize']).toBeDefined();
      expect(platform['maxBufferSize']).toBe(1048576); // Default 1MB
      
      // Config getter returns raw config (which may not have defaults)
      const config = platform.getConfig();
      expect(config.ipAddress).toBe(baseConfig.ipAddress);
    });

    it('should respect custom temperature units', () => {
      const celsiusConfig = { ...baseConfig, temperatureUnits: 'C' };
      const fahrenheitConfig = { ...baseConfig, temperatureUnits: 'F' };

      const celsiusPlatform = new PentairPlatform(mockLogger, celsiusConfig, mockAPI);
      const fahrenheitPlatform = new PentairPlatform(mockLogger, fahrenheitConfig, mockAPI);

      expect(celsiusPlatform.getConfig().temperatureUnits).toBe('C');
      expect(fahrenheitPlatform.getConfig().temperatureUnits).toBe('F');
    });

    it('should respect temperature range configuration', () => {
      const customTempConfig = {
        ...baseConfig,
        minimumTemperature: 50,
        maximumTemperature: 110,
      };

      const platform = new PentairPlatform(mockLogger, customTempConfig, mockAPI);
      const config = platform.getConfig();

      expect(config.minimumTemperature).toBe(50);
      expect(config.maximumTemperature).toBe(110);
    });

    it('should respect VSP support configuration', () => {
      const vspEnabledConfig = { ...baseConfig, supportVSP: true };
      const vspDisabledConfig = { ...baseConfig, supportVSP: false };

      const vspEnabledPlatform = new PentairPlatform(mockLogger, vspEnabledConfig, mockAPI);
      const vspDisabledPlatform = new PentairPlatform(mockLogger, vspDisabledConfig, mockAPI);

      expect(vspEnabledPlatform.getConfig().supportVSP).toBe(true);
      expect(vspDisabledPlatform.getConfig().supportVSP).toBe(false);
    });

    it('should respect air temperature sensor configuration', () => {
      const airTempEnabledConfig = { ...baseConfig, airTemp: true };
      const airTempDisabledConfig = { ...baseConfig, airTemp: false };

      const airTempEnabledPlatform = new PentairPlatform(mockLogger, airTempEnabledConfig, mockAPI);
      const airTempDisabledPlatform = new PentairPlatform(mockLogger, airTempDisabledConfig, mockAPI);

      expect(airTempEnabledPlatform.getConfig().airTemp).toBe(true);
      expect(airTempDisabledPlatform.getConfig().airTemp).toBe(false);
    });

    it('should respect includeAllCircuits configuration', () => {
      const includeAllConfig = { ...baseConfig, includeAllCircuits: true };
      const excludeNonFeaturesConfig = { ...baseConfig, includeAllCircuits: false };

      const includeAllPlatform = new PentairPlatform(mockLogger, includeAllConfig, mockAPI);
      const excludePlatform = new PentairPlatform(mockLogger, excludeNonFeaturesConfig, mockAPI);

      expect(includeAllPlatform.getConfig().includeAllCircuits).toBe(true);
      expect(excludePlatform.getConfig().includeAllCircuits).toBe(false);
    });

    it('should handle custom buffer size configuration', () => {
      const customBufferConfig = { ...baseConfig, maxBufferSize: 2097152 }; // 2MB

      const platform = new PentairPlatform(mockLogger, customBufferConfig, mockAPI);
      const config = platform.getConfig();

      expect(config.maxBufferSize).toBe(2097152);
    });
  });

  describe('Configuration Edge Cases', () => {
    it('should handle IP addresses with different formats', () => {
      const ipFormats = [
        '192.168.1.100',      // Standard IPv4
        '10.0.0.1',           // Private network
        '172.16.0.1',         // Another private range
        'intellicenter.local', // Hostname
      ];

      ipFormats.forEach(ip => {
        const config = { ...baseConfig, ipAddress: ip };
        
        expect(() => {
          new PentairPlatform(mockLogger, config, mockAPI);
        }).not.toThrow();
      });
    });

    it('should handle numeric configuration as strings', () => {
      const configWithStringNumbers = {
        ...baseConfig,
        minimumTemperature: '40',
        maximumTemperature: '104',
        maxBufferSize: '1048576',
      };

      expect(() => {
        new PentairPlatform(mockLogger, configWithStringNumbers as any, mockAPI);
      }).not.toThrow();
    });

    it('should handle boolean configuration as strings', () => {
      const configWithStringBooleans = {
        ...baseConfig,
        supportVSP: 'true',
        airTemp: 'false',
        includeAllCircuits: 'true',
      };

      expect(() => {
        new PentairPlatform(mockLogger, configWithStringBooleans as any, mockAPI);
      }).not.toThrow();
    });

    it('should handle missing optional configuration gracefully', () => {
      const minimalConfig = {
        name: 'PentairIntelliCenter',
        platform: 'PentairIntelliCenter',
        ipAddress: '192.168.1.100',
      };

      expect(() => {
        new PentairPlatform(mockLogger, minimalConfig as any, mockAPI);
      }).not.toThrow();
    });
  });

  describe('Configuration Schema Validation', () => {
    it('should match expected configuration schema structure', () => {
      const platform = new PentairPlatform(mockLogger, baseConfig, mockAPI);
      const config = platform.getConfig();

      // Required fields
      expect(config.name).toBeDefined();
      expect(config.platform).toBeDefined();
      expect(config.ipAddress).toBeDefined();

      // Provided fields should be preserved
      expect(config.username).toBeDefined();
      expect(config.password).toBeDefined();
    });

    it('should preserve all provided configuration values', () => {
      const fullConfig = {
        ...baseConfig,
        username: 'testuser',
        password: 'testpass',
        maxBufferSize: 2048000,
        temperatureUnits: 'C',
        minimumTemperature: 10,
        maximumTemperature: 40,
        supportVSP: true,
        airTemp: false,
        includeAllCircuits: true,
      };

      const platform = new PentairPlatform(mockLogger, fullConfig, mockAPI);
      const config = platform.getConfig();

      expect(config.username).toBe('testuser');
      expect(config.password).toBe('testpass');
      expect(config.maxBufferSize).toBe(2048000);
      expect(config.temperatureUnits).toBe('C');
      expect(config.minimumTemperature).toBe(10);
      expect(config.maximumTemperature).toBe(40);
      expect(config.supportVSP).toBe(true);
      expect(config.airTemp).toBe(false);
      expect(config.includeAllCircuits).toBe(true);
    });
  });

  describe('Configuration Error Scenarios', () => {
    it('should handle null configuration', () => {
      expect(() => {
        new PentairPlatform(mockLogger, null as any, mockAPI);
      }).toThrow();
    });

    it('should handle undefined configuration', () => {
      expect(() => {
        new PentairPlatform(mockLogger, undefined as any, mockAPI);
      }).toThrow();
    });

    it('should handle configuration with invalid types', () => {
      const invalidConfig = {
        ...baseConfig,
        minimumTemperature: 'not-a-number',
        maximumTemperature: null,
        supportVSP: 'maybe',
        maxBufferSize: -1,
      };

      // Should not throw during construction
      expect(() => {
        new PentairPlatform(mockLogger, invalidConfig as any, mockAPI);
      }).not.toThrow();
    });
  });

  describe('Real-world Configuration Scenarios', () => {
    it('should handle typical pool configuration', () => {
      const poolConfig = {
        ...baseConfig,
        temperatureUnits: 'F',
        minimumTemperature: 40,
        maximumTemperature: 104,
        supportVSP: true,
        airTemp: true,
        includeAllCircuits: false,
      };

      const platform = new PentairPlatform(mockLogger, poolConfig, mockAPI);
      expect(platform.getConfig().temperatureUnits).toBe('F');
    });

    it('should handle typical spa configuration', () => {
      const spaConfig = {
        ...baseConfig,
        temperatureUnits: 'F',
        minimumTemperature: 80,
        maximumTemperature: 104,
        supportVSP: false,
        airTemp: false,
        includeAllCircuits: true,
      };

      const platform = new PentairPlatform(mockLogger, spaConfig, mockAPI);
      expect(platform.getConfig().minimumTemperature).toBe(80);
    });

    it('should handle European configuration', () => {
      const europeanConfig = {
        ...baseConfig,
        temperatureUnits: 'C',
        minimumTemperature: 4,
        maximumTemperature: 40,
        supportVSP: true,
        airTemp: true,
        includeAllCircuits: false,
      };

      const platform = new PentairPlatform(mockLogger, europeanConfig, mockAPI);
      expect(platform.getConfig().temperatureUnits).toBe('C');
      expect(platform.getConfig().minimumTemperature).toBe(4);
      expect(platform.getConfig().maximumTemperature).toBe(40);
    });
  });
});