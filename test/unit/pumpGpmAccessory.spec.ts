import { API, Logger, PlatformAccessory, Service } from 'homebridge';
import { PumpGpmAccessory } from '../../src/pumpGpmAccessory';
import { PentairPlatform } from '../../src/platform';
import { Pump, CircuitType, ObjectType } from '../../src/types';

describe('PumpGpmAccessory', () => {
  let gpmAccessory: PumpGpmAccessory;
  let mockPlatform: Partial<PentairPlatform>;
  let mockAccessory: Partial<PlatformAccessory>;
  let mockService: Partial<Service>;
  let mockLogger: Partial<Logger>;

  beforeEach(() => {
    mockService = {
      setCharacteristic: jest.fn().mockReturnThis(),
      getCharacteristic: jest.fn().mockReturnValue({
        onGet: jest.fn().mockReturnThis(),
      }),
      updateCharacteristic: jest.fn().mockReturnThis(),
    };

    mockLogger = {
      debug: jest.fn(),
      warn: jest.fn(),
    };

    mockPlatform = {
      Service: {
        AccessoryInformation: 'AccessoryInformation',
        LightSensor: 'LightSensor',
      } as any,
      Characteristic: {
        Manufacturer: 'Manufacturer',
        Model: 'Model',
        SerialNumber: 'SerialNumber',
        Name: 'Name',
        CurrentAmbientLightLevel: 'CurrentAmbientLightLevel',
      } as any,
      log: mockLogger as Logger,
    };

    const mockPump: Pump = {
      id: 'PMP01',
      name: 'VS Pool Pump',
      objectType: ObjectType.Pump,
      type: 'SPEED' as any, // Pump subtype (SPEED maps to VS)
      circuits: [],
      minRpm: 450,
      maxRpm: 3450,
      minFlow: 10,
      maxFlow: 130,
    };

    mockAccessory = {
      context: {
        pump: mockPump,
      },
      displayName: 'VS Pool Pump GPM',
      getService: jest.fn().mockReturnValue(mockService),
      addService: jest.fn().mockReturnValue(mockService),
    };

    gpmAccessory = new PumpGpmAccessory(mockPlatform as PentairPlatform, mockAccessory as PlatformAccessory);
  });

  describe('constructor', () => {
    it('should initialize GPM accessory correctly', () => {
      expect(mockAccessory.getService).toHaveBeenCalledWith('AccessoryInformation');
      expect(mockService.setCharacteristic).toHaveBeenCalledWith('Manufacturer', expect.any(String));
      expect(mockService.setCharacteristic).toHaveBeenCalledWith('Model', 'Pump GPM Sensor');
      expect(mockService.setCharacteristic).toHaveBeenCalledWith('SerialNumber', 'GPM-PMP01');
    });

    it('should set up light sensor service', () => {
      expect(mockAccessory.getService).toHaveBeenCalledWith('LightSensor');
      expect(mockService.setCharacteristic).toHaveBeenCalledWith('Name', 'VS Pool Pump GPM');
    });
  });

  describe('updateSpeed', () => {
    it('should update speed and calculate GPM for VS pump', async () => {
      gpmAccessory.updateSpeed(2000);

      expect(gpmAccessory.getCurrentRpm()).toBe(2000);

      // Verify GPM calculation for VS pump at 2000 RPM
      // Using formula: Math.max(0, (rpm * 0.032) - 14.4)
      // 2000 * 0.032 - 14.4 = 64 - 14.4 = 49.6 GPM
      const expectedGpm = Math.max(0, 2000 * 0.032 - 14.4);
      expect(mockService.updateCharacteristic).toHaveBeenCalledWith('CurrentAmbientLightLevel', expectedGpm);
    });

    it('should handle low RPM with minimum value', () => {
      gpmAccessory.updateSpeed(400); // Below minimum 450 RPM

      expect(mockService.updateCharacteristic).toHaveBeenCalledWith(
        'CurrentAmbientLightLevel',
        0.0001, // HomeKit minimum value
      );
    });

    it('should handle zero RPM', () => {
      gpmAccessory.updateSpeed(0);

      expect(mockService.updateCharacteristic).toHaveBeenCalledWith(
        'CurrentAmbientLightLevel',
        0.0001, // HomeKit minimum value
      );
    });
  });

  describe('getGpm', () => {
    it('should return current GPM value', async () => {
      gpmAccessory.updateSpeed(1500);
      const gpm = await gpmAccessory.getGpm();

      // Calculate expected GPM for 1500 RPM VS pump
      const expectedGpm = Math.max(0, 1500 * 0.032 - 14.4);
      expect(gpm).toBe(expectedGpm);
    });
  });

  describe('pump type handling', () => {
    it('should get correct pump type', () => {
      expect(gpmAccessory.getPumpType()).toBe('VS'); // SPEED maps to VS
    });

    it('should handle VSF pump type', () => {
      const mockVsfPump: Pump = {
        id: 'PMP02',
        name: 'VSF Pool Pump',
        objectType: ObjectType.Pump,
        type: 'VSF' as any, // Pump subtype (VSF maps to VSF)
        circuits: [],
        minRpm: 450,
        maxRpm: 3450,
        minFlow: 10,
        maxFlow: 130,
      };

      const mockVsfAccessory = {
        ...mockAccessory,
        context: { pump: mockVsfPump },
        displayName: 'VSF Pool Pump GPM',
      };

      const vsfGpmAccessory = new PumpGpmAccessory(mockPlatform as PentairPlatform, mockVsfAccessory as PlatformAccessory);

      expect(vsfGpmAccessory.getPumpType()).toBe('VSF');
    });
  });
});
