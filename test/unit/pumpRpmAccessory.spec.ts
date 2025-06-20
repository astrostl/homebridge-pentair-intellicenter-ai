import { API, Characteristic, PlatformAccessory, Service } from 'homebridge';
import { PentairPlatform } from '../../src/platform';
import { PumpRpmAccessory } from '../../src/pumpRpmAccessory';
import { Circuit, CircuitStatus, PumpCircuit, ObjectType, CircuitType } from '../../src/types';
import { MANUFACTURER } from '../../src/settings';

// Mock homebridge
const mockApi = {
  hap: {
    Service: {
      AccessoryInformation: 'AccessoryInformation',
      LightSensor: 'LightSensor',
    },
    Characteristic: {
      Manufacturer: 'Manufacturer',
      Model: 'Model',
      SerialNumber: 'SerialNumber',
      Name: 'Name',
      CurrentAmbientLightLevel: 'CurrentAmbientLightLevel',
    },
  },
} as unknown as API;

const mockCharacteristic = {
  onGet: jest.fn().mockReturnThis(),
  setCharacteristic: jest.fn().mockReturnThis(),
  updateCharacteristic: jest.fn().mockReturnThis(),
  getCharacteristic: jest.fn().mockReturnThis(),
};

const mockService = {
  setCharacteristic: jest.fn().mockReturnThis(),
  getCharacteristic: jest.fn().mockReturnValue(mockCharacteristic),
  updateCharacteristic: jest.fn().mockReturnThis(),
};

const mockAccessoryInfo = {
  setCharacteristic: jest.fn().mockReturnThis(),
};

const mockAccessory = {
  displayName: 'Test Feature RPM',
  context: {
    feature: {
      id: 'F001',
      name: 'Test Feature',
      objectType: ObjectType.Circuit,
      type: CircuitType.Generic,
      status: CircuitStatus.On,
    } as Circuit,
    pumpCircuit: {
      id: 'PC001',
      speed: 2500,
      speedType: 'RPM',
    } as PumpCircuit,
  },
  getService: jest.fn(),
  addService: jest.fn().mockReturnValue(mockService),
} as unknown as PlatformAccessory;

const mockPlatform = {
  api: mockApi,
  log: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
  Service: mockApi.hap.Service,
  Characteristic: mockApi.hap.Characteristic,
} as unknown as PentairPlatform;

describe('PumpRpmAccessory', () => {
  let pumpRpmAccessory: PumpRpmAccessory;

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup mock accessory service behavior
    mockAccessory.getService = jest.fn().mockImplementation(serviceType => {
      if (serviceType === 'AccessoryInformation') {
        return mockAccessoryInfo;
      } else if (serviceType === 'LightSensor') {
        return null; // Will trigger addService
      }
      return null;
    });
  });

  describe('constructor', () => {
    it('should create RPM accessory with correct characteristics', () => {
      pumpRpmAccessory = new PumpRpmAccessory(mockPlatform, mockAccessory);

      // Verify accessory information setup
      expect(mockAccessoryInfo.setCharacteristic).toHaveBeenCalledWith('Manufacturer', MANUFACTURER);
      expect(mockAccessoryInfo.setCharacteristic).toHaveBeenCalledWith('Model', 'Feature RPM Sensor');
      expect(mockAccessoryInfo.setCharacteristic).toHaveBeenCalledWith('SerialNumber', 'RPM-F001');

      // Verify service creation
      expect(mockAccessory.addService).toHaveBeenCalledWith('LightSensor');
      expect(mockService.setCharacteristic).toHaveBeenCalledWith('Name', 'Test Feature RPM');

      // Verify characteristic setup
      expect(mockCharacteristic.onGet).toHaveBeenCalled();
    });

    it('should use existing LightSensor service if available', () => {
      mockAccessory.getService = jest.fn().mockReturnValue(mockService);

      pumpRpmAccessory = new PumpRpmAccessory(mockPlatform, mockAccessory);

      expect(mockAccessory.addService).not.toHaveBeenCalled();
      expect(mockAccessory.getService).toHaveBeenCalledWith('LightSensor');
    });
  });

  describe('getCurrentRpm', () => {
    beforeEach(() => {
      pumpRpmAccessory = new PumpRpmAccessory(mockPlatform, mockAccessory);
    });

    it('should return pump circuit speed when feature is active', async () => {
      mockAccessory.context.feature.status = CircuitStatus.On;
      mockAccessory.context.pumpCircuit.speed = 3000;

      const rpm = await pumpRpmAccessory.getRpm();

      expect(rpm).toBe(3000);
      expect(mockPlatform.log.debug).toHaveBeenCalledWith('Test Feature RPM: Checking feature F001');
      expect(mockPlatform.log.debug).toHaveBeenCalledWith('  Feature status: ON, Pump circuit speed: 3000');
      expect(mockPlatform.log.debug).toHaveBeenCalledWith('  Result: 3000 RPM (feature active)');
    });

    it('should return minimum value when feature is off', async () => {
      mockAccessory.context.feature.status = CircuitStatus.Off;
      mockAccessory.context.pumpCircuit.speed = 3000;

      const rpm = await pumpRpmAccessory.getRpm();

      expect(rpm).toBe(0.0001);
      expect(mockPlatform.log.debug).toHaveBeenCalledWith('  Result: 0.0001 RPM (feature inactive or no speed)');
    });

    it('should return minimum value when feature status is undefined', async () => {
      mockAccessory.context.feature.status = undefined;
      mockAccessory.context.pumpCircuit.speed = 3000;

      const rpm = await pumpRpmAccessory.getRpm();

      expect(rpm).toBe(0.0001);
    });

    it('should return minimum value when pump circuit speed is 0', async () => {
      mockAccessory.context.feature.status = CircuitStatus.On;
      mockAccessory.context.pumpCircuit.speed = 0;

      const rpm = await pumpRpmAccessory.getRpm();

      expect(rpm).toBe(0.0001);
    });

    it('should return minimum value when pump circuit speed is undefined', async () => {
      mockAccessory.context.feature.status = CircuitStatus.On;
      mockAccessory.context.pumpCircuit.speed = undefined as any;

      const rpm = await pumpRpmAccessory.getRpm();

      expect(rpm).toBe(0.0001);
    });
  });

  describe('updateRpm', () => {
    beforeEach(() => {
      pumpRpmAccessory = new PumpRpmAccessory(mockPlatform, mockAccessory);
    });

    it('should update characteristic with new RPM value', () => {
      pumpRpmAccessory.updateRpm(2800);

      expect(mockPlatform.log.debug).toHaveBeenCalledWith('Updating Test Feature RPM display to: 2800');
      expect(mockService.updateCharacteristic).toHaveBeenCalledWith('CurrentAmbientLightLevel', 2800);
    });

    it('should update characteristic with minimum value', () => {
      pumpRpmAccessory.updateRpm(0.0001);

      expect(mockPlatform.log.debug).toHaveBeenCalledWith('Updating Test Feature RPM display to: 0.0001');
      expect(mockService.updateCharacteristic).toHaveBeenCalledWith('CurrentAmbientLightLevel', 0.0001);
    });
  });

  describe('heater RPM sensor scenarios', () => {
    beforeEach(() => {
      // Setup heater RPM sensor context
      mockAccessory.displayName = 'Gas Heater RPM';
      mockAccessory.context.feature = {
        id: 'H0002',
        name: 'Gas Heater',
        objectType: ObjectType.Circuit,
        type: CircuitType.Generic,
        status: CircuitStatus.On,
        bodyId: 'B1202',
      } as Circuit & { bodyId: string };
      mockAccessory.context.pumpCircuit = {
        id: 'PC003',
        speed: 3000,
        speedType: 'RPM',
      } as PumpCircuit;
    });

    it('should handle heater RPM sensor with correct speed', async () => {
      pumpRpmAccessory = new PumpRpmAccessory(mockPlatform, mockAccessory);

      const rpm = await pumpRpmAccessory.getRpm();

      expect(rpm).toBe(3000);
      expect(mockPlatform.log.debug).toHaveBeenCalledWith('  Result: 3000 RPM (feature active)');
    });

    it('should handle inactive heater RPM sensor', async () => {
      mockAccessory.context.feature.status = CircuitStatus.Off;
      pumpRpmAccessory = new PumpRpmAccessory(mockPlatform, mockAccessory);

      const rpm = await pumpRpmAccessory.getRpm();

      expect(rpm).toBe(0.0001);
    });
  });

  describe('edge cases', () => {
    it('should handle missing feature context', () => {
      mockAccessory.context.feature = undefined as any;

      expect(() => {
        pumpRpmAccessory = new PumpRpmAccessory(mockPlatform, mockAccessory);
      }).toThrow();
    });

    it('should handle missing pump circuit context', () => {
      mockAccessory.context.pumpCircuit = undefined as any;

      expect(() => {
        pumpRpmAccessory = new PumpRpmAccessory(mockPlatform, mockAccessory);
      }).toThrow();
    });

    it('should handle very high RPM values', async () => {
      // Reset context to known state
      mockAccessory.context.feature = {
        id: 'F001',
        name: 'Test Feature',
        objectType: ObjectType.Circuit,
        type: CircuitType.Generic,
        status: CircuitStatus.On,
      } as Circuit;
      mockAccessory.context.pumpCircuit = {
        id: 'PC001',
        speed: 3400, // Spa jets speed
        speedType: 'RPM',
      } as PumpCircuit;

      pumpRpmAccessory = new PumpRpmAccessory(mockPlatform, mockAccessory);
      const rpm = await pumpRpmAccessory.getRpm();

      expect(rpm).toBe(3400);
    });
  });
});
