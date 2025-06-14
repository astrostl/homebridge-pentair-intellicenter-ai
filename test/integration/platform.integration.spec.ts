import { API, Logger, PlatformConfig } from 'homebridge';
import { PentairPlatform } from '../../src/platform';
import { Telnet } from 'telnet-client';
import { EventEmitter } from 'events';

// Test fixtures
import circuitResponse from '../resources/circuitResponse.json';
import pumpResponse from '../resources/pumpResponse.json';
import sensorResponse from '../resources/sensorResponse.json';
import heaterResponse from '../resources/heaterResponse.json';

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
    it('should discover and register pool devices from circuit response', () => {
      // Simulate connection established
      telnetEventEmitter.emit('connect');

      // Simulate discovery responses
      const mockResponses = [
        {
          command: 'SendQuery',
          queryName: 'GetHardwareDefinition',
          response: 'ok',
          answer: circuitResponse,
          messageID: 'test-1',
        },
        {
          command: 'SendQuery', 
          queryName: 'GetHardwareDefinition',
          response: 'ok',
          answer: pumpResponse,
          messageID: 'test-2',
        },
        {
          command: 'SendQuery',
          queryName: 'GetHardwareDefinition', 
          response: 'ok',
          answer: sensorResponse,
          messageID: 'test-3',
        },
        {
          command: 'SendQuery',
          queryName: 'GetHardwareDefinition',
          response: 'ok', 
          answer: heaterResponse,
          messageID: 'test-4',
        },
      ];

      // Send discovery responses in sequence
      mockResponses.forEach((response, index) => {
        setTimeout(() => {
          const responseData = JSON.stringify(response) + '\\n';
          telnetEventEmitter.emit('data', Buffer.from(responseData));
        }, index * 100);
      });

      return new Promise((resolve) => {
        setTimeout(() => {
          // Verify accessories were registered
          expect(mockAPI.registerPlatformAccessories).toHaveBeenCalled();
          
          // Check that we have the expected device types
          const registerCalls = (mockAPI.registerPlatformAccessories as jest.Mock).mock.calls;
          expect(registerCalls.length).toBeGreaterThan(0);
          
          resolve(undefined);
        }, 500);
      });
    });

    it('should handle malformed discovery responses gracefully', () => {
      telnetEventEmitter.emit('connect');

      // Send malformed JSON
      const malformedData = '{"incomplete": json\\n';
      telnetEventEmitter.emit('data', Buffer.from(malformedData));

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to parse JSON'),
        expect.any(Error)
      );
    });

    it('should filter devices based on configuration', () => {
      const configWithAllCircuits = { ...mockConfig, includeAllCircuits: true };
      platform = new PentairPlatform(mockLogger, configWithAllCircuits, mockAPI);

      telnetEventEmitter.emit('connect');

      const response = {
        command: 'SendQuery',
        queryName: 'GetHardwareDefinition',
        response: 'ok',
        answer: circuitResponse,
        messageID: 'test-1',
      };

      const responseData = JSON.stringify(response) + '\\n';
      telnetEventEmitter.emit('data', Buffer.from(responseData));

      // With includeAllCircuits=true, should register more devices
      setTimeout(() => {
        expect(mockAPI.registerPlatformAccessories).toHaveBeenCalled();
      }, 100);
    });
  });

  describe('Real-time Updates', () => {
    beforeEach(() => {
      // Setup platform with discovered devices first
      telnetEventEmitter.emit('connect');
      
      const discoveryResponse = {
        command: 'SendQuery',
        queryName: 'GetHardwareDefinition',
        response: 'ok',
        answer: circuitResponse,
        messageID: 'discovery-1',
      };
      
      const responseData = JSON.stringify(discoveryResponse) + '\\n';
      telnetEventEmitter.emit('data', Buffer.from(responseData));
    });

    it('should process device status updates', (done) => {
      setTimeout(() => {
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

        const updateData = JSON.stringify(statusUpdate) + '\\n';
        telnetEventEmitter.emit('data', Buffer.from(updateData));

        setTimeout(() => {
          expect(mockLogger.debug).toHaveBeenCalledWith(
            expect.stringContaining('Handling update for C0002')
          );
          done();
        }, 50);
      }, 100);
    });

    it('should handle temperature updates for bodies', (done) => {
      setTimeout(() => {
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

        const updateData = JSON.stringify(tempUpdate) + '\\n';
        telnetEventEmitter.emit('data', Buffer.from(updateData));

        setTimeout(() => {
          expect(mockAPI.updatePlatformAccessories).toHaveBeenCalled();
          done();
        }, 50);
      }, 100);
    });

    it('should handle pump speed updates', (done) => {
      setTimeout(() => {
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

        const updateData = JSON.stringify(pumpUpdate) + '\\n';
        telnetEventEmitter.emit('data', Buffer.from(updateData));

        setTimeout(() => {
          expect(mockLogger.debug).toHaveBeenCalledWith(
            expect.stringContaining('Standalone pump P0001 update')
          );
          done();
        }, 50);
      }, 100);
    });
  });

  describe('Error Recovery', () => {
    it('should attempt reconnection on connection close', (done) => {
      const reconnectSpy = jest.spyOn(platform as any, 'maybeReconnect');
      
      telnetEventEmitter.emit('close');

      setTimeout(() => {
        expect(mockLogger.error).toHaveBeenCalledWith(
          expect.stringContaining('socket has been closed')
        );
        done();
      }, 35000); // Wait for the 30s delay + buffer
    }, 40000);

    it('should handle parse errors gracefully', () => {
      telnetEventEmitter.emit('connect');

      // Simulate multiple parse errors
      for (let i = 0; i < 5; i++) {
        const errorResponse = {
          command: 'Error',
          response: '400',
          description: 'ParseError: Invalid command syntax',
          messageID: `error-${i}`,
        };

        const responseData = JSON.stringify(errorResponse) + '\\n';
        telnetEventEmitter.emit('data', Buffer.from(responseData));
      }

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Frequent IntelliCenter ParseErrors detected')
      );
    });

    it('should buffer incomplete JSON messages', () => {
      telnetEventEmitter.emit('connect');

      // Send incomplete JSON in chunks
      const partialMessage1 = '{"command": "SendQuery",';
      const partialMessage2 = '"response": "ok"}\\n';

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
      const platform = new PentairPlatform(
        mockLogger,
        noAirTempConfig, 
        mockAPI
      );

      expect(platform.getConfig().airTemp).toBe(false);
    });
  });

  describe('Accessory Lifecycle', () => {
    it('should clean up orphaned accessories', (done) => {
      // First discover some devices
      telnetEventEmitter.emit('connect');
      
      const initialDiscovery = {
        command: 'SendQuery',
        queryName: 'GetHardwareDefinition',
        response: 'ok',
        answer: circuitResponse,
        messageID: 'initial-discovery',
      };
      
      telnetEventEmitter.emit('data', Buffer.from(JSON.stringify(initialDiscovery) + '\\n'));

      setTimeout(() => {
        // Now send discovery with fewer devices (simulating removed devices)
        const reducedResponse = {
          command: 'SendQuery',
          queryName: 'GetHardwareDefinition', 
          response: 'ok',
          answer: [circuitResponse[0]], // Only first device
          messageID: 'reduced-discovery',
        };

        telnetEventEmitter.emit('data', Buffer.from(JSON.stringify(reducedResponse) + '\\n'));

        setTimeout(() => {
          expect(mockAPI.unregisterPlatformAccessories).toHaveBeenCalled();
          done();
        }, 100);
      }, 100);
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