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
      Service: {
        AccessoryInformation: 'AccessoryInformation',
        Lightbulb: 'Lightbulb',
        Switch: 'Switch',
        Fan: 'Fan',
        Thermostat: 'Thermostat',
        TemperatureSensor: 'TemperatureSensor',
        LightSensor: 'LightSensor',
      },
      Characteristic: {
        Manufacturer: 'Manufacturer',
        Model: 'Model',
        SerialNumber: 'SerialNumber',
        On: 'On',
        RotationSpeed: 'RotationSpeed',
        CurrentTemperature: 'CurrentTemperature',
        TargetTemperature: 'TargetTemperature',
        TargetHeatingCoolingState: 'TargetHeatingCoolingState',
        CurrentHeatingCoolingState: 'CurrentHeatingCoolingState',
        TemperatureDisplayUnits: 'TemperatureDisplayUnits',
        CurrentAmbientLightLevel: 'CurrentAmbientLightLevel',
      },
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
    platformAccessory: jest.fn().mockImplementation((name: string, uuid: string) => ({
      displayName: name,
      UUID: uuid,
      context: {},
      getService: jest.fn().mockReturnValue({
        setCharacteristic: jest.fn().mockReturnThis(),
        getCharacteristic: jest.fn().mockReturnValue({
          onGet: jest.fn().mockReturnThis(),
          onSet: jest.fn().mockReturnThis(),
          updateValue: jest.fn().mockReturnThis(),
        }),
        updateCharacteristic: jest.fn().mockReturnThis(),
      }),
      addService: jest.fn().mockReturnValue({
        setCharacteristic: jest.fn().mockReturnThis(),
        getCharacteristic: jest.fn().mockReturnValue({
          onGet: jest.fn().mockReturnThis(),
          onSet: jest.fn().mockReturnThis(),
          updateValue: jest.fn().mockReturnThis(),
        }),
        updateCharacteristic: jest.fn().mockReturnThis(),
      }),
    })),
  } as any;

  return mockAPI;
}

export function createMockAccessory(): PlatformAccessory {
  return {
    UUID: 'test-uuid',
    displayName: 'Test Accessory',
    context: {},
    getService: jest.fn().mockReturnValue({
      setCharacteristic: jest.fn().mockReturnThis(),
      getCharacteristic: jest.fn().mockReturnValue({
        onGet: jest.fn().mockReturnThis(),
        onSet: jest.fn().mockReturnThis(),
        updateValue: jest.fn().mockReturnThis(),
      }),
      updateCharacteristic: jest.fn().mockReturnThis(),
    }),
    getServiceById: jest.fn(),
    addService: jest.fn().mockReturnValue({
      setCharacteristic: jest.fn().mockReturnThis(),
      getCharacteristic: jest.fn().mockReturnValue({
        onGet: jest.fn().mockReturnThis(),
        onSet: jest.fn().mockReturnThis(),
        updateValue: jest.fn().mockReturnThis(),
      }),
      updateCharacteristic: jest.fn().mockReturnThis(),
    }),
    removeService: jest.fn(),
    services: [],
    category: 1,
    aid: 1,
    _associatedHAPAccessory: undefined,
    _associatedPlugin: undefined,
  } as any;
}
