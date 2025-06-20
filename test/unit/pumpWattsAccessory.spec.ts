import { API, Logger, PlatformAccessory, Service } from 'homebridge';
import { PumpWattsAccessory } from '../../src/pumpWattsAccessory';
import { PentairPlatform } from '../../src/platform';
import { Pump, ObjectType, CircuitStatus, PumpCircuit } from '../../src/types';

describe('PumpWattsAccessory', () => {
  let wattsAccessory: PumpWattsAccessory;
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
      accessoryMap: new Map(),
    };

    // Mock pump circuits for testing
    const mockPumpCircuits: PumpCircuit[] = [
      {
        id: 'PC01',
        pump: {} as Pump, // Will be set after pump creation
        circuitId: 'CIR01',
        speed: 1800, // Active SPA circuit
        speedType: 'RPM',
      },
      {
        id: 'PC02',
        pump: {} as Pump, // Will be set after pump creation
        circuitId: 'CIR02',
        speed: 3000, // HEATER circuit
        speedType: 'RPM',
      },
    ];

    const mockPump: Pump = {
      id: 'PMP01',
      name: 'VS Pool Pump',
      objectType: ObjectType.Pump,
      type: 'SPEED' as any, // Pump subtype (SPEED maps to VS)
      circuits: mockPumpCircuits,
      minRpm: 450,
      maxRpm: 3450,
      minFlow: 10,
      maxFlow: 130,
    };

    mockAccessory = {
      context: {
        pump: mockPump,
      },
      displayName: 'VS Pool Pump WATTS',
      getService: jest.fn().mockReturnValue(mockService),
      addService: jest.fn().mockReturnValue(mockService),
    };

    // Mock circuit accessories in accessoryMap to simulate circuit status
    const mockCircuitAccessory1 = {
      context: {
        circuit: {
          id: 'CIR01',
          status: CircuitStatus.On, // Active circuit
        },
      },
    };

    const mockCircuitAccessory2 = {
      context: {
        circuit: {
          id: 'CIR02',
          status: CircuitStatus.Off, // Inactive circuit
        },
      },
    };

    (mockPlatform.accessoryMap as Map<string, any>).set('CIR01', mockCircuitAccessory1);
    (mockPlatform.accessoryMap as Map<string, any>).set('CIR02', mockCircuitAccessory2);

    wattsAccessory = new PumpWattsAccessory(mockPlatform as PentairPlatform, mockAccessory as PlatformAccessory);
  });

  describe('constructor', () => {
    it('should initialize WATTS accessory correctly', () => {
      expect(mockAccessory.getService).toHaveBeenCalledWith('AccessoryInformation');
      expect(mockService.setCharacteristic).toHaveBeenCalledWith('Manufacturer', expect.any(String));
      expect(mockService.setCharacteristic).toHaveBeenCalledWith('Model', 'Pump WATTS Sensor');
      expect(mockService.setCharacteristic).toHaveBeenCalledWith('SerialNumber', 'WATTS-PMP01');
    });

    it('should set up light sensor service', () => {
      expect(mockAccessory.getService).toHaveBeenCalledWith('LightSensor');
      expect(mockService.setCharacteristic).toHaveBeenCalledWith('Name', 'VS Pool Pump WATTS');
    });
  });

  describe('updateSpeed', () => {
    it('should update speed and calculate WATTS for VS pump', async () => {
      wattsAccessory.updateSpeed(2000);

      expect(wattsAccessory.getCurrentRpm()).toBe(2000);

      // WATTS should be calculated based on highest active circuit speed (1800 RPM from CIR01)
      // not the updateSpeed parameter, since the new implementation uses active circuit detection
      const rpmRatio = 1800 / 3450; // Highest active circuit speed
      const expectedWatts = Math.round(Math.pow(rpmRatio, 2.4) * 1600);

      expect(mockService.updateCharacteristic).toHaveBeenCalledWith('CurrentAmbientLightLevel', expectedWatts);
    });

    it('should handle low RPM with minimum value when no circuits are active', () => {
      // Set all circuits to Off to test minimum value scenario
      const inactiveAccessory1 = {
        context: {
          circuit: { id: 'CIR01', status: CircuitStatus.Off },
        },
      };
      const inactiveAccessory2 = {
        context: {
          circuit: { id: 'CIR02', status: CircuitStatus.Off },
        },
      };

      (mockPlatform.accessoryMap as Map<string, any>).set('CIR01', inactiveAccessory1);
      (mockPlatform.accessoryMap as Map<string, any>).set('CIR02', inactiveAccessory2);

      wattsAccessory.updateSpeed(400); // updateSpeed parameter irrelevant since no active circuits

      expect(mockService.updateCharacteristic).toHaveBeenCalledWith(
        'CurrentAmbientLightLevel',
        0.0001, // HomeKit minimum value when no circuits active
      );
    });

    it('should handle zero RPM when no circuits are active', () => {
      // Set all circuits to Off
      const inactiveAccessory1 = {
        context: {
          circuit: { id: 'CIR01', status: CircuitStatus.Off },
        },
      };
      const inactiveAccessory2 = {
        context: {
          circuit: { id: 'CIR02', status: CircuitStatus.Off },
        },
      };

      (mockPlatform.accessoryMap as Map<string, any>).set('CIR01', inactiveAccessory1);
      (mockPlatform.accessoryMap as Map<string, any>).set('CIR02', inactiveAccessory2);

      wattsAccessory.updateSpeed(0);

      expect(mockService.updateCharacteristic).toHaveBeenCalledWith(
        'CurrentAmbientLightLevel',
        0.0001, // HomeKit minimum value when no circuits active
      );
    });

    it('should use highest active circuit speed', () => {
      // Set CIR02 (3000 RPM) to active and CIR01 (1800 RPM) to active
      const activeAccessory1 = {
        context: {
          circuit: { id: 'CIR01', status: CircuitStatus.On },
        },
      };
      const activeAccessory2 = {
        context: {
          circuit: { id: 'CIR02', status: CircuitStatus.On },
        },
      };

      (mockPlatform.accessoryMap as Map<string, any>).set('CIR01', activeAccessory1);
      (mockPlatform.accessoryMap as Map<string, any>).set('CIR02', activeAccessory2);

      wattsAccessory.updateSpeed(3450); // updateSpeed parameter irrelevant since using active circuit detection

      // Should use highest active speed (3000 RPM from CIR02)
      const rpmRatio = 3000 / 3450;
      const expectedWatts = Math.round(Math.pow(rpmRatio, 2.4) * 1600);

      expect(mockService.updateCharacteristic).toHaveBeenCalledWith('CurrentAmbientLightLevel', expectedWatts);
    });
  });

  describe('getWatts', () => {
    it('should return current WATTS value based on active circuits', async () => {
      wattsAccessory.updateSpeed(1500); // Parameter is irrelevant
      const watts = await wattsAccessory.getWatts();

      // Should calculate WATTS based on highest active circuit (1800 RPM from CIR01)
      const rpmRatio = 1800 / 3450;
      const expectedWatts = Math.round(Math.pow(rpmRatio, 2.4) * 1600);
      expect(watts).toBe(expectedWatts);
    });
  });

  describe('pump type handling', () => {
    it('should get correct pump type', () => {
      expect(wattsAccessory.getPumpType()).toBe('VS'); // SPEED maps to VS
    });

    it('should handle VSF pump type', () => {
      // Create VSF pump with circuits
      const mockVsfPumpCircuits: PumpCircuit[] = [
        {
          id: 'PC03',
          pump: {} as Pump, // Will be set after pump creation
          circuitId: 'CIR03',
          speed: 2000, // Active circuit for VSF pump
          speedType: 'RPM',
        },
      ];

      const mockVsfPump: Pump = {
        id: 'PMP02',
        name: 'VSF Pool Pump',
        objectType: ObjectType.Pump,
        type: 'VSF' as any, // Pump subtype (VSF maps to VSF)
        circuits: mockVsfPumpCircuits,
        minRpm: 450,
        maxRpm: 3450,
        minFlow: 10,
        maxFlow: 130,
      };

      // Create fresh platform for VSF test
      const mockVsfPlatform = {
        ...mockPlatform,
        accessoryMap: new Map(),
      };

      // Add active circuit for VSF pump
      const mockVsfCircuitAccessory = {
        context: {
          circuit: {
            id: 'CIR03',
            status: CircuitStatus.On, // Active circuit
          },
        },
      };

      (mockVsfPlatform.accessoryMap as Map<string, any>).set('CIR03', mockVsfCircuitAccessory);

      const mockVsfAccessory = {
        ...mockAccessory,
        context: { pump: mockVsfPump },
        displayName: 'VSF Pool Pump WATTS',
      };

      const vsfWattsAccessory = new PumpWattsAccessory(mockVsfPlatform as PentairPlatform, mockVsfAccessory as PlatformAccessory);

      expect(vsfWattsAccessory.getPumpType()).toBe('VSF');

      // Test VSF WATTS calculation - should use active circuit speed (2000 RPM)
      vsfWattsAccessory.updateSpeed(1500); // Parameter irrelevant
      const rpmRatio = 2000 / 3450; // Using active circuit speed
      const expectedVsfWatts = Math.round(Math.pow(rpmRatio, 2.4) * 1400); // VSF curve

      expect(mockService.updateCharacteristic).toHaveBeenCalledWith('CurrentAmbientLightLevel', expectedVsfWatts);
    });
  });
});
