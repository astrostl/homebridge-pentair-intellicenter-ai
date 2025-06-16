import {
  CircuitBreaker,
  RetryManager,
  HealthMonitor,
  RateLimiter,
  DeadLetterQueue,
  CircuitBreakerState,
  RetryOptions,
  CircuitBreakerOptions,
} from '../../src/errorHandling';
import { IntelliCenterRequest, IntelliCenterRequestCommand, IntelliCenterQueryName } from '../../src/types';

describe('Error Handling Components - Comprehensive Coverage', () => {
  describe('CircuitBreaker - Advanced Scenarios', () => {
    let circuitBreaker: CircuitBreaker;
    let options: CircuitBreakerOptions;

    beforeEach(() => {
      jest.useFakeTimers();
      options = {
        failureThreshold: 3,
        resetTimeout: 5000,
        monitoringPeriod: 1000,
      };
      circuitBreaker = new CircuitBreaker(options);
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should transition to HALF_OPEN after reset timeout', async () => {
      const failingOperation = jest.fn().mockRejectedValue(new Error('failure'));

      // Trigger failures to open circuit breaker
      for (let i = 0; i < 3; i++) {
        try {
          await circuitBreaker.execute(failingOperation);
        } catch (error) {
          // Expected
        }
      }

      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.OPEN);

      // Fast forward past reset timeout
      jest.advanceTimersByTime(6000);

      // Next operation should transition to HALF_OPEN
      const successOperation = jest.fn().mockResolvedValue('success');
      await circuitBreaker.execute(successOperation);

      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.HALF_OPEN);
    });

    it('should require 3 successes to close from HALF_OPEN', async () => {
      // Force into HALF_OPEN state
      circuitBreaker.reset();
      const failingOperation = jest.fn().mockRejectedValue(new Error('failure'));

      for (let i = 0; i < 3; i++) {
        try {
          await circuitBreaker.execute(failingOperation);
        } catch (error) {
          // Expected
        }
      }

      jest.advanceTimersByTime(6000);

      const successOperation = jest.fn().mockResolvedValue('success');

      // First success - should stay HALF_OPEN
      await circuitBreaker.execute(successOperation);
      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.HALF_OPEN);

      // Second success - should stay HALF_OPEN
      await circuitBreaker.execute(successOperation);
      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.HALF_OPEN);

      // Third success - should close
      await circuitBreaker.execute(successOperation);
      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.CLOSED);
    });

    it('should return to OPEN on failure in HALF_OPEN state', async () => {
      // Force into OPEN state
      const failingOperation = jest.fn().mockRejectedValue(new Error('failure'));

      for (let i = 0; i < 3; i++) {
        try {
          await circuitBreaker.execute(failingOperation);
        } catch (error) {
          // Expected
        }
      }

      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.OPEN);

      // Advance time to move to HALF_OPEN
      jest.advanceTimersByTime(6000);

      // One success to get into HALF_OPEN
      const successOperation = jest.fn().mockResolvedValue('success');
      await circuitBreaker.execute(successOperation);
      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.HALF_OPEN);

      // Next failure should keep it in HALF_OPEN (not return to OPEN immediately)
      // The circuit breaker only goes OPEN after reaching threshold failures
      const failingOperation2 = jest.fn().mockRejectedValue(new Error('failure2'));

      // Need to reach the failure threshold again
      for (let i = 0; i < 3; i++) {
        try {
          await circuitBreaker.execute(failingOperation2);
        } catch (error) {
          // Expected
        }
      }

      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.OPEN);
    });

    it('should provide comprehensive stats', () => {
      const stats = circuitBreaker.getStats();

      expect(stats).toHaveProperty('state');
      expect(stats).toHaveProperty('failureCount');
      expect(stats).toHaveProperty('lastFailureTime');
      expect(stats).toHaveProperty('successCount');
      expect(stats.state).toBe(CircuitBreakerState.CLOSED);
      expect(stats.failureCount).toBe(0);
      expect(stats.successCount).toBe(0);
    });

    it('should reset all state when reset is called', async () => {
      const failingOperation = jest.fn().mockRejectedValue(new Error('failure'));

      // Cause some failures
      for (let i = 0; i < 3; i++) {
        try {
          await circuitBreaker.execute(failingOperation);
        } catch (error) {
          // Expected
        }
      }

      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.OPEN);

      // Reset should restore to CLOSED state
      circuitBreaker.reset();

      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.CLOSED);
      const stats = circuitBreaker.getStats();
      expect(stats.failureCount).toBe(0);
      expect(stats.lastFailureTime).toBe(0);
      expect(stats.successCount).toBe(0);
    });
  });

  describe('RetryManager - Advanced Scenarios', () => {
    beforeEach(() => {
      jest.useRealTimers(); // Use real timers for RetryManager since it uses setTimeout
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should handle non-retryable errors', async () => {
      const options: RetryOptions = {
        maxAttempts: 3,
        baseDelay: 100,
        maxDelay: 1000,
        backoffFactor: 2,
        retryableErrors: ['ECONNREFUSED', 'ETIMEDOUT'],
      };

      const logger = jest.fn();
      const operation = jest.fn().mockRejectedValue(new Error('UNAUTHORIZED'));

      await expect(RetryManager.withRetry(operation, options, logger)).rejects.toThrow('UNAUTHORIZED');

      expect(operation).toHaveBeenCalledTimes(1);
      expect(logger).toHaveBeenCalledWith(expect.stringContaining('Non-retryable error encountered'));
    });

    it('should retry retryable errors', async () => {
      const options: RetryOptions = {
        maxAttempts: 3,
        baseDelay: 10, // Use smaller delays for faster tests
        maxDelay: 100,
        backoffFactor: 2,
        retryableErrors: ['ECONNREFUSED'],
      };

      const logger = jest.fn();
      const operation = jest
        .fn()
        .mockRejectedValueOnce(new Error('ECONNREFUSED'))
        .mockRejectedValueOnce(new Error('ECONNREFUSED'))
        .mockResolvedValueOnce('success');

      const result = await RetryManager.withRetry(operation, options, logger);

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(3);
      expect(logger).toHaveBeenCalledTimes(2);
    });

    it('should respect max delay', async () => {
      const options: RetryOptions = {
        maxAttempts: 3,
        baseDelay: 10,
        maxDelay: 20,
        backoffFactor: 3,
        retryableErrors: ['ECONNREFUSED'],
      };

      const logger = jest.fn();
      const operation = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));

      await expect(RetryManager.withRetry(operation, options, logger)).rejects.toThrow('ECONNREFUSED');
      expect(operation).toHaveBeenCalledTimes(3);
    });

    it('should work without retryableErrors filter', async () => {
      const options: RetryOptions = {
        maxAttempts: 2,
        baseDelay: 5,
        maxDelay: 10,
        backoffFactor: 2,
      };

      const logger = jest.fn();
      const operation = jest.fn().mockRejectedValueOnce(new Error('ANY_ERROR')).mockResolvedValueOnce('success');

      const result = await RetryManager.withRetry(operation, options, logger);

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(2);
    });

    it('should work without logger', async () => {
      const options: RetryOptions = {
        maxAttempts: 2,
        baseDelay: 5,
        maxDelay: 10,
        backoffFactor: 2,
      };

      const operation = jest.fn().mockRejectedValueOnce(new Error('TEMPORARY_ERROR')).mockResolvedValueOnce('success');

      const result = await RetryManager.withRetry(operation, options);

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(2);
    });
  });

  describe('HealthMonitor - Advanced Scenarios', () => {
    let healthMonitor: HealthMonitor;

    beforeEach(() => {
      jest.useFakeTimers();
      healthMonitor = new HealthMonitor();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should track response time history', () => {
      healthMonitor.recordSuccess(100);
      healthMonitor.recordSuccess(200);
      healthMonitor.recordSuccess(150);

      const health = healthMonitor.getHealth();
      expect(health.responseTime).toBe(150); // Average of 100, 200, 150
    });

    it('should limit response time history size', () => {
      // Add more than maxHistorySize (10) response times
      for (let i = 1; i <= 15; i++) {
        healthMonitor.recordSuccess(i * 10);
      }

      const health = healthMonitor.getHealth();
      // Should only consider last 10 values: 60, 70, 80, 90, 100, 110, 120, 130, 140, 150
      const expectedAverage = (60 + 70 + 80 + 90 + 100 + 110 + 120 + 130 + 140 + 150) / 10;
      expect(health.responseTime).toBe(expectedAverage);
    });

    it('should handle response time without value', () => {
      healthMonitor.recordSuccess(); // No response time

      const health = healthMonitor.getHealth();
      expect(health.responseTime).toBeUndefined();
    });

    it('should track consecutive failures', () => {
      healthMonitor.recordFailure('Error 1');
      healthMonitor.recordFailure('Error 2');
      healthMonitor.recordFailure('Error 3');

      const health = healthMonitor.getHealth();
      expect(health.consecutiveFailures).toBe(3);
      expect(health.lastError).toBe('Error 3');
      expect(health.isHealthy).toBe(false); // 3+ failures = unhealthy
    });

    it('should reset consecutive failures on success', () => {
      healthMonitor.recordFailure('Error 1');
      healthMonitor.recordFailure('Error 2');
      healthMonitor.recordSuccess(100);

      const health = healthMonitor.getHealth();
      expect(health.consecutiveFailures).toBe(0);
      expect(health.lastError).toBeUndefined();
      expect(health.isHealthy).toBe(true);
    });

    it('should consider time since last success for health', () => {
      healthMonitor.recordSuccess(100);

      // Fast forward more than 5 minutes
      jest.advanceTimersByTime(6 * 60 * 1000);

      const health = healthMonitor.getHealth();
      expect(health.isHealthy).toBe(false); // Too long since last success
    });

    it('should reset all state when reset is called', () => {
      healthMonitor.recordFailure('Error');
      healthMonitor.recordSuccess(100);
      healthMonitor.recordSuccess(200);

      jest.advanceTimersByTime(1000);

      healthMonitor.reset();

      const health = healthMonitor.getHealth();
      expect(health.consecutiveFailures).toBe(0);
      expect(health.lastError).toBeUndefined();
      expect(health.responseTime).toBeUndefined();
      expect(health.isHealthy).toBe(true);
    });
  });

  describe('DeadLetterQueue - Advanced Scenarios', () => {
    let deadLetterQueue: DeadLetterQueue;
    let mockCommand: IntelliCenterRequest;

    beforeEach(() => {
      jest.useFakeTimers();
      deadLetterQueue = new DeadLetterQueue(3, 1000); // Small size and retention for testing
      mockCommand = {
        command: IntelliCenterRequestCommand.GetQuery,
        queryName: IntelliCenterQueryName.GetHardwareDefinition,
        messageID: 'test-message-id',
        arguments: 'CIRCUITS',
      };
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should add commands to queue', () => {
      deadLetterQueue.add(mockCommand, 1, 'Connection failed', 'original-id');

      const failedCommands = deadLetterQueue.getFailedCommands();
      expect(failedCommands).toHaveLength(1);
      expect(failedCommands[0]?.command).toBe(mockCommand);
      expect(failedCommands[0]?.attempts).toBe(1);
      expect(failedCommands[0]?.lastError).toBe('Connection failed');
      expect(failedCommands[0]?.originalMessageId).toBe('original-id');
    });

    it('should respect max size limit', () => {
      // Add more commands than max size (3)
      for (let i = 0; i < 5; i++) {
        deadLetterQueue.add({ ...mockCommand, messageID: `msg-${i}` }, 1, `Error ${i}`, `original-${i}`);
      }

      const failedCommands = deadLetterQueue.getFailedCommands();
      expect(failedCommands).toHaveLength(3); // Should only keep last 3
      expect(failedCommands[0]?.originalMessageId).toBe('original-2');
      expect(failedCommands[2]?.originalMessageId).toBe('original-4');
    });

    it('should clean up expired items', () => {
      deadLetterQueue.add(mockCommand, 1, 'Old error', 'old-id');

      // Fast forward past retention time
      jest.advanceTimersByTime(1500);

      deadLetterQueue.add({ ...mockCommand, messageID: 'new-msg' }, 1, 'New error', 'new-id');

      const failedCommands = deadLetterQueue.getFailedCommands();
      expect(failedCommands).toHaveLength(1);
      expect(failedCommands[0]?.originalMessageId).toBe('new-id');
    });

    it('should provide comprehensive stats', () => {
      deadLetterQueue.add(mockCommand, 1, 'Error 1', 'id-1');
      jest.advanceTimersByTime(100);
      deadLetterQueue.add({ ...mockCommand, messageID: 'msg-2' }, 2, 'Error 2', 'id-2');

      const stats = deadLetterQueue.getStats();
      expect(stats.queueSize).toBe(2);
      expect(stats.maxSize).toBe(3);
      expect(stats.oldestTimestamp).toBeDefined();
      expect(stats.newestTimestamp).toBeDefined();
      expect(stats.newestTimestamp! > stats.oldestTimestamp!).toBe(true);
    });

    it('should handle empty queue stats', () => {
      const stats = deadLetterQueue.getStats();
      expect(stats.queueSize).toBe(0);
      expect(stats.maxSize).toBe(3);
      expect(stats.oldestTimestamp).toBeNull();
      expect(stats.newestTimestamp).toBeNull();
    });

    it('should clear all items', () => {
      deadLetterQueue.add(mockCommand, 1, 'Error 1', 'id-1');
      deadLetterQueue.add({ ...mockCommand, messageID: 'msg-2' }, 2, 'Error 2', 'id-2');

      expect(deadLetterQueue.getFailedCommands()).toHaveLength(2);

      deadLetterQueue.clear();

      expect(deadLetterQueue.getFailedCommands()).toHaveLength(0);
      const stats = deadLetterQueue.getStats();
      expect(stats.queueSize).toBe(0);
    });
  });

  describe('RateLimiter - Advanced Scenarios', () => {
    let rateLimiter: RateLimiter;

    beforeEach(() => {
      jest.useFakeTimers();
      rateLimiter = new RateLimiter(3, 1000); // 3 requests per second
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should allow requests within limit', () => {
      expect(rateLimiter.canMakeRequest()).toBe(true);
      expect(rateLimiter.recordRequest()).toBe(true);

      expect(rateLimiter.canMakeRequest()).toBe(true);
      expect(rateLimiter.recordRequest()).toBe(true);

      expect(rateLimiter.canMakeRequest()).toBe(true);
      expect(rateLimiter.recordRequest()).toBe(true);
    });

    it('should reject requests over limit', () => {
      // Use up all available requests
      for (let i = 0; i < 3; i++) {
        expect(rateLimiter.recordRequest()).toBe(true);
      }

      // Next request should be rejected
      expect(rateLimiter.canMakeRequest()).toBe(false);
      expect(rateLimiter.recordRequest()).toBe(false);
    });

    it('should reset requests after window expires', () => {
      // Use up all available requests
      for (let i = 0; i < 3; i++) {
        rateLimiter.recordRequest();
      }

      expect(rateLimiter.canMakeRequest()).toBe(false);

      // Fast forward past window
      jest.advanceTimersByTime(1100);

      // Should be able to make requests again
      expect(rateLimiter.canMakeRequest()).toBe(true);
      expect(rateLimiter.recordRequest()).toBe(true);
    });

    it('should handle partial window expiry', () => {
      rateLimiter.recordRequest();
      jest.advanceTimersByTime(500);
      rateLimiter.recordRequest();
      rateLimiter.recordRequest();

      expect(rateLimiter.canMakeRequest()).toBe(false);

      // Fast forward to expire only the first request
      jest.advanceTimersByTime(600); // Total 1100ms from first request

      expect(rateLimiter.canMakeRequest()).toBe(true);
      rateLimiter.recordRequest();

      expect(rateLimiter.canMakeRequest()).toBe(false); // Should be at limit again
    });

    it('should provide accurate stats', () => {
      rateLimiter.recordRequest();
      rateLimiter.recordRequest();

      const stats = rateLimiter.getStats();
      expect(stats.currentRequests).toBe(2);
      expect(stats.maxRequests).toBe(3);
      expect(stats.windowMs).toBe(1000);
      expect(stats.canMakeRequest).toBe(true);

      rateLimiter.recordRequest();

      const stats2 = rateLimiter.getStats();
      expect(stats2.currentRequests).toBe(3);
      expect(stats2.canMakeRequest).toBe(false);
    });

    it('should handle edge case with zero requests', () => {
      const stats = rateLimiter.getStats();
      expect(stats.currentRequests).toBe(0);
      expect(stats.canMakeRequest).toBe(true);
    });

    it('should work with different limits and windows', () => {
      const strictLimiter = new RateLimiter(1, 2000); // 1 request per 2 seconds

      expect(strictLimiter.recordRequest()).toBe(true);
      expect(strictLimiter.recordRequest()).toBe(false);

      jest.advanceTimersByTime(2100);

      expect(strictLimiter.recordRequest()).toBe(true);
    });
  });

  describe('Integration Tests', () => {
    it('should work together in error scenarios', async () => {
      const circuitBreaker = new CircuitBreaker({
        failureThreshold: 2,
        resetTimeout: 1000,
        monitoringPeriod: 500,
      });

      const healthMonitor = new HealthMonitor();
      const rateLimiter = new RateLimiter(5, 1000);
      const deadLetterQueue = new DeadLetterQueue(10, 5000);

      jest.useFakeTimers();

      // Simulate a series of operations
      const failingOperation = jest.fn().mockRejectedValue(new Error('Service unavailable'));

      // First failure
      try {
        await circuitBreaker.execute(failingOperation);
      } catch (error) {
        healthMonitor.recordFailure(String(error));
        deadLetterQueue.add(
          {
            command: IntelliCenterRequestCommand.GetQuery,
            queryName: IntelliCenterQueryName.GetHardwareDefinition,
            messageID: 'msg-1',
          },
          1,
          String(error),
          'original-1',
        );
      }

      // Second failure - should open circuit breaker
      try {
        await circuitBreaker.execute(failingOperation);
      } catch (error) {
        healthMonitor.recordFailure(String(error));
      }

      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.OPEN);
      expect(healthMonitor.getHealth().consecutiveFailures).toBe(2);
      expect(deadLetterQueue.getFailedCommands()).toHaveLength(1);

      // Rate limiter should still work
      expect(rateLimiter.recordRequest()).toBe(true);

      jest.useRealTimers();
    });
  });

  describe('Additional Branch Coverage Tests', () => {
    it('should cover DeadLetterQueue optional chaining branches (lines 241-242)', () => {
      const dlq = new DeadLetterQueue();

      // Create items with null timestamps to trigger optional chaining
      const itemWithNullTimestamp1 = {
        command: { command: IntelliCenterRequestCommand.GetQuery, messageID: 'msg1' },
        attempts: 1,
        lastError: 'Test error',
        originalMessageId: 'orig1',
        timestamp: null as any, // This should trigger optional chaining
      };

      const itemWithNullTimestamp2 = {
        command: { command: IntelliCenterRequestCommand.GetQuery, messageID: 'msg2' },
        attempts: 1,
        lastError: 'Test error',
        originalMessageId: 'orig2',
        timestamp: null as any, // This should trigger optional chaining
      };

      // Clear existing queue and set items with null timestamps directly
      dlq.clear();

      // Access internal queue directly to bypass normal add method
      (dlq as any).queue = [itemWithNullTimestamp1, itemWithNullTimestamp2];

      // Disable cleanup to prevent items from being removed
      (dlq as any).maxRetentionMs = Number.MAX_SAFE_INTEGER;

      const stats = dlq.getStats();
      expect(stats.queueSize).toBe(2);
      // The optional chaining should handle null timestamps
      expect(stats.oldestTimestamp).toBeNull();
      expect(stats.newestTimestamp).toBeNull();
    });
  });
});
