import { PentairPlatform } from '../../src/platform';
import { PlatformConfig } from 'homebridge';
import { createMockLogger, createMockAPI } from './testHelpers';
import { Telnet } from 'telnet-client';
import { CircuitStatus, PumpCircuit, Pump } from '../../src/types';

jest.mock('telnet-client');

// Mock classes for internal components
class MockTelnetClient {
  connect = jest.fn();
  on = jest.fn();
  removeAllListeners = jest.fn();
  destroy = jest.fn();
}

describe('PentairPlatform Pump Sensor Orchestration Tests', () => {
  let platform: PentairPlatform;
  let mockLogger: any;
  let mockTelnetClient: MockTelnetClient;

  const validConfig: PlatformConfig = {
    name: 'Pentair IntelliCenter',
    platform: 'PentairIntelliCenter',
    ipAddress: '192.168.1.100',
    username: 'admin',
    password: 'password123',
    temperatureUnits: 'F',
    enableVSP: true,
  };

  beforeEach(() => {
    jest.clearAllMocks();

    mockTelnetClient = new MockTelnetClient();
    (Telnet as any).mockImplementation(() => mockTelnetClient);

    mockLogger = createMockLogger();

    const mockAPI = createMockAPI();
    platform = new PentairPlatform(mockLogger as any, validConfig as any, mockAPI);

    (platform as any).connection = mockTelnetClient;
  });

  afterEach(async () => {
    // Clean up platform properly to prevent timer leaks
    await platform.cleanup();
  });

  describe('handlePumpCircuitUpdate', () => {
    beforeEach(() => {
      // Setup pump-circuit mapping
      (platform as any).pumpIdToCircuitMap.set('PC_1', { id: 'CIRCUIT_1', name: 'Pool Pump' });
      (platform as any).pumpToCircuitsMap.set('PUMP_1', new Set(['CIRCUIT_1']));
      (platform as any).pumpCircuitToPumpMap.set('PC_1', 'PUMP_1');

      // Create mock accessory
      const mockAccessory = {
        UUID: 'mock-uuid',
        context: { circuit: { id: 'CIRCUIT_1' } },
        updateCharacteristic: jest.fn(),
      };
      (platform as any).accessoryMap.set('mock-uuid', mockAccessory);

      // Mock updatePump method
      (platform as any).updatePump = jest.fn();
      (platform as any).logPumpCircuitUpdate = jest.fn();
    });

    it('should handle pump circuit update successfully', () => {
      const change = {
        objnam: 'PC_1',
        params: { STATUS: 'On', SPEED: '1500', RPM: '1500', GPM: '50', WATTS: '800' },
      };

      const result = (platform as any).handlePumpCircuitUpdate(change);

      expect(result).toBe(true);
      expect((platform as any).logPumpCircuitUpdate).toHaveBeenCalledWith('PC_1', 'CIRCUIT_1', 'PUMP_1', change.params);
      expect((platform as any).updatePump).toHaveBeenCalled();
    });

    it('should return false for unknown pump circuit', () => {
      const change = {
        objnam: 'PC_UNKNOWN',
        params: { STATUS: 'On' },
      };

      const result = (platform as any).handlePumpCircuitUpdate(change);

      expect(result).toBe(false);
      expect((platform as any).logPumpCircuitUpdate).not.toHaveBeenCalled();
      expect((platform as any).updatePump).not.toHaveBeenCalled();
    });
  });

  describe('handleStandalonePumpUpdate', () => {
    beforeEach(() => {
      // Setup pump circuit data for standalone pump testing
      (platform as any).pumpCircuitToPumpMap.set('PC_1', 'PUMP_1');
      (platform as any).activePumpCircuits.set('PC_1', {
        id: 'PC_1',
        name: 'Pump Circuit',
        circuitId: 'CIRCUIT_1',
        speed1: 1500,
        speed2: 2000,
        speed3: 2500,
        speed4: 3000,
      });

      // Mock methods
      (platform as any).logStandalonePumpUpdate = jest.fn();
      (platform as any).updatePumpObjectCircuits = jest.fn();
      (platform as any).updateAllPumpSensorsForChangedCircuit = jest.fn();
    });

    it('should handle standalone pump update successfully', () => {
      const change = {
        objnam: 'PC_1',
        params: { STATUS: 'On', SPEED: '2000', SELECT: 'Speed1', CIRCUIT: 'CIRCUIT_1' },
      };

      const result = (platform as any).handleStandalonePumpUpdate(change);

      expect(result).toBe(true);
      expect((platform as any).logStandalonePumpUpdate).toHaveBeenCalledWith('PC_1', 'PUMP_1', change.params);
      expect((platform as any).updatePumpObjectCircuits).toHaveBeenCalledWith('PUMP_1', 'PC_1', 2000);
      expect((platform as any).updateAllPumpSensorsForChangedCircuit).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'PC_1',
          speed: 2000,
          speedType: 'Speed1',
          circuitId: 'CIRCUIT_1',
        }),
      );
    });

    it('should return false for missing SPEED or SELECT parameters', () => {
      const change = {
        objnam: 'PC_1',
        params: { STATUS: 'On' }, // Missing SPEED and SELECT
      };

      const result = (platform as any).handleStandalonePumpUpdate(change);

      expect(result).toBe(false);
      expect((platform as any).logStandalonePumpUpdate).not.toHaveBeenCalled();
      expect((platform as any).updatePumpObjectCircuits).not.toHaveBeenCalled();
    });
  });

  describe('updatePumpSensors', () => {
    beforeEach(() => {
      // Setup pump mapping
      (platform as any).pumpCircuitToPumpMap.set('PC_1', 'PUMP_1');

      // Mock methods called by updatePumpSensors
      (platform as any).updatePumpSensorsWithRpm = jest.fn();
      (platform as any).updateAccessory = jest.fn();
    });

    it('should update pump sensors for pump circuit', () => {
      // Mock getHighestRpmForPump to return a specific value
      (platform as any).getHighestRpmForPump = jest.fn().mockReturnValue(1500);

      const pumpCircuit = {
        id: 'PC_1',
        name: 'Pool Pump Circuit',
        status: 'On',
        rpm: 1500,
        speed: 1500,
        speedType: 'RPM',
        watts: 1200,
        gpm: 50,
        circuitId: 'CIRCUIT_1',
        pump: {} as any,
      };

      (platform as any).updatePumpSensors(pumpCircuit);

      expect((platform as any).activePumpCircuits.get('PC_1')).toEqual(pumpCircuit);
      expect((platform as any).getHighestRpmForPump).toHaveBeenCalledWith('PUMP_1');
      expect((platform as any).updatePumpSensorsWithRpm).toHaveBeenCalledWith('PUMP_1', 1500);
    });

    it('should handle missing pump mapping gracefully', () => {
      const pumpCircuit = {
        id: 'PC_UNKNOWN',
        name: 'Unknown Pump Circuit',
        status: 'On',
        rpm: 1500,
        speed: 1500,
        speedType: 'RPM',
        watts: 1200,
        gpm: 50,
        circuitId: 'CIRCUIT_1',
        pump: {} as any,
      };

      expect(() => {
        (platform as any).updatePumpSensors(pumpCircuit);
      }).not.toThrow();

      expect((platform as any).activePumpCircuits.get('PC_UNKNOWN')).toEqual(pumpCircuit);
      expect((platform as any).updatePumpSensorsWithRpm).not.toHaveBeenCalled();
    });

    it('should handle zero RPM correctly', () => {
      const pumpCircuit = {
        id: 'PC_1',
        name: 'Pool Pump Circuit',
        status: 'Off',
        rpm: 0,
        speed: 0,
        speedType: 'RPM',
        watts: 0,
        gpm: 0,
        circuitId: 'CIRCUIT_1',
        pump: {} as any,
      };

      (platform as any).updatePumpSensors(pumpCircuit);

      expect((platform as any).activePumpCircuits.get('PC_1')).toEqual(pumpCircuit);
      expect((platform as any).updatePumpSensorsWithRpm).toHaveBeenCalledWith('PUMP_1', 0.0001); // Special handling for zero RPM
    });
  });

  describe('updateAllPumpSensorsForChangedCircuit', () => {
    beforeEach(() => {
      // Mock the API structure
      (platform as any).api = {
        hap: {
          uuid: {
            generate: jest.fn().mockImplementation(id => `uuid-${id}`),
          },
        },
      };

      // Mock getPumpForPumpCircuit method
      (platform as any).getPumpForPumpCircuit = jest.fn().mockReturnValue('PUMP_1');
    });

    it('should update all pump sensors for changed circuit', async () => {
      const pumpCircuit: PumpCircuit = {
        id: 'PC_1',
        status: CircuitStatus.On,
        rpm: 1500,
        speed: 1500,
        speedType: 'RPM',
        watts: 1200,
        gpm: 50,
        circuitId: 'CIRCUIT_1',
        pump: {
          id: 'PUMP_1',
          name: 'Test Pump',
          objectType: 'PUMP' as any,
          type: 'VS' as any,
          status: CircuitStatus.On,
          minRpm: 450,
          maxRpm: 3450,
          minFlow: 10,
          maxFlow: 140,
          circuits: [],
        } as Pump,
      };

      // This should not throw an error
      await (platform as any).updateAllPumpSensorsForChangedCircuit(pumpCircuit);

      expect((platform as any).getPumpForPumpCircuit).toHaveBeenCalledWith('PC_1');
    });

    it('should handle pump circuit with no associated pump', async () => {
      const pumpCircuit: PumpCircuit = {
        id: 'PC_UNKNOWN',
        status: CircuitStatus.On,
        rpm: 1500,
        speed: 1500,
        speedType: 'RPM',
        watts: 1200,
        gpm: 50,
        circuitId: 'CIRCUIT_UNKNOWN',
        pump: {
          id: 'PUMP_UNKNOWN',
          name: 'Unknown Pump',
          objectType: 'PUMP' as any,
          type: 'VS' as any,
          status: CircuitStatus.On,
          minRpm: 450,
          maxRpm: 3450,
          minFlow: 10,
          maxFlow: 140,
          circuits: [],
        } as Pump,
      };

      // Mock no pump found
      (platform as any).getPumpForPumpCircuit = jest.fn().mockReturnValue(null);

      await (platform as any).updateAllPumpSensorsForChangedCircuit(pumpCircuit);

      expect((platform as any).getPumpForPumpCircuit).toHaveBeenCalledWith('PC_UNKNOWN');
    });

    it('should handle pump circuit with valid pump', async () => {
      const pumpCircuit: PumpCircuit = {
        id: 'PC_2',
        status: CircuitStatus.On,
        rpm: 2000,
        speed: 2000,
        speedType: 'RPM',
        watts: 1500,
        gpm: 60,
        circuitId: 'CIRCUIT_2',
        pump: {
          id: 'PUMP_2',
          name: 'Spa Pump',
          objectType: 'PUMP' as any,
          type: 'VF' as any,
          status: CircuitStatus.On,
          minRpm: 450,
          maxRpm: 3450,
          minFlow: 10,
          maxFlow: 140,
          circuits: [],
        } as Pump,
      };

      (platform as any).getPumpForPumpCircuit = jest.fn().mockReturnValue('PUMP_2');

      await (platform as any).updateAllPumpSensorsForChangedCircuit(pumpCircuit);

      expect((platform as any).getPumpForPumpCircuit).toHaveBeenCalledWith('PC_2');
    });
  });

  describe('getHighestRpmForPump', () => {
    beforeEach(() => {
      // Setup pump accessories in accessoryMap (which is how the real method works)
      const mockPumpAccessory = {
        context: {
          pump: {
            id: 'PUMP_1',
            name: 'Test Pump',
            objectType: 'PUMP' as any,
            type: 'VS' as any,
            status: CircuitStatus.On,
            minRpm: 450,
            maxRpm: 3450,
            minFlow: 10,
            maxFlow: 140,
            circuits: [
              {
                id: 'PC_1',
                rpm: 1500,
                speed: 1500,
                circuitId: 'CIRCUIT_1',
              },
              {
                id: 'PC_2',
                rpm: 2000,
                speed: 2000,
                circuitId: 'CIRCUIT_2',
              },
            ],
          },
        },
      };

      (platform as any).accessoryMap.set('pump-uuid', mockPumpAccessory);

      // Mock isPumpCircuitActive method
      (platform as any).isPumpCircuitActive = jest.fn();
    });

    it('should return highest RPM from active pump circuits', () => {
      (platform as any).isPumpCircuitActive.mockReturnValue(true);

      const result = (platform as any).getHighestRpmForPump('PUMP_1');

      expect(result).toBe(2000);
      expect((platform as any).isPumpCircuitActive).toHaveBeenCalledWith('CIRCUIT_1');
      expect((platform as any).isPumpCircuitActive).toHaveBeenCalledWith('CIRCUIT_2');
    });

    it('should return null when no pump object found', () => {
      (platform as any).accessoryMap.clear();

      const result = (platform as any).getHighestRpmForPump('PUMP_UNKNOWN');

      expect(result).toBeNull();
    });

    it('should return null when pump has no circuits', () => {
      const mockPumpAccessory = {
        context: {
          pump: {
            id: 'PUMP_1',
            name: 'Test Pump',
            objectType: 'PUMP' as any,
            type: 'VS' as any,
            status: CircuitStatus.On,
            minRpm: 450,
            maxRpm: 3450,
            minFlow: 10,
            maxFlow: 140,
            circuits: [],
          },
        },
      };

      (platform as any).accessoryMap.set('pump-uuid', mockPumpAccessory);

      const result = (platform as any).getHighestRpmForPump('PUMP_1');

      expect(result).toBeNull();
    });

    it('should handle inactive pump circuits', () => {
      (platform as any).isPumpCircuitActive.mockReturnValue(false);

      const result = (platform as any).getHighestRpmForPump('PUMP_1');

      expect(result).toBeNull();
    });

    it('should handle mixed active states', () => {
      // Only second circuit is active
      (platform as any).isPumpCircuitActive.mockImplementation((circuitId: string) => {
        return circuitId === 'CIRCUIT_2';
      });

      const result = (platform as any).getHighestRpmForPump('PUMP_1');

      expect(result).toBe(2000);
    });

    it('should handle circuits with speed instead of rpm', () => {
      const mockPumpAccessory = {
        context: {
          pump: {
            id: 'PUMP_1',
            name: 'Test Pump',
            objectType: 'PUMP' as any,
            type: 'VS' as any,
            status: CircuitStatus.On,
            minRpm: 450,
            maxRpm: 3450,
            minFlow: 10,
            maxFlow: 140,
            circuits: [
              {
                id: 'PC_1',
                speed: 1800, // Using speed instead of rpm
                circuitId: 'CIRCUIT_1',
              },
            ],
          },
        },
      };

      (platform as any).accessoryMap.set('pump-uuid', mockPumpAccessory);
      (platform as any).isPumpCircuitActive.mockReturnValue(true);

      const result = (platform as any).getHighestRpmForPump('PUMP_1');

      expect(result).toBe(1800);
    });

    it('should handle zero RPM values', () => {
      const mockPumpAccessory = {
        context: {
          pump: {
            id: 'PUMP_1',
            name: 'Test Pump',
            objectType: 'PUMP' as any,
            type: 'VS' as any,
            status: CircuitStatus.On,
            minRpm: 450,
            maxRpm: 3450,
            minFlow: 10,
            maxFlow: 140,
            circuits: [
              {
                id: 'PC_1',
                rpm: 0,
                speed: 0,
                circuitId: 'CIRCUIT_1',
              },
              {
                id: 'PC_2',
                rpm: 1200,
                speed: 1200,
                circuitId: 'CIRCUIT_2',
              },
            ],
          },
        },
      };

      (platform as any).accessoryMap.set('pump-uuid', mockPumpAccessory);
      (platform as any).isPumpCircuitActive.mockReturnValue(true);

      const result = (platform as any).getHighestRpmForPump('PUMP_1');

      expect(result).toBe(1200);
    });
  });

  describe('isPumpCircuitActive', () => {
    beforeEach(() => {
      // Setup circuit accessories in accessoryMap
      const mockCircuit1 = {
        context: {
          circuit: {
            id: 'CIRCUIT_1',
            status: CircuitStatus.On,
          },
        },
      };
      const mockCircuit2 = {
        context: {
          circuit: {
            id: 'CIRCUIT_2',
            status: CircuitStatus.Off,
          },
        },
      };
      const mockFeature = {
        context: {
          feature: {
            id: 'FEATURE_1',
            status: CircuitStatus.On,
          },
        },
      };
      const mockBody = {
        context: {
          body: {
            circuit: { id: 'BODY_CIRCUIT_1' },
            status: CircuitStatus.On,
          },
        },
      };

      (platform as any).accessoryMap.set('uuid-1', mockCircuit1);
      (platform as any).accessoryMap.set('uuid-2', mockCircuit2);
      (platform as any).accessoryMap.set('uuid-3', mockFeature);
      (platform as any).accessoryMap.set('uuid-4', mockBody);
    });

    it('should return true when circuit is active', () => {
      const result = (platform as any).isPumpCircuitActive('CIRCUIT_1');
      expect(result).toBe(true);
    });

    it('should return false when circuit is inactive', () => {
      const result = (platform as any).isPumpCircuitActive('CIRCUIT_2');
      expect(result).toBe(false);
    });

    it('should return true when feature is active', () => {
      const result = (platform as any).isPumpCircuitActive('FEATURE_1');
      expect(result).toBe(true);
    });

    it('should return true when body circuit is active', () => {
      const result = (platform as any).isPumpCircuitActive('BODY_CIRCUIT_1');
      expect(result).toBe(true);
    });

    it('should return false when circuit not found', () => {
      const result = (platform as any).isPumpCircuitActive('CIRCUIT_UNKNOWN');
      expect(result).toBe(false);
    });
  });

  describe('updatePumpSensorsWithRpm', () => {
    beforeEach(() => {
      // Mock the API structure that's used by updatePumpSensorsWithRpm
      (platform as any).api = {
        hap: {
          uuid: {
            generate: jest.fn().mockImplementation(id => `uuid-${id}`),
          },
        },
      };
    });

    it('should handle pump with no sensors gracefully', () => {
      const pumpId = 'PUMP_NO_SENSORS';
      const rpm = 1500;

      expect(() => {
        (platform as any).updatePumpSensorsWithRpm(pumpId, rpm);
      }).not.toThrow();
    });

    it('should handle zero RPM values gracefully', () => {
      const pumpId = 'PUMP_1';
      const rpm = 0;

      expect(() => {
        (platform as any).updatePumpSensorsWithRpm(pumpId, rpm);
      }).not.toThrow();
    });

    it('should handle updatePumpSensorsWithRpm method without throwing', () => {
      expect(() => {
        (platform as any).updatePumpSensorsWithRpm('PUMP_1', 1500);
      }).not.toThrow();
    });
  });

  describe('updatePumpSensorsForStandalonePump', () => {
    it('should update standalone pump sensors with valid speed and speedType', () => {
      const pumpId = 'PUMP_1';
      const speed = '1500';
      const speedType = 'RPM';

      // This should not throw an error
      expect(() => {
        (platform as any).updatePumpSensorsForStandalonePump(pumpId, speed, speedType);
      }).not.toThrow();
    });

    it('should skip update with invalid speed', () => {
      const pumpId = 'PUMP_1';
      const speed = '0';
      const speedType = 'RPM';

      expect(() => {
        (platform as any).updatePumpSensorsForStandalonePump(pumpId, speed, speedType);
      }).not.toThrow();
    });

    it('should skip update with non-RPM speedType', () => {
      const pumpId = 'PUMP_1';
      const speed = '1500';
      const speedType = 'Speed1';

      expect(() => {
        (platform as any).updatePumpSensorsForStandalonePump(pumpId, speed, speedType);
      }).not.toThrow();
    });

    it('should handle invalid speed values', () => {
      const pumpId = 'PUMP_1';
      const speed = 'invalid';
      const speedType = 'RPM';

      expect(() => {
        (platform as any).updatePumpSensorsForStandalonePump(pumpId, speed, speedType);
      }).not.toThrow();
    });

    it('should handle empty speed values', () => {
      const pumpId = 'PUMP_1';
      const speed = '';
      const speedType = 'RPM';

      expect(() => {
        (platform as any).updatePumpSensorsForStandalonePump(pumpId, speed, speedType);
      }).not.toThrow();
    });
  });
});
