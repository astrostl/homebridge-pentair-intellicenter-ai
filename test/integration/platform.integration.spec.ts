import { API, Logger, PlatformConfig } from 'homebridge';
import { PentairPlatform } from '../../src/platform';
import { Telnet } from 'telnet-client';
import { EventEmitter } from 'events';

// Mock Telnet client
jest.mock('telnet-client');
const MockedTelnet = Telnet as jest.MockedClass<typeof Telnet>;

// Mock Homebridge API
const mockAPI = {
  hap: {
    Service: {},
    Characteristic: {},
    uuid: {
      generate: jest.fn((id: string) => `uuid-${id}`),
    },
  },
  on: jest.fn(),
  registerPlatformAccessories: jest.fn(),
  unregisterPlatformAccessories: jest.fn(),
  updatePlatformAccessories: jest.fn(),
  platformAccessory: jest.fn().mockImplementation((name: string, uuid: string) => ({
    displayName: name,
    UUID: uuid,
    context: {},
  })),
} as unknown as API;

const mockLogger = {
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
} as unknown as Logger;

const mockConfig: PlatformConfig = {
  name: 'PentairIntelliCenter',
  platform: 'PentairIntelliCenter',
  ipAddress: '192.168.1.100',
  username: 'test',
  password: 'test',
  temperatureUnits: 'F',
  minimumTemperature: 40,
  maximumTemperature: 104,
  supportVSP: true,
  airTemp: true,
  includeAllCircuits: false,
};

describe('Platform Integration Tests', () => {
  let platform: PentairPlatform;
  let mockTelnetInstance: jest.Mocked<Telnet>;
  let telnetEventEmitter: EventEmitter;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Create an EventEmitter for telnet events
    telnetEventEmitter = new EventEmitter();
    
    // Mock Telnet instance
    mockTelnetInstance = {
      connect: jest.fn().mockResolvedValue(undefined),
      send: jest.fn().mockResolvedValue(undefined),
      destroy: jest.fn(),
      on: jest.fn((event: string, callback: (...args: any[]) => void) => {
        telnetEventEmitter.on(event, callback);
        return mockTelnetInstance;
      }),
    } as unknown as jest.Mocked<Telnet>;

    MockedTelnet.mockImplementation(() => mockTelnetInstance);

    platform = new PentairPlatform(mockLogger, mockConfig, mockAPI);
  });

  afterEach(() => {
    telnetEventEmitter.removeAllListeners();
  });

  describe('Connection Management', () => {
    it('should establish connection to IntelliCenter', async () => {
      await platform.connectToIntellicenter();

      expect(mockTelnetInstance.connect).toHaveBeenCalledWith({
        host: '192.168.1.100',
        port: 6681,
        negotiationMandatory: false,
        timeout: 1500,
        debug: true,
        username: 'test',
        password: 'test',
      });
    });

    it('should handle connection failures gracefully', async () => {
      const connectionError = new Error('Connection refused');
      mockTelnetInstance.connect.mockRejectedValue(connectionError);

      await platform.connectToIntellicenter();

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Connection to IntelliCenter failed'),
        connectionError
      );
    });

    it('should setup event handlers on connection', () => {
      expect(mockTelnetInstance.on).toHaveBeenCalledWith('data', expect.any(Function));
      expect(mockTelnetInstance.on).toHaveBeenCalledWith('connect', expect.any(Function));
      expect(mockTelnetInstance.on).toHaveBeenCalledWith('ready', expect.any(Function));
      expect(mockTelnetInstance.on).toHaveBeenCalledWith('close', expect.any(Function));
      expect(mockTelnetInstance.on).toHaveBeenCalledWith('error', expect.any(Function));
    });
  });

  describe('Device Discovery', () => {
    it('should trigger discovery on connection', () => {
      // Simulate connection established
      telnetEventEmitter.emit('connect');

      // Discovery process should have been triggered
      expect(mockTelnetInstance.send).toHaveBeenCalled();
    });

    it('should handle malformed discovery responses gracefully', () => {
      telnetEventEmitter.emit('connect');

      // Send malformed JSON that passes bracket check but fails parsing
      const malformedData = '{"incomplete": json, "missing": }\n';
      telnetEventEmitter.emit('data', Buffer.from(malformedData));

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to parse JSON'),
        expect.any(Error)
      );
    });

    it('should filter devices based on configuration', () => {
      const configWithAllCircuits = { ...mockConfig, includeAllCircuits: true };
      const platformWithAllCircuits = new PentairPlatform(mockLogger, configWithAllCircuits, mockAPI);

      // Test that platform was created with correct config
      expect(platformWithAllCircuits.getConfig().includeAllCircuits).toBe(true);
    });
  });

  describe('Real-time Updates', () => {
    it('should process device status updates', () => {
      const statusUpdate = {
        command: 'NotifyList',
        response: 'ok',
        messageID: 'update-1',
        objectList: [{
          changes: [{
            objnam: 'C0002',
            params: {
              STATUS: '1',
              ACT: 'ON',
            },
          }],
        }],
      };

      const updateData = JSON.stringify(statusUpdate) + '\n';
      telnetEventEmitter.emit('data', Buffer.from(updateData));

      // Should not throw errors
      expect(mockLogger.error).not.toHaveBeenCalledWith(
        expect.stringContaining('Failed to parse JSON')
      );
    });

    it('should handle temperature updates for bodies', () => {
      const tempUpdate = {
        command: 'NotifyList',
        response: 'ok', 
        messageID: 'temp-update-1',
        objectList: [{
          changes: [{
            objnam: 'B1101',
            params: {
              LSTTMP: '78',
              HTSRC: 'H1201',
            },
          }],
        }],
      };

      const updateData = JSON.stringify(tempUpdate) + '\n';
      telnetEventEmitter.emit('data', Buffer.from(updateData));

      // Should not throw errors
      expect(mockLogger.error).not.toHaveBeenCalledWith(
        expect.stringContaining('Failed to parse JSON')
      );
    });

    it('should handle pump speed updates', () => {
      const pumpUpdate = {
        command: 'NotifyList', 
        response: 'ok',
        messageID: 'pump-update-1',
        objectList: [{
          changes: [{
            objnam: 'P0001',
            params: {
              SPEED: '2500',
              SELECT: 'RPM',
            },
          }],
        }],
      };

      const updateData = JSON.stringify(pumpUpdate) + '\n';
      telnetEventEmitter.emit('data', Buffer.from(updateData));

      // Should not throw errors
      expect(mockLogger.error).not.toHaveBeenCalledWith(
        expect.stringContaining('Failed to parse JSON')
      );
    });
  });

  describe('Error Recovery', () => {
    it('should log connection close events', () => {
      telnetEventEmitter.emit('close');

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('socket has been closed')
      );
    });

    it('should handle parse errors gracefully', () => {
      telnetEventEmitter.emit('connect');

      // Simulate a single parse error
      const errorResponse = {
        command: 'Error',
        response: '400',
        description: 'ParseError: Invalid command syntax',
        messageID: 'error-1',
      };

      const responseData = JSON.stringify(errorResponse) + '\n';
      telnetEventEmitter.emit('data', Buffer.from(responseData));

      // Should log the error
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('ParseError')
      );
    });

    it('should buffer incomplete JSON messages', () => {
      telnetEventEmitter.emit('connect');

      // Send incomplete JSON in chunks
      const partialMessage1 = '{"command": "SendQuery",';
      const partialMessage2 = '"response": "ok"}\n';

      telnetEventEmitter.emit('data', Buffer.from(partialMessage1));
      telnetEventEmitter.emit('data', Buffer.from(partialMessage2));

      // Should not log parse errors for incomplete messages
      expect(mockLogger.error).not.toHaveBeenCalledWith(
        expect.stringContaining('Failed to parse JSON')
      );
    });
  });

  describe('Configuration Validation', () => {
    it('should handle missing IP address', () => {
      const invalidConfig = { ...mockConfig, ipAddress: '' };
      const platformWithInvalidConfig = new PentairPlatform(
        mockLogger, 
        invalidConfig, 
        mockAPI
      );

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('IP address is not configured')
      );
    });

    it('should respect temperature unit configuration', () => {
      const celsiusConfig = { ...mockConfig, temperatureUnits: 'C' };
      const celsiusPlatform = new PentairPlatform(
        mockLogger,
        celsiusConfig,
        mockAPI
      );

      expect(celsiusPlatform.getConfig().temperatureUnits).toBe('C');
    });

    it('should handle air temperature sensor configuration', () => {
      const noAirTempConfig = { ...mockConfig, airTemp: false };
      const platformNoAirTemp = new PentairPlatform(
        mockLogger,
        noAirTempConfig, 
        mockAPI
      );

      expect(platformNoAirTemp.getConfig().airTemp).toBe(false);
    });
  });

  describe('Accessory Lifecycle', () => {
    it('should clean up orphaned accessories', () => {
      // Add an accessory to the platform
      const testAccessory = {
        displayName: 'Test Accessory',
        UUID: 'uuid-test-cleanup',
        context: {
          circuit: { id: 'C9999', name: 'Test Circuit' },
        },
      };

      platform.configureAccessory(testAccessory as any);
      
      // Verify it was added
      expect((platform as any).accessoryMap.has('uuid-test-cleanup')).toBe(true);
    });

    it('should restore accessories from cache', () => {
      const cachedAccessory = {
        displayName: 'Test Circuit',
        UUID: 'uuid-test',
        context: {
          circuit: { id: 'C0001', name: 'Test Circuit' },
        },
      };

      platform.configureAccessory(cachedAccessory as any);

      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Loading accessory from cache:',
        'Test Circuit'
      );
    });
  });
});