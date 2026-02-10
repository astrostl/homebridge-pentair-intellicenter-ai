module.exports = {
  clearMocks: true,
  collectCoverage: true,
  collectCoverageFrom: [
    'src/**',
    '!src/settings.ts',
    '!src/index.ts', // Entry point, mainly exports
  ],
  coverageDirectory: 'coverage',
  coverageProvider: 'v8',
  coverageReporters: [
    'text',
    'lcov',
  ],
  coverageThreshold: {
    global: {
      branches: 60,
      functions: 70,
      lines: 70,
      statements: 70,
    },
    // Per-file thresholds for critical accessory classes
    'src/circuitAccessory.ts': {
      functions: 80,
      lines: 80,
    },
    'src/heaterAccessory.ts': {
      functions: 80,
      lines: 80,
    },
    'src/temperatureAccessory.ts': {
      functions: 90,
      lines: 90,
    },
  },
  preset: 'ts-jest',
  setupFilesAfterEnv: ['<rootDir>/test/setup.ts'],
  testMatch: [
    '<rootDir>/test/**/*.spec.ts',
    '<rootDir>/test/**/*.test.ts',
  ],
  testPathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
  ],
  // uuid v13+ is ESM-only; map to CJS mock for Jest compatibility
  moduleNameMapper: {
    '^uuid$': '<rootDir>/test/__mocks__/uuid.ts',
  },
};
