/**
 * Error handling and resilience utilities for Pentair Platform
 */

import { IntelliCenterRequest } from './types';

export interface RetryOptions {
  maxAttempts: number;
  baseDelay: number;
  maxDelay: number;
  backoffFactor: number;
  retryableErrors?: string[];
}

export interface CircuitBreakerOptions {
  failureThreshold: number;
  resetTimeout: number;
  monitoringPeriod: number;
}

export enum CircuitBreakerState {
  CLOSED = 'closed',     // Normal operation
  OPEN = 'open',         // Circuit breaker is open, rejecting calls
  HALF_OPEN = 'half-open' // Testing if service is back
}

export class CircuitBreaker {
  private state: CircuitBreakerState = CircuitBreakerState.CLOSED;
  private failureCount = 0;
  private lastFailureTime = 0;
  private successCount = 0;

  constructor(private options: CircuitBreakerOptions) {}

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === CircuitBreakerState.OPEN) {
      if (Date.now() - this.lastFailureTime > this.options.resetTimeout) {
        this.state = CircuitBreakerState.HALF_OPEN;
        this.successCount = 0;
      } else {
        throw new Error('Circuit breaker is OPEN - operation rejected');
      }
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    this.failureCount = 0;

    if (this.state === CircuitBreakerState.HALF_OPEN) {
      this.successCount++;
      if (this.successCount >= 3) { // Require 3 successes to close
        this.state = CircuitBreakerState.CLOSED;
      }
    }
  }

  private onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.failureCount >= this.options.failureThreshold) {
      this.state = CircuitBreakerState.OPEN;
    }
  }

  getState(): CircuitBreakerState {
    return this.state;
  }

  getStats() {
    return {
      state: this.state,
      failureCount: this.failureCount,
      lastFailureTime: this.lastFailureTime,
      successCount: this.successCount,
    };
  }

  reset(): void {
    this.state = CircuitBreakerState.CLOSED;
    this.failureCount = 0;
    this.lastFailureTime = 0;
    this.successCount = 0;
  }
}

export class RetryManager {
  static async withRetry<T>(
    operation: () => Promise<T>,
    options: RetryOptions,
    logger?: (message: string) => void,
  ): Promise<T> {
    let lastError: Error;

    for (let attempt = 1; attempt <= options.maxAttempts; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;

        if (attempt === options.maxAttempts) {
          break; // Don't delay on final attempt
        }

        // Check if error is retryable
        if (options.retryableErrors && options.retryableErrors.length > 0) {
          const isRetryable = options.retryableErrors.some(retryableError =>
            lastError.message.includes(retryableError),
          );
          if (!isRetryable) {
            logger?.(`Non-retryable error encountered: ${lastError.message}`);
            throw lastError;
          }
        }

        const delay = Math.min(
          options.baseDelay * Math.pow(options.backoffFactor, attempt - 1),
          options.maxDelay,
        );

        logger?.(`Attempt ${attempt}/${options.maxAttempts} failed: ${lastError.message}. Retrying in ${delay}ms...`);

        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    throw lastError!;
  }
}

export interface ConnectionHealth {
  isHealthy: boolean;
  lastSuccessfulOperation: number;
  consecutiveFailures: number;
  lastError?: string;
  responseTime?: number;
}

export class HealthMonitor {
  private consecutiveFailures = 0;
  private lastSuccessfulOperation = Date.now();
  private lastError?: string;
  private responseTimeHistory: number[] = [];
  private readonly maxHistorySize = 10;

  recordSuccess(responseTime?: number): void {
    this.consecutiveFailures = 0;
    this.lastSuccessfulOperation = Date.now();
    this.lastError = undefined;

    if (responseTime !== undefined) {
      this.responseTimeHistory.push(responseTime);
      if (this.responseTimeHistory.length > this.maxHistorySize) {
        this.responseTimeHistory.shift();
      }
    }
  }

  recordFailure(error: string): void {
    this.consecutiveFailures++;
    this.lastError = error;
  }

  getHealth(): ConnectionHealth {
    const timeSinceLastSuccess = Date.now() - this.lastSuccessfulOperation;
    const avgResponseTime = this.responseTimeHistory.length > 0
      ? this.responseTimeHistory.reduce((a, b) => a + b, 0) / this.responseTimeHistory.length
      : undefined;

    return {
      isHealthy: this.consecutiveFailures < 3 && timeSinceLastSuccess < 300000, // 5 minutes
      lastSuccessfulOperation: this.lastSuccessfulOperation,
      consecutiveFailures: this.consecutiveFailures,
      lastError: this.lastError,
      responseTime: avgResponseTime,
    };
  }

  reset(): void {
    this.consecutiveFailures = 0;
    this.lastSuccessfulOperation = Date.now();
    this.lastError = undefined;
    this.responseTimeHistory = [];
  }
}

export interface DeadLetterQueueItem {
  command: IntelliCenterRequest;
  timestamp: number;
  attempts: number;
  lastError: string;
  originalMessageId: string;
}

export class DeadLetterQueue {
  private queue: DeadLetterQueueItem[] = [];
  private maxSize: number;
  private maxRetentionMs: number;

  constructor(maxSize = 100, maxRetentionMs = 24 * 60 * 60 * 1000) { // 24 hours default
    this.maxSize = maxSize;
    this.maxRetentionMs = maxRetentionMs;
  }

  add(command: IntelliCenterRequest, attempts: number, error: string, originalMessageId: string): void {
    const item: DeadLetterQueueItem = {
      command,
      timestamp: Date.now(),
      attempts,
      lastError: error,
      originalMessageId,
    };

    this.queue.push(item);

    // Maintain size limit
    if (this.queue.length > this.maxSize) {
      this.queue.shift(); // Remove oldest
    }
  }

  getFailedCommands(): ReadonlyArray<DeadLetterQueueItem> {
    this.cleanup();
    return [...this.queue];
  }

  getStats() {
    this.cleanup();
    return {
      queueSize: this.queue.length,
      maxSize: this.maxSize,
      oldestTimestamp: this.queue.length > 0 ? this.queue[0]?.timestamp ?? null : null,
      newestTimestamp: this.queue.length > 0 ? this.queue[this.queue.length - 1]?.timestamp ?? null : null,
    };
  }

  clear(): void {
    this.queue = [];
  }

  private cleanup(): void {
    const now = Date.now();
    this.queue = this.queue.filter(item => now - item.timestamp < this.maxRetentionMs);
  }
}

export class RateLimiter {
  private requests: number[] = [];

  constructor(
    private maxRequests: number,
    private windowMs: number,
  ) {}

  private getNow(): number {
    return Date.now();
  }

  canMakeRequest(): boolean {
    const now = this.getNow();
    // Remove expired requests
    this.requests = this.requests.filter(timestamp => now - timestamp < this.windowMs);

    return this.requests.length < this.maxRequests;
  }

  recordRequest(): boolean {
    if (!this.canMakeRequest()) {
      return false;
    }

    this.requests.push(this.getNow());
    return true;
  }

  getStats() {
    const now = this.getNow();
    const activeRequests = this.requests.filter(timestamp => now - timestamp < this.windowMs);

    return {
      currentRequests: activeRequests.length,
      maxRequests: this.maxRequests,
      windowMs: this.windowMs,
      canMakeRequest: this.canMakeRequest(),
    };
  }
}