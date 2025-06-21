import { Logger, API, PlatformAccessory } from 'homebridge';

export function createMockLogger(): Logger {
  return {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    log: jest.fn(),
  } as any;
}

export function createMockAPI(): API {
  const mockAPI = {
    hap: {
      Service: {},
      Characteristic: {},
      uuid: {
        generate: jest.fn((str: string) => `uuid-${str}`),
      },
    },
    updatePlatformAccessories: jest.fn(),
    registerPlatformAccessories: jest.fn(),
    unregisterPlatformAccessories: jest.fn(),
    on: jest.fn(),
    version: '1.8.0',
    platformVersion: '1.8.0',
    serverVersion: '1.8.0',
    user: {
      configPath: jest.fn(),
      persistPath: jest.fn(),
      storagePath: jest.fn(),
    },
  } as any;

  return mockAPI;
}

export function createMockAccessory(): PlatformAccessory {
  return {
    UUID: 'test-uuid',
    displayName: 'Test Accessory',
    context: {},
    getService: jest.fn(),
    getServiceById: jest.fn(),
    addService: jest.fn(),
    removeService: jest.fn(),
    services: [],
    category: 1,
    aid: 1,
    _associatedHAPAccessory: undefined,
    _associatedPlugin: undefined,
  } as any;
}
