import { CharacteristicValue, PlatformAccessory, Service } from 'homebridge';
import { HeaterAccessory } from '../../src/heaterAccessory';
import { PentairPlatform } from '../../src/platform';
import {
  Body,
  BodyType,
  CircuitStatus,
  CircuitType,
  Heater,
  HeatMode,
  IntelliCenterRequestCommand,
  ObjectType,
  TemperatureUnits,
} from '../../src/types';
import { MANUFACTURER } from '../../src/settings';
import {
  HEATER_KEY,
  NO_HEATER_ID,
  LOW_TEMP_KEY,
  HIGH_TEMP_KEY,
  STATUS_KEY,
  THERMOSTAT_STEP_VALUE,
  CURRENT_TEMP_MIN_C,
  CURRENT_TEMP_MAX_C,
} from '../../src/constants';

// Mock Homebridge services and characteristics
const mockService = {
  setCharacteristic: jest.fn().mockReturnThis(),
  updateCharacteristic: jest.fn().mockReturnThis(),
  getCharacteristic: jest.fn().mockReturnThis(),
  onSet: jest.fn().mockReturnThis(),
  onGet: jest.fn().mockReturnThis(),
  updateValue: jest.fn().mockReturnThis(),
  setProps: jest.fn().mockReturnThis(),
};

const mockAccessoryInformation = {
  setCharacteristic: jest.fn().mockReturnThis(),
};

const mockPlatformAccessory = {
  getService: jest.fn(),
  addService: jest.fn().mockReturnValue(mockService),
  context: {} as any,
  UUID: 'test-heater-uuid',
} as unknown as PlatformAccessory;

const mockPlatform = {
  Service: {
    AccessoryInformation: 'AccessoryInformation',
    Thermostat: 'Thermostat',
  },
  Characteristic: {
    Manufacturer: 'Manufacturer',
    Model: 'Model',
    SerialNumber: 'SerialNumber',
    Name: 'Name',
    TargetTemperature: 'TargetTemperature',
    CurrentTemperature: 'CurrentTemperature',
    CoolingThresholdTemperature: 'CoolingThresholdTemperature',
    HeatingThresholdTemperature: 'HeatingThresholdTemperature',
    TargetHeatingCoolingState: {
      OFF: 0,
      HEAT: 1,
      COOL: 2,
      AUTO: 3,
    },
    CurrentHeatingCoolingState: {
      INACTIVE: 0,
      IDLE: 1,
      HEATING: 2,
      COOLING: 3,
      OFF: 0,
      HEAT: 2,
      COOL: 3,
    },
    TemperatureDisplayUnits: {
      CELSIUS: 0,
      FAHRENHEIT: 1,
    },
  },
  log: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
  sendCommandNoWait: jest.fn(),
  getConfig: jest.fn(),
} as unknown as PentairPlatform;

// Test data for heat pump with cooling
const mockHeatPump: Heater = {
  id: 'H01',
  name: 'UltraTemp Heat Pump',
  objectType: ObjectType.Heater,
  type: CircuitType.Generic,
  bodyIds: ['B01'],
  coolingEnabled: true,
};

const mockBody: Body = {
  id: 'B01',
  name: 'Pool',
  objectType: ObjectType.Body,
  type: BodyType.Pool,
  temperature: 78, // Current temp in Fahrenheit
  lowTemperature: 75, // Heating setpoint
  highTemperature: 82, // Cooling setpoint
  heaterId: 'H01',
  heatMode: HeatMode.On,
};

const mockConfig = {
  name: 'Pool Equipment',
  ip: '192.168.1.100',
  username: 'user',
  password: 'pass',
  temperatureUnits: TemperatureUnits.F,
  minimumTemperature: 50,
  maximumTemperature: 104,
  enableVSPControl: true,
  includeAllCircuits: false,
  enableAirTempSensor: true,
};

describe('HeaterAccessory Cooling Functionality', () => {
  let heaterAccessory: HeaterAccessory;

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup platform config
    (mockPlatform.getConfig as jest.Mock).mockReturnValue(mockConfig);

    // Setup platform accessory context
    mockPlatformAccessory.context = {
      heater: mockHeatPump,
      body: mockBody,
    };

    // Setup service mocks
    (mockPlatformAccessory.getService as jest.Mock) = jest.fn(serviceType => {
      if (serviceType === 'AccessoryInformation') {
        return mockAccessoryInformation;
      }
      if (serviceType === 'Thermostat') {
        return mockService;
      }
      return undefined;
    });
  });

  describe('Cooling-Enabled Heat Pump', () => {
    beforeEach(() => {
      heaterAccessory = new HeaterAccessory(mockPlatform, mockPlatformAccessory);
    });

    it('should support cooling modes for heat pumps', () => {
      // Should only include OFF and AUTO in valid values for devices with both heating and cooling
      expect(mockService.setProps).toHaveBeenCalledWith({
        minValue: 0, // OFF
        maxValue: 3, // AUTO
        validValues: [0, 3], // OFF, AUTO only
      });
    });

    it('should bind cooling threshold temperature characteristic', () => {
      // Should bind CoolingThresholdTemperature for heat pumps
      expect(mockService.getCharacteristic).toHaveBeenCalledWith('CoolingThresholdTemperature');
      expect(mockService.onSet).toHaveBeenCalled();
      expect(mockService.onGet).toHaveBeenCalled();
    });

    it('should bind heating threshold temperature characteristic', () => {
      // Should bind HeatingThresholdTemperature for heat pumps
      expect(mockService.getCharacteristic).toHaveBeenCalledWith('HeatingThresholdTemperature');
      expect(mockService.onSet).toHaveBeenCalled();
      expect(mockService.onGet).toHaveBeenCalled();
    });

    it('should return AUTO mode when temperature is between setpoints', () => {
      const mode = heaterAccessory.getMode();
      expect(mode).toBe(mockPlatform.Characteristic.TargetHeatingCoolingState.AUTO);
    });

    it('should return AUTO mode when temperature is below low setpoint', () => {
      // Update body temperature to be below heating setpoint
      mockPlatformAccessory.context.body.temperature = 70; // Below 75°F
      heaterAccessory = new HeaterAccessory(mockPlatform, mockPlatformAccessory);

      const mode = heaterAccessory.getMode();
      expect(mode).toBe(mockPlatform.Characteristic.TargetHeatingCoolingState.AUTO);
    });

    it('should return AUTO mode when temperature is above high setpoint', () => {
      // Update body temperature to be above cooling setpoint
      mockPlatformAccessory.context.body.temperature = 85; // Above 82°F
      heaterAccessory = new HeaterAccessory(mockPlatform, mockPlatformAccessory);

      const mode = heaterAccessory.getMode();
      expect(mode).toBe(mockPlatform.Characteristic.TargetHeatingCoolingState.AUTO);
    });

    it('should return OFF mode when heater is not selected', () => {
      // Update body to not use this heater
      mockPlatformAccessory.context.body.heaterId = 'H02';
      heaterAccessory = new HeaterAccessory(mockPlatform, mockPlatformAccessory);

      const mode = heaterAccessory.getMode();
      expect(mode).toBe(mockPlatform.Characteristic.TargetHeatingCoolingState.OFF);
    });
  });

  describe('Current Heating/Cooling State for Heat Pumps', () => {
    beforeEach(() => {
      heaterAccessory = new HeaterAccessory(mockPlatform, mockPlatformAccessory);
    });

    it('should return HEAT state when actively heating', () => {
      // Temperature below heating setpoint (converted to Celsius: 70°F = 21.11°C)
      mockPlatformAccessory.context.body.temperature = 70; // Below 75°F
      mockPlatformAccessory.context.body.heaterId = mockHeatPump.id; // Ensure heater is selected
      heaterAccessory = new HeaterAccessory(mockPlatform, mockPlatformAccessory);

      const state = heaterAccessory.getCurrentHeatingCoolingState();
      expect(state).toBe(mockPlatform.Characteristic.CurrentHeatingCoolingState.HEAT);
    });

    it('should return COOL state when actively cooling', () => {
      // Temperature above cooling setpoint (converted to Celsius: 85°F = 29.44°C)
      mockPlatformAccessory.context.body.temperature = 85; // Above 82°F
      mockPlatformAccessory.context.body.heaterId = mockHeatPump.id; // Ensure heater is selected
      heaterAccessory = new HeaterAccessory(mockPlatform, mockPlatformAccessory);

      const state = heaterAccessory.getCurrentHeatingCoolingState();
      expect(state).toBe(mockPlatform.Characteristic.CurrentHeatingCoolingState.COOL);
    });

    it('should return OFF state when temperature is in deadband', () => {
      // Temperature between setpoints (75-82°F) - reset to original value
      mockPlatformAccessory.context.body.temperature = 78; // Between 75°F and 82°F
      mockPlatformAccessory.context.body.heaterId = mockHeatPump.id; // Ensure heater is selected
      heaterAccessory = new HeaterAccessory(mockPlatform, mockPlatformAccessory);

      const state = heaterAccessory.getCurrentHeatingCoolingState();
      expect(state).toBe(mockPlatform.Characteristic.CurrentHeatingCoolingState.OFF);
    });

    it('should return OFF state when heater is not selected', () => {
      mockPlatformAccessory.context.body.heaterId = 'H02';
      heaterAccessory = new HeaterAccessory(mockPlatform, mockPlatformAccessory);

      const state = heaterAccessory.getCurrentHeatingCoolingState();
      expect(state).toBe(mockPlatform.Characteristic.CurrentHeatingCoolingState.OFF);
    });

    it('should return OFF state when no temperature data available', () => {
      mockPlatformAccessory.context.body.temperature = undefined;
      heaterAccessory = new HeaterAccessory(mockPlatform, mockPlatformAccessory);

      const state = heaterAccessory.getCurrentHeatingCoolingState();
      expect(state).toBe(mockPlatform.Characteristic.CurrentHeatingCoolingState.OFF);
    });
  });

  describe('Temperature Setpoint Management', () => {
    beforeEach(() => {
      heaterAccessory = new HeaterAccessory(mockPlatform, mockPlatformAccessory);
    });

    it('should set cooling threshold temperature', async () => {
      const testTemp = 28; // 28°C

      await heaterAccessory.setCoolingThresholdTemperature(testTemp);

      expect(mockPlatform.sendCommandNoWait).toHaveBeenCalledWith({
        command: IntelliCenterRequestCommand.SetParamList,
        messageID: expect.any(String),
        objectList: [
          {
            objnam: 'B01',
            params: { [HIGH_TEMP_KEY]: '82' }, // Converted to Fahrenheit and rounded
          },
        ],
      });
    });

    it('should get cooling threshold temperature', async () => {
      const temp = await heaterAccessory.getCoolingThresholdTemperature();
      expect(temp).toBeCloseTo(27.78, 2); // 82°F converted to Celsius
    });

    it('should set heating threshold temperature', async () => {
      const testTemp = 24; // 24°C

      await heaterAccessory.setHeatingThresholdTemperature(testTemp);

      expect(mockPlatform.sendCommandNoWait).toHaveBeenCalledWith({
        command: IntelliCenterRequestCommand.SetParamList,
        messageID: expect.any(String),
        objectList: [
          {
            objnam: 'B01',
            params: { [LOW_TEMP_KEY]: '75' }, // Converted to Fahrenheit and rounded
          },
        ],
      });
    });

    it('should get heating threshold temperature', async () => {
      const temp = await heaterAccessory.getHeatingThresholdTemperature();
      expect(temp).toBeCloseTo(23.89, 2); // 75°F converted to Celsius
    });
  });

  describe('Heating-Only Systems', () => {
    beforeEach(() => {
      // Create heating-only heater
      const heatingOnlyHeater: Heater = {
        ...mockHeatPump,
        coolingEnabled: false,
      };

      mockPlatformAccessory.context.heater = heatingOnlyHeater;
      // Ensure heaterId matches heater id
      mockPlatformAccessory.context.body.heaterId = heatingOnlyHeater.id;
      heaterAccessory = new HeaterAccessory(mockPlatform, mockPlatformAccessory);
    });

    it('should only support heating modes for heating-only systems', () => {
      // Should NOT include COOL and AUTO in valid values
      expect(mockService.setProps).toHaveBeenCalledWith({
        minValue: 0, // OFF
        maxValue: 1, // HEAT
        validValues: [0, 1], // OFF, HEAT only
      });
    });

    it('should return HEAT mode when heater is selected for heating-only systems', () => {
      const mode = heaterAccessory.getMode();
      expect(mode).toBe(mockPlatform.Characteristic.TargetHeatingCoolingState.HEAT);
    });

    it('should not bind cooling threshold characteristics for heating-only systems', () => {
      // Should NOT bind CoolingThresholdTemperature
      const calls = (mockService.getCharacteristic as jest.Mock).mock.calls;
      const coolingCalls = calls.filter(call => call[0] === 'CoolingThresholdTemperature');
      expect(coolingCalls).toHaveLength(0);
    });

    it('should only return HEAT or OFF for current state in heating-only systems', () => {
      // Temperature below heating setpoint
      mockPlatformAccessory.context.body.temperature = 70;
      // Re-create the heater accessory with updated temperature
      const heatingOnlyHeater: Heater = {
        ...mockHeatPump,
        coolingEnabled: false,
      };
      mockPlatformAccessory.context.heater = heatingOnlyHeater;
      mockPlatformAccessory.context.body.heaterId = heatingOnlyHeater.id;
      heaterAccessory = new HeaterAccessory(mockPlatform, mockPlatformAccessory);

      const state = heaterAccessory.getCurrentHeatingCoolingState();
      expect(state).toBe(mockPlatform.Characteristic.CurrentHeatingCoolingState.HEAT);

      // Temperature at or above heating setpoint
      mockPlatformAccessory.context.body.temperature = 78;
      heaterAccessory = new HeaterAccessory(mockPlatform, mockPlatformAccessory);

      const state2 = heaterAccessory.getCurrentHeatingCoolingState();
      expect(state2).toBe(mockPlatform.Characteristic.CurrentHeatingCoolingState.OFF);
    });
  });

  describe('Edge Cases', () => {
    it('should handle missing temperature data in getMode', () => {
      mockPlatformAccessory.context.body.temperature = undefined;
      mockPlatformAccessory.context.body.heaterId = mockHeatPump.id; // Ensure heater is selected
      heaterAccessory = new HeaterAccessory(mockPlatform, mockPlatformAccessory);

      const mode = heaterAccessory.getMode();
      // Should default to AUTO for cooling-enabled heaters without temperature data
      expect(mode).toBe(mockPlatform.Characteristic.TargetHeatingCoolingState.AUTO);
    });

    it('should handle missing setpoint data in getMode', () => {
      mockPlatformAccessory.context.body.lowTemperature = undefined;
      mockPlatformAccessory.context.body.highTemperature = undefined;
      mockPlatformAccessory.context.body.heaterId = mockHeatPump.id; // Ensure heater is selected
      heaterAccessory = new HeaterAccessory(mockPlatform, mockPlatformAccessory);

      const mode = heaterAccessory.getMode();
      // Should default to AUTO for cooling-enabled heaters without setpoint data
      expect(mode).toBe(mockPlatform.Characteristic.TargetHeatingCoolingState.AUTO);
    });

    it('should handle temperature conversion for cooling setpoints in Celsius', () => {
      // Change config to Celsius
      (mockPlatform.getConfig as jest.Mock).mockReturnValue({
        ...mockConfig,
        temperatureUnits: TemperatureUnits.C,
      });

      // Update body temperatures to Celsius
      mockPlatformAccessory.context.body.temperature = 26; // 26°C
      mockPlatformAccessory.context.body.lowTemperature = 24; // 24°C
      mockPlatformAccessory.context.body.highTemperature = 28; // 28°C

      heaterAccessory = new HeaterAccessory(mockPlatform, mockPlatformAccessory);

      // Should work correctly with Celsius temperatures
      const mode = heaterAccessory.getMode();
      expect(mode).toBe(mockPlatform.Characteristic.TargetHeatingCoolingState.AUTO);
    });
  });
});
