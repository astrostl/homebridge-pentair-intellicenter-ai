import { API, Logger, PlatformAccessory, Service } from 'homebridge';
import { PumpGpmAccessory } from '../../src/pumpGpmAccessory';
import { PumpRpmAccessory } from '../../src/pumpRpmAccessory';
import { PumpWattsAccessory } from '../../src/pumpWattsAccessory';
import { PentairPlatform } from '../../src/platform';
import { Pump, CircuitType, ObjectType, PumpCircuit, CircuitStatus, Body } from '../../src/types';

describe('Pump Accessories Advanced Coverage', () => {
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
      info: jest.fn(),
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

    const mockPump: Pump = {
      id: 'PMP01',
      name: 'Test Pump',
      objectType: ObjectType.Pump,
      type: 'VS' as any,
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
      displayName: 'Test Pump',
      getService: jest.fn().mockReturnValue(mockService),
      addService: jest.fn().mockReturnValue(mockService),
    };
  });

  describe('PumpGpmAccessory Advanced Cases', () => {
    it('should handle unknown pump type and use fallback calculation', () => {
      const unknownPump: Pump = {
        ...mockAccessory.context!.pump,
        type: 'UNKNOWN_TYPE' as any,
      };

      mockAccessory.context!.pump = unknownPump;
      mockAccessory.context!.pump.circuits = [
        {
          id: 'PC01',
          pump: {} as Pump,
          circuitId: 'CIR01',
          speed: 1800,
          speedType: 'RPM',
        },
      ];

      // Mock circuit accessory to be inactive
      (mockPlatform.accessoryMap as Map<string, any>).clear();

      const gpmAccessory = new PumpGpmAccessory(mockPlatform as PentairPlatform, mockAccessory as PlatformAccessory);
      gpmAccessory.updateSpeed(2000);

      // Should use HomeKit minimum value when no active circuits
      expect(mockService.updateCharacteristic).toHaveBeenCalledWith('CurrentAmbientLightLevel', 0.0001);
    });

    it('should handle feature context for circuit status detection', () => {
      const pumpCircuits: PumpCircuit[] = [
        {
          id: 'PC01',
          pump: {} as Pump,
          circuitId: 'FEATURE01',
          speed: 1800,
          speedType: 'RPM',
        },
      ];

      mockAccessory.context!.pump.circuits = pumpCircuits;

      // Mock feature accessory
      const mockFeatureAccessory = {
        context: {
          feature: {
            id: 'FEATURE01',
            status: CircuitStatus.On,
          },
        },
      };

      (mockPlatform.accessoryMap as Map<string, any>).set('feature-uuid', mockFeatureAccessory);

      const gpmAccessory = new PumpGpmAccessory(mockPlatform as PentairPlatform, mockAccessory as PlatformAccessory);
      gpmAccessory.updateSpeed(2000);

      // Should use the feature's status for calculation
      expect(mockService.updateCharacteristic).toHaveBeenCalled();
    });

    it('should handle body context for circuit status detection', () => {
      const pumpCircuits: PumpCircuit[] = [
        {
          id: 'PC01',
          pump: {} as Pump,
          circuitId: 'BODY01',
          speed: 2000,
          speedType: 'RPM',
        },
      ];

      mockAccessory.context!.pump.circuits = pumpCircuits;

      // Mock body accessory
      const mockBodyAccessory = {
        context: {
          body: {
            circuit: { id: 'BODY01' },
            status: CircuitStatus.On,
          },
        },
      };

      (mockPlatform.accessoryMap as Map<string, any>).set('body-uuid', mockBodyAccessory);

      const gpmAccessory = new PumpGpmAccessory(mockPlatform as PentairPlatform, mockAccessory as PlatformAccessory);
      gpmAccessory.updateSpeed(2000);

      expect(mockLogger.debug).toHaveBeenCalledWith(expect.stringContaining('Found body circuit BODY01'));
    });

    it('should detect heater circuits starting with X', () => {
      const pumpCircuits: PumpCircuit[] = [
        {
          id: 'PC01',
          pump: {} as Pump,
          circuitId: 'X0051', // Heater circuit
          speed: 1800,
          speedType: 'RPM',
        },
      ];

      mockAccessory.context!.pump.circuits = pumpCircuits;

      // Mock body with active heater
      const mockBodyAccessory = {
        context: {
          body: {
            name: 'Pool',
            status: CircuitStatus.On,
            heaterId: 'HTR01',
            temperature: '75',
            lowTemperature: '80', // Set point higher than current temp
          },
        },
      };

      (mockPlatform.accessoryMap as Map<string, any>).set('body-uuid', mockBodyAccessory);

      const gpmAccessory = new PumpGpmAccessory(mockPlatform as PentairPlatform, mockAccessory as PlatformAccessory);
      gpmAccessory.updateSpeed(2000);

      expect(mockLogger.debug).toHaveBeenCalledWith(expect.stringContaining('Circuit X0051 appears to be internal heater circuit'));
    });

    it('should handle inactive heater circuits', () => {
      const pumpCircuits: PumpCircuit[] = [
        {
          id: 'PC01',
          pump: {} as Pump,
          circuitId: 'X0051',
          speed: 1800,
          speedType: 'RPM',
        },
      ];

      mockAccessory.context!.pump.circuits = pumpCircuits;

      // Mock body with heater not calling for heat
      const mockBodyAccessory = {
        context: {
          body: {
            name: 'Pool',
            status: CircuitStatus.On,
            heaterId: 'HTR01',
            temperature: '80',
            lowTemperature: '75', // Set point lower than current temp
          },
        },
      };

      (mockPlatform.accessoryMap as Map<string, any>).set('body-uuid', mockBodyAccessory);

      const gpmAccessory = new PumpGpmAccessory(mockPlatform as PentairPlatform, mockAccessory as PlatformAccessory);
      gpmAccessory.updateSpeed(2000);

      expect(mockLogger.debug).toHaveBeenCalledWith(expect.stringContaining('No actively heating heaters found'));
    });

    it('should handle heater circuit with no heater ID', () => {
      const pumpCircuits: PumpCircuit[] = [
        {
          id: 'PC01',
          pump: {} as Pump,
          circuitId: 'X0051',
          speed: 1800,
          speedType: 'RPM',
        },
      ];

      mockAccessory.context!.pump.circuits = pumpCircuits;

      // Mock body with no heater
      const mockBodyAccessory = {
        context: {
          body: {
            name: 'Pool',
            status: CircuitStatus.On,
            heaterId: '00000', // No heater assigned
          },
        },
      };

      (mockPlatform.accessoryMap as Map<string, any>).set('body-uuid', mockBodyAccessory);

      const gpmAccessory = new PumpGpmAccessory(mockPlatform as PentairPlatform, mockAccessory as PlatformAccessory);
      gpmAccessory.updateSpeed(2000);

      expect(mockLogger.debug).toHaveBeenCalledWith(expect.stringContaining('No actively heating heaters found'));
    });

    it('should handle circuit not found in accessories', () => {
      const pumpCircuits: PumpCircuit[] = [
        {
          id: 'PC01',
          pump: {} as Pump,
          circuitId: 'UNKNOWN_CIRCUIT',
          speed: 1800,
          speedType: 'RPM',
        },
      ];

      mockAccessory.context!.pump.circuits = pumpCircuits;

      const gpmAccessory = new PumpGpmAccessory(mockPlatform as PentairPlatform, mockAccessory as PlatformAccessory);
      gpmAccessory.updateSpeed(2000);

      expect(mockLogger.debug).toHaveBeenCalledWith(expect.stringContaining('Circuit UNKNOWN_CIRCUIT not found in accessories'));
    });
  });

  describe('PumpRpmAccessory Advanced Cases', () => {
    it('should handle unknown pump type and use fallback calculation', () => {
      const unknownPump: Pump = {
        ...mockAccessory.context!.pump,
        type: 'UNKNOWN_TYPE' as any,
      };

      mockAccessory.context!.pump = unknownPump;
      mockAccessory.context!.pump.circuits = [
        {
          id: 'PC01',
          pump: {} as Pump,
          circuitId: 'CIR01',
          speed: 1800,
          speedType: 'RPM',
        },
      ];

      // Mock inactive circuits
      (mockPlatform.accessoryMap as Map<string, any>).clear();

      const rpmAccessory = new PumpRpmAccessory(mockPlatform as PentairPlatform, mockAccessory as PlatformAccessory);
      rpmAccessory.updateRpm(2000);

      // Should use provided RPM value
      expect(mockService.updateCharacteristic).toHaveBeenCalledWith('CurrentAmbientLightLevel', 2000);
    });

    it('should handle pump circuits and feature context detection', () => {
      const pumpCircuits: PumpCircuit[] = [
        {
          id: 'PC01',
          pump: {} as Pump,
          circuitId: 'FEATURE01',
          speed: 1800,
          speedType: 'RPM',
        },
      ];

      mockAccessory.context!.pump.circuits = pumpCircuits;

      // Add feature context to accessory
      mockAccessory.context!.feature = {
        id: 'FEATURE01',
        status: CircuitStatus.On,
      };

      const rpmAccessory = new PumpRpmAccessory(mockPlatform as PentairPlatform, mockAccessory as PlatformAccessory);
      rpmAccessory.updateRpm(2000);

      expect(mockService.updateCharacteristic).toHaveBeenCalled();
    });
  });

  describe('PumpWattsAccessory Advanced Cases', () => {
    it('should handle unknown pump type and use fallback calculation', () => {
      const unknownPump: Pump = {
        ...mockAccessory.context!.pump,
        type: 'UNKNOWN_TYPE' as any,
      };

      mockAccessory.context!.pump = unknownPump;
      mockAccessory.context!.pump.circuits = [
        {
          id: 'PC01',
          pump: {} as Pump,
          circuitId: 'CIR01',
          speed: 1800,
          speedType: 'RPM',
        },
      ];

      // Mock inactive circuits
      (mockPlatform.accessoryMap as Map<string, any>).clear();

      const wattsAccessory = new PumpWattsAccessory(mockPlatform as PentairPlatform, mockAccessory as PlatformAccessory);
      wattsAccessory.updateSpeed(2000);

      // Should use HomeKit minimum value when no active circuits
      expect(mockService.updateCharacteristic).toHaveBeenCalledWith('CurrentAmbientLightLevel', 0.0001);
    });

    it('should handle pump with no circuits', () => {
      mockAccessory.context!.pump.circuits = [];

      const wattsAccessory = new PumpWattsAccessory(mockPlatform as PentairPlatform, mockAccessory as PlatformAccessory);
      wattsAccessory.updateSpeed(2000);

      expect(mockService.updateCharacteristic).toHaveBeenCalledWith(
        'CurrentAmbientLightLevel',
        0.0001, // HomeKit minimum value
      );
    });

    it('should handle VF pump type with flow calculation', () => {
      const vfPump: Pump = {
        ...mockAccessory.context!.pump,
        type: 'VF' as any,
      };

      mockAccessory.context!.pump = vfPump;

      const wattsAccessory = new PumpWattsAccessory(mockPlatform as PentairPlatform, mockAccessory as PlatformAccessory);
      wattsAccessory.updateSpeed(2000);

      expect(mockService.updateCharacteristic).toHaveBeenCalled();
    });

    it('should handle VSF pump type with flow calculation', () => {
      const vsfPump: Pump = {
        ...mockAccessory.context!.pump,
        type: 'VSF' as any,
      };

      mockAccessory.context!.pump = vsfPump;

      const wattsAccessory = new PumpWattsAccessory(mockPlatform as PentairPlatform, mockAccessory as PlatformAccessory);
      wattsAccessory.updateSpeed(2000);

      expect(mockService.updateCharacteristic).toHaveBeenCalled();
    });

    it('should handle speed below minimum RPM', () => {
      const wattsAccessory = new PumpWattsAccessory(mockPlatform as PentairPlatform, mockAccessory as PlatformAccessory);
      wattsAccessory.updateSpeed(400); // Below 450 RPM minimum

      expect(mockService.updateCharacteristic).toHaveBeenCalledWith(
        'CurrentAmbientLightLevel',
        0.0001, // HomeKit minimum value
      );
    });

    it('should calculate watts for high RPM values', () => {
      // Setup pump with active circuit
      mockAccessory.context!.pump.circuits = [
        {
          id: 'PC01',
          pump: {} as Pump,
          circuitId: 'CIR01',
          speed: 3400,
          speedType: 'RPM',
        },
      ];

      // Mock active circuit
      const mockCircuitAccessory = {
        context: {
          circuit: {
            id: 'CIR01',
            status: CircuitStatus.On,
          },
        },
      };
      (mockPlatform.accessoryMap as Map<string, any>).set('circuit-uuid', mockCircuitAccessory);

      const wattsAccessory = new PumpWattsAccessory(mockPlatform as PentairPlatform, mockAccessory as PlatformAccessory);
      wattsAccessory.updateSpeed(3400); // High RPM

      expect(mockService.updateCharacteristic).toHaveBeenCalled();
      const calledWith = (mockService.updateCharacteristic as jest.Mock).mock.calls[0];
      expect(calledWith[1]).toBeGreaterThan(0.0001); // Should calculate some watts
    });

    it('should handle flow-based pumps with proper conversion', () => {
      const vfPump: Pump = {
        ...mockAccessory.context!.pump,
        type: 'VF' as any,
      };

      mockAccessory.context!.pump = vfPump;

      const wattsAccessory = new PumpWattsAccessory(mockPlatform as PentairPlatform, mockAccessory as PlatformAccessory);

      // Test with flow value instead of RPM
      wattsAccessory.updateSpeed(50); // 50 GPM

      expect(mockService.updateCharacteristic).toHaveBeenCalled();
    });
  });

  describe('Edge Cases for All Pump Accessories', () => {
    it('should handle accessory with missing pump context', () => {
      mockAccessory.context = {};

      expect(() => {
        new PumpGpmAccessory(mockPlatform as PentairPlatform, mockAccessory as PlatformAccessory);
      }).toThrow();
    });

    it('should handle null platform or accessory', () => {
      expect(() => {
        new PumpGpmAccessory(null as any, mockAccessory as PlatformAccessory);
      }).toThrow();

      expect(() => {
        new PumpGpmAccessory(mockPlatform as PentairPlatform, null as any);
      }).toThrow();
    });

    it('should handle update with NaN or negative values', () => {
      const gpmAccessory = new PumpGpmAccessory(mockPlatform as PentairPlatform, mockAccessory as PlatformAccessory);

      gpmAccessory.updateSpeed(NaN);
      expect(mockService.updateCharacteristic).toHaveBeenCalledWith('CurrentAmbientLightLevel', 0.0001);

      gpmAccessory.updateSpeed(-100);
      expect(mockService.updateCharacteristic).toHaveBeenCalledWith('CurrentAmbientLightLevel', 0.0001);
    });
  });
});
