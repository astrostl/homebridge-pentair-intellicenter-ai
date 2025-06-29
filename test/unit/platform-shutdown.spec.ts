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

// Mock process for signal testing
const mockProcess = {
  on: jest.fn(),
  exit: jest.fn(),
  pid: 12345,
};

// Override global process for testing
const originalProcess = global.process;

describe('PentairPlatform Graceful Shutdown Tests', () => {
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
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // Reset static flag
    (PentairPlatform as any).shutdownHandlersSetup = false;

    // Mock process
    global.process = mockProcess as any;

    mockTelnetClient = new MockTelnetClient();
    (Telnet as any).mockImplementation(() => mockTelnetClient);

    mockLogger = createMockLogger();

    const mockAPI = createMockAPI();
    platform = new PentairPlatform(mockLogger as any, validConfig as any, mockAPI);
    platformInstances.push(platform);

    (platform as any).connection = mockTelnetClient;

    // Immediately clear the timer created in constructor to prevent leaks in tests
    if ((platform as any).heartbeatInterval) {
      clearInterval((platform as any).heartbeatInterval);
      (platform as any).heartbeatInterval = null;
    }
  });

  afterEach(async () => {
    // Clean up all platform instances to prevent timer leaks
    for (const p of platformInstances) {
      await p.cleanup();
    }
    platformInstances.length = 0;

    // Restore original process
    global.process = originalProcess;

    // Ensure all timers are cleared
    jest.clearAllTimers();
  });

  describe('setupGracefulShutdown', () => {
    it('should setup signal handlers for SIGTERM and SIGINT', () => {
      (platform as any).setupGracefulShutdown();

      expect(mockProcess.on).toHaveBeenCalledWith('SIGTERM', expect.any(Function));
      expect(mockProcess.on).toHaveBeenCalledWith('SIGINT', expect.any(Function));
      expect(mockProcess.on).toHaveBeenCalledWith('uncaughtException', expect.any(Function));
      expect(mockProcess.on).toHaveBeenCalledWith('unhandledRejection', expect.any(Function));
    });

    it('should prevent duplicate signal handlers from being setup', () => {
      (platform as any).setupGracefulShutdown();
      (platform as any).setupGracefulShutdown();

      // Should only be called once due to static flag
      expect(mockProcess.on).toHaveBeenCalledTimes(4);
    });

    it('should handle SIGTERM signal gracefully', async () => {
      (platform as any).setupGracefulShutdown();

      // Mock cleanup method
      (platform as any).cleanup = jest.fn().mockResolvedValue(undefined);

      // Get and execute SIGTERM handler
      const sigtermCall = mockProcess.on.mock.calls.find(call => call[0] === 'SIGTERM');
      expect(sigtermCall).toBeDefined();
      const sigtermHandler = sigtermCall![1];

      await sigtermHandler();

      expect(mockLogger.info).toHaveBeenCalledWith('Received SIGTERM, performing graceful shutdown...');
      expect((platform as any).cleanup).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith('Graceful shutdown completed');
      expect(mockProcess.exit).toHaveBeenCalledWith(0);
    });

    it('should handle SIGINT signal gracefully', async () => {
      (platform as any).setupGracefulShutdown();

      // Mock cleanup method
      (platform as any).cleanup = jest.fn().mockResolvedValue(undefined);

      // Get and execute SIGINT handler
      const sigintCall = mockProcess.on.mock.calls.find(call => call[0] === 'SIGINT');
      expect(sigintCall).toBeDefined();
      const sigintHandler = sigintCall![1];

      await sigintHandler();

      expect(mockLogger.info).toHaveBeenCalledWith('Received SIGINT, performing graceful shutdown...');
      expect((platform as any).cleanup).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith('Graceful shutdown completed');
      expect(mockProcess.exit).toHaveBeenCalledWith(0);
    });

    it('should handle uncaught exceptions', async () => {
      (platform as any).setupGracefulShutdown();

      // Mock cleanup method
      (platform as any).cleanup = jest.fn().mockResolvedValue(undefined);

      // Get and execute uncaughtException handler
      const exceptionCall = mockProcess.on.mock.calls.find(call => call[0] === 'uncaughtException');
      expect(exceptionCall).toBeDefined();
      const exceptionHandler = exceptionCall![1];

      const testError = new Error('Test uncaught exception');

      await exceptionHandler(testError);

      expect(mockLogger.error).toHaveBeenCalledWith('Uncaught Exception: Test uncaught exception');
      expect((platform as any).cleanup).toHaveBeenCalled();
      expect(mockProcess.exit).toHaveBeenCalledWith(1);
    });

    it('should handle unhandled promise rejections', async () => {
      (platform as any).setupGracefulShutdown();

      // Mock cleanup method
      (platform as any).cleanup = jest.fn().mockResolvedValue(undefined);

      // Get and execute unhandledRejection handler
      const rejectionCall = mockProcess.on.mock.calls.find(call => call[0] === 'unhandledRejection');
      expect(rejectionCall).toBeDefined();
      const rejectionHandler = rejectionCall![1];

      const testReason = 'Test unhandled rejection';
      const testPromise = Promise.reject(testReason);

      // Catch the promise to prevent actual unhandled rejection
      testPromise.catch(() => {});

      await rejectionHandler(testReason, testPromise);

      expect(mockLogger.error).toHaveBeenCalledWith(`Unhandled Promise Rejection at: ${testPromise}, reason: ${testReason}`);
      expect((platform as any).cleanup).toHaveBeenCalled();
      expect(mockProcess.exit).toHaveBeenCalledWith(1);
    });

    it('should handle cleanup errors in signal handlers', done => {
      (platform as any).setupGracefulShutdown();

      // Spy on the original cleanup method and make it reject
      const cleanupSpy = jest.spyOn(platform, 'cleanup').mockImplementation(() => {
        return Promise.reject(new Error('Cleanup failed'));
      });

      // Get and execute SIGTERM handler
      const sigtermCall = mockProcess.on.mock.calls.find(call => call[0] === 'SIGTERM');
      expect(sigtermCall).toBeDefined();
      const sigtermHandler = sigtermCall![1];

      // Execute the handler (this will trigger the catch block asynchronously)
      sigtermHandler();

      // Wait for the promise chain to complete
      setTimeout(() => {
        expect(mockLogger.error).toHaveBeenCalledWith('Error during graceful shutdown: Cleanup failed');
        expect(mockProcess.exit).toHaveBeenCalledWith(1);

        // Restore original method
        cleanupSpy.mockRestore();
        done();
      }, 10);
    });
  });

  describe('cleanup', () => {
    beforeEach(() => {
      // Clear any existing timers from platform constructor first
      if ((platform as any).heartbeatInterval) {
        clearInterval((platform as any).heartbeatInterval);
      }
      if ((platform as any).discoveryTimeout) {
        clearTimeout((platform as any).discoveryTimeout);
      }
      if ((platform as any).temperatureValidationInterval) {
        clearInterval((platform as any).temperatureValidationInterval);
      }

      // Setup some state for cleanup testing
      (platform as any).heartbeatInterval = setInterval(() => {}, 1000);
      (platform as any).discoveryTimeout = setTimeout(() => {}, 5000);
      (platform as any).temperatureValidationInterval = setInterval(() => {}, 10000);
      (platform as any).isSocketAlive = true;
      (platform as any).processingQueue = true;
      (platform as any).accessoryMap.set('test-uuid', {});
      (platform as any).heaters.set('heater1', {});
    });

    afterEach(() => {
      // Clean up any remaining timers
      if ((platform as any).heartbeatInterval) {
        clearInterval((platform as any).heartbeatInterval);
      }
      if ((platform as any).discoveryTimeout) {
        clearTimeout((platform as any).discoveryTimeout);
      }
      if ((platform as any).temperatureValidationInterval) {
        clearInterval((platform as any).temperatureValidationInterval);
      }
    });

    it('should perform complete cleanup sequence', async () => {
      mockTelnetClient.removeAllListeners.mockImplementation(() => {});
      mockTelnetClient.destroy.mockResolvedValue(undefined);

      await platform.cleanup();

      // Verify debug logging
      expect(mockLogger.debug).toHaveBeenCalledWith('Starting cleanup process...');
      expect(mockLogger.debug).toHaveBeenCalledWith('Cleanup process completed');

      // Verify timers are cleared
      expect((platform as any).heartbeatInterval).toBeNull();
      expect((platform as any).discoveryTimeout).toBeNull();
      expect((platform as any).temperatureValidationInterval).toBeNull();

      // Verify connection cleanup
      expect(mockTelnetClient.removeAllListeners).toHaveBeenCalled();
      expect(mockTelnetClient.destroy).toHaveBeenCalled();
      expect((platform as any).isSocketAlive).toBe(false);

      // Verify data structures are cleared
      expect((platform as any).accessoryMap.size).toBe(0);
      expect((platform as any).heaters.size).toBe(0);

      // Verify state is reset
      expect((platform as any).processingQueue).toBe(false);
    });

    it('should handle connection cleanup errors gracefully', async () => {
      const connectionError = new Error('Connection destroy failed');
      mockTelnetClient.removeAllListeners.mockImplementation(() => {
        throw connectionError;
      });
      mockTelnetClient.destroy.mockImplementation(() => {});

      await platform.cleanup();

      // Should still complete cleanup despite connection error
      expect(mockLogger.debug).toHaveBeenCalledWith('Starting cleanup process...');
      expect(mockLogger.debug).toHaveBeenCalledWith('Cleanup process completed');
      expect(mockLogger.warn).toHaveBeenCalledWith('Error removing connection event listeners: Connection destroy failed');

      // Other cleanup should still happen
      expect((platform as any).heartbeatInterval).toBeNull();
      expect((platform as any).isSocketAlive).toBe(false);
      expect((platform as any).accessoryMap.size).toBe(0);
      expect((platform as any).heaters.size).toBe(0);
    });

    it('should handle missing connection gracefully', async () => {
      (platform as any).connection = null;

      await platform.cleanup();

      expect(mockLogger.debug).toHaveBeenCalledWith('Starting cleanup process...');
      expect(mockLogger.debug).toHaveBeenCalledWith('Cleanup process completed');

      // Other cleanup should still happen
      expect((platform as any).heartbeatInterval).toBeNull();
      expect((platform as any).accessoryMap.size).toBe(0);
      expect((platform as any).heaters.size).toBe(0);
    });

    it('should handle already cleaned up state', async () => {
      // Pre-clear everything
      clearInterval((platform as any).heartbeatInterval);
      clearTimeout((platform as any).discoveryTimeout);
      clearInterval((platform as any).temperatureValidationInterval);
      (platform as any).heartbeatInterval = null;
      (platform as any).discoveryTimeout = null;
      (platform as any).temperatureValidationInterval = null;
      (platform as any).isSocketAlive = false;
      (platform as any).processingQueue = false;
      (platform as any).accessoryMap.clear();
      (platform as any).heaters.clear();
      (platform as any).connection = null;

      await platform.cleanup();

      expect(mockLogger.debug).toHaveBeenCalledWith('Starting cleanup process...');
      expect(mockLogger.debug).toHaveBeenCalledWith('Cleanup process completed');
    });
  });

  describe('Integration Tests', () => {
    it('should perform complete graceful shutdown sequence via SIGTERM', async () => {
      // Clear any existing timers from platform constructor first
      if ((platform as any).heartbeatInterval) {
        clearInterval((platform as any).heartbeatInterval);
      }
      if ((platform as any).discoveryTimeout) {
        clearTimeout((platform as any).discoveryTimeout);
      }
      if ((platform as any).temperatureValidationInterval) {
        clearInterval((platform as any).temperatureValidationInterval);
      }

      // Setup platform with full state
      (platform as any).heartbeatInterval = setInterval(() => {}, 1000);
      (platform as any).discoveryTimeout = setTimeout(() => {}, 5000);
      (platform as any).temperatureValidationInterval = setInterval(() => {}, 10000);
      (platform as any).isSocketAlive = true;
      (platform as any).processingQueue = true;
      (platform as any).accessoryMap.set('test-uuid', {});
      (platform as any).heaters.set('heater1', {});

      mockTelnetClient.removeAllListeners = jest.fn();
      mockTelnetClient.destroy = jest.fn().mockResolvedValue(undefined);

      // Setup graceful shutdown
      (platform as any).setupGracefulShutdown();

      // Get and execute SIGTERM handler
      const sigtermCall = mockProcess.on.mock.calls.find(call => call[0] === 'SIGTERM');
      expect(sigtermCall).toBeDefined();
      const sigtermHandler = sigtermCall![1];

      await sigtermHandler();

      // Verify complete shutdown sequence
      expect(mockLogger.info).toHaveBeenCalledWith('Received SIGTERM, performing graceful shutdown...');
      expect(mockLogger.debug).toHaveBeenCalledWith('Starting cleanup process...');
      expect(mockTelnetClient.removeAllListeners).toHaveBeenCalled();
      expect(mockTelnetClient.destroy).toHaveBeenCalled();
      expect((platform as any).accessoryMap.size).toBe(0);
      expect((platform as any).heaters.size).toBe(0);
      expect((platform as any).isSocketAlive).toBe(false);
      expect((platform as any).processingQueue).toBe(false);
      expect(mockLogger.debug).toHaveBeenCalledWith('Cleanup process completed');
      expect(mockLogger.info).toHaveBeenCalledWith('Graceful shutdown completed');
      expect(mockProcess.exit).toHaveBeenCalledWith(0);
    });

    it('should handle partial failures during shutdown gracefully', async () => {
      // Setup graceful shutdown
      (platform as any).setupGracefulShutdown();

      // Mock partial failure in connection cleanup
      const cleanupError = new Error('Connection cleanup failed');
      mockTelnetClient.removeAllListeners = jest.fn(() => {
        throw cleanupError;
      });
      mockTelnetClient.destroy = jest.fn();

      // Get and execute SIGTERM handler
      const sigtermCall = mockProcess.on.mock.calls.find(call => call[0] === 'SIGTERM');
      expect(sigtermCall).toBeDefined();
      const sigtermHandler = sigtermCall![1];

      await sigtermHandler();

      // Should still complete graceful shutdown despite warnings
      expect(mockLogger.info).toHaveBeenCalledWith('Received SIGTERM, performing graceful shutdown...');
      expect(mockLogger.debug).toHaveBeenCalledWith('Starting cleanup process...');
      expect(mockLogger.warn).toHaveBeenCalledWith('Error removing connection event listeners: Connection cleanup failed');
      expect(mockLogger.debug).toHaveBeenCalledWith('Cleanup process completed');
      expect(mockLogger.info).toHaveBeenCalledWith('Graceful shutdown completed');
      expect(mockProcess.exit).toHaveBeenCalledWith(0);
    });
  });
});
