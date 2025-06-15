/**
 * Integration tests for PentairPlatform
 * 
 * These tests focus on end-to-end flows and integration between components.
 * They test the complete Telnet → IntelliCenter → HomeKit workflow.
 */

import { API, Logger, PlatformAccessory, PlatformConfig } from 'homebridge';
import { PentairPlatform } from '../../src/platform';
import { Telnet } from 'telnet-client';
import { 
  IntelliCenterResponse, 
  IntelliCenterResponseStatus, 
  IntelliCenterResponseCommand,
  IntelliCenterQueryName,
  TemperatureUnits,
  ObjectType,
  CircuitStatusMessage
} from '../../src/types';

// Mock telnet-client
jest.mock('telnet-client');
const MockedTelnet = Telnet as jest.MockedClass<typeof Telnet>;

// Mock accessories
jest.mock('../../src/circuitAccessory', () => ({
  CircuitAccessory: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('../../src/heaterAccessory', () => ({
  HeaterAccessory: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('../../src/temperatureAccessory', () => ({
  TemperatureAccessory: jest.fn().mockImplementation(() => ({
    updateTemperature: jest.fn(),
  })),
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
        maxBufferSize: 1000000,
      },
    }),
  },
}));

describe('Platform Integration Tests', () => {
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

  describe('Connection Management', () => {
    it('should establish connection to IntelliCenter', async () => {
      mockTelnetInstance.connect.mockResolvedValue(undefined);

      platform = new PentairPlatform(mockLogger, mockConfig, mockAPI);
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

    it('should handle connection errors with circuit breaker', async () => {
      // Simulate multiple connection failures
      mockTelnetInstance.connect.mockRejectedValue(new Error('Connection failed'));

      platform = new PentairPlatform(mockLogger, mockConfig, mockAPI);

      // Make multiple failed connection attempts
      for (let i = 0; i < 6; i++) {
        await platform.connectToIntellicenter();
      }

      // Circuit breaker should be OPEN after threshold failures
      const circuitBreakerState = (platform as any).circuitBreaker.getState();
      expect(circuitBreakerState).toBe('open');
    });

    it('should recover connection after circuit breaker cooldown', async () => {
      mockTelnetInstance.connect
        .mockRejectedValueOnce(new Error('Connection failed'))
        .mockRejectedValueOnce(new Error('Connection failed'))
        .mockRejectedValueOnce(new Error('Connection failed'))
        .mockRejectedValueOnce(new Error('Connection failed'))
        .mockRejectedValueOnce(new Error('Connection failed'))
        .mockResolvedValue(undefined); // Successful connection

      platform = new PentairPlatform(mockLogger, mockConfig, mockAPI);

      // Trigger circuit breaker to OPEN
      for (let i = 0; i < 5; i++) {
        await platform.connectToIntellicenter();
      }

      // Fast-forward past circuit breaker reset timeout (5 minutes)
      jest.advanceTimersByTime(5 * 60 * 1000 + 1000);

      // Connection should succeed after cooldown
      await platform.connectToIntellicenter();
      expect(mockTelnetInstance.connect).toHaveBeenLastCalledWith(expect.any(Object));
    });
  });

  describe('Device Discovery Flow', () => {
    it('should complete full discovery cycle', async () => {
      platform = new PentairPlatform(mockLogger, mockConfig, mockAPI);

      // Mock transformPanels to return sample data
      const mockTransformPanels = require('../../src/util').transformPanels;
      mockTransformPanels.mockReturnValue([
        {
          id: 'panel1',
          sensors: [{
            id: 'sensor1',
            name: 'Air Temp',
            objectType: ObjectType.Sensor,
            sensorType: 'Air',
          }],
          pumps: [{
            id: 'pump1',
            name: 'Main Pump',
            circuits: [{
              id: 'pumpcircuit1',
              circuitId: 'circuit1',
              speed: 75,
              speedType: 'RPM',
            }],
          }],
          modules: [{
            id: 'module1',
            bodies: [{
              id: 'body1',
              name: 'Pool',
              objectType: ObjectType.Body,
              circuitType: 'Pool',
            }],
            circuits: [{
              id: 'circuit1',
              name: 'Pool Light',
              objectType: ObjectType.Circuit,
              circuitType: 'Light',
            }],
            heaters: [],
            features: [],
          }],
          features: [],
        },
      ]);

      // Mock discovery responses - need all 7 commands: CIRCUITS, PUMPS, CHEMS, VALVES, HEATERS, SENSORS, GROUPS
      const mockDiscoveryResponses = [
        {
          response: IntelliCenterResponseStatus.Ok,
          command: IntelliCenterResponseCommand.SendQuery,
          queryName: IntelliCenterQueryName.GetHardwareDefinition,
          messageID: 'discovery-circuits',
          description: 'CIRCUITS discovery',
          answer: { panels: [{ id: 'panel1', modules: [{ id: 'module1', circuits: [{ id: 'circuit1', name: 'Pool Light' }] }] }] },
        },
        {
          response: IntelliCenterResponseStatus.Ok,
          command: IntelliCenterResponseCommand.SendQuery,
          queryName: IntelliCenterQueryName.GetHardwareDefinition,
          messageID: 'discovery-pumps',
          description: 'PUMPS discovery',
          answer: { panels: [] },
        },
        {
          response: IntelliCenterResponseStatus.Ok,
          command: IntelliCenterResponseCommand.SendQuery,
          queryName: IntelliCenterQueryName.GetHardwareDefinition,
          messageID: 'discovery-chems',
          description: 'CHEMS discovery',
          answer: { panels: [] },
        },
        {
          response: IntelliCenterResponseStatus.Ok,
          command: IntelliCenterResponseCommand.SendQuery,
          queryName: IntelliCenterQueryName.GetHardwareDefinition,
          messageID: 'discovery-valves',
          description: 'VALVES discovery',
          answer: { panels: [] },
        },
        {
          response: IntelliCenterResponseStatus.Ok,
          command: IntelliCenterResponseCommand.SendQuery,
          queryName: IntelliCenterQueryName.GetHardwareDefinition,
          messageID: 'discovery-heaters',
          description: 'HEATERS discovery',
          answer: { panels: [] },
        },
        {
          response: IntelliCenterResponseStatus.Ok,
          command: IntelliCenterResponseCommand.SendQuery,
          queryName: IntelliCenterQueryName.GetHardwareDefinition,
          messageID: 'discovery-sensors',
          description: 'SENSORS discovery',
          answer: { panels: [] },
        },
        {
          response: IntelliCenterResponseStatus.Ok,
          command: IntelliCenterResponseCommand.SendQuery,
          queryName: IntelliCenterQueryName.GetHardwareDefinition,
          messageID: 'discovery-groups',
          description: 'GROUPS discovery',
          answer: { panels: [] },
        },
      ];

      // Simulate discovery sequence - each response increments the commands sent
      (platform as any).discoverCommandsSent = []; // Start empty
      
      for (let i = 0; i < mockDiscoveryResponses.length; i++) {
        // Add command as if it was sent
        (platform as any).discoverCommandsSent.push(['CIRCUITS', 'PUMPS', 'CHEMS', 'VALVES', 'HEATERS', 'SENSORS', 'GROUPS'][i]);
        const response = mockDiscoveryResponses[i];
        if (response) {
          platform.handleDiscoveryResponse(response);
        }
      }

      // Verify accessories were registered
      expect(mockAPI.registerPlatformAccessories).toHaveBeenCalled();
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining('Discovery commands completed')
      );
    });

    it('should handle discovery with no devices', async () => {
      platform = new PentairPlatform(mockLogger, mockConfig, mockAPI);

      // Mock transformPanels to return empty data
      const mockTransformPanels = require('../../src/util').transformPanels;
      mockTransformPanels.mockReturnValue([]);

      const response = {
        response: IntelliCenterResponseStatus.Ok,
        command: IntelliCenterResponseCommand.SendQuery,
        queryName: IntelliCenterQueryName.GetHardwareDefinition,
        messageID: 'discovery-1',
        description: 'Empty discovery',
        answer: { panels: [] },
      };

      // Complete discovery cycle with empty data - simulate all 7 discovery commands completed
      (platform as any).discoverCommandsSent = ['CIRCUITS', 'PUMPS', 'CHEMS', 'VALVES', 'HEATERS', 'SENSORS', 'GROUPS'];
      platform.handleDiscoveryResponse(response);

      // Should not crash and should log completion
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining('Discovery commands completed')
      );
    });
  });

  describe('Real-time Updates', () => {
    it('should process circuit status updates', async () => {
      platform = new PentairPlatform(mockLogger, mockConfig, mockAPI);

      // Set up an accessory
      const mockAccessory = {
        UUID: 'uuid-C01',
        context: {
          circuit: {
            id: 'C01',
            objectType: ObjectType.Circuit,
          },
        },
      } as unknown as PlatformAccessory;

      platform.accessoryMap.set('uuid-C01', mockAccessory);

      // Simulate real-time update
      const notifyResponse: IntelliCenterResponse = {
        response: IntelliCenterResponseStatus.Ok,
        command: IntelliCenterResponseCommand.NotifyList,
        messageID: 'notify-123',
        description: 'Status update',
        answer: undefined as never,
        objectList: [{
          objnam: 'C01',
          params: { STATUS: 'ON' },
        } as CircuitStatusMessage],
      };

      await platform.handleUpdate(notifyResponse);

      expect(mockAPI.updatePlatformAccessories).toHaveBeenCalledWith([mockAccessory]);
    });

    it('should handle multiple concurrent updates', async () => {
      platform = new PentairPlatform(mockLogger, mockConfig, mockAPI);

      // Set up multiple accessories
      const circuitAccessory = {
        UUID: 'uuid-C01',
        context: { circuit: { id: 'C01', objectType: ObjectType.Circuit } },
      } as unknown as PlatformAccessory;

      const sensorAccessory = {
        UUID: 'uuid-S01',
        context: { 
          sensor: { id: 'S01', objectType: ObjectType.Sensor, name: 'Pool Temp' },
        },
      } as unknown as PlatformAccessory;

      platform.accessoryMap.set('uuid-C01', circuitAccessory);
      platform.accessoryMap.set('uuid-S01', sensorAccessory);

      // Simulate concurrent updates
      const concurrentUpdates = [
        {
          response: IntelliCenterResponseStatus.Ok,
          command: IntelliCenterResponseCommand.NotifyList,
          messageID: 'notify-1',
          description: 'Circuit update',
          answer: undefined as never,
          objectList: [{ objnam: 'C01', params: { STATUS: 'ON' } } as CircuitStatusMessage],
        },
        {
          response: IntelliCenterResponseStatus.Ok,
          command: IntelliCenterResponseCommand.NotifyList,
          messageID: 'notify-2',
          description: 'Sensor update',
          answer: undefined as never,
          objectList: [{ objnam: 'S01', params: { PROBE: '78.5' } } as CircuitStatusMessage],
        },
      ];

      // Process updates concurrently
      await Promise.all(concurrentUpdates.map(update => platform.handleUpdate(update)));

      expect(mockAPI.updatePlatformAccessories).toHaveBeenCalledTimes(2); // Circuit and sensor updates
    });

    it('should handle temperature sensor updates', async () => {
      platform = new PentairPlatform(mockLogger, mockConfig, mockAPI);

      const sensorAccessory = {
        UUID: 'uuid-S01',
        context: { 
          sensor: { id: 'S01', objectType: ObjectType.Sensor, name: 'Pool Temp' },
        },
      } as unknown as PlatformAccessory;

      platform.accessoryMap.set('uuid-S01', sensorAccessory);

      const notifyResponse: IntelliCenterResponse = {
        response: IntelliCenterResponseStatus.Ok,
        command: IntelliCenterResponseCommand.NotifyList,
        messageID: 'notify-temp',
        description: 'Temperature update',
        answer: undefined as never,
        objectList: [{
          objnam: 'S01',
          params: { PROBE: '78.5' },
        } as CircuitStatusMessage],
      };

      await platform.handleUpdate(notifyResponse);

      // Should update sensor probe value
      expect(sensorAccessory.context.sensor.probe).toBe(78.5);
    });
  });

  describe('Error Resilience', () => {
    it('should recover from malformed JSON responses', async () => {
      platform = new PentairPlatform(mockLogger, mockConfig, mockAPI);

      // Get the data handler
      const dataHandler = mockTelnetInstance.on.mock.calls.find(
        call => call[0] === 'data'
      )![1] as (chunk: Buffer) => Promise<void>;

      // Send malformed JSON
      const malformedChunk = Buffer.from('{ "malformed": json}\n');
      await dataHandler(malformedChunk);

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to parse JSON'),
        expect.any(Error)
      );

      // Send valid JSON after error - should still work
      const validChunk = Buffer.from(JSON.stringify({
        response: IntelliCenterResponseStatus.Ok,
        command: IntelliCenterResponseCommand.SendQuery,
        messageID: 'test-123',
        description: 'Valid response',
      }) + '\n');

      await dataHandler(validChunk);

      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining('Unhandled command in handleUpdate')
      );
    });

    it('should handle connection drops and reconnect', async () => {
      platform = new PentairPlatform(mockLogger, mockConfig, mockAPI);

      // Get the close handler
      const closeHandler = mockTelnetInstance.on.mock.calls.find(
        call => call[0] === 'close'
      )![1] as () => void;

      const maybeReconnectSpy = jest.spyOn(platform as any, 'maybeReconnect').mockImplementation();

      // Simulate connection close
      closeHandler();

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('socket has been closed')
      );

      // Fast-forward past reconnection delay
      jest.advanceTimersByTime(30000);
      await Promise.resolve();

      expect(maybeReconnectSpy).toHaveBeenCalled();
    });

    it('should handle rate limiting under load', async () => {
      platform = new PentairPlatform(mockLogger, mockConfig, mockAPI);
      (platform as any).isSocketAlive = true;

      // Send commands rapidly to trigger rate limiting (over 40/minute limit)
      const commands = Array.from({ length: 50 }, (_, i) => ({
        command: 'GetQuery',
        queryName: 'GetHardwareDefinition',
        arguments: `TEST${i}`,
        messageID: `test-${i}`,
      }));

      commands.forEach(cmd => platform.sendCommandNoWait(cmd as any));

      // Should log rate limiting debug messages
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Rate limit exceeded. Command dropped to prevent overwhelming IntelliCenter.'
      );
    });

    it('should handle parse errors with frequency tracking', async () => {
      platform = new PentairPlatform(mockLogger, mockConfig, mockAPI);

      const parseErrorResponse = {
        response: '400' as any, // Non-OK status to trigger error handling
        command: IntelliCenterResponseCommand.Error,
        messageID: 'error-123',
        description: 'ParseError: Invalid command',
        answer: undefined as never,
      };

      // Send multiple parse errors
      for (let i = 0; i < 4; i++) {
        await platform.handleUpdate(parseErrorResponse);
      }

      // Should detect frequent parse errors
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Frequent IntelliCenter ParseErrors detected')
      );
    });
  });

  describe('Health Monitoring', () => {
    it('should track connection health over time', async () => {
      platform = new PentairPlatform(mockLogger, mockConfig, mockAPI);

      // Simulate successful operations
      const healthMonitor = (platform as any).healthMonitor;
      healthMonitor.recordSuccess(100);
      healthMonitor.recordSuccess(150);
      healthMonitor.recordSuccess(120);

      const health = healthMonitor.getHealth();
      expect(health.isHealthy).toBe(true);
      expect(health.responseTime).toBe(123.33333333333333); // Average
    });

    it('should detect unhealthy connection patterns', async () => {
      platform = new PentairPlatform(mockLogger, mockConfig, mockAPI);

      const healthMonitor = (platform as any).healthMonitor;

      // Simulate multiple failures
      healthMonitor.recordFailure('Connection timeout');
      healthMonitor.recordFailure('Parse error');
      healthMonitor.recordFailure('Socket error');

      const health = healthMonitor.getHealth();
      expect(health.isHealthy).toBe(false);
      expect(health.consecutiveFailures).toBe(3);
    });

    it('should detect connection timeout', () => {
      platform = new PentairPlatform(mockLogger, mockConfig, mockAPI);

      // Set connection as old
      (platform as any).isSocketAlive = true;
      (platform as any).lastMessageReceived = Date.now() - (5 * 60 * 60 * 1000);

      // Trigger heartbeat check
      jest.advanceTimersByTime(61000);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'No data from IntelliCenter in over 4 hours. Closing and restarting connection.'
      );
    });
  });

  describe('End-to-End Scenarios', () => {
    it('should handle complete device lifecycle', async () => {
      platform = new PentairPlatform(mockLogger, mockConfig, mockAPI);

      // 1. Connection established
      mockTelnetInstance.connect.mockResolvedValue(undefined);
      const connectHandler = mockTelnetInstance.on.mock.calls.find(
        call => call[0] === 'connect'
      )![1] as () => void;

      connectHandler();
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'IntelliCenter socket connection has been established.'
      );

      // 2. Discovery completed
      const mockTransformPanels = require('../../src/util').transformPanels;
      mockTransformPanels.mockReturnValue([{
        id: 'panel1',
        modules: [{
          id: 'module1',
          circuits: [{
            id: 'circuit1',
            name: 'Pool Light',
            objectType: ObjectType.Circuit,
            circuitType: 'Light',
          }],
          bodies: [],
          heaters: [],
          features: [],
        }],
        sensors: [],
        pumps: [],
        features: [],
      }]);

      // Mock discovery responses - complete all 7 commands first
      const discoveryResponses = [
        {
          response: IntelliCenterResponseStatus.Ok,
          command: IntelliCenterResponseCommand.SendQuery,
          queryName: IntelliCenterQueryName.GetHardwareDefinition,
          messageID: 'discovery-circuits',
          description: 'CIRCUITS discovery',
          answer: { panels: [{ id: 'panel1', modules: [{ id: 'module1', circuits: [{ id: 'circuit1', name: 'Pool Light' }] }] }] },
        },
        {
          response: IntelliCenterResponseStatus.Ok,
          command: IntelliCenterResponseCommand.SendQuery,
          queryName: IntelliCenterQueryName.GetHardwareDefinition,
          messageID: 'discovery-pumps',
          description: 'PUMPS discovery',
          answer: { panels: [] },
        },
        {
          response: IntelliCenterResponseStatus.Ok,
          command: IntelliCenterResponseCommand.SendQuery,
          queryName: IntelliCenterQueryName.GetHardwareDefinition,
          messageID: 'discovery-chems',
          description: 'CHEMS discovery',
          answer: { panels: [] },
        },
        {
          response: IntelliCenterResponseStatus.Ok,
          command: IntelliCenterResponseCommand.SendQuery,
          queryName: IntelliCenterQueryName.GetHardwareDefinition,
          messageID: 'discovery-valves',
          description: 'VALVES discovery',
          answer: { panels: [] },
        },
        {
          response: IntelliCenterResponseStatus.Ok,
          command: IntelliCenterResponseCommand.SendQuery,
          queryName: IntelliCenterQueryName.GetHardwareDefinition,
          messageID: 'discovery-heaters',
          description: 'HEATERS discovery',
          answer: { panels: [] },
        },
        {
          response: IntelliCenterResponseStatus.Ok,
          command: IntelliCenterResponseCommand.SendQuery,
          queryName: IntelliCenterQueryName.GetHardwareDefinition,
          messageID: 'discovery-sensors',
          description: 'SENSORS discovery',
          answer: { panels: [] },
        },
        {
          response: IntelliCenterResponseStatus.Ok,
          command: IntelliCenterResponseCommand.SendQuery,
          queryName: IntelliCenterQueryName.GetHardwareDefinition,
          messageID: 'discovery-groups',
          description: 'GROUPS discovery',
          answer: { panels: [] },
        },
      ];

      // Process all discovery responses
      (platform as any).discoverCommandsSent = [];
      for (let i = 0; i < discoveryResponses.length; i++) {
        (platform as any).discoverCommandsSent.push(['CIRCUITS', 'PUMPS', 'CHEMS', 'VALVES', 'HEATERS', 'SENSORS', 'GROUPS'][i]);
        const response = discoveryResponses[i];
        if (response) {
          platform.handleDiscoveryResponse(response);
        }
      }

      // 3. Real-time updates working
      const updateResponse = {
        response: IntelliCenterResponseStatus.Ok,
        command: IntelliCenterResponseCommand.NotifyList,
        messageID: 'update-1',
        description: 'Status update',
        answer: undefined as never,
        objectList: [{
          objnam: 'circuit1',
          params: { STATUS: 'ON' },
        } as CircuitStatusMessage],
      };

      await platform.handleUpdate(updateResponse);

      // Verify complete flow worked
      // The registerPlatformAccessories should have been called for circuit discovery
      // Check if debug logs show discovery completion
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining('Discovery commands completed')
      );
    });

    it('should handle graceful shutdown', () => {
      platform = new PentairPlatform(mockLogger, mockConfig, mockAPI);

      // Simulate various shutdown scenarios
      const errorHandler = mockTelnetInstance.on.mock.calls.find(
        call => call[0] === 'error'
      )![1] as (error: string) => void;

      const endHandler = mockTelnetInstance.on.mock.calls.find(
        call => call[0] === 'end'
      )![1] as (data: string) => void;

      errorHandler('Connection error');
      endHandler('Connection ended');

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('socket error has been detected')
      );
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('socket connection has ended')
      );
    });
  });

  describe('Configuration Edge Cases', () => {
    it('should handle invalid configuration gracefully', () => {
      const invalidConfig = { ...mockConfig };
      delete invalidConfig.ipAddress;

      // Mock config validation to return invalid for this test
      const mockConfigValidator = require('../../src/configValidation').ConfigValidator;
      mockConfigValidator.validate.mockReturnValueOnce({
        isValid: false,
        errors: ['IP address is required'],
        warnings: [],
        sanitizedConfig: invalidConfig,
      });

      platform = new PentairPlatform(mockLogger, invalidConfig, mockAPI);

      expect(mockLogger.error).toHaveBeenCalledWith('Configuration validation failed:');
    });

    it('should handle VSP pump configuration', () => {
      const vspConfig = { ...mockConfig, supportVSP: true };
      
      // Mock config validation to return the VSP config
      const mockConfigValidator = require('../../src/configValidation').ConfigValidator;
      mockConfigValidator.validate.mockReturnValueOnce({
        isValid: true,
        errors: [],
        warnings: [],
        sanitizedConfig: { ...vspConfig },
      });
      
      platform = new PentairPlatform(mockLogger, vspConfig, mockAPI);

      expect(platform.getConfig().supportVSP).toBe(true);
    });

    it('should handle temperature unit configuration', () => {
      const celsiusConfig = { ...mockConfig, temperatureUnits: TemperatureUnits.C };
      
      // Mock config validation to return the celsius config
      const mockConfigValidator = require('../../src/configValidation').ConfigValidator;
      mockConfigValidator.validate.mockReturnValueOnce({
        isValid: true,
        errors: [],
        warnings: [],
        sanitizedConfig: { ...celsiusConfig },
      });
      
      platform = new PentairPlatform(mockLogger, celsiusConfig, mockAPI);

      expect(platform.getConfig().temperatureUnits).toBe(TemperatureUnits.C);
    });
  });
});