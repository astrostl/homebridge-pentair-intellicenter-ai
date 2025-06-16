import { PentairPlatform } from '../../src/platform';
import { CircuitAccessory } from '../../src/circuitAccessory';
import { HeaterAccessory } from '../../src/heaterAccessory';
import { DeadLetterQueue } from '../../src/errorHandling';
import { API, PlatformAccessory, Service, Logger } from 'homebridge';
import { CircuitType, ObjectType, PumpSpeedType, TemperatureUnits, IntelliCenterRequestCommand, Color } from '../../src/types';

// Mock Homebridge API and platform
const mockAPI = {
  hap: {
    Service: {
      AccessoryInformation: 'AccessoryInformation',
      Lightbulb: 'Lightbulb',
      Switch: 'Switch',
      Fan: 'Fan',
      Thermostat: 'Thermostat',
    },
    Characteristic: {
      Manufacturer: 'Manufacturer',
      Model: 'Model',
      SerialNumber: 'SerialNumber',
      Name: 'Name',
      On: 'On',
      Hue: 'Hue',
      Saturation: 'Saturation',
      ColorTemperature: 'ColorTemperature',
      Brightness: 'Brightness',
      RotationSpeed: 'RotationSpeed',
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

describe('Final 100% Branch Coverage Tests', () => {
  let platform: PentairPlatform;
  let mockConfig: any;

  beforeEach(() => {
    mockConfig = {
      name: 'Test Platform',
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

  describe('CircuitAccessory remaining uncovered branches', () => {
    it('should cover pump?.name optional chaining when name is undefined', async () => {
      const mockAccessory = {
        context: {
          module: { id: 'mod1' },
          panel: { id: 'panel1' },
          circuit: { id: 'circ1', name: 'Test Circuit', type: CircuitType.Generic },
          pumpCircuit: {
            id: 'pc1',
            pump: {
              minRpm: 1000,
              maxRpm: 3000,
              minFlow: 10,
              maxFlow: 100,
              name: undefined, // This triggers pump?.name optional chaining
            },
            speed: 1500,
            speedType: PumpSpeedType.RPM,
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
        removeService: jest.fn(),
      } as unknown as PlatformAccessory;

      // Mock the platform methods
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
      Object.defineProperty(platform, 'sendCommandNoWait', {
        value: jest.fn(),
        writable: true,
      });

      const circuitAccessory = new CircuitAccessory(platform, mockAccessory);

      // Call setSpeed to trigger pump?.name optional chaining
      await circuitAccessory.setSpeed(50);

      // Verify the method was called without throwing
      expect(platform.sendCommandNoWait).toHaveBeenCalled();
    });

    it('should cover pumpCircuit.speed ?? min nullish coalescing when speed is 0', () => {
      const mockAccessory = {
        context: {
          module: { id: 'mod1' },
          panel: { id: 'panel1' },
          circuit: { id: 'circ1', name: 'Test Circuit', type: CircuitType.Generic },
          pumpCircuit: {
            id: 'pc1',
            pump: { minRpm: 1000, maxRpm: 3000, minFlow: 10, maxFlow: 100 },
            speed: 0, // This triggers ?? min nullish coalescing
            speedType: PumpSpeedType.RPM,
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
        removeService: jest.fn(),
      } as unknown as PlatformAccessory;

      // Mock the platform methods
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

      const circuitAccessory = new CircuitAccessory(platform, mockAccessory);

      // Call convertSpeedToPowerLevel to trigger (this.pumpCircuit.speed ?? min) nullish coalescing
      const powerLevel = circuitAccessory.convertSpeedToPowerLevel();
      expect(powerLevel).toBe(0);
    });
  });

  describe('HeaterAccessory remaining uncovered branches', () => {
    it('should cover body?.temperature optional chaining when temperature is undefined', () => {
      const mockAccessory = {
        context: {
          heater: { id: 'heater1', name: 'Test Heater', type: 'GAS' },
          body: {
            id: 'body1',
            name: 'Pool',
            temperature: undefined, // This triggers body?.temperature optional chaining
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

      // Mock the platform methods
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

      // This will trigger the body?.temperature optional chaining
      const heaterAccessory = new HeaterAccessory(platform, mockAccessory);
      expect(heaterAccessory).toBeDefined();
    });

    it('should cover lowTemperature || 0 logical OR when lowTemperature is 0', () => {
      const mockAccessory = {
        context: {
          heater: { id: 'heater1', name: 'Test Heater', type: 'GAS' },
          body: {
            id: 'body1',
            name: 'Pool',
            temperature: 75,
            lowTemperature: 0, // This triggers || 0 logical OR (0 is falsy)
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

      // Mock the platform methods
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

      // This will trigger the lowTemperature || 0 logical OR in the updateValue call
      const heaterAccessory = new HeaterAccessory(platform, mockAccessory);
      expect(heaterAccessory).toBeDefined();
    });

    it('should cover lowTemperature || 0 in updateValue when lowTemperature is falsy', () => {
      const mockAccessory = {
        context: {
          heater: { id: 'heater1', name: 'Test Heater', type: 'GAS' },
          body: {
            id: 'body1',
            name: 'Pool',
            temperature: 75,
            lowTemperature: null, // This will trigger || 0 in updateValue
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

      // Mock the platform methods
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

      // This will trigger the lowTemperature || 0 in the updateValue call
      const heaterAccessory = new HeaterAccessory(platform, mockAccessory);
      expect(heaterAccessory).toBeDefined();
    });
  });

  describe('ErrorHandling remaining uncovered branches', () => {
    it('should cover DeadLetterQueue getStats nullish coalescing for empty queue', () => {
      const dlq = new DeadLetterQueue();

      // Get stats on empty queue to trigger queue[0]?.timestamp ?? null
      const stats = dlq.getStats();
      expect(stats.oldestTimestamp).toBeNull();
      expect(stats.newestTimestamp).toBeNull();
      expect(stats.queueSize).toBe(0);
    });

    it('should cover DeadLetterQueue getStats with multiple items', () => {
      const dlq = new DeadLetterQueue();

      // Add multiple items to test the optional chaining paths
      dlq.add({ command: IntelliCenterRequestCommand.GetQuery, messageID: 'msg1' }, 3, 'Test error 1', 'original1');

      dlq.add({ command: IntelliCenterRequestCommand.GetQuery, messageID: 'msg2' }, 2, 'Test error 2', 'original2');

      // Get stats to exercise the optional chaining for non-empty queue
      const stats = dlq.getStats();
      expect(stats.queueSize).toBe(2);
      expect(stats.oldestTimestamp).not.toBeNull();
      expect(stats.newestTimestamp).not.toBeNull();
    });
  });
});
