import { CharacteristicValue, PlatformAccessory, Service } from 'homebridge';
import { TemperatureAccessory } from '../../src/temperatureAccessory';
import { PentairPlatform } from '../../src/platform';
import { TemperatureSensorType, TemperatureUnits, ObjectType } from '../../src/types';
import { MANUFACTURER } from '../../src/settings';

// Mock Homebridge services and characteristics
const mockService = {
  setCharacteristic: jest.fn().mockReturnThis(),
  updateCharacteristic: jest.fn().mockReturnThis(),
  getCharacteristic: jest.fn().mockReturnThis(),
  onGet: jest.fn().mockReturnThis(),
};

const mockAccessoryInformation = {
  setCharacteristic: jest.fn().mockReturnThis(),
};

const mockPlatformAccessory = {
  getService: jest.fn(),
  addService: jest.fn().mockReturnValue(mockService),
  context: {} as any,
  UUID: 'test-temp-uuid',
} as unknown as PlatformAccessory;

const mockPlatform = {
  Service: {
    AccessoryInformation: 'AccessoryInformation',
    TemperatureSensor: 'TemperatureSensor',
  },
  Characteristic: {
    Manufacturer: 'Manufacturer',
    Model: 'Model',
    SerialNumber: 'SerialNumber',
    Name: 'Name',
    CurrentTemperature: 'CurrentTemperature',
  },
  log: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
  getConfig: jest.fn(),
} as unknown as PentairPlatform;

// Test data
const mockSensor = {
  id: 'S01',
  name: 'Pool Temperature',
  objectType: ObjectType.Sensor,
  type: TemperatureSensorType.Pool,
  probe: 78.5, // Temperature reading
};

const mockAirSensor = {
  id: 'S02',
  name: 'Air Temperature',
  objectType: ObjectType.Sensor,
  type: TemperatureSensorType.Air,
  probe: 85.2,
};

describe('TemperatureAccessory', () => {
  let temperatureAccessory: TemperatureAccessory;

  beforeEach(() => {
    jest.clearAllMocks();

    // Reset platform accessory context
    mockPlatformAccessory.context = {
      sensor: mockSensor,
    };

    // Setup default mock returns
    (mockPlatformAccessory.getService as jest.Mock).mockImplementation(serviceType => {
      if (serviceType === 'AccessoryInformation') {
        return mockAccessoryInformation;
      }
      return null;
    });

    // Default configuration (Fahrenheit)
    (mockPlatform.getConfig as jest.Mock).mockReturnValue({
      temperatureUnits: TemperatureUnits.F,
    });
  });

  describe('Constructor', () => {
    beforeEach(() => {
      temperatureAccessory = new TemperatureAccessory(mockPlatform, mockPlatformAccessory);
    });

    it('should initialize with correct accessory information', () => {
      expect(mockAccessoryInformation.setCharacteristic).toHaveBeenCalledWith('Manufacturer', MANUFACTURER);
      expect(mockAccessoryInformation.setCharacteristic).toHaveBeenCalledWith('Model', 'Temperature Sensor');
      expect(mockAccessoryInformation.setCharacteristic).toHaveBeenCalledWith('SerialNumber', 'test-temp-uuid');
    });

    it('should create a TemperatureSensor service', () => {
      expect(mockPlatformAccessory.addService).toHaveBeenCalledWith('TemperatureSensor', 'Pool Temperature');
      expect(mockService.setCharacteristic).toHaveBeenCalledWith('Name', 'Pool Temperature');
    });

    it('should bind CurrentTemperature characteristic', () => {
      expect(mockService.getCharacteristic).toHaveBeenCalledWith('CurrentTemperature');
      expect(mockService.onGet).toHaveBeenCalled();
    });

    it('should extract sensor type and name from context', () => {
      expect(temperatureAccessory['type']).toBe(TemperatureSensorType.Pool);
      expect(temperatureAccessory['name']).toBe('Pool Temperature');
    });
  });

  describe('Constructor - Air Temperature Sensor', () => {
    beforeEach(() => {
      mockPlatformAccessory.context.sensor = mockAirSensor;
      temperatureAccessory = new TemperatureAccessory(mockPlatform, mockPlatformAccessory);
    });

    it('should handle air temperature sensor correctly', () => {
      expect(mockService.setCharacteristic).toHaveBeenCalledWith('Name', 'Air Temperature');
      expect(temperatureAccessory['type']).toBe(TemperatureSensorType.Air);
      expect(temperatureAccessory['name']).toBe('Air Temperature');
    });
  });

  describe('getCurrentTemperature - Fahrenheit Configuration', () => {
    beforeEach(() => {
      temperatureAccessory = new TemperatureAccessory(mockPlatform, mockPlatformAccessory);
    });

    it('should convert Fahrenheit to Celsius', async () => {
      const result = await temperatureAccessory.getCurrentTemperature();

      // 78.5°F should convert to ~25.83°C
      expect(result).toBeCloseTo(25.83, 1);
    });

    it('should handle edge case temperatures', async () => {
      // Test freezing point
      mockPlatformAccessory.context.sensor.probe = 32; // 32°F = 0°C
      const result1 = await temperatureAccessory.getCurrentTemperature();
      expect(result1).toBeCloseTo(0, 1);

      // Test boiling point
      mockPlatformAccessory.context.sensor.probe = 212; // 212°F = 100°C
      const result2 = await temperatureAccessory.getCurrentTemperature();
      expect(result2).toBeCloseTo(100, 1);
    });

    it('should handle negative temperatures', async () => {
      mockPlatformAccessory.context.sensor.probe = -4; // -4°F = -20°C
      const result = await temperatureAccessory.getCurrentTemperature();
      expect(result).toBeCloseTo(-20, 1);
    });
  });

  describe('getCurrentTemperature - Celsius Configuration', () => {
    beforeEach(() => {
      (mockPlatform.getConfig as jest.Mock).mockReturnValue({
        temperatureUnits: TemperatureUnits.C,
      });
      temperatureAccessory = new TemperatureAccessory(mockPlatform, mockPlatformAccessory);
    });

    it('should return temperature without conversion', async () => {
      mockPlatformAccessory.context.sensor.probe = 25.5; // Already Celsius
      const result = await temperatureAccessory.getCurrentTemperature();
      expect(result).toBe(25.5);
    });

    it('should handle decimal values correctly', async () => {
      mockPlatformAccessory.context.sensor.probe = 23.456;
      const result = await temperatureAccessory.getCurrentTemperature();
      expect(result).toBe(23.456);
    });
  });

  describe('getCurrentTemperature - Error Cases', () => {
    beforeEach(() => {
      temperatureAccessory = new TemperatureAccessory(mockPlatform, mockPlatformAccessory);
    });

    it('should handle undefined temperature', async () => {
      mockPlatformAccessory.context.sensor.probe = undefined;
      const result = await temperatureAccessory.getCurrentTemperature();

      expect(result).toBe(0);
      expect(mockPlatform.log.warn).toHaveBeenCalledWith('[Pool Temperature] Invalid temperature value: undefined, returning 0');
    });

    it('should handle null temperature', async () => {
      mockPlatformAccessory.context.sensor.probe = null;
      const result = await temperatureAccessory.getCurrentTemperature();

      expect(result).toBe(0);
      expect(mockPlatform.log.warn).toHaveBeenCalledWith('[Pool Temperature] Invalid temperature value: null, returning 0');
    });

    it('should handle NaN temperature', async () => {
      mockPlatformAccessory.context.sensor.probe = NaN;
      const result = await temperatureAccessory.getCurrentTemperature();

      expect(result).toBe(0);
      expect(mockPlatform.log.warn).toHaveBeenCalledWith('[Pool Temperature] Invalid temperature value: NaN, returning 0');
    });

    it('should handle missing sensor context', async () => {
      mockPlatformAccessory.context.sensor = undefined;
      const result = await temperatureAccessory.getCurrentTemperature();

      expect(result).toBe(0);
      expect(mockPlatform.log.warn).toHaveBeenCalledWith('[Pool Temperature] Invalid temperature value: undefined, returning 0');
    });

    it('should handle string temperature values that are NaN', async () => {
      mockPlatformAccessory.context.sensor.probe = 'invalid' as any;
      const result = await temperatureAccessory.getCurrentTemperature();

      expect(result).toBe(0);
      expect(mockPlatform.log.warn).toHaveBeenCalledWith('[Pool Temperature] Invalid temperature value: invalid, returning 0');
    });
  });

  describe('updateTemperature - Fahrenheit Configuration', () => {
    beforeEach(() => {
      temperatureAccessory = new TemperatureAccessory(mockPlatform, mockPlatformAccessory);
    });

    it('should update context and characteristic with converted value', () => {
      temperatureAccessory.updateTemperature(80); // 80°F

      expect(mockPlatformAccessory.context.sensor.probe).toBe(80);
      expect(mockService.updateCharacteristic).toHaveBeenCalledWith(
        'CurrentTemperature',
        expect.any(Number), // 80°F to Celsius conversion
      );
    });

    it('should log temperature update with units', () => {
      temperatureAccessory.updateTemperature(75.5);

      expect(mockPlatform.log.debug).toHaveBeenCalledWith(expect.stringContaining('[Pool Temperature] Updated temperature: 75.5F -> 24.1'));
    });

    it('should handle decimal input values', () => {
      temperatureAccessory.updateTemperature(78.25);

      expect(mockPlatformAccessory.context.sensor.probe).toBe(78.25);
      expect(mockService.updateCharacteristic).toHaveBeenCalledWith('CurrentTemperature', expect.any(Number));
    });
  });

  describe('updateTemperature - Celsius Configuration', () => {
    beforeEach(() => {
      (mockPlatform.getConfig as jest.Mock).mockReturnValue({
        temperatureUnits: TemperatureUnits.C,
      });
      temperatureAccessory = new TemperatureAccessory(mockPlatform, mockPlatformAccessory);
    });

    it('should update without conversion', () => {
      temperatureAccessory.updateTemperature(25);

      expect(mockPlatformAccessory.context.sensor.probe).toBe(25);
      expect(mockService.updateCharacteristic).toHaveBeenCalledWith(
        'CurrentTemperature',
        25, // No conversion
      );
    });

    it('should log temperature update with Celsius units', () => {
      temperatureAccessory.updateTemperature(23.5);

      expect(mockPlatform.log.debug).toHaveBeenCalledWith('[Pool Temperature] Updated temperature: 23.5C -> 23.5C');
    });
  });

  describe('updateTemperature - Error Cases', () => {
    beforeEach(() => {
      temperatureAccessory = new TemperatureAccessory(mockPlatform, mockPlatformAccessory);
    });

    it('should skip update for undefined value', () => {
      temperatureAccessory.updateTemperature(undefined as any);

      expect(mockPlatform.log.warn).toHaveBeenCalledWith('[Pool Temperature] Invalid temperature update value: undefined, skipping update');
      expect(mockService.updateCharacteristic).not.toHaveBeenCalled();
    });

    it('should skip update for null value', () => {
      temperatureAccessory.updateTemperature(null as any);

      expect(mockPlatform.log.warn).toHaveBeenCalledWith('[Pool Temperature] Invalid temperature update value: null, skipping update');
      expect(mockService.updateCharacteristic).not.toHaveBeenCalled();
    });

    it('should skip update for NaN value', () => {
      temperatureAccessory.updateTemperature(NaN);

      expect(mockPlatform.log.warn).toHaveBeenCalledWith('[Pool Temperature] Invalid temperature update value: NaN, skipping update');
      expect(mockService.updateCharacteristic).not.toHaveBeenCalled();
    });

    it('should not update context for invalid values', () => {
      const originalProbe = mockPlatformAccessory.context.sensor.probe;
      temperatureAccessory.updateTemperature(undefined as any);

      expect(mockPlatformAccessory.context.sensor.probe).toBe(originalProbe);
    });
  });

  describe('Temperature Conversion Edge Cases', () => {
    beforeEach(() => {
      temperatureAccessory = new TemperatureAccessory(mockPlatform, mockPlatformAccessory);
    });

    it('should handle extreme high temperatures', async () => {
      mockPlatformAccessory.context.sensor.probe = 1000; // 1000°F
      const result = await temperatureAccessory.getCurrentTemperature();

      // 1000°F should convert to ~537.78°C
      expect(result).toBeCloseTo(537.78, 1);
    });

    it('should handle extreme low temperatures', async () => {
      mockPlatformAccessory.context.sensor.probe = -100; // -100°F
      const result = await temperatureAccessory.getCurrentTemperature();

      // -100°F should convert to ~-73.33°C
      expect(result).toBeCloseTo(-73.33, 1);
    });

    it('should handle zero temperature', async () => {
      mockPlatformAccessory.context.sensor.probe = 0; // 0°F
      const result = await temperatureAccessory.getCurrentTemperature();

      // 0°F should convert to ~-17.78°C
      expect(result).toBeCloseTo(-17.78, 1);
    });

    it('should handle very small decimal values', () => {
      temperatureAccessory.updateTemperature(0.001);

      expect(mockPlatformAccessory.context.sensor.probe).toBe(0.001);
      expect(mockService.updateCharacteristic).toHaveBeenCalledWith('CurrentTemperature', expect.any(Number));
    });
  });

  describe('Service Integration', () => {
    beforeEach(() => {
      temperatureAccessory = new TemperatureAccessory(mockPlatform, mockPlatformAccessory);
    });

    it('should use existing service if available', () => {
      const existingService = { ...mockService };
      (mockPlatformAccessory.getService as jest.Mock).mockImplementation(serviceType => {
        if (serviceType === 'AccessoryInformation') {
          return mockAccessoryInformation;
        }
        if (serviceType === 'TemperatureSensor') {
          return existingService;
        }
        return null;
      });

      // Reset call count since constructor was called in beforeEach
      jest.clearAllMocks();

      temperatureAccessory = new TemperatureAccessory(mockPlatform, mockPlatformAccessory);

      expect(mockPlatformAccessory.addService).not.toHaveBeenCalled();
    });

    it('should create new service if none exists', () => {
      expect(mockPlatformAccessory.addService).toHaveBeenCalledWith('TemperatureSensor', 'Pool Temperature');
    });
  });

  describe('Sensor Name Handling', () => {
    it('should handle sensors with different names', () => {
      const customSensor = {
        ...mockSensor,
        name: 'Spa Water Temperature',
      };
      mockPlatformAccessory.context.sensor = customSensor;

      temperatureAccessory = new TemperatureAccessory(mockPlatform, mockPlatformAccessory);

      expect(mockService.setCharacteristic).toHaveBeenCalledWith('Name', 'Spa Water Temperature');
      expect(temperatureAccessory['name']).toBe('Spa Water Temperature');
    });

    it('should handle empty sensor names', () => {
      const sensorWithEmptyName = {
        ...mockSensor,
        name: '',
      };
      mockPlatformAccessory.context.sensor = sensorWithEmptyName;

      temperatureAccessory = new TemperatureAccessory(mockPlatform, mockPlatformAccessory);

      expect(mockService.setCharacteristic).toHaveBeenCalledWith('Name', '');
      expect(temperatureAccessory['name']).toBe('');
    });
  });

  describe('Context Mutation', () => {
    beforeEach(() => {
      temperatureAccessory = new TemperatureAccessory(mockPlatform, mockPlatformAccessory);
    });

    it('should not modify original sensor object during construction', () => {
      const originalProbe = mockSensor.probe;
      temperatureAccessory = new TemperatureAccessory(mockPlatform, mockPlatformAccessory);

      expect(mockSensor.probe).toBe(originalProbe);
    });

    it('should modify context sensor probe during updates', () => {
      const newTemp = 85.5;
      temperatureAccessory.updateTemperature(newTemp);

      expect(mockPlatformAccessory.context.sensor.probe).toBe(newTemp);
    });
  });
});
