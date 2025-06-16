import { PentairPlatform } from '../../src/platform';
import { HeaterAccessory } from '../../src/heaterAccessory';
import { API, PlatformAccessory, Service, Logger } from 'homebridge';
import { TemperatureUnits } from '../../src/types';

// Mock Homebridge API and platform
const mockAPI = {
  hap: {
    Service: {
      AccessoryInformation: 'AccessoryInformation',
      Thermostat: 'Thermostat',
    },
    Characteristic: {
      Manufacturer: 'Manufacturer',
      Model: 'Model',
      SerialNumber: 'SerialNumber',
      Name: 'Name',
      TargetTemperature: 'TargetTemperature',
      CurrentTemperature: 'CurrentTemperature',
      TargetHeatingCoolingState: {
        OFF: 0,
        HEAT: 1,
      },
      CurrentHeatingCoolingState: {
        OFF: 0,
        HEAT: 1,
      },
      TemperatureDisplayUnits: {
        CELSIUS: 0,
        FAHRENHEIT: 1,
      },
    },
  },
  on: jest.fn(),
  registerPlatform: jest.fn(),
} as unknown as API;

const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
} as unknown as Logger;

describe('HeaterAccessory Comprehensive Coverage Tests', () => {
  let platform: PentairPlatform;
  let mockConfig: any;

  beforeEach(() => {
    mockConfig = {
      name: 'Test Platform',
      platform: 'PentairIntelliCenter',
      ipAddress: '192.168.1.100',
      username: 'test',
      password: 'test',
      temperatureUnits: TemperatureUnits.F,
      minimumTemperature: 50,
      maximumTemperature: 100,
      supportVSP: true,
    };

    platform = new PentairPlatform(mockLogger, mockConfig, mockAPI);
  });

  describe('Missing HeaterAccessory branches', () => {
    it('should cover getCurrentHeatingCoolingState when heater matches body heaterId', () => {
      const mockAccessory = {
        context: {
          heater: { id: 'heater1', name: 'Test Heater', type: 'GAS' },
          body: {
            id: 'body1',
            name: 'Pool',
            temperature: 75,
            lowTemperature: 80, // Temperature below target to trigger heating
            highTemperature: 85,
            heaterId: 'heater1', // Matches heater ID to trigger heater selection
          },
        },
        getService: jest.fn().mockReturnValue({
          setCharacteristic: jest.fn().mockReturnThis(),
          getCharacteristic: jest.fn().mockReturnValue({
            onSet: jest.fn().mockReturnThis(),
            onGet: jest.fn().mockReturnThis(),
            updateValue: jest.fn().mockReturnThis(),
            setProps: jest.fn().mockReturnThis(),
          }),
          updateCharacteristic: jest.fn(),
        }),
        addService: jest.fn().mockReturnValue({
          setCharacteristic: jest.fn().mockReturnThis(),
          getCharacteristic: jest.fn().mockReturnValue({
            onSet: jest.fn().mockReturnThis(),
            onGet: jest.fn().mockReturnThis(),
            updateValue: jest.fn().mockReturnThis(),
            setProps: jest.fn().mockReturnThis(),
          }),
          updateCharacteristic: jest.fn(),
        }),
      } as unknown as PlatformAccessory;

      // Mock platform methods
      Object.defineProperty(platform, 'getConfig', {
        value: jest.fn().mockReturnValue(mockConfig),
        writable: true,
      });
      Object.defineProperty(platform, 'Service', {
        value: mockAPI.hap.Service,
        writable: true,
      });
      Object.defineProperty(platform, 'Characteristic', {
        value: mockAPI.hap.Characteristic,
        writable: true,
      });
      Object.defineProperty(platform, 'log', {
        value: mockLogger,
        writable: true,
      });

      const heaterAccessory = new HeaterAccessory(platform, mockAccessory);

      // Call getCurrentHeatingCoolingState to trigger the branch where heater is selected and heating
      const state = heaterAccessory.getCurrentHeatingCoolingState();
      expect(state).toBe(mockAPI.hap.Characteristic.CurrentHeatingCoolingState.HEAT);
    });

    it('should cover Celsius temperature display unit branch', () => {
      const mockConfig = {
        name: 'Test Platform',
        platform: 'PentairIntelliCenter',
        ipAddress: '192.168.1.100',
        username: 'test',
        password: 'test',
        temperatureUnits: TemperatureUnits.C, // Use Celsius to trigger the else branch
        minimumTemperature: 10,
        maximumTemperature: 40,
        supportVSP: true,
      };

      const platform = new PentairPlatform(mockLogger, mockConfig, mockAPI);

      const mockAccessory = {
        context: {
          heater: { id: 'heater1', name: 'Test Heater', type: 'GAS' },
          body: {
            id: 'body1',
            name: 'Pool',
            temperature: 25,
            lowTemperature: 30,
            highTemperature: 35,
          },
        },
        getService: jest.fn().mockReturnValue({
          setCharacteristic: jest.fn().mockReturnThis(),
          getCharacteristic: jest.fn().mockReturnValue({
            onSet: jest.fn().mockReturnThis(),
            onGet: jest.fn().mockReturnThis(),
            updateValue: jest.fn().mockReturnThis(),
            setProps: jest.fn().mockReturnThis(),
          }),
          updateCharacteristic: jest.fn(),
        }),
        addService: jest.fn().mockReturnValue({
          setCharacteristic: jest.fn().mockReturnThis(),
          getCharacteristic: jest.fn().mockReturnValue({
            onSet: jest.fn().mockReturnThis(),
            onGet: jest.fn().mockReturnThis(),
            updateValue: jest.fn().mockReturnThis(),
            setProps: jest.fn().mockReturnThis(),
          }),
          updateCharacteristic: jest.fn(),
        }),
      } as unknown as PlatformAccessory;

      // Mock platform methods
      Object.defineProperty(platform, 'getConfig', {
        value: jest.fn().mockReturnValue(mockConfig),
        writable: true,
      });
      Object.defineProperty(platform, 'Service', {
        value: mockAPI.hap.Service,
        writable: true,
      });
      Object.defineProperty(platform, 'Characteristic', {
        value: mockAPI.hap.Characteristic,
        writable: true,
      });
      Object.defineProperty(platform, 'log', {
        value: mockLogger,
        writable: true,
      });

      // This will trigger the Celsius temperature display unit branch
      const heaterAccessory = new HeaterAccessory(platform, mockAccessory);
      expect(heaterAccessory).toBeDefined();
    });

    it('should cover addService branch when thermostat service does not exist', () => {
      const mockAccessory = {
        context: {
          heater: { id: 'heater1', name: 'Test Heater', type: 'GAS' },
          body: {
            id: 'body1',
            name: 'Pool',
            temperature: 75,
            lowTemperature: 78,
            highTemperature: 85,
          },
        },
        getService: jest.fn(serviceType => {
          if (serviceType === mockAPI.hap.Service.AccessoryInformation) {
            return {
              setCharacteristic: jest.fn().mockReturnThis(),
            };
          }
          // Return null for Thermostat service to trigger addService
          return null;
        }),
        addService: jest.fn().mockReturnValue({
          setCharacteristic: jest.fn().mockReturnThis(),
          getCharacteristic: jest.fn().mockReturnValue({
            onSet: jest.fn().mockReturnThis(),
            onGet: jest.fn().mockReturnThis(),
            updateValue: jest.fn().mockReturnThis(),
            setProps: jest.fn().mockReturnThis(),
          }),
          updateCharacteristic: jest.fn(),
        }),
      } as unknown as PlatformAccessory;

      // Mock platform methods
      Object.defineProperty(platform, 'getConfig', {
        value: jest.fn().mockReturnValue(mockConfig),
        writable: true,
      });
      Object.defineProperty(platform, 'Service', {
        value: mockAPI.hap.Service,
        writable: true,
      });
      Object.defineProperty(platform, 'Characteristic', {
        value: mockAPI.hap.Characteristic,
        writable: true,
      });
      Object.defineProperty(platform, 'log', {
        value: mockLogger,
        writable: true,
      });

      // This will trigger the addService branch for Thermostat
      const heaterAccessory = new HeaterAccessory(platform, mockAccessory);
      expect(heaterAccessory).toBeDefined();
      expect(mockAccessory.addService).toHaveBeenCalledWith(mockAPI.hap.Service.Thermostat);
    });

    it('should cover getMode when heater does not match body heaterId', () => {
      const mockAccessory = {
        context: {
          heater: { id: 'heater1', name: 'Test Heater', type: 'GAS' },
          body: {
            id: 'body1',
            name: 'Pool',
            temperature: 75,
            lowTemperature: 78,
            highTemperature: 85,
            heaterId: 'different-heater', // Different heater ID to trigger OFF mode
          },
        },
        getService: jest.fn().mockReturnValue({
          setCharacteristic: jest.fn().mockReturnThis(),
          getCharacteristic: jest.fn().mockReturnValue({
            onSet: jest.fn().mockReturnThis(),
            onGet: jest.fn().mockReturnThis(),
            updateValue: jest.fn().mockReturnThis(),
            setProps: jest.fn().mockReturnThis(),
          }),
          updateCharacteristic: jest.fn(),
        }),
        addService: jest.fn().mockReturnValue({
          setCharacteristic: jest.fn().mockReturnThis(),
          getCharacteristic: jest.fn().mockReturnValue({
            onSet: jest.fn().mockReturnThis(),
            onGet: jest.fn().mockReturnThis(),
            updateValue: jest.fn().mockReturnThis(),
            setProps: jest.fn().mockReturnThis(),
          }),
          updateCharacteristic: jest.fn(),
        }),
      } as unknown as PlatformAccessory;

      // Mock platform methods
      Object.defineProperty(platform, 'getConfig', {
        value: jest.fn().mockReturnValue(mockConfig),
        writable: true,
      });
      Object.defineProperty(platform, 'Service', {
        value: mockAPI.hap.Service,
        writable: true,
      });
      Object.defineProperty(platform, 'Characteristic', {
        value: mockAPI.hap.Characteristic,
        writable: true,
      });
      Object.defineProperty(platform, 'log', {
        value: mockLogger,
        writable: true,
      });

      const heaterAccessory = new HeaterAccessory(platform, mockAccessory);

      // Call getMode to trigger the branch where heater does not match body heaterId
      const mode = heaterAccessory.getMode();
      expect(mode).toBe(mockAPI.hap.Characteristic.TargetHeatingCoolingState.OFF);
    });

    it('should cover fahrenheitToCelsius conversion when isFahrenheit is true', () => {
      const mockAccessory = {
        context: {
          heater: { id: 'heater1', name: 'Test Heater', type: 'GAS' },
          body: {
            id: 'body1',
            name: 'Pool',
            temperature: 77, // This will be converted from F to C when isFahrenheit is true
            lowTemperature: 78,
            highTemperature: 85,
          },
        },
        getService: jest.fn().mockReturnValue({
          setCharacteristic: jest.fn().mockReturnThis(),
          getCharacteristic: jest.fn().mockReturnValue({
            onSet: jest.fn().mockReturnThis(),
            onGet: jest.fn().mockReturnThis(),
            updateValue: jest.fn().mockReturnThis(),
            setProps: jest.fn().mockReturnThis(),
          }),
          updateCharacteristic: jest.fn(),
        }),
        addService: jest.fn().mockReturnValue({
          setCharacteristic: jest.fn().mockReturnThis(),
          getCharacteristic: jest.fn().mockReturnValue({
            onSet: jest.fn().mockReturnThis(),
            onGet: jest.fn().mockReturnThis(),
            updateValue: jest.fn().mockReturnThis(),
            setProps: jest.fn().mockReturnThis(),
          }),
          updateCharacteristic: jest.fn(),
        }),
      } as unknown as PlatformAccessory;

      // Mock platform methods
      Object.defineProperty(platform, 'getConfig', {
        value: jest.fn().mockReturnValue(mockConfig), // Uses F temperature units
        writable: true,
      });
      Object.defineProperty(platform, 'Service', {
        value: mockAPI.hap.Service,
        writable: true,
      });
      Object.defineProperty(platform, 'Characteristic', {
        value: mockAPI.hap.Characteristic,
        writable: true,
      });
      Object.defineProperty(platform, 'log', {
        value: mockLogger,
        writable: true,
      });

      // This will trigger fahrenheitToCelsius conversion for temperature
      const heaterAccessory = new HeaterAccessory(platform, mockAccessory);
      expect(heaterAccessory).toBeDefined();
    });
  });
});
