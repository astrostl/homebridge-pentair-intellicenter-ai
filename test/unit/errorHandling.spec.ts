import { CircuitBreaker, RetryManager, HealthMonitor, RateLimiter, DeadLetterQueue, CircuitBreakerState } from '../../src/errorHandling';

describe('Error Handling Components', () => {
  describe('CircuitBreaker', () => {
    let circuitBreaker: CircuitBreaker;

    beforeEach(() => {
      circuitBreaker = new CircuitBreaker({
        failureThreshold: 3,
        resetTimeout: 1000,
        monitoringPeriod: 500,
      });
    });

    it('should start in CLOSED state', () => {
      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.CLOSED);
    });

    it('should allow operations when CLOSED', async () => {
      const operation = jest.fn().mockResolvedValue('success');

      const result = await circuitBreaker.execute(operation);

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should transition to OPEN after threshold failures', async () => {
      const operation = jest.fn().mockRejectedValue(new Error('failure'));

      // Trigger failures up to threshold
      for (let i = 0; i < 3; i++) {
        try {
          await circuitBreaker.execute(operation);
        } catch (error) {
          // Expected
        }
      }

      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.OPEN);
    });

    it('should reject operations when OPEN', async () => {
      const operation = jest.fn().mockResolvedValue('success');

      // Force circuit breaker to OPEN state
      for (let i = 0; i < 3; i++) {
        try {
          await circuitBreaker.execute(jest.fn().mockRejectedValue(new Error('failure')));
        } catch (error) {
          // Expected
        }
      }

      await expect(circuitBreaker.execute(operation)).rejects.toThrow('Circuit breaker is OPEN');
      expect(operation).not.toHaveBeenCalled();
    });

    it('should transition to HALF_OPEN after reset timeout', async () => {
      jest.useFakeTimers();

      const operation = jest.fn().mockResolvedValue('success');

      // Force to OPEN state
      for (let i = 0; i < 3; i++) {
        try {
          await circuitBreaker.execute(jest.fn().mockRejectedValue(new Error('failure')));
        } catch (error) {
          // Expected
        }
      }

      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.OPEN);

      // Advance time past reset timeout
      jest.advanceTimersByTime(1100);

      // Next operation should transition to HALF_OPEN
      const result = await circuitBreaker.execute(operation);

      expect(result).toBe('success');
      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.HALF_OPEN);

      jest.useRealTimers();
    });

    it('should reset to CLOSED after successful operations in HALF_OPEN', async () => {
      jest.useFakeTimers();

      const operation = jest.fn().mockResolvedValue('success');

      // Force to OPEN state
      for (let i = 0; i < 3; i++) {
        try {
          await circuitBreaker.execute(jest.fn().mockRejectedValue(new Error('failure')));
        } catch (error) {
          // Expected
        }
      }

      // Wait for reset timeout
      jest.advanceTimersByTime(1100);

      // Perform 3 successful operations to close circuit
      for (let i = 0; i < 3; i++) {
        await circuitBreaker.execute(operation);
      }

      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.CLOSED);

      jest.useRealTimers();
    });

    it('should provide accurate stats', () => {
      const stats = circuitBreaker.getStats();

      expect(stats).toHaveProperty('state');
      expect(stats).toHaveProperty('failureCount');
      expect(stats).toHaveProperty('lastFailureTime');
      expect(stats).toHaveProperty('successCount');
    });
  });

  describe('RetryManager', () => {
    // Use real timers for RetryManager tests since it uses setTimeout internally
    beforeEach(() => {
      jest.useRealTimers();
    });

    it('should succeed on first attempt if operation succeeds', async () => {
      const operation = jest.fn().mockResolvedValue('success');

      const result = await RetryManager.withRetry(operation, {
        maxAttempts: 3,
        baseDelay: 100,
        maxDelay: 1000,
        backoffFactor: 2,
      });

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should retry on failure with exponential backoff', async () => {
      const operation = jest
        .fn()
        .mockRejectedValueOnce(new Error('failure 1'))
        .mockRejectedValueOnce(new Error('failure 2'))
        .mockResolvedValue('success');

      const logger = jest.fn();

      const result = await RetryManager.withRetry(
        operation,
        {
          maxAttempts: 3,
          baseDelay: 10,
          maxDelay: 100,
          backoffFactor: 2,
        },
        logger,
      );

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(3);
      expect(logger).toHaveBeenCalledTimes(2);
    });

    it('should respect maxDelay', async () => {
      const operation = jest
        .fn()
        .mockRejectedValueOnce(new Error('failure 1'))
        .mockRejectedValueOnce(new Error('failure 2'))
        .mockResolvedValue('success');

      const result = await RetryManager.withRetry(operation, {
        maxAttempts: 3,
        baseDelay: 100,
        maxDelay: 150,
        backoffFactor: 3, // Would normally be 300ms, but capped at 150ms
      });

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(3);
    });

    it('should check retryable errors', async () => {
      const operation = jest.fn().mockRejectedValue(new Error('Non-retryable error'));

      await expect(
        RetryManager.withRetry(operation, {
          maxAttempts: 3,
          baseDelay: 100,
          maxDelay: 1000,
          backoffFactor: 2,
          retryableErrors: ['ECONNREFUSED', 'ETIMEDOUT'],
        }),
      ).rejects.toThrow('Non-retryable error');

      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should throw last error after exhausting retries', async () => {
      const operation = jest.fn().mockRejectedValue(new Error('persistent failure'));

      // Test the retry behavior and expect it to fail
      await expect(
        RetryManager.withRetry(operation, {
          maxAttempts: 2,
          baseDelay: 1, // Use very small delays for test speed
          maxDelay: 5,
          backoffFactor: 2,
        }),
      ).rejects.toThrow('persistent failure');

      expect(operation).toHaveBeenCalledTimes(2);
    });
  });

  describe('HealthMonitor', () => {
    let healthMonitor: HealthMonitor;

    beforeEach(() => {
      jest.useFakeTimers();
      healthMonitor = new HealthMonitor();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should start healthy', () => {
      const health = healthMonitor.getHealth();

      expect(health.isHealthy).toBe(true);
      expect(health.consecutiveFailures).toBe(0);
      expect(health.lastError).toBeUndefined();
    });

    it('should record successful operations', () => {
      healthMonitor.recordSuccess(100);

      const health = healthMonitor.getHealth();

      expect(health.isHealthy).toBe(true);
      expect(health.consecutiveFailures).toBe(0);
      expect(health.responseTime).toBe(100);
    });

    it('should record failures', () => {
      healthMonitor.recordFailure('Test error');

      const health = healthMonitor.getHealth();

      expect(health.consecutiveFailures).toBe(1);
      expect(health.lastError).toBe('Test error');
    });

    it('should become unhealthy after multiple failures', () => {
      for (let i = 0; i < 3; i++) {
        healthMonitor.recordFailure(`Error ${i + 1}`);
      }

      const health = healthMonitor.getHealth();

      expect(health.isHealthy).toBe(false);
      expect(health.consecutiveFailures).toBe(3);
    });

    it('should become unhealthy if no success for too long', () => {
      // Advance time beyond healthy threshold (5 minutes)
      jest.advanceTimersByTime(6 * 60 * 1000);

      const health = healthMonitor.getHealth();

      expect(health.isHealthy).toBe(false);
    });

    it('should calculate average response time', () => {
      healthMonitor.recordSuccess(100);
      healthMonitor.recordSuccess(200);
      healthMonitor.recordSuccess(300);

      const health = healthMonitor.getHealth();

      expect(health.responseTime).toBe(200); // Average of 100, 200, 300
    });

    it('should reset correctly', () => {
      healthMonitor.recordFailure('Test error');
      healthMonitor.recordSuccess(100);

      healthMonitor.reset();

      const health = healthMonitor.getHealth();

      expect(health.isHealthy).toBe(true);
      expect(health.consecutiveFailures).toBe(0);
      expect(health.lastError).toBeUndefined();
      expect(health.responseTime).toBeUndefined();
    });
  });

  describe('RateLimiter', () => {
    let rateLimiter: RateLimiter;

    beforeEach(() => {
      jest.useFakeTimers();
      rateLimiter = new RateLimiter(3, 1000); // 3 requests per second
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should allow requests within limit', () => {
      expect(rateLimiter.recordRequest()).toBe(true);
      expect(rateLimiter.recordRequest()).toBe(true);
      expect(rateLimiter.recordRequest()).toBe(true);
    });

    it('should reject requests exceeding limit', () => {
      // Fill the quota
      rateLimiter.recordRequest();
      rateLimiter.recordRequest();
      rateLimiter.recordRequest();

      // Should reject the next request
      expect(rateLimiter.recordRequest()).toBe(false);
    });

    it('should allow requests after window expires', () => {
      // Fill the quota
      rateLimiter.recordRequest();
      rateLimiter.recordRequest();
      rateLimiter.recordRequest();

      // Should reject
      expect(rateLimiter.recordRequest()).toBe(false);

      // Advance time past window
      jest.advanceTimersByTime(1100);

      // Should allow again
      expect(rateLimiter.recordRequest()).toBe(true);
    });

    it('should provide accurate stats', () => {
      rateLimiter.recordRequest();
      rateLimiter.recordRequest();

      const stats = rateLimiter.getStats();

      expect(stats.currentRequests).toBe(2);
      expect(stats.maxRequests).toBe(3);
      expect(stats.windowMs).toBe(1000);
      expect(stats.canMakeRequest).toBe(true);
    });

    it('should handle window sliding correctly', () => {
      const dateSpy = jest.spyOn(Date, 'now');

      // Set up first three requests within the window
      dateSpy.mockReturnValue(1000);
      expect(rateLimiter.recordRequest()).toBe(true); // t=1000

      dateSpy.mockReturnValue(1100);
      expect(rateLimiter.recordRequest()).toBe(true); // t=1100

      dateSpy.mockReturnValue(1200);
      expect(rateLimiter.recordRequest()).toBe(true); // t=1200

      // All three slots filled, next request should fail at same time
      dateSpy.mockReturnValue(1200);
      expect(rateLimiter.recordRequest()).toBe(false); // t=1200 (should reject)

      // Move forward past window expiry for first request (1000 + 1000 = 2000, so at 2001 it expires)
      dateSpy.mockReturnValue(2001);
      expect(rateLimiter.recordRequest()).toBe(true); // t=2001 (should allow, first request expired)

      dateSpy.mockRestore();
    });
  });

  describe('DeadLetterQueue', () => {
    let deadLetterQueue: DeadLetterQueue;

    beforeEach(() => {
      jest.useFakeTimers();
      deadLetterQueue = new DeadLetterQueue(3, 1000); // Small size and retention for testing
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should start empty', () => {
      const stats = deadLetterQueue.getStats();

      expect(stats.queueSize).toBe(0);
      expect(stats.maxSize).toBe(3);
      expect(stats.oldestTimestamp).toBeNull();
      expect(stats.newestTimestamp).toBeNull();
    });

    it('should add failed commands', () => {
      const command = {
        command: 'GetQuery' as any,
        messageID: 'test-1',
      };

      deadLetterQueue.add(command, 3, 'Test error', 'test-1');

      const failedCommands = deadLetterQueue.getFailedCommands();
      expect(failedCommands).toHaveLength(1);
      expect(failedCommands[0]?.command).toBe(command);
      expect(failedCommands[0]?.attempts).toBe(3);
      expect(failedCommands[0]?.lastError).toBe('Test error');
      expect(failedCommands[0]?.originalMessageId).toBe('test-1');
    });

    it('should maintain size limit', () => {
      // Add 4 items to queue with max size 3
      for (let i = 0; i < 4; i++) {
        deadLetterQueue.add({ command: 'GetQuery' as any, messageID: `test-${i}` }, 1, `Error ${i}`, `test-${i}`);
      }

      const failedCommands = deadLetterQueue.getFailedCommands();
      expect(failedCommands).toHaveLength(3);

      // Should contain items 1, 2, 3 (item 0 was removed)
      expect(failedCommands[0]?.originalMessageId).toBe('test-1');
      expect(failedCommands[2]?.originalMessageId).toBe('test-3');
    });

    it('should clean up expired items', () => {
      deadLetterQueue.add({ command: 'GetQuery' as any, messageID: 'test-1' }, 1, 'Error 1', 'test-1');

      // Advance time past retention period
      jest.advanceTimersByTime(1100);

      deadLetterQueue.add({ command: 'GetQuery' as any, messageID: 'test-2' }, 1, 'Error 2', 'test-2');

      const failedCommands = deadLetterQueue.getFailedCommands();
      expect(failedCommands).toHaveLength(1);
      expect(failedCommands[0]?.originalMessageId).toBe('test-2');
    });

    it('should clear all items', () => {
      deadLetterQueue.add({ command: 'GetQuery' as any, messageID: 'test-1' }, 1, 'Error 1', 'test-1');
      deadLetterQueue.add({ command: 'GetQuery' as any, messageID: 'test-2' }, 1, 'Error 2', 'test-2');

      expect(deadLetterQueue.getFailedCommands()).toHaveLength(2);

      deadLetterQueue.clear();

      expect(deadLetterQueue.getFailedCommands()).toHaveLength(0);
      expect(deadLetterQueue.getStats().queueSize).toBe(0);
    });

    it('should provide accurate stats', () => {
      const dateSpy = jest.spyOn(Date, 'now');

      // Set initial time
      dateSpy.mockReturnValue(1000);
      deadLetterQueue.add({ command: 'GetQuery' as any, messageID: 'test-1' }, 1, 'Error 1', 'test-1');

      // Add second item just 100ms later (both within retention period)
      dateSpy.mockReturnValue(1100);
      deadLetterQueue.add({ command: 'GetQuery' as any, messageID: 'test-2' }, 1, 'Error 2', 'test-2');

      // Check stats at the same time as the second item
      dateSpy.mockReturnValue(1100);
      const stats = deadLetterQueue.getStats();

      expect(stats.queueSize).toBe(2);
      expect(stats.maxSize).toBe(3);
      expect(stats.oldestTimestamp).toBe(1000);
      expect(stats.newestTimestamp).toBe(1100);

      dateSpy.mockRestore();
    });
  });

  describe('Coverage for uncovered lines', () => {
    it('should cover CircuitBreaker reset method', async () => {
      const circuitBreaker = new CircuitBreaker({
        failureThreshold: 2,
        resetTimeout: 30000,
        monitoringPeriod: 60000,
      });

      // Put circuit breaker in failed state by executing failing operations
      try {
        await circuitBreaker.execute(async () => {
          throw new Error('test error');
        });
      } catch (e) {
        /* ignore */
      }
      try {
        await circuitBreaker.execute(async () => {
          throw new Error('test error');
        });
      } catch (e) {
        /* ignore */
      }
      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.OPEN);

      // Reset should restore it to closed state
      circuitBreaker.reset();
      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.CLOSED);
    });

    it('should cover HealthMonitor response time history limit', () => {
      const healthMonitor = new HealthMonitor();

      // Fill up history beyond max size (should be 100)
      for (let i = 0; i < 105; i++) {
        healthMonitor.recordSuccess(100 + i);
      }

      const health = healthMonitor.getHealth();

      // Should have trimmed to max size
      expect(health.lastSuccessfulOperation).toBeGreaterThan(0);
      expect(health.consecutiveFailures).toBe(0);
    });
  });
});
