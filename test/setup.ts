/**
 * Jest setup file for integration tests
 *
 * This file configures the test environment for integration testing of the
 * Homebridge Pentair IntelliCenter plugin. It sets up common mocks and
 * test utilities that are used across multiple test suites.
 */

// Global test setup
beforeAll(() => {
  // Set test environment
  process.env.NODE_ENV = 'test';

  // Configure Jest timeouts for integration tests
  jest.setTimeout(10000);
});

// Global cleanup
afterAll(() => {
  // Clean up any global resources if needed
});

// Export common test utilities
export const testConfig = {
  defaultTimeout: 5000,
  integrationTimeout: 10000,
};
