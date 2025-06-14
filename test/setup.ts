// Jest setup file for integration tests

// Increase timeout for integration tests that may involve async operations
jest.setTimeout(30000);

// Mock telnet-client at the module level
jest.mock('telnet-client', () => {
  return {
    Telnet: jest.fn().mockImplementation(() => ({
      connect: jest.fn(),
      send: jest.fn(),
      destroy: jest.fn(),
      on: jest.fn(),
    })),
  };
});

// Suppress console output during tests unless explicitly needed
const originalConsole = console;
beforeAll(() => {
  global.console = {
    ...originalConsole,
    log: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };
});

afterAll(() => {
  global.console = originalConsole;
});

export {};