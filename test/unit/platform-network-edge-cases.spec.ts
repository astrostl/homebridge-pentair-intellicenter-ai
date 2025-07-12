import { PentairPlatform } from '../../src/platform';
import { Logger } from 'homebridge';
import * as net from 'net';

// Mock the net module
jest.mock('net');

describe('Platform Network Edge Cases', () => {
  let platform: PentairPlatform;
  let mockLog: Logger;
  let mockSocket: jest.Mocked<net.Socket>;

  beforeEach(() => {
    mockLog = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      success: jest.fn(),
      log: jest.fn(),
    } as Logger;

    mockSocket = {
      connect: jest.fn(),
      destroy: jest.fn(),
      on: jest.fn(),
      removeAllListeners: jest.fn(),
    } as unknown as jest.Mocked<net.Socket>;

    (net.Socket as jest.MockedClass<typeof net.Socket>).mockImplementation(() => mockSocket);

    const mockConfig = {
      platform: 'PentairIntelliCenter',
      name: 'IntelliCenter Test',
      host: '192.168.1.100',
      username: 'test',
      password: 'test',
      temperatureUnit: 'F' as const,
      enableVspControl: true,
      enableAirTempSensor: true,
    };

    const mockAPI = {
      hap: {
        uuid: { generate: jest.fn((str: string) => `uuid-${str}`) },
        Service: {},
        Characteristic: {},
      },
      platformAccessory: jest.fn(),
      registerPlatformAccessories: jest.fn(),
      updatePlatformAccessories: jest.fn(),
      unregisterPlatformAccessories: jest.fn(),
      on: jest.fn(),
    } as any;

    platform = new PentairPlatform(mockLog, mockConfig, mockAPI);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Network Connectivity Validation', () => {
    test('should handle network validation timeout', async () => {
      // Setup socket mock to simulate timeout scenario
      let timeoutCallback: (() => void) | undefined;

      jest.spyOn(global, 'setTimeout').mockImplementation((callback: () => void, delay?: number) => {
        timeoutCallback = callback;
        return 'timeout-id' as any;
      });

      // Start the validation
      const validationPromise = (platform as any).validateNetworkConnectivity('192.168.1.100', 6681);

      // Trigger the timeout
      if (timeoutCallback) {
        timeoutCallback();
      }

      const result = await validationPromise;
      expect(result).toBe(false);
      expect(mockLog.warn).toHaveBeenCalledWith('Network connectivity check timeout for 192.168.1.100:6681');
    });

    test('should handle socket connection success', async () => {
      let connectCallback: (() => void) | undefined;

      mockSocket.on.mockImplementation((event: string, callback: () => void) => {
        if (event === 'connect') {
          connectCallback = callback;
        }
        return mockSocket;
      });

      jest.spyOn(global, 'clearTimeout').mockImplementation();

      // Start the validation
      const validationPromise = (platform as any).validateNetworkConnectivity('192.168.1.100', 6681);

      // Trigger the connect event
      if (connectCallback) {
        connectCallback();
      }

      const result = await validationPromise;
      expect(result).toBe(true);
      expect(mockLog.debug).toHaveBeenCalledWith('Network connectivity confirmed for 192.168.1.100:6681');
    });

    test('should handle socket connection error', async () => {
      let errorCallback: ((error: Error) => void) | undefined;

      mockSocket.on.mockImplementation((event: string, callback: (error?: Error) => void) => {
        if (event === 'error') {
          errorCallback = callback;
        }
        return mockSocket;
      });

      jest.spyOn(global, 'clearTimeout').mockImplementation();

      // Start the validation
      const validationPromise = (platform as any).validateNetworkConnectivity('192.168.1.100', 6681);

      // Trigger the error event
      if (errorCallback) {
        errorCallback(new Error('Connection refused'));
      }

      const result = await validationPromise;
      expect(result).toBe(false);
      expect(mockLog.warn).toHaveBeenCalledWith('Network connectivity check failed for 192.168.1.100:6681: Connection refused');
    });

    test('should prevent multiple resolutions in network check', async () => {
      let connectCallback: (() => void) | undefined;
      let errorCallback: ((error: Error) => void) | undefined;

      mockSocket.on.mockImplementation((event: string, callback: (error?: Error) => void) => {
        if (event === 'connect') {
          connectCallback = callback;
        } else if (event === 'error') {
          errorCallback = callback;
        }
        return mockSocket;
      });

      jest.spyOn(global, 'clearTimeout').mockImplementation();

      // Start the validation
      const validationPromise = (platform as any).validateNetworkConnectivity('192.168.1.100', 6681);

      // Trigger both connect and error (should only resolve once)
      if (connectCallback) {
        connectCallback();
      }
      if (errorCallback) {
        errorCallback(new Error('Should be ignored'));
      }

      const result = await validationPromise;
      expect(result).toBe(true);
      expect(mockSocket.destroy).toHaveBeenCalledTimes(1);
    });
  });

  describe('Network Check Context Creation', () => {
    test('should create network check context with proper values', () => {
      const mockResolve = jest.fn();
      const context = (platform as any).createNetworkCheckContext('192.168.1.100', 6681, mockResolve);

      expect(context.socket).toBe(mockSocket);
      expect(context.host).toBe('192.168.1.100');
      expect(context.port).toBe(6681);
      expect(typeof context.resolveOnce).toBe('function');
      expect(typeof context.timer).toBe('string'); // mocked setTimeout returns string
    });

    test('should setup network check handlers correctly', () => {
      const mockResolve = jest.fn();
      const context = {
        socket: mockSocket,
        timer: setTimeout(() => {}, 1000),
        host: '192.168.1.100',
        port: 6681,
        resolveOnce: mockResolve,
      };

      (platform as any).setupNetworkCheckHandlers(context);

      expect(mockSocket.on).toHaveBeenCalledWith('connect', expect.any(Function));
      expect(mockSocket.on).toHaveBeenCalledWith('error', expect.any(Function));
    });
  });
});
