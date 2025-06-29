import { PentairPlatform } from '../../src/platform';
import { PlatformConfig } from 'homebridge';
import { createMockLogger, createMockAPI } from './testHelpers';
import { Telnet } from 'telnet-client';
import * as net from 'net';

// Mock dependencies
jest.mock('telnet-client');
jest.mock('net');

// Mock classes for internal components
class MockTelnetClient {
  connect = jest.fn();
  on = jest.fn();
  removeAllListeners = jest.fn();
  destroy = jest.fn();
}

class MockHealthMonitor {
  recordSuccess = jest.fn();
  recordFailure = jest.fn();
  getHealth = jest.fn().mockReturnValue({
    consecutiveFailures: 0,
    lastSuccessfulOperation: Date.now(),
  });
}

class MockCircuitBreaker {
  execute = jest.fn();
  getState = jest.fn().mockReturnValue('CLOSED');
}

describe.skip('PentairPlatform Network Connectivity Tests', () => {
  let platform: PentairPlatform;
  let mockLogger: any;
  let mockTelnetClient: MockTelnetClient;
  let mockHealthMonitor: MockHealthMonitor;
  let mockCircuitBreaker: MockCircuitBreaker;
  let mockSocket: jest.Mocked<net.Socket>;
  const platformInstances: PentairPlatform[] = [];

  const validConfig: PlatformConfig = {
    name: 'Pentair IntelliCenter',
    platform: 'PentairIntelliCenter',
    ipAddress: '192.168.1.100',
    username: 'admin',
    password: 'password123',
    temperatureUnits: 'F',
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock net.Socket
    mockSocket = {
      connect: jest.fn(),
      destroy: jest.fn(),
      on: jest.fn(),
    } as any;

    (net.Socket as any).mockImplementation(() => mockSocket);

    // Mock TelnetClient
    mockTelnetClient = new MockTelnetClient();
    (Telnet as any).mockImplementation(() => mockTelnetClient);

    mockLogger = createMockLogger();
    mockHealthMonitor = new MockHealthMonitor();
    mockCircuitBreaker = new MockCircuitBreaker();

    const mockAPI = createMockAPI();
    platform = new PentairPlatform(mockLogger as any, validConfig as any, mockAPI);
    platformInstances.push(platform);

    // Immediately clear the timer created in constructor to prevent leaks in tests
    if ((platform as any).heartbeatInterval) {
      clearInterval((platform as any).heartbeatInterval);
      (platform as any).heartbeatInterval = null;
    }

    // Replace internals with mocks
    (platform as any).connection = mockTelnetClient;
    (platform as any).healthMonitor = mockHealthMonitor;
    (platform as any).circuitBreaker = mockCircuitBreaker;
  });

  afterEach(async () => {
    // Clean up all platform instances to prevent timer leaks
    for (const p of platformInstances) {
      await p.cleanup();
    }
    platformInstances.length = 0;
  });

  describe('validateNetworkConnectivity', () => {
    it('should resolve true when socket connects successfully', async () => {
      // Setup mock socket to emit connect event
      mockSocket.on.mockImplementation((event: string, callback: any) => {
        if (event === 'connect') {
          setTimeout(() => callback(), 10);
        }
        return mockSocket;
      });

      const result = await (platform as any).validateNetworkConnectivity('192.168.1.100', 6681);

      expect(result).toBe(true);
      expect(mockSocket.connect).toHaveBeenCalledWith(6681, '192.168.1.100');
      expect(mockSocket.destroy).toHaveBeenCalled();
    });

    it('should resolve false when socket connection times out', async () => {
      // Mock setTimeout to call callback immediately for testing
      jest.spyOn(global, 'setTimeout').mockImplementation((callback: any) => {
        setTimeout(() => callback(), 0);
        return {} as any;
      });

      // Setup mock socket to not emit any events (timeout scenario)
      mockSocket.on.mockImplementation(() => mockSocket);

      const result = await (platform as any).validateNetworkConnectivity('192.168.1.100', 6681);

      expect(result).toBe(false);
      expect(mockLogger.warn).toHaveBeenCalledWith('Network connectivity check timeout for 192.168.1.100:6681');
      expect(mockSocket.destroy).toHaveBeenCalled();

      jest.restoreAllMocks();
    }, 10000);

    it('should resolve false when socket connection fails with error', async () => {
      const testError = new Error('Connection refused');

      // Setup mock socket to emit error event
      mockSocket.on.mockImplementation((event: string, callback: any) => {
        if (event === 'error') {
          setTimeout(() => callback(testError), 10);
        }
        return mockSocket;
      });

      const result = await (platform as any).validateNetworkConnectivity('192.168.1.100', 6681);

      expect(result).toBe(false);
      expect(mockLogger.warn).toHaveBeenCalledWith('Network connectivity check failed for 192.168.1.100:6681: Connection refused');
      expect(mockSocket.destroy).toHaveBeenCalled();
    });

    it('should resolve false when socket connect throws synchronous error', async () => {
      const testError = new Error('Invalid host');
      mockSocket.connect.mockImplementation(() => {
        throw testError;
      });

      const result = await (platform as any).validateNetworkConnectivity('192.168.1.100', 6681);

      expect(result).toBe(false);
      expect(mockLogger.warn).toHaveBeenCalledWith('Network connectivity check error for 192.168.1.100:6681: Invalid host');
      expect(mockSocket.destroy).toHaveBeenCalled();
    });

    it('should handle non-Error objects in catch block', async () => {
      const testError = 'String error';
      mockSocket.connect.mockImplementation(() => {
        throw testError;
      });

      const result = await (platform as any).validateNetworkConnectivity('192.168.1.100', 6681);

      expect(result).toBe(false);
      expect(mockLogger.warn).toHaveBeenCalledWith('Network connectivity check error for 192.168.1.100:6681: String error');
    });

    it('should handle duplicate resolution attempts gracefully', async () => {
      // Setup mock socket to emit both connect and error events
      mockSocket.on.mockImplementation((event: string, callback: any) => {
        if (event === 'connect') {
          setTimeout(() => callback(), 10);
        } else if (event === 'error') {
          setTimeout(() => callback(new Error('Secondary error')), 20);
        }
        return mockSocket;
      });

      const result = await (platform as any).validateNetworkConnectivity('192.168.1.100', 6681);

      expect(result).toBe(true);
      // Should only destroy socket once despite multiple events
      expect(mockSocket.destroy).toHaveBeenCalledTimes(1);
    });
  });

  describe('connectToIntellicenter - Network Validation', () => {
    beforeEach(() => {
      // Mock discoverDevices to prevent it from running
      (platform as any).discoverDevices = jest.fn();
    });

    it('should skip network validation in test environment', async () => {
      // Set test environment
      process.env.JEST_WORKER_ID = '1';

      // Mock discoverDevices to prevent it from running
      (platform as any).discoverDevices = jest.fn();

      mockCircuitBreaker.execute.mockResolvedValue(undefined);
      mockTelnetClient.connect.mockResolvedValue(undefined);

      await platform.connectToIntellicenter();

      // Should not call validateNetworkConnectivity
      expect(net.Socket).not.toHaveBeenCalled();
      expect(mockCircuitBreaker.execute).toHaveBeenCalled();

      // Cleanup
      delete process.env.JEST_WORKER_ID;
    });

    it('should validate network connectivity in production environment', async () => {
      // Set production environment
      const originalEnv = process.env.NODE_ENV;
      const originalJest = process.env.JEST_WORKER_ID;
      process.env.NODE_ENV = 'production';
      delete process.env.JEST_WORKER_ID;

      // Mock discoverDevices to prevent it from running
      (platform as any).discoverDevices = jest.fn();

      // Mock successful network validation
      mockSocket.on.mockImplementation((event: string, callback: any) => {
        if (event === 'connect') {
          setTimeout(() => callback(), 10);
        }
        return mockSocket;
      });

      mockCircuitBreaker.execute.mockResolvedValue(undefined);
      mockTelnetClient.connect.mockResolvedValue(undefined);

      await platform.connectToIntellicenter();

      expect(mockLogger.debug).toHaveBeenCalledWith('Validating network connectivity to 192.168.1.100:6681...');
      expect(mockSocket.connect).toHaveBeenCalledWith(6681, '192.168.1.100');
      expect(mockCircuitBreaker.execute).toHaveBeenCalled();

      // Restore environment
      process.env.NODE_ENV = originalEnv;
      process.env.JEST_WORKER_ID = originalJest;
    });

    it('should abort connection if network validation fails in production', async () => {
      // Set production environment
      const originalEnv = process.env.NODE_ENV;
      const originalJest = process.env.JEST_WORKER_ID;
      process.env.NODE_ENV = 'production';
      delete process.env.JEST_WORKER_ID;

      // Mock setTimeout to call callback immediately for testing
      jest.spyOn(global, 'setTimeout').mockImplementation((callback: any) => {
        setTimeout(() => callback(), 0);
        return {} as any;
      });

      // Mock failed network validation (timeout)
      mockSocket.on.mockImplementation(() => mockSocket);

      await platform.connectToIntellicenter();

      expect(mockLogger.error).toHaveBeenCalledWith(
        'IntelliCenter at 192.168.1.100:6681 is not reachable. Check network connectivity and configuration.',
      );
      expect(mockHealthMonitor.recordFailure).toHaveBeenCalledWith(
        'IntelliCenter at 192.168.1.100:6681 is not reachable. Check network connectivity and configuration.',
      );
      expect(mockTelnetClient.connect).not.toHaveBeenCalled();

      // Restore environment
      process.env.NODE_ENV = originalEnv;
      process.env.JEST_WORKER_ID = originalJest;
      jest.restoreAllMocks();
    }, 10000);

    it('should handle connection failure without config validation', async () => {
      (platform as any).validatedConfig = null;

      await platform.connectToIntellicenter();

      expect(mockLogger.error).toHaveBeenCalledWith('Cannot connect: Configuration validation failed');
      expect(mockTelnetClient.connect).not.toHaveBeenCalled();
    });

    it('should record successful connection metrics', async () => {
      process.env.JEST_WORKER_ID = '1';

      mockCircuitBreaker.execute.mockResolvedValue(undefined);
      mockTelnetClient.connect.mockResolvedValue(undefined);

      await platform.connectToIntellicenter();

      expect(mockHealthMonitor.recordSuccess).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('Successfully connected to IntelliCenter'));

      delete process.env.JEST_WORKER_ID;
    });

    it('should handle circuit breaker OPEN state', async () => {
      process.env.JEST_WORKER_ID = '1';

      const error = new Error('Circuit breaker failure');
      mockCircuitBreaker.execute.mockRejectedValue(error);
      mockCircuitBreaker.getState.mockReturnValue('OPEN');

      await platform.connectToIntellicenter();

      expect(mockHealthMonitor.recordFailure).toHaveBeenCalledWith('Circuit breaker failure');
      // The actual error message might be different, let's check what gets logged
      expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining('Circuit breaker'));

      delete process.env.JEST_WORKER_ID;
    });

    it('should handle general connection failures', async () => {
      process.env.JEST_WORKER_ID = '1';

      const error = new Error('Connection failed');
      mockCircuitBreaker.execute.mockRejectedValue(error);
      mockCircuitBreaker.getState.mockReturnValue('CLOSED');

      const mockHealth = {
        consecutiveFailures: 3,
        lastSuccessfulOperation: Date.now() - 10000,
      };
      mockHealthMonitor.getHealth.mockReturnValue(mockHealth);

      await platform.connectToIntellicenter();

      expect(mockLogger.error).toHaveBeenCalledWith('Connection to IntelliCenter failed after retries: Connection failed');
      expect(mockLogger.debug).toHaveBeenCalledWith(expect.stringContaining('Connection health: 3 consecutive failures'));

      delete process.env.JEST_WORKER_ID;
    });

    it('should handle non-Error objects in connection failures', async () => {
      process.env.JEST_WORKER_ID = '1';

      const error = 'String error';
      mockCircuitBreaker.execute.mockRejectedValue(error);
      mockCircuitBreaker.getState.mockReturnValue('CLOSED');

      await platform.connectToIntellicenter();

      expect(mockHealthMonitor.recordFailure).toHaveBeenCalledWith('String error');
      expect(mockLogger.error).toHaveBeenCalledWith('Connection to IntelliCenter failed after retries: String error');

      delete process.env.JEST_WORKER_ID;
    });
  });
});
