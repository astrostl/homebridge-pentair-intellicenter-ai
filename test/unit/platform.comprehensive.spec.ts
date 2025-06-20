import { API, Logger, PlatformAccessory, PlatformConfig } from 'homebridge';
import { PentairPlatform } from '../../src/platform';
import { Telnet } from 'telnet-client';
import { PLUGIN_NAME, PLATFORM_NAME } from '../../src/settings';
import {
  IntelliCenterResponse,
  IntelliCenterResponseStatus,
  IntelliCenterResponseCommand,
  IntelliCenterRequestCommand,
  IntelliCenterQueryName,
  TemperatureUnits,
  ObjectType,
  CircuitStatusMessage,
  TemperatureSensorType,
  CircuitType,
  BodyType,
  IntelliCenterRequest,
} from '../../src/types';
import { PentairConfig } from '../../src/configValidation';
import { CircuitBreakerState } from '../../src/errorHandling';

// Mock telnet-client
jest.mock('telnet-client');
const MockedTelnet = Telnet as jest.MockedClass<typeof Telnet>;

// Mock accessories
const mockCircuitAccessory = {
  constructor: jest.fn(),
};

const mockHeaterAccessory = {
  constructor: jest.fn(),
};

const mockTemperatureAccessory = {
  constructor: jest.fn(),
  updateTemperature: jest.fn(),
};

// Mock the accessory imports
jest.mock('../../src/circuitAccessory', () => ({
  CircuitAccessory: jest.fn().mockImplementation(() => mockCircuitAccessory),
}));

jest.mock('../../src/heaterAccessory', () => ({
  HeaterAccessory: jest.fn().mockImplementation(() => mockHeaterAccessory),
}));

jest.mock('../../src/temperatureAccessory', () => ({
  TemperatureAccessory: jest.fn().mockImplementation(() => mockTemperatureAccessory),
}));

// Mock types
jest.mock('../../src/types', () => ({
  ...jest.requireActual('../../src/types'),
  CircuitTypes: new Set(['CIRCUIT', 'BODY']),
  SensorTypes: new Set(['SENSE']),
}));

// Mock util functions
jest.mock('../../src/util', () => ({
  mergeResponse: jest.fn(),
  transformPanels: jest.fn(),
  updateBody: jest.fn(),
  updateCircuit: jest.fn(),
  updatePump: jest.fn(),
}));

const mockTransformPanels = require('../../src/util').transformPanels;

// Mock config validation
jest.mock('../../src/configValidation', () => ({
  ConfigValidator: {
    validate: jest.fn().mockReturnValue({
      isValid: true,
      errors: [],
      warnings: [],
      sanitizedConfig: {
        ipAddress: '192.168.1.100',
        username: 'testuser',
        password: 'testpass',
        temperatureUnits: 'F',
        minimumTemperature: 40,
        maximumTemperature: 104,
        supportVSP: false,
        airTemp: true,
        includeAllCircuits: false,
        maxBufferSize: 1048576,
      },
    }),
  },
}));

const mockConfigValidator = require('../../src/configValidation').ConfigValidator;

describe('PentairPlatform - Comprehensive Coverage Tests', () => {
  let platform: PentairPlatform;
  let mockLogger: jest.Mocked<Logger>;
  let mockAPI: jest.Mocked<API>;
  let mockTelnetInstance: jest.Mocked<Telnet>;
  let mockConfig: PlatformConfig;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    // Set up mockTransformPanels return value
    mockTransformPanels.mockReturnValue([
      {
        id: 'PNL01',
        modules: [
          {
            id: 'M0101',
            features: [{ id: 'C0001', name: 'Pool Light', objectType: ObjectType.Circuit, type: CircuitType.Generic }],
            bodies: [{ id: 'B1101', name: 'Pool', objectType: ObjectType.Body, type: BodyType.Pool, circuit: { id: 'C0001' } }],
            heaters: [{ id: 'H0001', name: 'Pool Heater', objectType: ObjectType.Heater, type: CircuitType.Generic, bodyIds: ['B1101'] }],
          },
        ],
        features: [],
        pumps: [
          {
            id: 'P0001',
            name: 'Pool Pump',
            objectType: ObjectType.Pump,
            type: 'VSP',
            circuits: [{ id: 'PC0001', pump: {}, circuitId: 'C0001', speed: 1500, speedType: 'RPM' }],
          },
        ],
        sensors: [{ id: 'S0001', name: 'Air Temp', objectType: ObjectType.Sensor, type: TemperatureSensorType.Air, probe: 75 }],
      },
    ]);

    // Mock logger
    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
      success: jest.fn(),
      log: jest.fn(),
    } as unknown as jest.Mocked<Logger>;

    // Mock API
    mockAPI = {
      hap: {
        Service: {
          AccessoryInformation: 'AccessoryInformation',
          Lightbulb: 'Lightbulb',
          Switch: 'Switch',
          Fan: 'Fan',
          Thermostat: 'Thermostat',
          TemperatureSensor: 'TemperatureSensor',
        },
        Characteristic: {
          Manufacturer: 'Manufacturer',
          Model: 'Model',
          SerialNumber: 'SerialNumber',
        },
        uuid: {
          generate: jest.fn().mockImplementation((id: string) => `mock-uuid-${id}`),
        },
      },
      on: jest.fn().mockImplementation((event: string, callback: () => void) => {
        if (event === 'didFinishLaunching') {
          // Store the callback for later invocation in tests
          (mockAPI as any)._didFinishLaunchingCallback = callback;
        }
      }),
      registerPlatformAccessories: jest.fn(),
      unregisterPlatformAccessories: jest.fn(),
      updatePlatformAccessories: jest.fn(),
      platformAccessory: jest.fn().mockImplementation((name: string, uuid: string) => {
        return {
          UUID: uuid,
          displayName: name,
          context: {},
          getService: jest.fn().mockReturnValue({
            setCharacteristic: jest.fn().mockReturnThis(),
            getCharacteristic: jest.fn().mockReturnValue({
              onGet: jest.fn().mockReturnThis(),
              onSet: jest.fn().mockReturnThis(),
              updateValue: jest.fn().mockReturnThis(),
            }),
            updateCharacteristic: jest.fn().mockReturnThis(),
          }),
          addService: jest.fn().mockReturnValue({
            setCharacteristic: jest.fn().mockReturnThis(),
            getCharacteristic: jest.fn().mockReturnValue({
              onGet: jest.fn().mockReturnThis(),
              onSet: jest.fn().mockReturnThis(),
              updateValue: jest.fn().mockReturnThis(),
            }),
            updateCharacteristic: jest.fn().mockReturnThis(),
          }),
        };
      }),
    } as any;

    // Mock Telnet instance
    mockTelnetInstance = {
      connect: jest.fn(),
      destroy: jest.fn(),
      send: jest.fn(),
      on: jest.fn(),
      end: jest.fn(),
      off: jest.fn(),
      removeAllListeners: jest.fn(),
    } as unknown as jest.Mocked<Telnet>;

    MockedTelnet.mockImplementation(() => mockTelnetInstance);

    // Mock config
    mockConfig = {
      platform: 'PentairIntelliCenter',
      name: 'Test Platform',
      ipAddress: '192.168.1.100',
      username: 'testuser',
      password: 'testpass',
      temperatureUnits: TemperatureUnits.F,
      minimumTemperature: 40,
      maximumTemperature: 104,
      supportVSP: false,
      airTemp: true,
      maxBufferSize: 1048576,
    };
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('Connection Error Handling', () => {
    it('should handle connection failures with circuit breaker', () => {
      const connectionError = new Error('ECONNREFUSED');
      mockTelnetInstance.connect.mockRejectedValue(connectionError);

      platform = new PentairPlatform(mockLogger, mockConfig, mockAPI);

      // Test that the platform handles connection errors through the circuit breaker
      const health = platform.getSystemHealth();
      expect(health.circuitBreaker).toBeDefined();

      // The platform should log that configuration was validated
      expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('Configuration validated successfully'));
    });

    it('should handle circuit breaker OPEN state', () => {
      // Setup the platform
      platform = new PentairPlatform(mockLogger, mockConfig, mockAPI);

      // Test circuit breaker state directly
      const circuitBreaker = (platform as any).circuitBreaker;
      expect(circuitBreaker).toBeDefined();

      // Test that we can get system health which includes circuit breaker state
      const health = platform.getSystemHealth();
      expect(health.circuitBreaker).toBeDefined();
      expect(health.circuitBreaker.state).toBe('closed'); // Initial state should be closed
    });
  });

  describe('Health Monitoring', () => {
    it('should provide system health status', () => {
      platform = new PentairPlatform(mockLogger, mockConfig, mockAPI);

      const health = platform.getSystemHealth();

      expect(health).toHaveProperty('isHealthy');
      expect(health).toHaveProperty('lastSuccessfulOperation');
      expect(health).toHaveProperty('consecutiveFailures');
      expect(health).toHaveProperty('circuitBreaker');
      expect(health).toHaveProperty('rateLimiter');
      expect(health).toHaveProperty('connection');
    });

    it('should reset error handling components', () => {
      platform = new PentairPlatform(mockLogger, mockConfig, mockAPI);

      platform.resetErrorHandling();

      expect(mockLogger.info).toHaveBeenCalledWith('Error handling components have been reset');
    });
  });

  describe('Command Queue and Rate Limiting', () => {
    it('should handle rate limiting', () => {
      platform = new PentairPlatform(mockLogger, mockConfig, mockAPI);

      const command: IntelliCenterRequest = {
        command: IntelliCenterRequestCommand.GetQuery,
        queryName: IntelliCenterQueryName.GetHardwareDefinition,
        messageID: 'test-uuid',
        arguments: 'CIRCUITS',
      };

      // Send many commands to trigger rate limiting (over 40/minute limit)
      for (let i = 0; i < 50; i++) {
        platform.sendCommandNoWait(command);
      }

      expect(mockLogger.debug).toHaveBeenCalledWith(expect.stringContaining('Rate limit exceeded'));
    });

    it('should sanitize commands before sending', () => {
      platform = new PentairPlatform(mockLogger, mockConfig, mockAPI);

      const maliciousCommand: IntelliCenterRequest = {
        command: IntelliCenterRequestCommand.GetQuery,
        queryName: IntelliCenterQueryName.GetHardwareDefinition,
        messageID: 'invalid-uuid-format',
        arguments: 'CIRCUITS<script>alert("xss")</script>',
        objectList: [
          {
            objnam: 'malicious<>name"',
            keys: ['STATUS'],
          },
        ],
      };

      // Mock the connection as alive
      (platform as any).isSocketAlive = true;

      platform.sendCommandNoWait(maliciousCommand);

      expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('Invalid messageID format'));
    });

    it('should handle connection not alive', () => {
      platform = new PentairPlatform(mockLogger, mockConfig, mockAPI);

      const command: IntelliCenterRequest = {
        command: IntelliCenterRequestCommand.GetQuery,
        queryName: IntelliCenterQueryName.GetHardwareDefinition,
        messageID: 'test-uuid',
        arguments: 'CIRCUITS',
      };

      // Ensure socket is not alive
      (platform as any).isSocketAlive = false;

      platform.sendCommandNoWait(command);

      expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('Cannot send command, socket is not alive'));
    });
  });

  describe('Socket Event Handlers', () => {
    beforeEach(() => {
      platform = new PentairPlatform(mockLogger, mockConfig, mockAPI);
    });

    it('should handle connect event', () => {
      const connectHandler = mockTelnetInstance.on.mock.calls.find(call => call[0] === 'connect')?.[1];

      if (connectHandler) {
        connectHandler();
      }

      expect(mockLogger.debug).toHaveBeenCalledWith('IntelliCenter socket connection has been established.');
    });

    it('should handle ready event', () => {
      const readyHandler = mockTelnetInstance.on.mock.calls.find(call => call[0] === 'ready')?.[1];

      if (readyHandler) {
        readyHandler();
      }

      expect(mockLogger.debug).toHaveBeenCalledWith('IntelliCenter socket connection is ready.');
    });

    it('should handle failedlogin event', () => {
      const failedLoginHandler = mockTelnetInstance.on.mock.calls.find(call => call[0] === 'failedlogin')?.[1];

      if (failedLoginHandler) {
        failedLoginHandler('Authentication failed');
      }

      expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining('IntelliCenter login failed'));
    });

    it('should handle close event', async () => {
      const closeHandler = mockTelnetInstance.on.mock.calls.find(call => call[0] === 'close')?.[1];

      if (closeHandler) {
        closeHandler();
      }

      expect(mockLogger.error).toHaveBeenCalledWith(
        'IntelliCenter socket has been closed. Waiting 30 seconds and attempting to reconnect...',
      );

      // Fast forward the delay
      jest.advanceTimersByTime(30000);
      await Promise.resolve();

      expect(mockLogger.info).toHaveBeenCalledWith('Finished waiting. Attempting reconnect...');
    });

    it('should handle error event', () => {
      const errorHandler = mockTelnetInstance.on.mock.calls.find(call => call[0] === 'error')?.[1];

      if (errorHandler) {
        errorHandler('Socket error occurred');
      }

      expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining('IntelliCenter socket error has been detected'));
    });

    it('should handle end event', () => {
      const endHandler = mockTelnetInstance.on.mock.calls.find(call => call[0] === 'end')?.[1];

      if (endHandler) {
        endHandler('Connection ended');
      }

      expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining('IntelliCenter socket connection has ended'));
    });

    it('should handle responseready event', () => {
      const responseReadyHandler = mockTelnetInstance.on.mock.calls.find(call => call[0] === 'responseready')?.[1];

      if (responseReadyHandler) {
        responseReadyHandler('Response ready data');
      }

      expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining('IntelliCenter responseready'));
    });
  });

  describe('Data Event Handler', () => {
    beforeEach(() => {
      platform = new PentairPlatform(mockLogger, mockConfig, mockAPI);
    });

    it('should handle incomplete data chunks', () => {
      const dataHandler = mockTelnetInstance.on.mock.calls.find(call => call[0] === 'data')?.[1];

      // Send incomplete JSON data (no newline)
      if (dataHandler) {
        dataHandler('{"command": "partial');
      }

      expect(mockLogger.debug).toHaveBeenCalledWith('Received incomplete data in data handler.');
    });

    it('should handle buffer overflow', () => {
      const dataHandler = mockTelnetInstance.on.mock.calls.find(call => call[0] === 'data')?.[1];

      // Set a small buffer first by accessing private property
      const largeData = 'x'.repeat(2000000); // Larger than default buffer

      if (dataHandler) {
        dataHandler(largeData);
      }

      expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining('Exceeded max buffer size'));
    });

    it('should handle malformed JSON', () => {
      const dataHandler = mockTelnetInstance.on.mock.calls.find(call => call[0] === 'data')?.[1];

      // Send malformed JSON with newline
      const malformedData = Buffer.from('{"invalid": json}\n');
      if (dataHandler) {
        dataHandler(malformedData);
      }

      expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining('Failed to parse JSON from IntelliCenter'), expect.any(Error));
    });

    it('should handle malformed JSON lines without proper brackets', () => {
      const dataHandler = mockTelnetInstance.on.mock.calls.find(call => call[0] === 'data')?.[1];

      // Send data without proper JSON brackets
      const malformedData = Buffer.from('not-json-data\n');
      if (dataHandler) {
        dataHandler(malformedData);
      }

      expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('Skipping malformed JSON line'));
    });
  });

  describe('Device Discovery and Updates', () => {
    beforeEach(() => {
      platform = new PentairPlatform(mockLogger, mockConfig, mockAPI);
    });

    it('should handle discovery response and register accessories', async () => {
      // Set up platform to complete discovery
      (platform as any).discoverCommandsSent = ['CIRCUITS', 'PUMPS', 'CHEMS', 'VALVES', 'HEATERS', 'SENSORS', 'GROUPS'];
      (platform as any).discoveryBuffer = { panels: [] };

      const discoveryResponse: IntelliCenterResponse = {
        command: IntelliCenterResponseCommand.SendQuery,
        queryName: IntelliCenterQueryName.GetHardwareDefinition,
        response: IntelliCenterResponseStatus.Ok,
        messageID: 'test-msg',
        description: 'test discovery response',
        answer: { panels: [] },
      };

      await platform.handleUpdate(discoveryResponse);

      expect(mockTransformPanels).toHaveBeenCalled();
    });

    it('should handle pump updates', () => {
      const mockAccessory = {
        context: {
          pumpCircuit: { id: 'PC0001' },
        },
      } as unknown as PlatformAccessory;

      platform.updatePump(mockAccessory, { SPEED: 1800, SELECT: 'RPM' });

      expect(mockAPI.updatePlatformAccessories).toHaveBeenCalledWith([mockAccessory]);
    });

    it('should handle sensor updates with valid probe value', () => {
      const mockAccessory = {
        context: {
          sensor: {
            id: 'S0001',
            name: 'Air Temp',
            objectType: ObjectType.Sensor,
            probe: 75,
          },
        },
      } as unknown as PlatformAccessory;

      platform.updateSensor(mockAccessory, { PROBE: '78.5' });

      expect(mockTemperatureAccessory.updateTemperature).toHaveBeenCalledWith(78.5);
    });

    it('should handle sensor updates with invalid probe value', () => {
      const mockAccessory = {
        context: {
          sensor: {
            id: 'S0001',
            name: 'Air Temp',
            objectType: ObjectType.Sensor,
            probe: 75,
          },
        },
      } as unknown as PlatformAccessory;

      platform.updateSensor(mockAccessory, { PROBE: 'invalid' });

      expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('Invalid probe value received'));
    });

    it('should handle circuit updates for body objects', () => {
      const mockAccessory = {
        context: {
          circuit: {
            id: 'B1101',
            objectType: ObjectType.Body,
          },
        },
      } as unknown as PlatformAccessory;

      platform.updateCircuit(mockAccessory, { STATUS: 'ON', LOTMP: '78' });

      expect(mockAPI.updatePlatformAccessories).toHaveBeenCalledWith([mockAccessory]);
    });
  });

  describe('Error Response Handling', () => {
    beforeEach(() => {
      platform = new PentairPlatform(mockLogger, mockConfig, mockAPI);
    });

    it('should handle ParseError responses', async () => {
      const parseErrorResponse: IntelliCenterResponse = {
        command: IntelliCenterResponseCommand.Error,
        response: '400' as any,
        description: 'ParseError: Invalid command syntax',
        messageID: 'test-msg',
      };

      await platform.handleUpdate(parseErrorResponse);

      expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('IntelliCenter ParseError'));
    });

    it('should handle frequent ParseErrors and suggest reboot', async () => {
      const parseErrorResponse: IntelliCenterResponse = {
        command: IntelliCenterResponseCommand.Error,
        response: '400' as any,
        description: 'ParseError: Invalid command syntax',
        messageID: 'test-msg',
      };

      // Send multiple ParseErrors quickly
      for (let i = 0; i < 4; i++) {
        await platform.handleUpdate(parseErrorResponse);
      }

      expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining('Frequent IntelliCenter ParseErrors detected'));
    });

    it('should attempt reconnect on excessive ParseErrors', async () => {
      const parseErrorResponse: IntelliCenterResponse = {
        command: IntelliCenterResponseCommand.Error,
        response: '400' as any,
        description: 'ParseError: Invalid command syntax',
        messageID: 'test-msg',
      };

      // Send excessive ParseErrors
      for (let i = 0; i < 10; i++) {
        await platform.handleUpdate(parseErrorResponse);
      }

      expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining('Excessive ParseErrors'));
    });

    it('should handle other error responses', async () => {
      const errorResponse: IntelliCenterResponse = {
        command: IntelliCenterResponseCommand.Error,
        response: '500' as any,
        description: 'Internal server error',
        messageID: 'test-msg',
      };

      await platform.handleUpdate(errorResponse);

      expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining('Received unsuccessful response code 500'));
    });
  });

  describe('JSON Serialization', () => {
    beforeEach(() => {
      platform = new PentairPlatform(mockLogger, mockConfig, mockAPI);
    });

    it('should handle circular references in JSON serialization', () => {
      const circularObj: any = { name: 'test' };
      circularObj.self = circularObj;

      const result = platform.json(circularObj);

      expect(result).toContain('[Circular]');
    });

    it('should handle normal JSON serialization', () => {
      const normalObj = { name: 'test', value: 123 };

      const result = platform.json(normalObj);

      expect(result).toContain('"name": "test"');
      expect(result).toContain('"value": 123');
    });
  });

  describe('Heartbeat and Reconnection', () => {
    beforeEach(() => {
      platform = new PentairPlatform(mockLogger, mockConfig, mockAPI);
    });

    it('should trigger reconnection after long silence', () => {
      // Set socket as alive initially
      (platform as any).isSocketAlive = true;
      (platform as any).lastMessageReceived = Date.now() - 5 * 60 * 60 * 1000; // 5 hours ago

      // Advance timer to trigger heartbeat check
      jest.advanceTimersByTime(60000);

      expect(mockLogger.warn).toHaveBeenCalledWith('No data from IntelliCenter in over 4 hours. Closing and restarting connection.');
      expect(mockTelnetInstance.destroy).toHaveBeenCalled();
    });

    it('should handle reconnection throttling', async () => {
      // Set up recent reconnection time
      (platform as any).lastReconnectTime = Date.now() - 10000; // 10 seconds ago
      (platform as any).reconnecting = false;

      const maybeReconnect = (platform as any).maybeReconnect.bind(platform);
      await maybeReconnect();

      expect(mockLogger.warn).toHaveBeenCalledWith('Reconnect suppressed: too soon after last one.');
    });

    it('should skip reconnection if already in progress', async () => {
      (platform as any).reconnecting = true;

      const maybeReconnect = (platform as any).maybeReconnect.bind(platform);
      await maybeReconnect();

      expect(mockLogger.warn).toHaveBeenCalledWith('Reconnect already in progress. Skipping.');
    });
  });

  describe('Orphaned Accessory Cleanup', () => {
    beforeEach(() => {
      platform = new PentairPlatform(mockLogger, mockConfig, mockAPI);
    });

    it('should clean up orphaned circuit accessories', () => {
      const orphanedAccessory = {
        UUID: 'mock-uuid-orphaned',
        displayName: 'Orphaned Circuit',
        context: {
          circuit: { id: 'ORPHANED_CIRCUIT' },
        },
      } as unknown as PlatformAccessory;

      // Add orphaned accessory to the map
      platform.accessoryMap.set('mock-uuid-orphaned', orphanedAccessory);

      // Mock current IDs that don't include the orphaned one
      const currentCircuitIds = new Set(['C0001']);
      const currentSensorIds = new Set(['S0001']);
      const currentHeaterIds = new Set(['H0001.B1101']);

      // Combine all discovered accessory IDs into a single set
      const discoveredAccessoryIds = new Set([...currentCircuitIds, ...currentSensorIds, ...currentHeaterIds]);
      platform.cleanupOrphanedAccessories(discoveredAccessoryIds);

      expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('Removing orphaned accessory: Orphaned Circuit'));
      expect(mockAPI.unregisterPlatformAccessories).toHaveBeenCalledWith(PLUGIN_NAME, PLATFORM_NAME, [orphanedAccessory]);
    });

    it('should clean up orphaned sensor accessories', () => {
      const orphanedAccessory = {
        UUID: 'mock-uuid-orphaned-sensor',
        displayName: 'Orphaned Sensor',
        context: {
          sensor: { id: 'ORPHANED_SENSOR' },
        },
      } as unknown as PlatformAccessory;

      platform.accessoryMap.set('mock-uuid-orphaned-sensor', orphanedAccessory);

      const currentCircuitIds = new Set(['C0001']);
      const currentSensorIds = new Set(['S0001']);
      const currentHeaterIds = new Set(['H0001.B1101']);

      // Combine all discovered accessory IDs into a single set
      const discoveredAccessoryIds = new Set([...currentCircuitIds, ...currentSensorIds, ...currentHeaterIds]);
      platform.cleanupOrphanedAccessories(discoveredAccessoryIds);

      expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('Removing orphaned accessory: Orphaned Sensor'));
    });

    it('should clean up orphaned heater accessories', () => {
      const orphanedAccessory = {
        UUID: 'mock-uuid-orphaned-heater',
        displayName: 'Orphaned Heater',
        context: {
          heater: { id: 'ORPHANED_HEATER' },
          body: { id: 'ORPHANED_BODY' },
        },
      } as unknown as PlatformAccessory;

      platform.accessoryMap.set('mock-uuid-orphaned-heater', orphanedAccessory);
      platform.heaters.set('mock-uuid-orphaned-heater', orphanedAccessory);

      const currentCircuitIds = new Set(['C0001']);
      const currentSensorIds = new Set(['S0001']);
      const currentHeaterIds = new Set(['H0001.B1101']);

      // Combine all discovered accessory IDs into a single set
      const discoveredAccessoryIds = new Set([...currentCircuitIds, ...currentSensorIds, ...currentHeaterIds]);
      platform.cleanupOrphanedAccessories(discoveredAccessoryIds);

      expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('Removing orphaned accessory: Orphaned Heater'));
    });
  });

  describe('Discovery Device Type Sequencing', () => {
    beforeEach(() => {
      platform = new PentairPlatform(mockLogger, mockConfig, mockAPI);
    });

    it('should handle discovery response sequencing', async () => {
      // Mock that we haven't sent all discovery commands yet
      (platform as any).discoverCommandsSent = ['CIRCUITS'];
      (platform as any).discoveryBuffer = null;

      const discoveryResponse: IntelliCenterResponse = {
        command: IntelliCenterResponseCommand.SendQuery,
        queryName: IntelliCenterQueryName.GetHardwareDefinition,
        response: IntelliCenterResponseStatus.Ok,
        messageID: 'test-msg',
        description: 'test discovery response',
        answer: { panels: [] },
      };

      await platform.handleUpdate(discoveryResponse);

      expect(mockLogger.debug).toHaveBeenCalledWith(expect.stringContaining('Merged 1 of'));

      // Advance timer to trigger next discovery command
      jest.advanceTimersByTime(250);
    });

    it('should complete discovery when all commands sent', async () => {
      // Mock that all discovery commands have been sent
      const DISCOVER_COMMANDS = require('../../src/constants').DISCOVER_COMMANDS;
      (platform as any).discoverCommandsSent = [...DISCOVER_COMMANDS];
      (platform as any).discoveryBuffer = { panels: [] };

      const discoveryResponse: IntelliCenterResponse = {
        command: IntelliCenterResponseCommand.SendQuery,
        queryName: IntelliCenterQueryName.GetHardwareDefinition,
        response: IntelliCenterResponseStatus.Ok,
        messageID: 'test-msg',
        description: 'test discovery response',
        answer: { panels: [] },
      };

      await platform.handleUpdate(discoveryResponse);

      expect(mockLogger.debug).toHaveBeenCalledWith(expect.stringContaining('Discovery commands completed'));
    });
  });

  describe('Temperature Sensor Discovery Logic', () => {
    beforeEach(() => {
      platform = new PentairPlatform(mockLogger, mockConfig, mockAPI);
    });

    it('should skip air temperature sensor when disabled in config', () => {
      // Mock config with airTemp disabled
      const configWithoutAirTemp = {
        ...mockConfigValidator.validate().sanitizedConfig,
        airTemp: false,
      };
      mockConfigValidator.validate.mockReturnValueOnce({
        isValid: true,
        errors: [],
        warnings: [],
        sanitizedConfig: configWithoutAirTemp,
      });

      const newPlatform = new PentairPlatform(mockLogger, mockConfig, mockAPI);

      const panel = {
        id: 'PNL01',
        modules: [],
        features: [],
        pumps: [],
        sensors: [],
      };

      const sensor = {
        id: 'S0001',
        name: 'Air Temp',
        objectType: ObjectType.Sensor,
        type: TemperatureSensorType.Air,
        probe: 75,
      };

      newPlatform.discoverTemperatureSensor(panel, null, sensor);

      expect(mockLogger.debug).toHaveBeenCalledWith(expect.stringContaining('Skipping air temperature sensor'));
    });

    it('should skip water temperature sensor when heater is present', () => {
      const panel = {
        id: 'PNL01',
        modules: [
          {
            id: 'M0101',
            features: [],
            bodies: [],
            heaters: [{ id: 'H0001', name: 'Pool Heater', bodyIds: ['B1101'], objectType: ObjectType.Heater, type: CircuitType.Generic }], // Has heater
          },
        ],
        features: [],
        pumps: [],
        sensors: [],
      };

      const sensor = {
        id: 'S0001',
        name: 'Pool Temp',
        objectType: ObjectType.Sensor,
        type: TemperatureSensorType.Pool,
        probe: 78,
      };

      platform.discoverTemperatureSensor(panel, null, sensor);

      expect(mockLogger.debug).toHaveBeenCalledWith(expect.stringContaining('Skipping water temperature sensor'));
    });
  });

  describe('Configuration Validation Failure', () => {
    it('should handle configuration validation failure', () => {
      mockConfigValidator.validate.mockReturnValueOnce({
        isValid: false,
        errors: ['ipAddress is required'],
        warnings: [],
        sanitizedConfig: null,
      });

      platform = new PentairPlatform(mockLogger, mockConfig, mockAPI);

      expect(mockLogger.error).toHaveBeenCalledWith('Configuration validation failed:');
      expect(mockLogger.error).toHaveBeenCalledWith('  - ipAddress is required');
    });

    it('should handle configuration warnings', () => {
      mockConfigValidator.validate.mockReturnValueOnce({
        isValid: true,
        errors: [],
        warnings: ['Temperature units defaulted to Fahrenheit'],
        sanitizedConfig: mockConfigValidator.validate().sanitizedConfig,
      });

      platform = new PentairPlatform(mockLogger, mockConfig, mockAPI);

      expect(mockLogger.warn).toHaveBeenCalledWith('Config Warning: Temperature units defaulted to Fahrenheit');
    });

    it('should throw error when accessing config without validation', () => {
      mockConfigValidator.validate.mockReturnValueOnce({
        isValid: false,
        errors: ['ipAddress is required'],
        warnings: [],
        sanitizedConfig: null,
      });

      platform = new PentairPlatform(mockLogger, mockConfig, mockAPI);

      expect(() => platform.getConfig()).toThrow('Configuration has not been validated. Cannot return config.');
    });
  });
});
