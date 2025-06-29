import { PentairPlatform } from '../../src/platform';
import { PlatformConfig } from 'homebridge';
import { createMockLogger, createMockAPI } from './testHelpers';
import { Telnet } from 'telnet-client';

jest.mock('telnet-client');

// Mock classes for internal components
class MockTelnetClient {
  connect = jest.fn();
  on = jest.fn();
  removeAllListeners = jest.fn();
  destroy = jest.fn();
}

// Create enums to match what's used in the codebase
enum PumpType {
  VS = 'VS',
  VF = 'VF',
  VSF = 'VSF',
}

enum SensorType {
  FEATURE_RPM = 'FEATURE_RPM',
  BODY_RPM = 'BODY_RPM',
  HEATER_RPM = 'HEATER_RPM',
  PUMP_GPM = 'PUMP_GPM',
  PUMP_RPM = 'PUMP_RPM',
  PUMP_WATTS = 'PUMP_WATTS',
  WATER_TEMP = 'WATER_TEMP',
  AIR_TEMP = 'AIR_TEMP',
}

describe.skip('PentairPlatform Device Discovery Tests', () => {
  let platform: PentairPlatform;
  let mockLogger: any;
  let mockTelnetClient: MockTelnetClient;
  const platformInstances: PentairPlatform[] = [];

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
    // Mock PlatformAccessory constructor
    (mockAPI.hap as any).PlatformAccessory = jest.fn().mockImplementation((name, uuid) => ({
      displayName: name,
      UUID: uuid,
      context: {},
      addService: jest.fn().mockReturnValue({
        setCharacteristic: jest.fn().mockReturnThis(),
        getCharacteristic: jest.fn().mockReturnValue({
          onGet: jest.fn().mockReturnThis(),
          onSet: jest.fn().mockReturnThis(),
          updateValue: jest.fn().mockReturnThis(),
        }),
        updateCharacteristic: jest.fn().mockReturnThis(),
      }),
      removeService: jest.fn(),
      getService: jest.fn().mockReturnValue({
        setCharacteristic: jest.fn().mockReturnThis(),
        getCharacteristic: jest.fn().mockReturnValue({
          onGet: jest.fn().mockReturnThis(),
          onSet: jest.fn().mockReturnThis(),
          updateValue: jest.fn().mockReturnThis(),
        }),
        updateCharacteristic: jest.fn().mockReturnThis(),
      }),
    }));
    // Also add to api directly for the platform code
    (mockAPI as any).platformAccessory = jest.fn().mockImplementation((name, uuid) => ({
      displayName: name,
      UUID: uuid,
      context: {},
      addService: jest.fn().mockReturnValue({
        setCharacteristic: jest.fn().mockReturnThis(),
        getCharacteristic: jest.fn().mockReturnValue({
          onGet: jest.fn().mockReturnThis(),
          onSet: jest.fn().mockReturnThis(),
          updateValue: jest.fn().mockReturnThis(),
        }),
        updateCharacteristic: jest.fn().mockReturnThis(),
      }),
      removeService: jest.fn(),
      getService: jest.fn().mockReturnValue({
        setCharacteristic: jest.fn().mockReturnThis(),
        getCharacteristic: jest.fn().mockReturnValue({
          onGet: jest.fn().mockReturnThis(),
          onSet: jest.fn().mockReturnThis(),
          updateValue: jest.fn().mockReturnThis(),
        }),
        updateCharacteristic: jest.fn().mockReturnThis(),
      }),
    }));
    // Use the correct method name
    mockAPI.registerPlatformAccessories = jest.fn();

    platform = new PentairPlatform(mockLogger as any, validConfig as any, mockAPI);
    platformInstances.push(platform);

    // Immediately clear the timer created in constructor to prevent leaks in tests
    if ((platform as any).heartbeatInterval) {
      clearInterval((platform as any).heartbeatInterval);
      (platform as any).heartbeatInterval = null;
    }

    (platform as any).connection = mockTelnetClient;

    // Initialize Maps that the tests expect
    (platform as any).pumps = new Map();
    (platform as any).bodies = new Map();
    (platform as any).sensors = new Map();
    (platform as any).pumpToCircuitsMap = new Map();
    (platform as any).circuitToPumpMap = new Map();
    (platform as any).pumpCircuitToPumpMap = new Map();
    (platform as any).pumpToPumpCircuitsMap = new Map();
    (platform as any).activePumpCircuits = new Map();
    (platform as any).pumpIdToCircuitMap = new Map();
    (platform as any).accessoryMap = new Map();
  });

  afterEach(async () => {
    // Clean up all platform instances to prevent timer leaks
    for (const p of platformInstances) {
      await p.cleanup();
    }
    platformInstances.length = 0;
  });

  describe('discoverFeatureRpmSensor', () => {
    beforeEach(() => {
      // Setup pump circuit mapping
      (platform as any).pumpCircuitToPumpMap.set('PC_1', 'PUMP_1');
      (platform as any).activePumpCircuits.set('PC_1', {
        id: 'PC_1',
        pumpId: 'PUMP_1',
        circuitId: 'C_001',
        rpm: 2000,
        watts: 800,
        gpm: 45,
      });
    });

    it('should discover and register new feature RPM sensor', () => {
      const panel = {
        id: 'PANEL_1',
        name: 'Main Panel',
        pumps: [
          {
            id: 'PUMP_1',
            name: 'Pool Pump',
            type: PumpType.VS,
            circuits: [],
          },
        ],
      };
      const feature = {
        id: 'FEATURE_1',
        name: 'Pool Light',
        objectType: 'FEATURE',
        pump: { id: 'PUMP_1' },
      };
      const pumpCircuit = {
        id: 'PC_1',
        pumpId: 'PUMP_1',
        circuitId: 'C_001',
        rpm: 2000,
        watts: 800,
        gpm: 45,
      };

      (platform as any).discoverFeatureRpmSensor(panel, feature, pumpCircuit);

      expect((platform as any).api.platformAccessory).toHaveBeenCalledWith('Pool Light RPM', 'mock-uuid');
      expect((platform as any).api.registerPlatformAccessories).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith('Registering new accessory: Pool Light RPM');
    });

    it('should restore existing feature RPM sensor from cache', () => {
      const panel = {
        id: 'PANEL_1',
        name: 'Main Panel',
        pumps: [
          {
            id: 'PUMP_1',
            name: 'Pool Pump',
            type: PumpType.VS,
            circuits: [],
          },
        ],
      };
      const feature = {
        id: 'FEATURE_1',
        name: 'Pool Light',
        objectType: 'FEATURE',
        pump: { id: 'PUMP_1' },
      };
      const pumpCircuit = {
        id: 'PC_1',
        pumpId: 'PUMP_1',
        circuitId: 'C_001',
        rpm: 2000,
        watts: 800,
        gpm: 45,
      };

      // Add existing accessory to cache
      const existingAccessory = {
        UUID: 'mock-uuid',
        context: { sensor: { type: SensorType.FEATURE_RPM } },
        displayName: 'Pool Light RPM',
      };
      (platform as any).accessoryMap.set('mock-uuid', existingAccessory);

      (platform as any).discoverFeatureRpmSensor(panel, feature, pumpCircuit);

      expect((platform as any).api.registerPlatformAccessories).not.toHaveBeenCalled();
      expect(mockLogger.debug).toHaveBeenCalledWith('Restoring existing accessory from cache: Pool Light RPM');
    });

    it('should handle feature without pump association', () => {
      const panel = { id: 'PANEL_1', name: 'Main Panel' };
      const feature = {
        id: 'FEATURE_NO_PUMP',
        name: 'Feature No Pump',
        objectType: 'FEATURE',
        // No pump property
      };
      const pumpCircuit = {
        id: 'PC_1',
        pumpId: 'PUMP_1',
        circuitId: 'C_001',
        rpm: 2000,
        watts: 800,
        gpm: 45,
      };

      (platform as any).discoverFeatureRpmSensor(panel, feature, pumpCircuit);

      expect((platform as any).api.registerPlatformAccessories).not.toHaveBeenCalled();
      expect(mockLogger.debug).not.toHaveBeenCalledWith(expect.stringContaining('Registering new accessory'));
    });

    it('should handle feature with missing pump in pumps map', () => {
      const panel = { id: 'PANEL_1', name: 'Main Panel' };
      const feature = {
        id: 'FEATURE_UNKNOWN_PUMP',
        name: 'Feature Unknown Pump',
        objectType: 'FEATURE',
        pump: { id: 'PUMP_UNKNOWN' },
      };
      const pumpCircuit = {
        id: 'PC_1',
        pumpId: 'PUMP_1',
        circuitId: 'C_001',
        rpm: 2000,
        watts: 800,
        gpm: 45,
      };

      (platform as any).discoverFeatureRpmSensor(panel, feature, pumpCircuit);

      expect((platform as any).api.registerPlatformAccessories).not.toHaveBeenCalled();
    });
  });

  describe('discoverBodyRpmSensor', () => {
    beforeEach(() => {
      // Setup pump data
      (platform as any).pumps.set('PUMP_1', {
        id: 'PUMP_1',
        name: 'Pool Pump',
        type: PumpType.VS,
        circuits: [],
      });
    });

    it('should discover and register new body RPM sensor for pool', () => {
      const body = {
        id: 'BODY_1',
        name: 'Pool',
        objectType: 'BODY',
        pump: { id: 'PUMP_1' },
      };

      (platform as any).discoverBodyRpmSensor(body);

      expect((platform as any).api.platformAccessory).toHaveBeenCalledWith('Pool Pump RPM', 'mock-uuid');
      expect((platform as any).api.registerPlatformAccessories).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith('Registering new accessory: Pool Pump RPM');
    });

    it('should discover and register new body RPM sensor for spa', () => {
      const body = {
        id: 'BODY_2',
        name: 'Spa',
        objectType: 'BODY',
        pump: { id: 'PUMP_1' },
      };

      (platform as any).discoverBodyRpmSensor(body);

      expect((platform as any).api.platformAccessory).toHaveBeenCalledWith('Spa Pump RPM', 'mock-uuid');
    });

    it('should restore existing body RPM sensor from cache', () => {
      const body = {
        id: 'BODY_1',
        name: 'Pool',
        objectType: 'BODY',
        pump: { id: 'PUMP_1' },
      };

      // Add existing accessory to cache
      const existingAccessory = {
        UUID: 'mock-uuid',
        context: { sensor: { type: SensorType.BODY_RPM } },
        displayName: 'Pool Pump RPM',
      };
      (platform as any).accessoryMap.set('mock-uuid', existingAccessory);

      (platform as any).discoverBodyRpmSensor(body);

      expect((platform as any).api.registerPlatformAccessories).not.toHaveBeenCalled();
      expect(mockLogger.debug).toHaveBeenCalledWith('Restoring existing accessory from cache: Pool Pump RPM');
    });

    it('should handle body without pump association', () => {
      const body = {
        id: 'BODY_NO_PUMP',
        name: 'Body No Pump',
        objectType: 'BODY',
        // No pump property
      };

      (platform as any).discoverBodyRpmSensor(body);

      expect((platform as any).api.registerPlatformAccessories).not.toHaveBeenCalled();
    });

    it('should handle body with unknown pump', () => {
      const body = {
        id: 'BODY_UNKNOWN_PUMP',
        name: 'Body Unknown Pump',
        objectType: 'BODY',
        pump: { id: 'PUMP_UNKNOWN' },
      };

      (platform as any).discoverBodyRpmSensor(body);

      expect((platform as any).api.registerPlatformAccessories).not.toHaveBeenCalled();
    });
  });

  describe('discoverHeaterRpmSensor', () => {
    beforeEach(() => {
      // Setup heater data
      const heater = {
        id: 'HEATER_1',
        name: 'Pool Heater',
        objectType: 'HEATER',
        bodyId: 'BODY_1',
      };

      (platform as any).heaters.set('heater-uuid', heater);

      // Setup body data
      const body = {
        id: 'BODY_1',
        name: 'Pool',
        objectType: 'BODY',
        pump: { id: 'PUMP_1' },
      };

      (platform as any).bodies.set('BODY_1', body);

      // Setup pump data
      (platform as any).pumps.set('PUMP_1', {
        id: 'PUMP_1',
        name: 'Pool Pump',
        type: PumpType.VS,
        circuits: [],
      });
    });

    it('should discover and register new heater RPM sensor', () => {
      const heater = {
        id: 'HEATER_1',
        name: 'Pool Heater',
        objectType: 'HEATER',
        bodyId: 'BODY_1',
      };

      (platform as any).discoverHeaterRpmSensor(heater);

      expect((platform as any).api.platformAccessory).toHaveBeenCalledWith('Pool Heater RPM', 'mock-uuid');
      expect((platform as any).api.registerPlatformAccessories).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith('Registering new accessory: Pool Heater RPM');
    });

    it('should restore existing heater RPM sensor from cache', () => {
      const heater = {
        id: 'HEATER_1',
        name: 'Pool Heater',
        objectType: 'HEATER',
        bodyId: 'BODY_1',
      };

      // Add existing accessory to cache
      const existingAccessory = {
        UUID: 'mock-uuid',
        context: { sensor: { type: SensorType.HEATER_RPM } },
        displayName: 'Pool Heater RPM',
      };
      (platform as any).accessoryMap.set('mock-uuid', existingAccessory);

      (platform as any).discoverHeaterRpmSensor(heater);

      expect((platform as any).api.registerPlatformAccessories).not.toHaveBeenCalled();
      expect(mockLogger.debug).toHaveBeenCalledWith('Restoring existing accessory from cache: Pool Heater RPM');
    });

    it('should handle heater without bodyId', () => {
      const heater = {
        id: 'HEATER_NO_BODY',
        name: 'Heater No Body',
        objectType: 'HEATER',
        // No bodyId property
      };

      (platform as any).discoverHeaterRpmSensor(heater);

      expect((platform as any).api.registerPlatformAccessories).not.toHaveBeenCalled();
    });

    it('should handle heater with unknown body', () => {
      const heater = {
        id: 'HEATER_UNKNOWN_BODY',
        name: 'Heater Unknown Body',
        objectType: 'HEATER',
        bodyId: 'BODY_UNKNOWN',
      };

      (platform as any).discoverHeaterRpmSensor(heater);

      expect((platform as any).api.registerPlatformAccessories).not.toHaveBeenCalled();
    });

    it('should handle body without pump association', () => {
      const heater = {
        id: 'HEATER_NO_PUMP_BODY',
        name: 'Heater No Pump Body',
        objectType: 'HEATER',
        bodyId: 'BODY_NO_PUMP',
      };

      // Setup body without pump
      const bodyNoPump = {
        id: 'BODY_NO_PUMP',
        name: 'Body No Pump',
        objectType: 'BODY',
        // No pump property
      };
      (platform as any).bodies.set('BODY_NO_PUMP', bodyNoPump);

      (platform as any).discoverHeaterRpmSensor(heater);

      expect((platform as any).api.registerPlatformAccessories).not.toHaveBeenCalled();
    });

    it('should handle body with unknown pump', () => {
      const heater = {
        id: 'HEATER_UNKNOWN_PUMP',
        name: 'Heater Unknown Pump',
        objectType: 'HEATER',
        bodyId: 'BODY_UNKNOWN_PUMP',
      };

      // Setup body with unknown pump
      const bodyUnknownPump = {
        id: 'BODY_UNKNOWN_PUMP',
        name: 'Body Unknown Pump',
        objectType: 'BODY',
        pump: { id: 'PUMP_UNKNOWN' },
      };
      (platform as any).bodies.set('BODY_UNKNOWN_PUMP', bodyUnknownPump);

      (platform as any).discoverHeaterRpmSensor(heater);

      expect((platform as any).api.registerPlatformAccessories).not.toHaveBeenCalled();
    });
  });

  describe('discoverPumpGpmSensor', () => {
    beforeEach(() => {
      // Setup pump data
      (platform as any).pumps.set('PUMP_VSF', {
        id: 'PUMP_VSF',
        name: 'VSF Pump',
        type: PumpType.VSF,
        circuits: [],
      });

      (platform as any).pumps.set('PUMP_VF', {
        id: 'PUMP_VF',
        name: 'VF Pump',
        type: PumpType.VF,
        circuits: [],
      });

      (platform as any).pumps.set('PUMP_VS', {
        id: 'PUMP_VS',
        name: 'VS Pump',
        type: PumpType.VS,
        circuits: [],
      });
    });

    it('should discover and register GPM sensor for VSF pump', () => {
      const pump = {
        id: 'PUMP_VSF',
        name: 'VSF Pump',
        type: PumpType.VSF,
        circuits: [],
      };

      (platform as any).discoverPumpGpmSensor(pump);

      expect((platform as any).api.platformAccessory).toHaveBeenCalledWith('VSF Pump GPM', 'mock-uuid');
      expect((platform as any).api.registerPlatformAccessories).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith('Registering new accessory: VSF Pump GPM');
    });

    it('should not register GPM sensor for VF pump', () => {
      const pump = {
        id: 'PUMP_VF',
        name: 'VF Pump',
        type: PumpType.VF,
        circuits: [],
      };

      (platform as any).discoverPumpGpmSensor(pump);

      expect((platform as any).api.registerPlatformAccessories).not.toHaveBeenCalled();
    });

    it('should not register GPM sensor for VS pump', () => {
      const pump = {
        id: 'PUMP_VS',
        name: 'VS Pump',
        type: PumpType.VS,
        circuits: [],
      };

      (platform as any).discoverPumpGpmSensor(pump);

      expect((platform as any).api.registerPlatformAccessories).not.toHaveBeenCalled();
    });

    it('should restore existing GPM sensor from cache', () => {
      const pump = {
        id: 'PUMP_VSF',
        name: 'VSF Pump',
        type: PumpType.VSF,
        circuits: [],
      };

      // Add existing accessory to cache
      const existingAccessory = {
        UUID: 'mock-uuid',
        context: { sensor: { type: SensorType.PUMP_GPM } },
        displayName: 'VSF Pump GPM',
      };
      (platform as any).accessoryMap.set('mock-uuid', existingAccessory);

      (platform as any).discoverPumpGpmSensor(pump);

      expect((platform as any).api.registerPlatformAccessories).not.toHaveBeenCalled();
      expect(mockLogger.debug).toHaveBeenCalledWith('Restoring existing accessory from cache: VSF Pump GPM');
    });

    it('should handle pump not found in pumps map', () => {
      const pump = {
        id: 'PUMP_UNKNOWN',
        name: 'Unknown Pump',
        type: PumpType.VSF,
        circuits: [],
      };

      (platform as any).discoverPumpGpmSensor(pump);

      expect((platform as any).api.registerPlatformAccessories).not.toHaveBeenCalled();
    });

    it('should handle undefined pump type', () => {
      const pump = {
        id: 'PUMP_NO_TYPE',
        name: 'No Type Pump',
        circuits: [],
        // No type property
      };

      (platform as any).pumps.set('PUMP_NO_TYPE', pump);

      (platform as any).discoverPumpGpmSensor(pump);

      expect((platform as any).api.registerPlatformAccessories).not.toHaveBeenCalled();
    });
  });

  describe('discoverPumpRpmSensor', () => {
    beforeEach(() => {
      // Setup pump data
      (platform as any).pumps.set('PUMP_1', {
        id: 'PUMP_1',
        name: 'Test Pump',
        type: PumpType.VS,
        circuits: [],
      });
    });

    it('should discover and register new pump RPM sensor', () => {
      const pump = {
        id: 'PUMP_1',
        name: 'Test Pump',
        type: PumpType.VS,
        circuits: [],
      };

      (platform as any).discoverPumpRpmSensor(pump);

      expect((platform as any).api.platformAccessory).toHaveBeenCalledWith('Test Pump RPM', 'mock-uuid');
      expect((platform as any).api.registerPlatformAccessories).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith('Registering new accessory: Test Pump RPM');
    });

    it('should restore existing pump RPM sensor from cache', () => {
      const pump = {
        id: 'PUMP_1',
        name: 'Test Pump',
        type: PumpType.VS,
        circuits: [],
      };

      // Add existing accessory to cache
      const existingAccessory = {
        UUID: 'mock-uuid',
        context: { sensor: { type: SensorType.PUMP_RPM } },
        displayName: 'Test Pump RPM',
      };
      (platform as any).accessoryMap.set('mock-uuid', existingAccessory);

      (platform as any).discoverPumpRpmSensor(pump);

      expect((platform as any).api.registerPlatformAccessories).not.toHaveBeenCalled();
      expect(mockLogger.debug).toHaveBeenCalledWith('Restoring existing accessory from cache: Test Pump RPM');
    });

    it('should handle pump not found in pumps map', () => {
      const pump = {
        id: 'PUMP_UNKNOWN',
        name: 'Unknown Pump',
        type: PumpType.VS,
        circuits: [],
      };

      (platform as any).discoverPumpRpmSensor(pump);

      expect((platform as any).api.registerPlatformAccessories).not.toHaveBeenCalled();
    });
  });

  describe('discoverPumpWattsSensor', () => {
    beforeEach(() => {
      // Setup pump data
      (platform as any).pumps.set('PUMP_1', {
        id: 'PUMP_1',
        name: 'Test Pump',
        type: PumpType.VS,
        circuits: [],
      });
    });

    it('should discover and register new pump WATTS sensor', () => {
      const pump = {
        id: 'PUMP_1',
        name: 'Test Pump',
        type: PumpType.VS,
        circuits: [],
      };

      (platform as any).discoverPumpWattsSensor(pump);

      expect((platform as any).api.platformAccessory).toHaveBeenCalledWith('Test Pump WATTS', 'mock-uuid');
      expect((platform as any).api.registerPlatformAccessories).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith('Registering new accessory: Test Pump WATTS');
    });

    it('should restore existing pump WATTS sensor from cache', () => {
      const pump = {
        id: 'PUMP_1',
        name: 'Test Pump',
        type: PumpType.VS,
        circuits: [],
      };

      // Add existing accessory to cache
      const existingAccessory = {
        UUID: 'mock-uuid',
        context: { sensor: { type: SensorType.PUMP_WATTS } },
        displayName: 'Test Pump WATTS',
      };
      (platform as any).accessoryMap.set('mock-uuid', existingAccessory);

      (platform as any).discoverPumpWattsSensor(pump);

      expect((platform as any).api.registerPlatformAccessories).not.toHaveBeenCalled();
      expect(mockLogger.debug).toHaveBeenCalledWith('Restoring existing accessory from cache: Test Pump WATTS');
    });

    it('should handle pump not found in pumps map', () => {
      const pump = {
        id: 'PUMP_UNKNOWN',
        name: 'Unknown Pump',
        type: PumpType.VS,
        circuits: [],
      };

      (platform as any).discoverPumpWattsSensor(pump);

      expect((platform as any).api.registerPlatformAccessories).not.toHaveBeenCalled();
    });
  });

  describe('discoverTemperatureSensor', () => {
    beforeEach(() => {
      // Setup heater data
      (platform as any).heaters.set('heater-uuid', {
        id: 'HEATER_1',
        name: 'Pool Heater',
        bodyId: 'BODY_1',
      });
    });

    it('should discover and register water temperature sensor when no heater exists', () => {
      // Clear heaters to simulate no heater scenario
      (platform as any).heaters.clear();

      const sensor = {
        id: 'SENSOR_1',
        name: 'Water Temperature',
        objectType: 'WATERSENSOR',
        bodyId: 'BODY_1',
      };

      (platform as any).discoverTemperatureSensor(sensor);

      expect((platform as any).api.platformAccessory).toHaveBeenCalledWith('Water Temperature', 'mock-uuid');
      expect((platform as any).api.registerPlatformAccessories).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith('Registering new accessory: Water Temperature');
    });

    it('should skip water temperature sensor when heater exists for same body', () => {
      const sensor = {
        id: 'SENSOR_1',
        name: 'Water Temperature',
        objectType: 'WATERSENSOR',
        bodyId: 'BODY_1',
      };

      (platform as any).discoverTemperatureSensor(sensor);

      expect((platform as any).api.registerPlatformAccessories).not.toHaveBeenCalled();
      expect(mockLogger.debug).toHaveBeenCalledWith('Skipping water temperature sensor Water Temperature: heater exists for this body');
    });

    it('should discover air temperature sensor regardless of heater existence', () => {
      const sensor = {
        id: 'SENSOR_AIR',
        name: 'Air Temperature',
        objectType: 'AIRSENSOR',
      };

      (platform as any).discoverTemperatureSensor(sensor);

      expect((platform as any).api.platformAccessory).toHaveBeenCalledWith('Air Temperature', 'mock-uuid');
      expect((platform as any).api.registerPlatformAccessories).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith('Registering new accessory: Air Temperature');
    });

    it('should discover solar temperature sensor', () => {
      const sensor = {
        id: 'SENSOR_SOLAR',
        name: 'Solar Temperature',
        objectType: 'SOLARSENSOR',
      };

      (platform as any).discoverTemperatureSensor(sensor);

      expect((platform as any).api.platformAccessory).toHaveBeenCalledWith('Solar Temperature', 'mock-uuid');
      expect((platform as any).api.registerPlatformAccessories).toHaveBeenCalled();
    });

    it('should discover water temperature sensor for different body than heater', () => {
      const sensor = {
        id: 'SENSOR_SPA',
        name: 'Spa Temperature',
        objectType: 'WATERSENSOR',
        bodyId: 'BODY_2', // Different from heater's BODY_1
      };

      (platform as any).discoverTemperatureSensor(sensor);

      expect((platform as any).api.platformAccessory).toHaveBeenCalledWith('Spa Temperature', 'mock-uuid');
      expect((platform as any).api.registerPlatformAccessories).toHaveBeenCalled();
    });

    it('should restore existing temperature sensor from cache', () => {
      // Clear heaters for this test
      (platform as any).heaters.clear();

      const sensor = {
        id: 'SENSOR_1',
        name: 'Water Temperature',
        objectType: 'WATERSENSOR',
        bodyId: 'BODY_1',
      };

      // Add existing accessory to cache
      const existingAccessory = {
        UUID: 'mock-uuid',
        context: { sensor: { type: SensorType.WATER_TEMP } },
        displayName: 'Water Temperature',
      };
      (platform as any).accessoryMap.set('mock-uuid', existingAccessory);

      (platform as any).discoverTemperatureSensor(sensor);

      expect((platform as any).api.registerPlatformAccessories).not.toHaveBeenCalled();
      expect(mockLogger.debug).toHaveBeenCalledWith('Restoring existing accessory from cache: Water Temperature');
    });

    it('should handle unknown sensor object type', () => {
      const sensor = {
        id: 'SENSOR_UNKNOWN',
        name: 'Unknown Sensor',
        objectType: 'UNKNOWNSENSOR',
      };

      (platform as any).discoverTemperatureSensor(sensor);

      expect((platform as any).api.registerPlatformAccessories).not.toHaveBeenCalled();
    });

    it('should handle water sensor without bodyId', () => {
      // Clear heaters for this test
      (platform as any).heaters.clear();

      const sensor = {
        id: 'SENSOR_NO_BODY',
        name: 'Water Temperature No Body',
        objectType: 'WATERSENSOR',
        // No bodyId property
      };

      (platform as any).discoverTemperatureSensor(sensor);

      expect((platform as any).api.platformAccessory).toHaveBeenCalledWith('Water Temperature No Body', 'mock-uuid');
      expect((platform as any).api.registerPlatformAccessories).toHaveBeenCalled();
    });
  });

  describe('Complex Discovery Integration Tests', () => {
    it('should handle discovery of multiple sensor types for same pump', () => {
      // Setup pump
      const pump = {
        id: 'PUMP_VSF',
        name: 'VSF Pump',
        type: PumpType.VSF,
        circuits: [],
      };

      (platform as any).pumps.set('PUMP_VSF', pump);

      // Discover all sensor types
      (platform as any).discoverPumpRpmSensor(pump);
      (platform as any).discoverPumpGpmSensor(pump);
      (platform as any).discoverPumpWattsSensor(pump);

      // Should register 3 sensors (RPM + GPM + WATTS) for VSF pump
      expect((platform as any).api.registerPlatformAccessories).toHaveBeenCalledTimes(3);
    });

    it('should handle sensor discovery with mixed existing and new accessories', () => {
      // Setup pump
      const pump = {
        id: 'PUMP_1',
        name: 'Test Pump',
        type: PumpType.VS,
        circuits: [],
      };

      (platform as any).pumps.set('PUMP_1', pump);

      // Add one existing sensor to cache
      const existingRpmSensor = {
        UUID: 'mock-uuid',
        context: { sensor: { type: SensorType.PUMP_RPM } },
        displayName: 'Test Pump RPM',
      };
      (platform as any).accessoryMap.set('mock-uuid', existingRpmSensor);

      // Generate different UUIDs for each call
      let callCount = 0;
      (platform as any).api.hap.uuid.generate.mockImplementation(() => {
        callCount++;
        return `mock-uuid-${callCount}`;
      });

      // Discover all sensor types
      (platform as any).discoverPumpRpmSensor(pump);
      (platform as any).discoverPumpWattsSensor(pump);

      // Should restore 1 existing and register 1 new
      expect((platform as any).api.registerPlatformAccessories).toHaveBeenCalledTimes(1);
      expect(mockLogger.debug).toHaveBeenCalledWith('Restoring existing accessory from cache: Test Pump RPM');
    });

    it('should handle feature sensor discovery with complex pump associations', () => {
      // Setup complex pump-feature association
      const panel = { id: 'PANEL_1', name: 'Main Panel' };
      const pump = {
        id: 'PUMP_1',
        name: 'Main Pump',
        type: PumpType.VS,
        circuits: [],
      };

      const feature = {
        id: 'FEATURE_1',
        name: 'Pool Light',
        objectType: 'FEATURE',
        pump: { id: 'PUMP_1' },
      };

      const pumpCircuit = {
        id: 'PC_1',
        pumpId: 'PUMP_1',
        circuitId: 'C_001',
        rpm: 2000,
        watts: 800,
        gpm: 45,
      };

      (platform as any).pumps.set('PUMP_1', pump);
      (platform as any).pumpToPumpCircuitsMap.set('PUMP_1', ['PC_1']);
      (platform as any).pumpCircuitToPumpMap.set('PC_1', 'PUMP_1');

      (platform as any).discoverFeatureRpmSensor(panel, feature, pumpCircuit);

      expect((platform as any).api.registerPlatformAccessories).toHaveBeenCalledWith(
        'PentairIntelliCenter',
        expect.objectContaining({
          displayName: 'Pool Light RPM',
          context: expect.objectContaining({
            sensor: expect.objectContaining({
              type: SensorType.FEATURE_RPM,
              feature: feature,
              pump: pump,
            }),
          }),
        }),
      );
    });
  });
});
