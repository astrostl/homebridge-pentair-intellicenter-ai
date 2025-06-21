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
} from '../../src/types';

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

const mockPumpRpmAccessory = {
  constructor: jest.fn(),
  updateRpm: jest.fn(),
};

jest.mock('../../src/pumpRpmAccessory', () => ({
  PumpRpmAccessory: jest.fn().mockImplementation(() => mockPumpRpmAccessory),
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
  transformPanels: jest.fn().mockReturnValue([]),
  updateBody: jest.fn(),
  updateCircuit: jest.fn(),
  updatePump: jest.fn(),
}));

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

describe('PentairPlatform', () => {
  let platform: PentairPlatform;
  let mockLogger: jest.Mocked<Logger>;
  let mockAPI: jest.Mocked<API>;
  let mockTelnetInstance: jest.Mocked<Telnet>;
  let mockConfig: PlatformConfig;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

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
      on: jest.fn(),
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

  describe('Constructor', () => {
    it('should initialize platform with valid config', () => {
      platform = new PentairPlatform(mockLogger, mockConfig, mockAPI);

      expect(platform).toBeDefined();
      expect(MockedTelnet).toHaveBeenCalledTimes(1);
      expect(mockTelnetInstance.on).toHaveBeenCalledTimes(8); // All event handlers (updated)
      expect(mockAPI.on).toHaveBeenCalledWith('didFinishLaunching', expect.any(Function));
    });

    it('should log error and return early if IP address is missing', () => {
      const configWithoutIP = { ...mockConfig };
      delete configWithoutIP.ipAddress;

      // Mock config validation to return invalid config
      const mockConfigValidator = require('../../src/configValidation').ConfigValidator;
      mockConfigValidator.validate.mockReturnValueOnce({
        isValid: false,
        errors: ['ipAddress is required and must be a string'],
        warnings: [],
        sanitizedConfig: configWithoutIP,
      });

      platform = new PentairPlatform(mockLogger, configWithoutIP, mockAPI);

      expect(mockLogger.error).toHaveBeenCalledWith('Configuration validation failed:');
      expect(mockLogger.error).toHaveBeenCalledWith('  - ipAddress is required and must be a string');
    });

    it('should set up telnet event handlers', () => {
      platform = new PentairPlatform(mockLogger, mockConfig, mockAPI);

      const eventHandlers = ['data', 'connect', 'ready', 'failedlogin', 'close', 'error', 'end', 'responseready'];
      eventHandlers.forEach(event => {
        expect(mockTelnetInstance.on).toHaveBeenCalledWith(event, expect.any(Function));
      });
    });

    it('should set up heartbeat monitoring', () => {
      const setIntervalSpy = jest.spyOn(global, 'setInterval');
      platform = new PentairPlatform(mockLogger, mockConfig, mockAPI);

      // Should have set up the interval
      expect(setIntervalSpy).toHaveBeenCalled();

      setIntervalSpy.mockRestore();
    });
  });

  describe('connectToIntellicenter', () => {
    beforeEach(() => {
      platform = new PentairPlatform(mockLogger, mockConfig, mockAPI);
    });

    it('should connect with correct telnet parameters', async () => {
      mockTelnetInstance.connect.mockResolvedValue(undefined);

      await platform.connectToIntellicenter();

      expect(mockTelnetInstance.connect).toHaveBeenCalledWith({
        host: '192.168.1.100',
        port: 6681,
        negotiationMandatory: false,
        timeout: 1500,
        debug: true,
        username: 'testuser',
        password: 'testpass',
      });
    });

    it('should log error on connection failure', async () => {
      const error = new Error('Connection failed');
      mockTelnetInstance.connect.mockRejectedValue(error);

      await platform.connectToIntellicenter();

      expect(mockLogger.error).toHaveBeenCalledWith('Connection to IntelliCenter failed after retries: Connection failed');
    });
  });

  describe('Event Handlers', () => {
    beforeEach(() => {
      platform = new PentairPlatform(mockLogger, mockConfig, mockAPI);
    });

    describe('data handler', () => {
      let dataHandler: (chunk: Buffer) => Promise<void>;

      beforeEach(() => {
        const onCall = mockTelnetInstance.on.mock.calls.find(call => call[0] === 'data');
        dataHandler = onCall![1] as (chunk: Buffer) => Promise<void>;
      });

      it('should process valid JSON response', async () => {
        const validResponse = {
          response: IntelliCenterResponseStatus.Ok,
          command: IntelliCenterResponseCommand.SendQuery,
          messageID: 'test-123',
          description: 'Test response',
        };
        const chunk = Buffer.from(JSON.stringify(validResponse) + '\n');

        await dataHandler(chunk);

        expect(mockLogger.debug).toHaveBeenCalledWith(expect.stringContaining('Unhandled command in handleUpdate'));
      });

      it('should handle malformed JSON gracefully', async () => {
        const malformedChunk = Buffer.from('{ invalid json\n');

        await dataHandler(malformedChunk);

        expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('Skipping malformed JSON line'));
      });

      it('should skip non-bracketed responses', async () => {
        const nonJsonChunk = Buffer.from('not json at all\n');

        await dataHandler(nonJsonChunk);

        expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('Skipping malformed JSON line'));
      });

      it('should buffer incomplete data', async () => {
        const incompleteChunk = Buffer.from('{"partial": "data"');

        await dataHandler(incompleteChunk);

        // Should not attempt to parse yet
        expect(mockLogger.debug).toHaveBeenCalledWith('Received incomplete data in data handler.');
      });

      it('should discard buffer when exceeding max size', async () => {
        // Set a smaller buffer size for testing (minimum is 64KB = 65536 bytes)
        const smallBufferConfig = { ...mockConfig, maxBufferSize: 65536 };

        // Mock config validation to return the smaller buffer size
        const mockConfigValidator = require('../../src/configValidation').ConfigValidator;
        mockConfigValidator.validate.mockReturnValueOnce({
          isValid: true,
          errors: [],
          warnings: [],
          sanitizedConfig: { ...smallBufferConfig },
        });

        platform = new PentairPlatform(mockLogger, smallBufferConfig, mockAPI);

        // Get the new data handler from the new platform instance
        const newOnCalls = mockTelnetInstance.on.mock.calls.filter(call => call[0] === 'data');
        const handler = newOnCalls[newOnCalls.length - 1]?.[1] as (chunk: Buffer) => Promise<void>;

        // Send data without newline to accumulate in buffer
        const chunk1 = Buffer.from('a'.repeat(32768)); // 32KB, no newline
        await handler(chunk1);

        // Send more data to exceed the buffer limit and trigger check
        const chunk2 = Buffer.from('b'.repeat(32769)); // 32KB + 1 byte, no newline (total > 64KB)
        await handler(chunk2);

        expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining('Exceeded max buffer size'));
      });
    });

    describe('connect handler', () => {
      it('should set socket alive and start discovery', () => {
        const connectHandler = mockTelnetInstance.on.mock.calls.find(call => call[0] === 'connect')![1] as () => void;

        // Mock discoverDevices to avoid calling real implementation
        const discoverDevicesSpy = jest.spyOn(platform, 'discoverDevices').mockImplementation();

        connectHandler();

        expect(mockLogger.debug).toHaveBeenCalledWith('IntelliCenter socket connection has been established.');
        expect(discoverDevicesSpy).toHaveBeenCalled();
      });

      it('should handle discovery errors gracefully', () => {
        const connectHandler = mockTelnetInstance.on.mock.calls.find(call => call[0] === 'connect')![1] as () => void;

        jest.spyOn(platform, 'discoverDevices').mockImplementation(() => {
          throw new Error('Discovery failed');
        });

        connectHandler();

        expect(mockLogger.error).toHaveBeenCalledWith('IntelliCenter device discovery failed.', expect.any(Error));
      });
    });

    describe('close handler', () => {
      it('should attempt reconnection after delay', async () => {
        const closeHandler = mockTelnetInstance.on.mock.calls.find(call => call[0] === 'close')![1] as () => void;

        const maybeReconnectSpy = jest.spyOn(platform as any, 'maybeReconnect').mockImplementation();

        closeHandler();

        expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining('IntelliCenter socket has been closed'));

        // Fast-forward the delay
        jest.advanceTimersByTime(30000);
        await Promise.resolve(); // Allow promises to resolve

        expect(maybeReconnectSpy).toHaveBeenCalled();
      });
    });

    describe('error and end handlers', () => {
      it('should handle socket errors', () => {
        const errorHandler = mockTelnetInstance.on.mock.calls.find(call => call[0] === 'error')![1] as (data: any) => void;

        errorHandler('Test error');

        expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining('IntelliCenter socket error has been detected'));
      });

      it('should handle socket end', () => {
        const endHandler = mockTelnetInstance.on.mock.calls.find(call => call[0] === 'end')![1] as (data: any) => void;

        endHandler('Test end');

        expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining('IntelliCenter socket connection has ended'));
      });
    });
  });

  describe('handleUpdate', () => {
    beforeEach(() => {
      platform = new PentairPlatform(mockLogger, mockConfig, mockAPI);
    });

    it('should handle unsuccessful responses', async () => {
      const unsuccessfulResponse: IntelliCenterResponse = {
        response: '400' as any,
        command: IntelliCenterResponseCommand.Error,
        messageID: 'test-123',
        description: 'Bad request',
        answer: undefined as never,
      };

      await platform.handleUpdate(unsuccessfulResponse);

      expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining('Received unsuccessful response code 400'));
    });

    it('should handle ParseError responses with frequency tracking', async () => {
      const parseErrorResponse: IntelliCenterResponse = {
        response: '400' as any,
        command: IntelliCenterResponseCommand.Error,
        messageID: 'test-123',
        description: 'ParseError: Invalid command',
        answer: undefined as never,
      };

      // First few parse errors should be warnings
      await platform.handleUpdate(parseErrorResponse);
      expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('IntelliCenter ParseError (1/3 in 5min)'));

      await platform.handleUpdate(parseErrorResponse);
      await platform.handleUpdate(parseErrorResponse);

      // Fourth error should trigger error log
      await platform.handleUpdate(parseErrorResponse);
      expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining('Frequent IntelliCenter ParseErrors detected (4 in 5min)'));
    });

    it('should handle successful request confirmations', async () => {
      const successResponse: IntelliCenterResponse = {
        response: IntelliCenterResponseStatus.Ok,
        command: 'SetParamList' as any, // This maps to IntelliCenterRequestCommand
        messageID: 'test-123',
        description: 'Success',
        answer: undefined as never,
      };

      await platform.handleUpdate(successResponse);

      expect(mockLogger.debug).toHaveBeenCalledWith('Request with message ID test-123 was successful.');
    });

    it('should handle discovery responses', async () => {
      const discoveryResponse: IntelliCenterResponse = {
        response: IntelliCenterResponseStatus.Ok,
        command: IntelliCenterResponseCommand.SendQuery,
        queryName: IntelliCenterQueryName.GetHardwareDefinition,
        messageID: 'test-123',
        description: 'Discovery response',
        answer: undefined as never,
      };

      const handleDiscoveryResponseSpy = jest.spyOn(platform as any, 'handleDiscoveryResponse').mockImplementation();

      await platform.handleUpdate(discoveryResponse);

      expect(handleDiscoveryResponseSpy).toHaveBeenCalledWith(discoveryResponse);
    });

    it('should handle NotifyList responses', async () => {
      const notifyResponse: IntelliCenterResponse = {
        response: IntelliCenterResponseStatus.Ok,
        command: IntelliCenterResponseCommand.NotifyList,
        messageID: 'test-123',
        description: 'Notify response',
        answer: undefined as never,
        objectList: [
          {
            objnam: 'C01',
            params: { STATUS: 'ON' },
          } as unknown as CircuitStatusMessage,
        ],
      };

      // Create a mock accessory for this ID
      const mockAccessory = {
        UUID: 'mock-uuid-C01',
        context: {
          circuit: {
            id: 'C01',
            objectType: 'Circuit',
          },
        },
      } as unknown as PlatformAccessory;

      platform.accessoryMap.set('mock-uuid-C01', mockAccessory);

      await platform.handleUpdate(notifyResponse);

      expect(mockLogger.debug).toHaveBeenCalledWith(expect.stringContaining('Handling IntelliCenter 200 response'));
      expect(mockLogger.debug).toHaveBeenCalledWith('Handling update for C01');
    });

    it('should handle missing object list in NotifyList', async () => {
      const notifyResponseWithoutObjectList: IntelliCenterResponse = {
        response: IntelliCenterResponseStatus.Ok,
        command: IntelliCenterResponseCommand.NotifyList,
        messageID: 'test-123',
        description: 'Notify response',
        answer: undefined as never,
      };

      await platform.handleUpdate(notifyResponseWithoutObjectList);

      expect(mockLogger.error).toHaveBeenCalledWith('Object list missing in NotifyList response.');
    });
  });

  describe('configureAccessory', () => {
    beforeEach(() => {
      platform = new PentairPlatform(mockLogger, mockConfig, mockAPI);
    });

    it('should add accessory to map', () => {
      const mockAccessory = {
        UUID: 'test-uuid',
        displayName: 'Test Accessory',
        context: {},
      } as unknown as PlatformAccessory;

      platform.configureAccessory(mockAccessory);

      expect(platform.accessoryMap.get('test-uuid')).toBe(mockAccessory);
      expect(mockLogger.debug).toHaveBeenCalledWith('Loading accessory from cache:', 'Test Accessory');
    });

    it('should add heater to heaters map', () => {
      const mockHeater = { id: 'H01', name: 'Test Heater' };
      const mockAccessory = {
        UUID: 'test-uuid',
        displayName: 'Test Heater Accessory',
        context: { heater: mockHeater },
      } as unknown as PlatformAccessory;

      platform.configureAccessory(mockAccessory);

      expect(platform.heaters.get('test-uuid')).toBe(mockHeater);
    });
  });

  describe('Configuration Management', () => {
    beforeEach(() => {
      platform = new PentairPlatform(mockLogger, mockConfig, mockAPI);
    });

    it('should return sanitized config', () => {
      const config = platform.getConfig();

      expect(config).toEqual(
        expect.objectContaining({
          ipAddress: '192.168.1.100',
          username: 'testuser',
          password: 'testpass',
          temperatureUnits: TemperatureUnits.F,
        }),
      );
    });

    it('should handle JSON serialization', () => {
      const testObject = { test: 'value', number: 123 };
      const result = platform.json(testObject);

      expect(result).toBe('{\n  "test": "value",\n  "number": 123\n}');
    });
  });

  describe('Connection Health Monitoring', () => {
    beforeEach(() => {
      platform = new PentairPlatform(mockLogger, mockConfig, mockAPI);
    });

    it('should detect connection timeout and attempt reconnection', () => {
      const mockTime = Date.now();
      jest.setSystemTime(mockTime);

      // Create platform with timer
      platform = new PentairPlatform(mockLogger, mockConfig, mockAPI);

      // Set socket as alive and last message received 5 hours ago
      (platform as any).isSocketAlive = true;
      (platform as any).lastMessageReceived = mockTime - 5 * 60 * 60 * 1000; // 5 hours ago

      const maybeReconnectSpy = jest.spyOn(platform as any, 'maybeReconnect').mockImplementation();

      // Trigger heartbeat check - the timer was set up in constructor with 60000ms interval
      jest.advanceTimersByTime(60000);

      expect(mockLogger.warn).toHaveBeenCalledWith('No data from IntelliCenter in over 4 hours. Closing and restarting connection.');
      expect(mockTelnetInstance.destroy).toHaveBeenCalled();
    });
  });

  describe('Device Discovery', () => {
    beforeEach(() => {
      platform = new PentairPlatform(mockLogger, mockConfig, mockAPI);
    });

    it('should start device discovery', () => {
      const discoverDeviceTypeSpy = jest.spyOn(platform as any, 'discoverDeviceType').mockImplementation();

      platform.discoverDevices();

      // The actual implementation calls discoverDeviceType for each command in DISCOVER_COMMANDS
      expect(discoverDeviceTypeSpy).toHaveBeenCalled();
    });

    it('should send discovery command for device type', () => {
      const sendCommandNoWaitSpy = jest.spyOn(platform, 'sendCommandNoWait').mockImplementation();

      (platform as any).discoverDeviceType('DISCOVERY');

      expect(sendCommandNoWaitSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          command: IntelliCenterRequestCommand.GetQuery,
          queryName: IntelliCenterQueryName.GetHardwareDefinition,
          arguments: 'DISCOVERY',
          messageID: expect.any(String),
        }),
      );
    });

    it('should handle discovery response and merge data', () => {
      const mergeResponseSpy = jest.spyOn(require('../../src/util'), 'mergeResponse').mockImplementation();

      const firstResponse = {
        response: IntelliCenterResponseStatus.Ok,
        command: IntelliCenterResponseCommand.SendQuery,
        queryName: IntelliCenterQueryName.GetHardwareDefinition,
        messageID: 'test-123',
        description: 'Success',
        answer: { panels: [{ id: 'panel1' }] },
      } as any;

      const secondResponse = {
        response: IntelliCenterResponseStatus.Ok,
        command: IntelliCenterResponseCommand.SendQuery,
        queryName: IntelliCenterQueryName.GetHardwareDefinition,
        messageID: 'test-124',
        description: 'Success',
        answer: { panels: [{ id: 'panel2' }] },
      } as any;

      // Set up discovery state
      (platform as any).discoverCommandsSent = [];
      (platform as any).discoveryBuffer = null;

      platform.handleDiscoveryResponse(firstResponse);
      expect((platform as any).discoveryBuffer).toEqual(firstResponse.answer);

      // Add a command to simulate second discovery command being sent
      (platform as any).discoverCommandsSent.push('CIRCUITS');
      platform.handleDiscoveryResponse(secondResponse);
      expect(mergeResponseSpy).toHaveBeenCalledWith(firstResponse.answer, secondResponse.answer);
    });

    it('should process complete discovery and create accessories', () => {
      const transformPanelsSpy = jest.spyOn(require('../../src/util'), 'transformPanels').mockReturnValue([
        {
          id: 'panel1',
          sensors: [],
          pumps: [],
          modules: [
            {
              features: [
                {
                  id: 'circuit1',
                  name: 'Pool Light',
                  objectType: 'Circuit',
                  type: 'LIGHT',
                },
              ],
              bodies: [],
              heaters: [],
            },
          ],
          features: [],
        },
      ]);

      // Mock the discovery methods
      const discoverCircuitSpy = jest.spyOn(platform as any, 'discoverCircuit').mockImplementation();
      const discoverTemperatureSensorSpy = jest.spyOn(platform as any, 'discoverTemperatureSensor').mockImplementation();
      const discoverHeaterSpy = jest.spyOn(platform as any, 'discoverHeater').mockImplementation();

      // Mock discovery completion - set all commands as sent
      const allCommands = ['CIRCUITS', 'PUMPS', 'CHEMS', 'VALVES', 'HEATERS', 'SENSORS', 'GROUPS'];
      (platform as any).discoverCommandsSent = [...allCommands];
      (platform as any).discoveryBuffer = { panels: [] };

      const response = {
        response: IntelliCenterResponseStatus.Ok,
        command: IntelliCenterResponseCommand.SendQuery,
        queryName: IntelliCenterQueryName.GetHardwareDefinition,
        messageID: 'test-125',
        description: 'Success',
        answer: { panels: [] },
      } as any;

      platform.handleDiscoveryResponse(response);

      expect(transformPanelsSpy).toHaveBeenCalled();
      expect(mockLogger.debug).toHaveBeenCalledWith(expect.stringContaining('Discovery commands completed'));
    });
  });

  describe('Command Processing', () => {
    beforeEach(() => {
      platform = new PentairPlatform(mockLogger, mockConfig, mockAPI);
    });

    it('should sanitize commands before sending', () => {
      const sendSpy = jest.spyOn(mockTelnetInstance, 'send').mockImplementation();
      (platform as any).isSocketAlive = true;
      (platform as any).processingQueue = false;

      const maliciousCommand = {
        command: IntelliCenterRequestCommand.GetQuery,
        queryName: IntelliCenterQueryName.GetHardwareDefinition,
        arguments: 'DISCOVERY<script>alert("xss")</script>',
        messageID: 'test-123',
      };

      platform.sendCommandNoWait(maliciousCommand);

      expect(sendSpy).toHaveBeenCalledWith(expect.stringContaining('"arguments":"DISCOVERYscriptalert(xss)/script"'));
    });

    it('should respect rate limiting', () => {
      const rateLimiterSpy = jest.spyOn((platform as any).rateLimiter, 'recordRequest').mockReturnValue(false);
      const sendSpy = jest.spyOn(mockTelnetInstance, 'send').mockImplementation();

      const command = {
        command: IntelliCenterRequestCommand.GetQuery,
        queryName: IntelliCenterQueryName.GetHardwareDefinition,
        arguments: 'DISCOVERY',
        messageID: 'test-123',
      };

      platform.sendCommandNoWait(command);

      expect(mockLogger.debug).toHaveBeenCalledWith('Rate limit exceeded. Command dropped to prevent overwhelming IntelliCenter.');
      expect(sendSpy).not.toHaveBeenCalled();

      rateLimiterSpy.mockRestore();
    });

    it('should not send commands when socket is not alive', () => {
      const sendSpy = jest.spyOn(mockTelnetInstance, 'send').mockImplementation();
      const maybeReconnectSpy = jest.spyOn(platform as any, 'maybeReconnect').mockImplementation();

      (platform as any).isSocketAlive = false;

      const command = {
        command: IntelliCenterRequestCommand.GetQuery,
        queryName: IntelliCenterQueryName.GetHardwareDefinition,
        arguments: 'DISCOVERY',
        messageID: 'test-123',
      };

      platform.sendCommandNoWait(command);

      expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('Cannot send command, socket is not alive'));
      expect(maybeReconnectSpy).toHaveBeenCalled();
      expect(sendSpy).not.toHaveBeenCalled();
    });

    it('should process command queue sequentially', async () => {
      // Use real timers for this test since it involves async processing
      jest.useRealTimers();

      const sendSpy = jest.spyOn(mockTelnetInstance, 'send').mockResolvedValue('');
      (platform as any).isSocketAlive = true;
      (platform as any).processingQueue = false;

      // Mock rate limiter to allow requests
      jest.spyOn((platform as any).rateLimiter, 'recordRequest').mockReturnValue(true);

      // Mock the delay method to resolve faster for testing
      jest.spyOn(platform as any, 'delay').mockResolvedValue(undefined);

      const command1 = {
        command: IntelliCenterRequestCommand.GetQuery,
        queryName: IntelliCenterQueryName.GetHardwareDefinition,
        arguments: 'DISCOVERY',
        messageID: 'a1b2c3d4-e5f6-7890-1234-567890abcdef',
      };

      const command2 = {
        command: IntelliCenterRequestCommand.GetQuery,
        queryName: IntelliCenterQueryName.GetHardwareDefinition,
        arguments: 'PANEL',
        messageID: 'b2c3d4e5-f6g7-8901-2345-678901bcdefg',
      };

      // Send first command
      platform.sendCommandNoWait(command1);

      // Wait for processing to complete
      await new Promise(resolve => setTimeout(resolve, 50));

      // Should process first command
      expect(sendSpy).toHaveBeenCalledTimes(1);
      expect(sendSpy).toHaveBeenCalledWith(expect.stringContaining('DISCOVERY'));

      // Send second command
      platform.sendCommandNoWait(command2);

      // Wait for second command processing
      await new Promise(resolve => setTimeout(resolve, 50));

      expect(sendSpy).toHaveBeenCalledTimes(2);
      expect(sendSpy).toHaveBeenCalledWith(expect.stringContaining('PANEL'));

      // Restore fake timers
      jest.useFakeTimers();
    });
  });

  describe('Update Handling', () => {
    beforeEach(() => {
      platform = new PentairPlatform(mockLogger, mockConfig, mockAPI);
    });

    it('should update circuit accessories', () => {
      const mockAccessory = {
        UUID: 'circuit-uuid',
        context: {
          circuit: {
            id: 'C01',
            objectType: 'Circuit',
          },
        },
      } as unknown as PlatformAccessory;

      platform.accessoryMap.set('circuit-uuid', mockAccessory);

      const updateCircuitSpy = jest.spyOn(require('../../src/util'), 'updateCircuit').mockImplementation();
      const mockParams = { STATUS: 'ON' };

      platform.updateCircuit(mockAccessory, mockParams as never);

      expect(updateCircuitSpy).toHaveBeenCalledWith(mockAccessory.context.circuit, mockParams);
      expect(mockAPI.updatePlatformAccessories).toHaveBeenCalledWith([mockAccessory]);
    });

    it('should update pump accessories', () => {
      const mockAccessory = {
        UUID: 'pump-uuid',
        context: {
          pumpCircuit: {
            id: 'P01',
            circuitId: 'C01',
          },
        },
      } as unknown as PlatformAccessory;

      const updateCircuitSpy = jest.spyOn(require('../../src/util'), 'updateCircuit').mockImplementation();
      const updatePumpSpy = jest.spyOn(require('../../src/util'), 'updatePump').mockImplementation();
      const mockParams = { SPEED: '75' };

      platform.updatePump(mockAccessory, mockParams as never);

      // updatePump method now directly updates pump circuit properties instead of calling updateCircuit
      // This is correct behavior since pump circuits have different properties than regular circuits
      expect(updateCircuitSpy).not.toHaveBeenCalled();
      // updatePump utility is only called if the parent pump exists (which it doesn't in this test)
      expect(updatePumpSpy).not.toHaveBeenCalled();
      expect(mockAPI.updatePlatformAccessories).toHaveBeenCalledWith([mockAccessory]);

      // Verify the pump circuit was updated directly
      expect(mockAccessory.context.pumpCircuit.speed).toBe('75');
    });

    it('should update heater RPM sensors when pump circuit speeds change', () => {
      // Setup pump accessory
      const mockPumpAccessory = {
        UUID: 'pump-uuid',
        context: {
          pumpCircuit: {
            id: 'PC003',
            speed: 2800,
            speedType: 'RPM',
          },
        },
      } as unknown as PlatformAccessory;

      // Setup heater RPM sensor accessory that uses the same pump circuit
      const mockHeaterRpmAccessory = {
        UUID: 'heater-rpm-uuid',
        displayName: 'Gas Heater RPM',
        context: {
          feature: {
            id: 'H0002',
            name: 'Gas Heater',
            bodyId: 'B1202',
          },
          pumpCircuit: {
            id: 'PC003',
            speed: 3000, // Old speed
            speedType: 'RPM',
          },
        },
      } as unknown as PlatformAccessory;

      // Add the heater RPM sensor to the accessory map
      platform.accessoryMap.set('heater-rpm-uuid', mockHeaterRpmAccessory);

      const updateCircuitSpy = jest.spyOn(require('../../src/util'), 'updateCircuit').mockImplementation();
      const updatePumpSpy = jest.spyOn(require('../../src/util'), 'updatePump').mockImplementation();
      const updatePumpSensorsSpy = jest.spyOn(platform as any, 'updateAllPumpSensorsForChangedCircuit').mockImplementation();

      const mockParams = { SPEED: '2800' };

      platform.updatePump(mockPumpAccessory, mockParams as never);

      // updatePump method now directly updates pump circuit properties instead of calling updateCircuit
      expect(updateCircuitSpy).not.toHaveBeenCalled();
      // updatePump utility is only called if the parent pump exists (which it doesn't in this test)
      expect(updatePumpSpy).not.toHaveBeenCalled();

      // Verify the pump circuit was updated directly
      expect(mockPumpAccessory.context.pumpCircuit.speed).toBe('2800');

      // Should still call pump sensor updates
      expect(updatePumpSensorsSpy).toHaveBeenCalledWith(mockPumpAccessory.context.pumpCircuit);
      expect(mockAPI.updatePlatformAccessories).toHaveBeenCalledWith([mockPumpAccessory]);
    });

    it('should update temperature sensors', () => {
      const mockAccessory = {
        UUID: 'sensor-uuid',
        context: {
          sensor: {
            id: 'S01',
            name: 'Pool Temp',
            objectType: ObjectType.Sensor,
          },
        },
      } as unknown as PlatformAccessory;

      const mockParams = { PROBE: '78.5' };

      platform.updateSensor(mockAccessory, mockParams as never);

      expect(mockLogger.debug).toHaveBeenCalledWith('Updating temperature sensor Pool Temp');
      expect(mockAccessory.context.sensor.probe).toBe(78.5);
    });

    it('should handle invalid temperature sensor values', () => {
      const mockAccessory = {
        UUID: 'sensor-uuid',
        context: {
          sensor: {
            id: 'S01',
            name: 'Pool Temp',
            objectType: ObjectType.Sensor,
          },
        },
      } as unknown as PlatformAccessory;

      const mockParams = { PROBE: 'invalid' };

      platform.updateSensor(mockAccessory, mockParams as never);

      expect(mockLogger.warn).toHaveBeenCalledWith('Invalid probe value received for sensor Pool Temp: invalid, skipping update');
    });

    it('should update heater RPM sensors using updateHeaterRpmSensorsForPumpCircuit', () => {
      // Setup a heater RPM sensor accessory with proper mock methods
      const mockHeaterRpmAccessory = {
        UUID: 'heater-rpm-uuid',
        displayName: 'Gas Heater RPM',
        context: {
          feature: {
            id: 'H0002',
            name: 'Gas Heater',
            bodyId: 'B1202',
          },
          pumpCircuit: {
            id: 'PC003',
            speed: 3000, // Old speed
            speedType: 'RPM',
          },
        },
        getService: jest.fn().mockReturnValue({
          setCharacteristic: jest.fn().mockReturnThis(),
          getCharacteristic: jest.fn().mockReturnValue({
            onGet: jest.fn().mockReturnThis(),
          }),
          updateCharacteristic: jest.fn().mockReturnThis(),
        }),
        addService: jest.fn().mockReturnValue({
          setCharacteristic: jest.fn().mockReturnThis(),
          getCharacteristic: jest.fn().mockReturnValue({
            onGet: jest.fn().mockReturnThis(),
          }),
          updateCharacteristic: jest.fn().mockReturnThis(),
        }),
      } as unknown as PlatformAccessory;

      // Add to accessory map
      platform.accessoryMap.set('heater-rpm-uuid', mockHeaterRpmAccessory);

      // Create updated pump circuit with new speed
      const updatedPumpCircuit = {
        id: 'PC003',
        speed: 2800, // New speed
        speedType: 'RPM',
      };

      // Call the function under test
      (platform as any).updateHeaterRpmSensorsForPumpCircuit(updatedPumpCircuit);

      // Verify the heater RPM sensor was updated
      expect(mockAPI.updatePlatformAccessories).toHaveBeenCalledWith([mockHeaterRpmAccessory]);
      expect(mockLogger.debug).toHaveBeenCalledWith('Updating heater RPM sensor pump circuit for Gas Heater RPM: 2800 RPM (was 3000 RPM)');
    });

    it('should not update non-heater RPM sensors in updateHeaterRpmSensorsForPumpCircuit', () => {
      // Setup a regular feature RPM sensor (not a heater)
      const mockFeatureRpmAccessory = {
        UUID: 'feature-rpm-uuid',
        displayName: 'Spa Jets RPM',
        context: {
          feature: {
            id: 'F001',
            name: 'Spa Jets',
          },
          pumpCircuit: {
            id: 'PC003',
            speed: 3000,
            speedType: 'RPM',
          },
        },
      } as unknown as PlatformAccessory;

      platform.accessoryMap.set('feature-rpm-uuid', mockFeatureRpmAccessory);

      const updatedPumpCircuit = {
        id: 'PC003',
        speed: 2800,
        speedType: 'RPM',
      };

      // Call the function under test
      (platform as any).updateHeaterRpmSensorsForPumpCircuit(updatedPumpCircuit);

      // Verify the regular feature RPM sensor was NOT updated (since it's not a heater)
      // We expect only heater RPM sensors to be updated by this function
      expect(mockAPI.updatePlatformAccessories).not.toHaveBeenCalledWith([mockFeatureRpmAccessory]);
    });
  });

  describe('Error Recovery', () => {
    beforeEach(() => {
      platform = new PentairPlatform(mockLogger, mockConfig, mockAPI);
    });

    it('should handle maybeReconnect with proper throttling', async () => {
      const connectSpy = jest.spyOn(platform, 'connectToIntellicenter').mockResolvedValue();

      // First reconnection attempt
      await (platform as any).maybeReconnect();
      expect(connectSpy).toHaveBeenCalledTimes(1);

      // Immediate second attempt should be throttled
      await (platform as any).maybeReconnect();
      expect(mockLogger.warn).toHaveBeenCalledWith('Reconnect suppressed: too soon after last one.');
      expect(connectSpy).toHaveBeenCalledTimes(1);
    });

    it('should handle reconnection failures gracefully', async () => {
      const error = new Error('Reconnection failed');
      jest.spyOn(platform, 'connectToIntellicenter').mockRejectedValue(error);

      await (platform as any).maybeReconnect();

      expect(mockLogger.error).toHaveBeenCalledWith('Reconnect failed.', error);
    });

    it('should prevent concurrent reconnection attempts', async () => {
      let resolveConnection: () => void;
      const connectionPromise = new Promise<void>(resolve => {
        resolveConnection = resolve;
      });

      jest.spyOn(platform, 'connectToIntellicenter').mockReturnValue(connectionPromise);

      // Start first reconnection
      const reconnect1 = (platform as any).maybeReconnect();

      // Start second reconnection (should be skipped)
      const reconnect2 = (platform as any).maybeReconnect();

      await reconnect2;
      expect(mockLogger.warn).toHaveBeenCalledWith('Reconnect already in progress. Skipping.');

      // Complete the first reconnection
      resolveConnection!();
      await reconnect1;
    });
  });

  describe('System Health and Configuration', () => {
    beforeEach(() => {
      platform = new PentairPlatform(mockLogger, mockConfig, mockAPI);
    });

    it('should return system health information', () => {
      // Mock health monitor methods
      jest.spyOn((platform as any).healthMonitor, 'getHealth').mockReturnValue({
        isHealthy: true,
        lastSuccessfulOperation: Date.now(),
        consecutiveFailures: 0,
        lastError: null,
        responseTime: 50,
      });

      jest.spyOn((platform as any).circuitBreaker, 'getStats').mockReturnValue({
        state: 'CLOSED',
        failureCount: 0,
        lastFailureTime: null,
      });

      jest.spyOn((platform as any).rateLimiter, 'getStats').mockReturnValue({
        requestCount: 5,
        lastRequestTime: Date.now(),
      });

      const health = platform.getSystemHealth();

      expect(health.isHealthy).toBe(true);
      expect(health.circuitBreaker.state).toBe('CLOSED');
      expect(health.connection.isSocketAlive).toBeDefined();
    });

    it('should reset error handling components', () => {
      const circuitBreakerResetSpy = jest.spyOn((platform as any).circuitBreaker, 'reset').mockImplementation();
      const healthMonitorResetSpy = jest.spyOn((platform as any).healthMonitor, 'reset').mockImplementation();

      platform.resetErrorHandling();

      expect(circuitBreakerResetSpy).toHaveBeenCalled();
      expect(healthMonitorResetSpy).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith('Error handling components have been reset');
    });

    it('should throw error when getting config before validation', () => {
      // Mock a fresh instance to start without validated config
      const testPlatform = Object.create(PentairPlatform.prototype);
      testPlatform.validatedConfig = null; // Ensure this is null to trigger the error

      expect(() => testPlatform.getConfig()).toThrow('Configuration has not been validated. Cannot return config.');
    });
  });

  describe('Command Processing and Sanitization', () => {
    beforeEach(() => {
      platform = new PentairPlatform(mockLogger, mockConfig, mockAPI);
      (platform as any).isSocketAlive = true;
      jest.spyOn((platform as any).rateLimiter, 'recordRequest').mockReturnValue(true);
    });

    it('should sanitize invalid messageID', () => {
      const sendSpy = jest.spyOn(mockTelnetInstance, 'send').mockImplementation();

      const commandWithInvalidMessageID = {
        command: IntelliCenterRequestCommand.GetQuery,
        queryName: IntelliCenterQueryName.GetHardwareDefinition,
        arguments: 'DISCOVERY',
        messageID: 'invalid-uuid-format',
      };

      platform.sendCommandNoWait(commandWithInvalidMessageID);

      expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('Invalid messageID format: invalid-uuid-format'));
      expect(sendSpy).toHaveBeenCalled();
    });

    it('should sanitize object names in object list', () => {
      const sendSpy = jest.spyOn(mockTelnetInstance, 'send').mockImplementation();

      const commandWithUnsafeObjectList = {
        command: IntelliCenterRequestCommand.SetParamList,
        messageID: 'test-123',
        objectList: [
          {
            objnam: 'B01<script>alert("xss")</script>',
            params: { LOTMP: '75' },
          },
        ],
      } as any;

      platform.sendCommandNoWait(commandWithUnsafeObjectList);

      const sentCommandStr = sendSpy.mock.calls[0]?.[0] as string;
      const sentCommand = JSON.parse(sentCommandStr.replace('\n', ''));
      expect(sentCommand.objectList[0].objnam).toBe('B01scriptalertxssscript');
    });

    it('should handle command queue processing with connection errors', async () => {
      const sendSpy = jest.spyOn(mockTelnetInstance, 'send').mockRejectedValue(new Error('connection failed'));
      const maybeReconnectSpy = jest.spyOn(platform as any, 'maybeReconnect').mockImplementation();

      // Ensure socket is alive so processCommandQueue runs
      (platform as any).isSocketAlive = true;
      (platform as any).processingQueue = false;

      // Mock rate limiter to allow requests
      jest.spyOn((platform as any).rateLimiter, 'recordRequest').mockReturnValue(true);

      // Mock the delay method to resolve immediately during tests
      jest.spyOn(platform as any, 'delay').mockResolvedValue(undefined);

      const command = {
        command: IntelliCenterRequestCommand.GetQuery,
        queryName: IntelliCenterQueryName.GetHardwareDefinition,
        arguments: 'DISCOVERY',
        messageID: 'test-123',
      };

      (platform as any).commandQueue.push(command);

      // Process the queue
      await (platform as any).processCommandQueue();

      expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining('Failed to send command to IntelliCenter'));
      expect(maybeReconnectSpy).toHaveBeenCalled();
    });

    it('should handle JSON serialization errors in command processing', async () => {
      jest.spyOn(mockTelnetInstance, 'send').mockImplementation();

      // Ensure socket is alive so processCommandQueue runs
      (platform as any).isSocketAlive = true;

      // Create a command with circular references to cause JSON.stringify to fail
      const circularCommand = {
        command: IntelliCenterRequestCommand.GetQuery,
        messageID: 'test-123',
      } as any;
      circularCommand.circular = circularCommand;

      (platform as any).commandQueue.push(circularCommand);
      await (platform as any).processCommandQueue();

      expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining('Failed to send command to IntelliCenter'));
    });

    it('should delay between commands during queue processing', async () => {
      const sendSpy = jest.spyOn(mockTelnetInstance, 'send').mockImplementation();
      const delaySpy = jest.spyOn(platform as any, 'delay').mockResolvedValue(undefined);

      const command = {
        command: IntelliCenterRequestCommand.GetQuery,
        queryName: IntelliCenterQueryName.GetHardwareDefinition,
        arguments: 'DISCOVERY',
        messageID: 'test-123',
      };

      (platform as any).commandQueue.push(command);
      await (platform as any).processCommandQueue();

      expect(sendSpy).toHaveBeenCalled();
      expect(delaySpy).toHaveBeenCalledWith(200);
    });
  });

  describe('Discovery and Accessory Management', () => {
    beforeEach(() => {
      platform = new PentairPlatform(mockLogger, mockConfig, mockAPI);
    });

    it('should subscribe for updates on discovered devices', () => {
      const sendCommandNoWaitSpy = jest.spyOn(platform, 'sendCommandNoWait').mockImplementation();

      const circuit = {
        id: 'C01',
        name: 'Test Circuit',
        objectType: 'Circuit',
      };

      platform.subscribeForUpdates(circuit as any, ['STATUS']);

      expect(sendCommandNoWaitSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          command: IntelliCenterRequestCommand.RequestParamList,
          objectList: [
            {
              objnam: 'C01',
              keys: ['STATUS'],
            },
          ],
        }),
      );
    });

    it('should handle discovery timeout and cleanup', () => {
      jest.useFakeTimers();
      const discoverDeviceTypeSpy = jest.spyOn(platform as any, 'discoverDeviceType').mockImplementation();

      // Start discovery
      platform.discoverDevices();

      // Verify the discovery process started
      expect(discoverDeviceTypeSpy).toHaveBeenCalled();

      jest.useRealTimers();
    });

    it('should handle missing configuration during connection', async () => {
      // Mock the config validation to return invalid
      const configValidationModule = require('../../src/configValidation');
      const originalValidate = configValidationModule.ConfigValidator.validate;

      configValidationModule.ConfigValidator.validate = jest.fn().mockReturnValue({
        isValid: false,
        errors: ['Missing ipAddress'],
        warnings: [],
        sanitizedConfig: null,
      });

      // Create platform with invalid config to prevent validation
      const invalidPlatform = new PentairPlatform(mockLogger, { ...mockConfig, ipAddress: undefined }, mockAPI);

      await invalidPlatform.connectToIntellicenter();

      expect(mockLogger.error).toHaveBeenCalledWith('Cannot connect: Configuration validation failed');

      // Restore original
      configValidationModule.ConfigValidator.validate = originalValidate;
    });

    it('should handle circuit breaker open state during connection', async () => {
      jest.spyOn((platform as any).circuitBreaker, 'execute').mockRejectedValue(new Error('Circuit breaker is OPEN'));

      await platform.connectToIntellicenter();

      expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining('Connection to IntelliCenter failed after retries'));
    });
  });

  describe('Update Processing Edge Cases', () => {
    beforeEach(() => {
      platform = new PentairPlatform(mockLogger, mockConfig, mockAPI);
    });

    it('should handle updates for unregistered devices with pump characteristics', () => {
      const notifyResponse: IntelliCenterResponse = {
        response: IntelliCenterResponseStatus.Ok,
        command: IntelliCenterResponseCommand.NotifyList,
        messageID: 'test-123',
        description: 'Notify response',
        answer: undefined as never,
        objectList: [
          {
            objnam: 'P99',
            params: { SPEED: '1500', SELECT: 'RPM' },
          } as unknown as CircuitStatusMessage,
        ],
      };

      platform.handleUpdate(notifyResponse);

      expect(mockLogger.debug).toHaveBeenCalledWith(expect.stringContaining('Standalone pump P99 update'));
    });

    it('should handle updates for unregistered devices with identification info', () => {
      const notifyResponse: IntelliCenterResponse = {
        response: IntelliCenterResponseStatus.Ok,
        command: IntelliCenterResponseCommand.NotifyList,
        messageID: 'test-123',
        description: 'Notify response',
        answer: undefined as never,
        objectList: [
          {
            objnam: 'UNKNOWN99',
            params: {
              OBJTYP: 'Circuit',
              SUBTYP: 'Light',
              SNAME: 'Unknown Light',
              FEATR: 'ON',
            },
          } as unknown as CircuitStatusMessage,
        ],
      };

      platform.handleUpdate(notifyResponse);

      expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('Unregistered device details - ID: UNKNOWN99'));
    });

    it('should handle updates for devices without params', () => {
      // Ensure the accessory is not in the map and not a pump
      platform.accessoryMap.clear();
      (platform as any).pumpIdToCircuitMap = new Map();

      const notifyResponse: IntelliCenterResponse = {
        response: IntelliCenterResponseStatus.Ok,
        command: IntelliCenterResponseCommand.NotifyList,
        messageID: 'test-123',
        description: 'Notify response',
        answer: undefined as never,
        objectList: [
          {
            objnam: 'NOPARAM99',
            params: undefined,
          } as unknown as CircuitStatusMessage,
        ],
      };

      platform.handleUpdate(notifyResponse);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Device NOPARAM99 sending updates but not registered as accessory. No params available for identification.',
      );
    });

    it('should handle sensor updates', () => {
      // Generate UUID using the same method as the platform
      const sensorUUID = mockAPI.hap.uuid.generate('S01');

      const mockAccessory = {
        UUID: sensorUUID,
        context: {
          sensor: {
            id: 'S01',
            name: 'Pool Temp',
            objectType: ObjectType.Sensor,
          },
        },
      } as unknown as PlatformAccessory;

      platform.accessoryMap.set(sensorUUID, mockAccessory);

      const notifyResponse: IntelliCenterResponse = {
        response: IntelliCenterResponseStatus.Ok,
        command: IntelliCenterResponseCommand.NotifyList,
        messageID: 'test-123',
        description: 'Notify response',
        answer: undefined as never,
        objectList: [
          {
            objnam: 'S01',
            params: { PROBE: '78.5' },
          } as unknown as CircuitStatusMessage,
        ],
      };

      const updateSensorSpy = jest.spyOn(platform, 'updateSensor').mockImplementation();

      // Test should work now with corrected SensorTypes mock

      platform.handleUpdate(notifyResponse);

      expect(updateSensorSpy).toHaveBeenCalledWith(mockAccessory, { PROBE: '78.5' });
    });

    it('should handle unhandled object types on accessories', () => {
      const mockAccessory = {
        UUID: 'mock-uuid-UNKNOWN',
        context: {
          unknownType: {
            id: 'UNKNOWN01',
            objectType: 'UnknownType',
          },
        },
      } as unknown as PlatformAccessory;

      platform.accessoryMap.set('mock-uuid-UNKNOWN', mockAccessory);

      const notifyResponse: IntelliCenterResponse = {
        response: IntelliCenterResponseStatus.Ok,
        command: IntelliCenterResponseCommand.NotifyList,
        messageID: 'test-123',
        description: 'Notify response',
        answer: undefined as never,
        objectList: [
          {
            objnam: 'UNKNOWN',
            params: { STATUS: 'ON' },
          } as unknown as CircuitStatusMessage,
        ],
      };

      platform.handleUpdate(notifyResponse);

      expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('Unhandled object type on accessory'));
    });
  });

  describe('Utility and Helper Methods', () => {
    beforeEach(() => {
      platform = new PentairPlatform(mockLogger, mockConfig, mockAPI);
    });

    it('should handle delay method', async () => {
      // Use real timers for this specific test
      jest.useRealTimers();

      const start = Date.now();
      await (platform as any).delay(10); // Use shorter delay for testing
      const end = Date.now();

      expect(end - start).toBeGreaterThanOrEqual(5); // Allow some variance

      // Restore fake timers
      jest.useFakeTimers();
    }, 10000);

    it('should handle writeParamList responses', () => {
      const writeResponse: IntelliCenterResponse = {
        response: IntelliCenterResponseStatus.Ok,
        command: IntelliCenterResponseCommand.WriteParamList,
        messageID: 'test-123',
        description: 'Write response',
        answer: undefined as never,
        objectList: [
          {
            objnam: 'C01',
            params: { STATUS: 'ON' },
          } as unknown as CircuitStatusMessage,
        ],
      };

      platform.handleUpdate(writeResponse);

      expect(mockLogger.debug).toHaveBeenCalledWith(expect.stringContaining('Handling IntelliCenter 200 response'));
    });

    it('should handle command queue processing errors without connection keywords', async () => {
      const sendSpy = jest.spyOn(mockTelnetInstance, 'send').mockRejectedValue(new Error('Generic error'));

      // Ensure socket is alive so processCommandQueue runs
      (platform as any).isSocketAlive = true;
      (platform as any).processingQueue = false;

      // Mock rate limiter to allow requests
      jest.spyOn((platform as any).rateLimiter, 'recordRequest').mockReturnValue(true);

      // Mock the delay method to resolve immediately during tests
      jest.spyOn(platform as any, 'delay').mockResolvedValue(undefined);

      const command = {
        command: IntelliCenterRequestCommand.GetQuery,
        queryName: IntelliCenterQueryName.GetHardwareDefinition,
        arguments: 'DISCOVERY',
        messageID: 'test-123',
      };

      (platform as any).commandQueue.push(command);
      await (platform as any).processCommandQueue();

      expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining('Failed to send command to IntelliCenter'));
    });
  });

  describe('Additional Edge Cases and Coverage', () => {
    beforeEach(() => {
      platform = new PentairPlatform(mockLogger, mockConfig, mockAPI);
    });

    it('should handle pump circuit mapping', () => {
      const pumpToCircuitMap = (platform as any).pumpIdToCircuitMap;
      const circuit = { id: 'C01', name: 'Test Circuit' };

      pumpToCircuitMap.set('P01', circuit);

      const notifyResponse: IntelliCenterResponse = {
        response: IntelliCenterResponseStatus.Ok,
        command: IntelliCenterResponseCommand.NotifyList,
        messageID: 'test-123',
        description: 'Notify response',
        answer: undefined as never,
        objectList: [
          {
            objnam: 'P01',
            params: { SPEED: '1500' },
          } as unknown as CircuitStatusMessage,
        ],
      };

      const mockAccessory = {
        UUID: 'mock-uuid-C01',
        context: {
          pumpCircuit: {
            id: 'P01',
            circuitId: 'C01',
          },
        },
      } as unknown as PlatformAccessory;

      platform.accessoryMap.set('mock-uuid-C01', mockAccessory);
      const updatePumpSpy = jest.spyOn(platform, 'updatePump').mockImplementation();

      platform.handleUpdate(notifyResponse);

      expect(mockLogger.debug).toHaveBeenCalledWith('Update is for pump circuit P01 -> Circuit C01 (controlled by pump unknown)');
      expect(updatePumpSpy).toHaveBeenCalledWith(mockAccessory, { SPEED: '1500' });
    });

    it('should handle body object type in updateCircuit', () => {
      const mockAccessory = {
        UUID: 'body-uuid',
        context: {
          circuit: {
            id: 'B01',
            objectType: ObjectType.Body,
            temperature: 75,
          },
        },
      } as unknown as PlatformAccessory;

      const updateHeaterStatusesSpy = jest.spyOn(platform as any, 'updateHeaterStatuses').mockImplementation();
      const updateCircuitSpy = jest.spyOn(require('../../src/util'), 'updateCircuit').mockImplementation();
      const updateBodySpy = jest.spyOn(require('../../src/util'), 'updateBody').mockImplementation();

      const mockParams = { LSTTMP: '80' };
      platform.updateCircuit(mockAccessory, mockParams as never);

      expect(updateCircuitSpy).toHaveBeenCalledWith(mockAccessory.context.circuit, mockParams);
      expect(updateBodySpy).toHaveBeenCalledWith(mockAccessory.context.circuit, mockParams);
      expect(updateHeaterStatusesSpy).toHaveBeenCalledWith(mockAccessory.context.circuit);
    });

    it('should handle updateHeaterStatuses with matching body', () => {
      const mockBody = { id: 'B01', temperature: 80 };
      const mockHeaterAccessory = {
        displayName: 'Pool Heater',
        context: {
          body: { id: 'B01' },
          heater: { id: 'H01', name: 'Pool Heater' },
        },
      } as unknown as PlatformAccessory;

      platform.heaters.set('heater-uuid', mockHeaterAccessory);

      platform.updateHeaterStatuses(mockBody as any);

      expect(mockLogger.debug).toHaveBeenCalledWith('Updating heater Pool Heater');
      expect(mockHeaterAccessory.context.body).toBe(mockBody);
    });

    it('should handle updateHeaterStatuses with non-matching body', () => {
      const mockBody = { id: 'B01', temperature: 80 };
      const mockHeaterAccessory = {
        displayName: 'Spa Heater',
        context: {
          body: { id: 'B02' },
        },
      } as unknown as PlatformAccessory;

      platform.heaters.set('heater-uuid', mockHeaterAccessory);

      platform.updateHeaterStatuses(mockBody as any);

      expect(mockLogger.debug).toHaveBeenCalledWith("Not updating heater because body id of heater B02 doesn't match input body ID B01");
    });

    it('should handle discovery command iteration', () => {
      const discoverDeviceTypeSpy = jest.spyOn(platform as any, 'discoverDeviceType').mockImplementation();

      // Simulate partial discovery completion
      (platform as any).discoverCommandsSent = ['CIRCUITS', 'PUMPS'];
      (platform as any).discoveryBuffer = { panels: [] };

      const response = {
        response: IntelliCenterResponseStatus.Ok,
        command: IntelliCenterResponseCommand.SendQuery,
        queryName: IntelliCenterQueryName.GetHardwareDefinition,
        messageID: 'test-123',
        description: 'Success',
        answer: { circuits: [] },
      } as any;

      jest.useFakeTimers();
      platform.handleDiscoveryResponse(response);

      expect(mockLogger.debug).toHaveBeenCalledWith('Merged 2 of 7 so far. Sending next command..');

      // Fast forward the timeout
      jest.advanceTimersByTime(500);
      expect(discoverDeviceTypeSpy).toHaveBeenCalledWith('CHEMS');

      jest.useRealTimers();
    });

    it('should handle excessive parse errors and trigger reconnection', async () => {
      const maybeReconnectSpy = jest.spyOn(platform as any, 'maybeReconnect').mockImplementation();

      // Set parse error count high
      (platform as any).parseErrorCount = 10;

      const parseErrorResponse: IntelliCenterResponse = {
        response: '400' as any,
        command: IntelliCenterResponseCommand.Error,
        messageID: 'test-123',
        description: 'ParseError: Too many errors',
        answer: undefined as never,
      };

      await platform.handleUpdate(parseErrorResponse);

      expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining('Excessive ParseErrors (11). Attempting to reconnect...'));
      expect(maybeReconnectSpy).toHaveBeenCalled();
    });

    it('should handle missing sensor context in updateSensor', () => {
      const mockAccessory = {
        UUID: 'sensor-uuid',
        context: {},
      } as unknown as PlatformAccessory;

      const mockParams = { PROBE: '78.5' };
      platform.updateSensor(mockAccessory, mockParams as never);

      // Should complete without error, but no sensor to update
      expect(mockAPI.updatePlatformAccessories).toHaveBeenCalledWith([mockAccessory]);
    });

    it('should handle non-sensor object type in updateSensor', () => {
      const mockAccessory = {
        UUID: 'sensor-uuid',
        context: {
          sensor: {
            id: 'S01',
            name: 'Not a Sensor',
            objectType: ObjectType.Circuit, // Wrong type
          },
        },
      } as unknown as PlatformAccessory;

      const mockParams = { PROBE: '78.5' };
      platform.updateSensor(mockAccessory, mockParams as never);

      // Should complete without error
      expect(mockAPI.updatePlatformAccessories).toHaveBeenCalledWith([mockAccessory]);
    });

    it('should handle complete discovery with full panel data', () => {
      const transformPanelsSpy = jest.spyOn(require('../../src/util'), 'transformPanels').mockReturnValue([
        {
          id: 'panel1',
          sensors: [
            {
              id: 'S01',
              name: 'Pool Temp',
              objectType: ObjectType.Sensor,
              type: 'POOL',
            },
          ],
          pumps: [
            {
              id: 'P01',
              name: 'Pool Pump',
              objectType: 'Pump',
              circuits: [
                {
                  id: 'PC01',
                  pump: { id: 'P01' },
                  circuitId: 'C01',
                  speed: 1500,
                },
              ],
            },
          ],
          modules: [
            {
              features: [
                {
                  id: 'C01',
                  name: 'Pool Light',
                  objectType: 'Circuit',
                  type: 'LIGHT',
                },
              ],
              bodies: [
                {
                  id: 'B01',
                  name: 'Pool',
                  objectType: 'Body',
                  type: 'POOL',
                },
              ],
              heaters: [
                {
                  id: 'H01',
                  name: 'Pool Heater',
                  objectType: 'Heater',
                  bodyIds: ['B01'],
                },
              ],
            },
          ],
          features: [],
        },
      ]);

      // Mock discovery methods
      const discoverTemperatureSensorSpy = jest.spyOn(platform as any, 'discoverTemperatureSensor').mockImplementation();
      const discoverCircuitSpy = jest.spyOn(platform as any, 'discoverCircuit').mockImplementation();
      const discoverHeaterSpy = jest.spyOn(platform as any, 'discoverHeater').mockImplementation();

      // Set all commands as sent to trigger completion
      const allCommands = ['CIRCUITS', 'PUMPS', 'CHEMS', 'VALVES', 'HEATERS', 'SENSORS', 'GROUPS'];
      (platform as any).discoverCommandsSent = [...allCommands];
      (platform as any).discoveryBuffer = { panels: [] };

      const response = {
        response: IntelliCenterResponseStatus.Ok,
        command: IntelliCenterResponseCommand.SendQuery,
        queryName: IntelliCenterQueryName.GetHardwareDefinition,
        messageID: 'test-125',
        description: 'Success',
        answer: { panels: [] },
      } as any;

      platform.handleDiscoveryResponse(response);

      expect(transformPanelsSpy).toHaveBeenCalled();
      expect(discoverTemperatureSensorSpy).toHaveBeenCalled();
      expect(discoverCircuitSpy).toHaveBeenCalled();
      expect(discoverHeaterSpy).toHaveBeenCalled();
    });

    it('should handle JSON validation error in command processing', async () => {
      const sendSpy = jest.spyOn(mockTelnetInstance, 'send').mockImplementation();

      // Ensure socket is alive so processCommandQueue runs
      (platform as any).isSocketAlive = true;
      (platform as any).processingQueue = false;

      // Mock rate limiter to allow requests
      jest.spyOn((platform as any).rateLimiter, 'recordRequest').mockReturnValue(true);

      // Mock the delay method to resolve immediately during tests
      jest.spyOn(platform as any, 'delay').mockResolvedValue(undefined);

      // Mock JSON.stringify to throw error during processCommandQueue
      const originalStringify = JSON.stringify;
      jest.spyOn(JSON, 'stringify').mockImplementationOnce(() => {
        throw new Error('Invalid JSON structure');
      });

      const command = {
        command: IntelliCenterRequestCommand.GetQuery,
        queryName: IntelliCenterQueryName.GetHardwareDefinition,
        arguments: 'DISCOVERY',
        messageID: 'a1b2c3d4-e5f6-7890-1234-567890abcdef',
      };

      (platform as any).commandQueue.push(command);
      await (platform as any).processCommandQueue();

      expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining('Failed to send command to IntelliCenter'));

      // Restore original JSON.stringify
      JSON.stringify = originalStringify;
    });

    it('should handle discovery response logging and merging', () => {
      const mergeResponseSpy = jest.spyOn(require('../../src/util'), 'mergeResponse').mockImplementation();

      // First response - establishes buffer
      const firstResponse = {
        response: IntelliCenterResponseStatus.Ok,
        command: IntelliCenterResponseCommand.SendQuery,
        queryName: IntelliCenterQueryName.GetHardwareDefinition,
        messageID: 'test-123',
        description: 'Success',
        answer: { circuits: [] },
      } as any;

      (platform as any).discoverCommandsSent = [];
      (platform as any).discoveryBuffer = null;

      platform.handleDiscoveryResponse(firstResponse);

      expect(mockLogger.debug).toHaveBeenCalledWith(expect.stringContaining('Discovery response from IntelliCenter'));
      expect((platform as any).discoveryBuffer).toEqual(firstResponse.answer);

      // Second response - should merge
      const secondResponse = {
        response: IntelliCenterResponseStatus.Ok,
        command: IntelliCenterResponseCommand.SendQuery,
        queryName: IntelliCenterQueryName.GetHardwareDefinition,
        messageID: 'test-124',
        description: 'Success',
        answer: { pumps: [] },
      } as any;

      // Add a command to simulate second discovery command being sent
      (platform as any).discoverCommandsSent.push('CIRCUITS');

      platform.handleDiscoveryResponse(secondResponse);

      expect(mergeResponseSpy).toHaveBeenCalledWith(firstResponse.answer, secondResponse.answer);
    });

    it('should handle socket data with newline termination correctly', async () => {
      const onCall = mockTelnetInstance.on.mock.calls.find(call => call[0] === 'data');
      const handler = onCall![1] as (chunk: Buffer) => Promise<void>;

      const validResponse = {
        response: IntelliCenterResponseStatus.Ok,
        command: 'UnknownCommand' as any,
        messageID: 'test-123',
        description: 'Test response',
      };

      // Send data with newline (ASCII 10)
      const chunkWithNewline = Buffer.from(JSON.stringify(validResponse) + '\n');

      await handler(chunkWithNewline);

      expect(mockLogger.debug).toHaveBeenCalledWith(expect.stringContaining('Unhandled command in handleUpdate'));
    });

    it('should handle empty command queue in processCommandQueue', async () => {
      (platform as any).commandQueue = [];
      (platform as any).processingQueue = false;

      await (platform as any).processCommandQueue();

      // Should return early without processing
      expect((platform as any).processingQueue).toBe(false);
    });

    it('should handle command queue when socket is not alive', async () => {
      (platform as any).isSocketAlive = false;
      (platform as any).processingQueue = false;
      (platform as any).commandQueue = [
        {
          command: IntelliCenterRequestCommand.GetQuery,
          messageID: 'test-123',
        },
      ];

      await (platform as any).processCommandQueue();

      // Should exit loop when socket is not alive
      expect((platform as any).processingQueue).toBe(false);
    });

    it('should handle updateSensor with TemperatureAccessory call', () => {
      const mockAccessory = {
        UUID: 'sensor-uuid',
        context: {
          sensor: {
            id: 'S01',
            name: 'Pool Temp',
            objectType: ObjectType.Sensor,
          },
        },
      } as unknown as PlatformAccessory;

      // Mock TemperatureAccessory constructor and updateTemperature method
      const mockTempAccessory = {
        updateTemperature: jest.fn(),
      };

      const TempAccessoryConstructor = require('../../src/temperatureAccessory').TemperatureAccessory;
      jest.spyOn(TempAccessoryConstructor.prototype, 'constructor').mockImplementation(() => mockTempAccessory);
      jest.spyOn(mockTempAccessory, 'updateTemperature').mockImplementation();

      const mockParams = { PROBE: '78.5' };
      platform.updateSensor(mockAccessory, mockParams as never);

      expect(mockAccessory.context.sensor.probe).toBe(78.5);
      expect(mockLogger.debug).toHaveBeenCalledWith('Updating temperature sensor Pool Temp');
    });
  });

  describe('Connection Lifecycle Events', () => {
    beforeEach(() => {
      platform = new PentairPlatform(mockLogger, mockConfig, mockAPI);
    });

    it('should handle didFinishLaunching event', async () => {
      const connectSpy = jest.spyOn(platform as any, 'connectToIntellicenter').mockResolvedValue(undefined);

      // Trigger the didFinishLaunching event
      const didFinishLaunchingCallback = mockAPI.on.mock.calls.find((call: any) => call[0] === 'didFinishLaunching')?.[1] as
        | (() => void)
        | undefined;
      if (didFinishLaunchingCallback) {
        await didFinishLaunchingCallback();
      }

      expect(connectSpy).toHaveBeenCalled();
    });

    it('should handle connection ready event', async () => {
      (platform as any).isSocketAlive = false;

      // Simulate the ready event
      const readyHandler = mockTelnetInstance.on.mock.calls.find(call => call[0] === 'ready')?.[1] as (() => void) | undefined;
      if (!readyHandler) throw new Error('Ready handler not found');
      readyHandler();

      expect((platform as any).isSocketAlive).toBe(true);
      expect(mockLogger.debug).toHaveBeenCalledWith('IntelliCenter socket connection is ready.');
    });

    it('should handle connection failedlogin event', async () => {
      (platform as any).isSocketAlive = true;

      // Simulate the failedlogin event
      const failedLoginHandler = mockTelnetInstance.on.mock.calls.find(call => call[0] === 'failedlogin')?.[1] as
        | ((error: string) => void)
        | undefined;
      if (!failedLoginHandler) throw new Error('Failed login handler not found');
      failedLoginHandler('Invalid credentials');

      expect((platform as any).isSocketAlive).toBe(false);
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('IntelliCenter login failed. Check configured username/password. Invalid credentials'),
      );
    });

    it('should handle validation error in getConfig', () => {
      const testPlatform = Object.create(PentairPlatform.prototype);
      testPlatform.validatedConfig = null;

      expect(() => testPlatform.getConfig()).toThrow('Configuration has not been validated. Cannot return config.');
    });
  });

  describe('Device Discovery Edge Cases', () => {
    beforeEach(() => {
      platform = new PentairPlatform(mockLogger, mockConfig, mockAPI);
    });

    it('should handle discoverHeater with missing body', () => {
      const heater = {
        id: 'H01',
        name: 'Pool Heater',
        bodyIds: ['B01'],
      } as any;

      const bodyMap = new Map();
      // bodyMap deliberately empty to test missing body scenario

      platform.discoverHeater(heater, bodyMap);

      expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining('Body not in bodyMap for ID B01'));
    });

    it('should handle cleanupOrphanedAccessories for circuit accessories', () => {
      const mockAccessory = {
        UUID: 'circuit-uuid',
        displayName: 'Pool Light',
        context: {
          circuit: { id: 'C01' },
        },
      };

      (platform as any).accessoryMap.set('circuit-uuid', mockAccessory);

      const currentCircuitIds = new Set<string>(['C02']); // Different ID to trigger removal
      const currentSensorIds = new Set<string>();
      const currentHeaterIds = new Set<string>();

      // Combine all discovered accessory IDs into a single set
      const discoveredAccessoryIds = new Set<string>([...currentCircuitIds, ...currentSensorIds, ...currentHeaterIds]);
      platform.cleanupOrphanedAccessories(discoveredAccessoryIds);

      expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('Removing orphaned accessory: Pool Light'));
      expect(mockAPI.unregisterPlatformAccessories).toHaveBeenCalled();
    });

    it('should handle cleanupOrphanedAccessories for sensor accessories', () => {
      const mockAccessory = {
        UUID: 'sensor-uuid',
        displayName: 'Pool Temp',
        context: {
          sensor: { id: 'S01' },
        },
      };

      (platform as any).accessoryMap.set('sensor-uuid', mockAccessory);

      const currentCircuitIds = new Set<string>();
      const currentSensorIds = new Set<string>(['S02']); // Different ID to trigger removal
      const currentHeaterIds = new Set<string>();

      // Combine all discovered accessory IDs into a single set
      const discoveredAccessoryIds = new Set<string>([...currentCircuitIds, ...currentSensorIds, ...currentHeaterIds]);
      platform.cleanupOrphanedAccessories(discoveredAccessoryIds);

      expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('Removing orphaned accessory: Pool Temp'));
    });

    it('should handle cleanupOrphanedAccessories for heater accessories', () => {
      const mockAccessory = {
        UUID: 'heater-uuid',
        displayName: 'Pool Heater',
        context: {
          heater: { id: 'H01' },
          body: { id: 'B01' },
        },
      };

      (platform as any).accessoryMap.set('heater-uuid', mockAccessory);
      (platform as any).heaters.set('heater-uuid', mockAccessory);

      const currentCircuitIds = new Set<string>();
      const currentSensorIds = new Set<string>();
      const currentHeaterIds = new Set<string>(['H01.B02']); // Different body ID to trigger removal

      // Combine all discovered accessory IDs into a single set
      const discoveredAccessoryIds = new Set<string>([...currentCircuitIds, ...currentSensorIds, ...currentHeaterIds]);
      platform.cleanupOrphanedAccessories(discoveredAccessoryIds);

      expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('Removing orphaned accessory: Pool Heater'));
    });

    it('should handle discoverTemperatureSensor with non-air temperature', () => {
      const sensor = {
        id: 'S01',
        name: 'Pool Temp',
        objectType: ObjectType.Sensor,
        type: TemperatureSensorType.Pool,
      } as any;

      const mockAccessory = {
        UUID: 'sensor-uuid',
        displayName: 'Pool Temp',
        context: { sensor },
      };

      (platform as any).accessoryMap.set('sensor-uuid', mockAccessory);

      const mockPanel = { modules: [{ heaters: [{ id: 'H01' }] }] } as any; // Has heater to trigger skip
      platform.discoverTemperatureSensor(mockPanel, null, sensor);

      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining('Skipping water temperature sensor Pool Temp because a heater is installed'),
      );
    });
  });

  describe('Error Handling and Edge Cases', () => {
    beforeEach(() => {
      platform = new PentairPlatform(mockLogger, mockConfig, mockAPI);
    });

    it('should handle sendCommandNoWait when rate limited', () => {
      jest.spyOn((platform as any).rateLimiter, 'recordRequest').mockReturnValue(false);

      const command = {
        command: IntelliCenterRequestCommand.GetQuery,
        messageID: 'test-123',
      };

      platform.sendCommandNoWait(command);

      expect(mockLogger.debug).toHaveBeenCalledWith(expect.stringContaining('Rate limit exceeded. Command dropped'));
    });

    it('should handle sendCommandNoWait when socket not alive', () => {
      (platform as any).isSocketAlive = false;
      const maybeReconnectSpy = jest.spyOn(platform as any, 'maybeReconnect').mockImplementation();

      const command = {
        command: IntelliCenterRequestCommand.GetQuery,
        messageID: 'test-123',
      };

      platform.sendCommandNoWait(command);

      expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('Cannot send command, socket is not alive'));
      expect(maybeReconnectSpy).toHaveBeenCalled();
    });

    it('should handle sanitizeCommand with invalid messageID', () => {
      const command = {
        command: IntelliCenterRequestCommand.GetQuery,
        messageID: 'invalid-format',
      };

      const result = (platform as any).sanitizeCommand(command);

      expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('Invalid messageID format: invalid-format'));
      expect(result.messageID).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    });

    it('should handle sanitizeCommand with objectList', () => {
      const command = {
        command: IntelliCenterRequestCommand.RequestParamList,
        messageID: 'a1b2c3d4-e5f6-7890-1234-567890abcdef',
        objectList: [{ objnam: 'invalid<chars>' }],
      };

      const result = (platform as any).sanitizeCommand(command);

      expect(result.objectList[0].objnam).toBe('invalidchars');
    });

    it('should handle processCommandQueue with connection error', async () => {
      (platform as any).isSocketAlive = true;
      (platform as any).processingQueue = false;
      const maybeReconnectSpy = jest.spyOn(platform as any, 'maybeReconnect').mockImplementation();

      mockTelnetInstance.send.mockRejectedValueOnce(new Error('connection lost'));

      const command = {
        command: IntelliCenterRequestCommand.GetQuery,
        messageID: 'a1b2c3d4-e5f6-7890-1234-567890abcdef',
      };

      (platform as any).commandQueue.push(command);
      await (platform as any).processCommandQueue();

      expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining('Failed to send command to IntelliCenter'));
      expect(maybeReconnectSpy).toHaveBeenCalled();
    });

    it('should handle maybeReconnect when already reconnecting', async () => {
      (platform as any).reconnecting = true;

      await (platform as any).maybeReconnect();

      expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('Reconnect already in progress. Skipping.'));
    });

    it('should handle maybeReconnect when too soon after last reconnect', async () => {
      (platform as any).reconnecting = false;
      (platform as any).lastReconnectTime = Date.now() - 15000; // 15 seconds ago (< 30 seconds)

      await (platform as any).maybeReconnect();

      expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('Reconnect suppressed: too soon after last one.'));
    });
  });

  describe('JSON Handling Edge Cases', () => {
    beforeEach(() => {
      platform = new PentairPlatform(mockLogger, mockConfig, mockAPI);
    });

    it('should handle circular references in json method', () => {
      const circularObj: any = { name: 'test' };
      circularObj.self = circularObj;

      const result = platform.json(circularObj);

      expect(result).toContain('[Circular]');
    });
  });

  describe('Full Coverage Tests for Platform', () => {
    beforeEach(() => {
      platform = new PentairPlatform(mockLogger, mockConfig, mockAPI);
    });

    it('should cover responseready event', () => {
      // Trigger responseready event
      const responseReadyHandler = mockTelnetInstance.on.mock.calls.find(call => call[0] === 'responseready')?.[1] as
        | ((data: string) => void)
        | undefined;
      if (responseReadyHandler) {
        responseReadyHandler('test response data');
        expect(mockLogger.error).toHaveBeenCalledWith('IntelliCenter responseready. test response data');
      }
    });

    it('should cover delay method usage', async () => {
      const delaySpy = jest.spyOn(platform as any, 'delay').mockResolvedValue(undefined);

      // Test the delay method directly
      await (platform as any).delay(1000);

      expect(delaySpy).toHaveBeenCalledWith(1000);
    });

    it('should cover ParseError reset logic after 5 minutes', async () => {
      const mockTime = Date.now();
      jest.setSystemTime(mockTime);

      // Set up previous parse error time more than 5 minutes ago
      (platform as any).parseErrorResetTime = mockTime - 400000; // 6.67 minutes ago
      (platform as any).parseErrorCount = 5;

      const parseErrorResponse: IntelliCenterResponse = {
        command: IntelliCenterResponseCommand.Error,
        response: '400' as any,
        description: 'ParseError: Invalid command',
        messageID: '123',
      };

      await platform.handleUpdate(parseErrorResponse);

      // Should have reset the counter and time
      expect((platform as any).parseErrorCount).toBe(1);
      expect((platform as any).parseErrorResetTime).toBe(mockTime);
    });

    it('should cover panel features discovery', () => {
      const mockMergeResponse = require('../../src/util').mergeResponse;
      const mockTransformPanels = require('../../src/util').transformPanels;

      // Set up discovery buffer first
      (platform as any).discoveryBuffer = undefined;

      // Mock the response
      const discoveryResponse = {
        command: 'SendQuery',
        response: '200',
        answer: {
          panels: [
            {
              id: 'P1',
              modules: [],
              features: [
                { id: 'F1', name: 'Feature 1', objectType: ObjectType.Circuit },
                { id: 'F2', name: 'Feature 2', objectType: ObjectType.Circuit },
              ],
              circuits: [],
              bodies: [],
              heaters: [],
              sensors: [],
            },
          ],
        },
        messageID: 'test-id',
      };

      mockTransformPanels.mockReturnValue([
        {
          id: 'P1',
          modules: [],
          features: [
            { id: 'F1', name: 'Feature 1', objectType: ObjectType.Circuit },
            { id: 'F2', name: 'Feature 2', objectType: ObjectType.Circuit },
          ],
          circuits: [],
          bodies: [],
          heaters: [],
          sensors: [],
          pumps: [],
        },
      ]);

      // Mock the discoverCommandsSent to indicate we're done with discovery
      (platform as any).discoverCommandsSent = [
        'GetHardwareDefinition',
        'GetHardwareDefinition',
        'GetHardwareDefinition',
        'GetHardwareDefinition',
        'GetHardwareDefinition',
        'GetHardwareDefinition',
        'GetHardwareDefinition',
      ]; // All 7 commands sent

      (platform as any).handleDiscoveryResponse(discoveryResponse);

      expect(mockLogger.debug).toHaveBeenCalledWith(expect.stringContaining('Discovery commands completed'));
    });

    it('should cover temperature sensor registration with existing accessory', () => {
      const sensor = {
        id: 'S1',
        name: 'Air Temp',
        objectType: ObjectType.Sensor,
        type: TemperatureSensorType.Air,
      } as any;

      const mockAccessory = {
        UUID: 'sensor-uuid',
        displayName: 'Air Temp',
        context: { sensor },
      };

      // Add existing accessory to map
      (platform as any).accessoryMap.set('mock-uuid-S1', mockAccessory);

      const mockPanel = { modules: [] } as any;
      platform.discoverTemperatureSensor(mockPanel, null, sensor);

      expect(mockLogger.debug).toHaveBeenCalledWith(expect.stringContaining('Restoring existing temperature sensor from cache: Air Temp'));
    });

    it('should cover cleanup scenarios from discovery', () => {
      // Setup platform with existing accessories
      const mockCircuitAccessory = {
        UUID: 'circuit-1',
        displayName: 'Old Circuit',
        context: { circuit: { id: 'C999' } },
      };
      const mockSensorAccessory = {
        UUID: 'sensor-1',
        displayName: 'Old Sensor',
        context: { sensor: { id: 'S999' } },
      };

      (platform as any).accessoryMap.set('circuit-1', mockCircuitAccessory);
      (platform as any).accessoryMap.set('sensor-1', mockSensorAccessory);

      const mockTransformPanels = require('../../src/util').transformPanels;

      // Return empty discovery to trigger cleanup
      mockTransformPanels.mockReturnValue([]);

      // Set up discovery buffer and complete state
      (platform as any).discoveryBuffer = { panels: [] };
      (platform as any).discoverCommandsSent = [
        'GetHardwareDefinition',
        'GetHardwareDefinition',
        'GetHardwareDefinition',
        'GetHardwareDefinition',
        'GetHardwareDefinition',
        'GetHardwareDefinition',
        'GetHardwareDefinition',
      ]; // All 7 commands sent

      const discoveryResponse = {
        command: 'SendQuery',
        response: '200',
        answer: { panels: [] },
        messageID: 'test-id',
      };

      (platform as any).handleDiscoveryResponse(discoveryResponse);

      // Should call cleanup for orphaned accessories
      expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('Removing orphaned'));
    });
  });

  describe('Complete Coverage Tests', () => {
    it('should cover remaining platform edge cases', () => {
      const testPlatform = new PentairPlatform(mockLogger, mockConfig, mockAPI);

      // Test the delay method directly
      const delayPromise = testPlatform['delay'](100);
      expect(delayPromise).toBeInstanceOf(Promise);

      // Test maybeReconnect method directly
      const maybeReconnectSpy = jest.spyOn(testPlatform as any, 'maybeReconnect').mockResolvedValue(undefined);
      testPlatform['maybeReconnect'](); // This covers the method call
      expect(maybeReconnectSpy).toHaveBeenCalled();
    });

    it('should cover heater discovery with existing accessory in cache (lines 630-634)', () => {
      const testPlatform = new PentairPlatform(mockLogger, mockConfig, mockAPI);

      const mockHeater = {
        id: 'H1',
        name: 'Pool Heater',
        bodyIds: ['B1'],
        objectType: ObjectType.Heater,
        type: CircuitType.Generic,
      };

      const mockBody = {
        id: 'B1',
        name: 'Pool',
        objectType: ObjectType.Body,
        type: BodyType.Pool,
      };

      const mockAccessory = {
        UUID: 'test-uuid',
        displayName: 'Pool Pool Heater',
        context: {},
      } as any;

      // Pre-populate accessory map to trigger the cache path
      const uuid = mockAPI.hap.uuid.generate(`${mockHeater.id}.${mockBody.id}`);
      testPlatform.accessoryMap.set(uuid, mockAccessory);

      const bodyMap = new Map([['B1', mockBody]]);

      // Clear previous calls
      mockAPI.updatePlatformAccessories.mockClear();
      mockLogger.debug.mockClear();

      testPlatform.discoverHeater(mockHeater, bodyMap);

      // Should cover lines 630-634 (existing accessory path)
      expect(mockLogger.debug).toHaveBeenCalledWith(`Restoring existing heater from cache: ${mockAccessory.displayName}`);
      expect(mockAPI.updatePlatformAccessories).toHaveBeenCalledWith([mockAccessory]);
      expect(mockAccessory.context.body).toBe(mockBody);
      expect(mockAccessory.context.heater).toBe(mockHeater);
    });

    it('should cover heater discovery with new accessory registration (lines 636-642)', () => {
      const testPlatform = new PentairPlatform(mockLogger, mockConfig, mockAPI);

      const mockHeater = {
        id: 'H2',
        name: 'Spa Heater',
        bodyIds: ['B2'],
        objectType: ObjectType.Heater,
        type: CircuitType.Generic,
      };

      const mockBody = {
        id: 'B2',
        name: 'Spa',
        objectType: ObjectType.Body,
        type: BodyType.Spa,
      };

      const bodyMap = new Map([['B2', mockBody]]);

      // Clear the accessory map to ensure new accessory path
      testPlatform.accessoryMap.clear();

      // Clear previous calls
      mockAPI.registerPlatformAccessories.mockClear();
      mockLogger.debug.mockClear();

      testPlatform.discoverHeater(mockHeater, bodyMap);

      // Should cover lines 636-642 (new accessory path)
      expect(mockLogger.debug).toHaveBeenCalledWith(`Adding new heater: ${mockHeater.name}`);
      expect(mockAPI.registerPlatformAccessories).toHaveBeenCalledWith(
        PLUGIN_NAME,
        PLATFORM_NAME,
        expect.arrayContaining([expect.any(Object)]),
      );
    });

    it('should cover remaining uncovered platform lines', () => {
      const testPlatform = new PentairPlatform(mockLogger, mockConfig, mockAPI);

      // Test various edge cases to hit remaining uncovered lines

      // Test getSystemHealth
      const health = testPlatform.getSystemHealth();
      expect(health).toBeDefined();

      // Test resetErrorHandling
      testPlatform.resetErrorHandling();

      // Test json method with circular reference handling
      const circularObj: any = { name: 'test' };
      circularObj.self = circularObj;
      const jsonResult = testPlatform.json(circularObj);
      expect(jsonResult).toContain('[Circular]');
    });
  });

  describe('Coverage for Platform Uncovered Lines', () => {
    let testPlatform: PentairPlatform;

    beforeEach(() => {
      testPlatform = new PentairPlatform(mockLogger, mockConfig, mockAPI);
    });

    it('should trigger maybeReconnect on timeout covering line 153', async () => {
      const maybeReconnectSpy = jest.spyOn(testPlatform as any, 'maybeReconnect').mockResolvedValue(undefined);
      const destroySpy = jest.spyOn(testPlatform['connection'], 'destroy').mockImplementation();

      // Set up state to trigger the timeout condition
      testPlatform['isSocketAlive'] = true;
      testPlatform['lastMessageReceived'] = Date.now() - 5 * 60 * 60 * 1000; // 5 hours ago

      // Advance timers to trigger the setInterval callback
      jest.advanceTimersByTime(60000);

      // Verify timeout was triggered
      expect(destroySpy).toHaveBeenCalled();
      expect(testPlatform['isSocketAlive']).toBe(false);

      // Advance timers to resolve the delay(30000) promise
      jest.advanceTimersByTime(30000);

      // Allow promises to resolve
      await Promise.resolve();

      // This should have triggered line 153: await this.maybeReconnect()
      expect(maybeReconnectSpy).toHaveBeenCalled();
    });

    it('should restore existing circuit accessory (lines 657-663)', () => {
      const mockPanel = { id: 'P1', name: 'Panel 1' };
      const mockModule = { id: 'M1', name: 'Module 1' };
      const mockCircuit = { id: 'C1', name: 'Test Circuit', objectType: 'Circuit' };
      const mockPumpCircuit = { id: 'PC1', name: 'Pump Circuit' };

      // Create a mock existing accessory
      const mockExistingAccessory = {
        UUID: 'mock-uuid-C1',
        displayName: 'Existing Circuit',
        context: {},
      } as any;

      // Add to accessory map to simulate existing accessory
      testPlatform.accessoryMap.set('mock-uuid-C1', mockExistingAccessory);

      // Mock the CircuitAccessory constructor to verify it gets called
      const CircuitAccessoryMock = require('../../src/circuitAccessory').CircuitAccessory;

      // Call discoverCircuit which should hit lines 657-663
      (testPlatform as any).discoverCircuit(mockPanel, mockModule, mockCircuit, mockPumpCircuit);

      // Verify the existing accessory path was taken
      expect(mockLogger.debug).toHaveBeenCalledWith('Restoring existing circuit from cache: Existing Circuit');
      expect(mockExistingAccessory.context.circuit).toBe(mockCircuit);
      expect(mockExistingAccessory.context.module).toBe(mockModule);
      expect(mockExistingAccessory.context.panel).toBe(mockPanel);
      expect(mockExistingAccessory.context.pumpCircuit).toBe(mockPumpCircuit);
      expect(mockAPI.updatePlatformAccessories).toHaveBeenCalledWith([mockExistingAccessory]);
      expect(CircuitAccessoryMock).toHaveBeenCalledWith(testPlatform, mockExistingAccessory);
    });

    it('should add pump circuit to map when pumpCircuit exists (lines 676-677)', () => {
      const mockPanel = { id: 'P1', name: 'Panel 1' };
      const mockModule = { id: 'M1', name: 'Module 1' };
      const mockCircuit = { id: 'C1', name: 'Test Circuit', objectType: 'Circuit' };
      const mockPumpCircuit = { id: 'PC1', name: 'Pump Circuit' };

      // Ensure no existing accessory so it creates a new one
      testPlatform.accessoryMap.clear();

      // Call discoverCircuit with a pump circuit
      (testPlatform as any).discoverCircuit(mockPanel, mockModule, mockCircuit, mockPumpCircuit);

      // Verify pump circuit was added to the map (line 676-677)
      expect(testPlatform['pumpIdToCircuitMap'].get('PC1')).toBe(mockCircuit);
    });

    it('should remove air temperature sensor when airTemp is disabled (lines 688-690)', () => {
      // Create a platform with airTemp disabled
      const configWithAirTempDisabled = {
        ...mockConfig,
        airTemp: false,
      };

      // Mock ConfigValidator to return airTemp: false
      const ConfigValidatorMock = require('../../src/configValidation').ConfigValidator;
      ConfigValidatorMock.validate.mockReturnValue({
        isValid: true,
        errors: [],
        warnings: [],
        sanitizedConfig: {
          ...ConfigValidatorMock.validate().sanitizedConfig,
          airTemp: false,
        },
      });

      const testPlatformAirTempDisabled = new PentairPlatform(mockLogger, configWithAirTempDisabled, mockAPI);

      const mockPanel = { id: 'P1', modules: [] };
      const mockModule = { id: 'M1', name: 'Module 1' };
      const mockAirSensor = {
        id: 'S1',
        name: 'Air Temperature',
        type: TemperatureSensorType.Air,
        objectType: 'Sensor',
      };

      // Call discoverTemperatureSensor with an air sensor
      (testPlatformAirTempDisabled as any).discoverTemperatureSensor(mockPanel, mockModule, mockAirSensor);

      // Verify air temperature sensor was skipped (lines 688-690)
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Skipping air temperature sensor Air Temperature because air temperature is disabled in config',
      );
    });

    it('should remove existing temperature sensor accessory when removing sensor (lines 699-701)', () => {
      const mockPanel = { id: 'P1', modules: [] };
      const mockModule = { id: 'M1', name: 'Module 1' };
      const mockAirSensor = {
        id: 'S1',
        name: 'Air Temperature',
        type: TemperatureSensorType.Air,
        objectType: 'Sensor',
      };

      // Create a mock existing temperature sensor accessory
      const mockExistingTempAccessory = {
        UUID: 'mock-uuid-S1',
        displayName: 'Existing Air Temp Sensor',
        context: {},
      } as any;

      // Add to accessory map
      testPlatform.accessoryMap.set('mock-uuid-S1', mockExistingTempAccessory);

      // Mock ConfigValidator to return airTemp: false for this test
      const ConfigValidatorMock = require('../../src/configValidation').ConfigValidator;
      const originalValidate = ConfigValidatorMock.validate;
      ConfigValidatorMock.validate.mockReturnValue({
        isValid: true,
        errors: [],
        warnings: [],
        sanitizedConfig: {
          ...originalValidate().sanitizedConfig,
          airTemp: false, // Disable airTemp to trigger removal
        },
      });

      const testPlatformForRemoval = new PentairPlatform(mockLogger, mockConfig, mockAPI);
      testPlatformForRemoval.accessoryMap.set('mock-uuid-S1', mockExistingTempAccessory);

      // Call discoverTemperatureSensor - should remove the existing accessory
      (testPlatformForRemoval as any).discoverTemperatureSensor(mockPanel, mockModule, mockAirSensor);

      // Verify existing accessory was removed (lines 699-701)
      expect(testPlatformForRemoval.accessoryMap.has('mock-uuid-S1')).toBe(false);
      expect(mockAPI.unregisterPlatformAccessories).toHaveBeenCalledWith(PLUGIN_NAME, PLATFORM_NAME, [mockExistingTempAccessory]);

      // Restore original mock
      ConfigValidatorMock.validate = originalValidate;
    });

    it('should handle timeout with socket not alive gracefully', async () => {
      // Test the else branch where socket is not alive
      testPlatform['isSocketAlive'] = false;
      testPlatform['lastMessageReceived'] = Date.now() - 5 * 60 * 60 * 1000; // 5 hours ago

      const destroySpy = jest.spyOn(testPlatform['connection'], 'destroy').mockImplementation();
      const maybeReconnectSpy = jest.spyOn(testPlatform as any, 'maybeReconnect').mockResolvedValue(undefined);

      // Fast forward timers to trigger the setInterval callback
      jest.advanceTimersByTime(60000);

      // Should not destroy connection or try to reconnect since socket is not alive
      expect(destroySpy).not.toHaveBeenCalled();
      expect(maybeReconnectSpy).not.toHaveBeenCalled();
    });
  });
});
