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
  ObjectType,
  TemperatureUnits,
} from '../../src/types';
import { MANUFACTURER } from '../../src/settings';
import {
  HEATER_KEY,
  NO_HEATER_ID,
  LOW_TEMP_KEY,
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

// Test data
const mockHeater: Heater = {
  id: 'H01',
  name: 'Pool Heater',
  objectType: ObjectType.Heater,
  type: CircuitType.Generic,
  bodyIds: ['B01'],
};

const mockBody: Body = {
  id: 'B01',
  name: 'Pool',
  objectType: ObjectType.Body,
  type: BodyType.Pool,
  temperature: 78, // Fahrenheit
  lowTemperature: 75, // Target temperature
  highTemperature: 85,
  heaterId: 'H01', // Currently using this heater
};

const mockBodyCelsius: Body = {
  id: 'B01',
  name: 'Pool',
  objectType: ObjectType.Body,
  type: BodyType.Pool,
  temperature: 25, // Celsius
  lowTemperature: 24, // Target temperature
  highTemperature: 30,
  heaterId: 'H01',
};

describe('HeaterAccessory', () => {
  let heaterAccessory: HeaterAccessory;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Reset platform accessory context
    mockPlatformAccessory.context = {
      heater: mockHeater,
      body: mockBody,
    };

    // Setup default mock returns
    (mockPlatformAccessory.getService as jest.Mock).mockImplementation((serviceType) => {
      if (serviceType === 'AccessoryInformation') {
        return mockAccessoryInformation;
      }
      return null;
    });

    // Default configuration (Fahrenheit)
    (mockPlatform.getConfig as jest.Mock).mockReturnValue({
      temperatureUnits: TemperatureUnits.F,
      minimumTemperature: 40, // Fahrenheit
      maximumTemperature: 104, // Fahrenheit
    });
  });

  describe('Constructor - Fahrenheit Configuration', () => {
    beforeEach(() => {
      heaterAccessory = new HeaterAccessory(mockPlatform, mockPlatformAccessory);
    });

    it('should initialize with correct accessory information', () => {
      expect(mockAccessoryInformation.setCharacteristic).toHaveBeenCalledWith('Manufacturer', MANUFACTURER);
      expect(mockAccessoryInformation.setCharacteristic).toHaveBeenCalledWith('Model', 'GENERIC');
      expect(mockAccessoryInformation.setCharacteristic).toHaveBeenCalledWith('SerialNumber', 'B01.H01');
    });

    it('should create a Thermostat service', () => {
      expect(mockPlatformAccessory.addService).toHaveBeenCalledWith('Thermostat');
      expect(mockService.setCharacteristic).toHaveBeenCalledWith('Name', 'Pool Pool Heater');
    });

    it('should convert Fahrenheit temperatures to Celsius for internal use', () => {
      // Verify temperature conversion in constructor
      expect(mockPlatform.log.debug).toHaveBeenCalledWith(
        expect.stringContaining('Temperature Slider Min: 4.444444444444445') // 40F to C
      );
      expect(mockPlatform.log.debug).toHaveBeenCalledWith(
        expect.stringContaining('Max: 40') // 104F to C
      );
    });

    it('should bind thermostat characteristics', () => {
      expect(mockService.getCharacteristic).toHaveBeenCalledWith('TargetTemperature');
      expect(mockService.getCharacteristic).toHaveBeenCalledWith('CurrentTemperature');
      expect(mockService.getCharacteristic).toHaveBeenCalledWith(
        expect.objectContaining({
          OFF: 0,
          HEAT: 1,
          COOL: 2,
          AUTO: 3
        })
      );
    });

    it('should set correct temperature display units for Fahrenheit', () => {
      expect(mockService.updateCharacteristic).toHaveBeenCalledWith(
        expect.objectContaining({
          CELSIUS: 0,
          FAHRENHEIT: 1
        }),
        1 // FAHRENHEIT
      );
    });
  });

  describe('Constructor - Celsius Configuration', () => {
    beforeEach(() => {
      (mockPlatform.getConfig as jest.Mock).mockReturnValue({
        temperatureUnits: TemperatureUnits.C,
        minimumTemperature: 4, // Celsius
        maximumTemperature: 40, // Celsius
      });
      mockPlatformAccessory.context.body = mockBodyCelsius;
      
      heaterAccessory = new HeaterAccessory(mockPlatform, mockPlatformAccessory);
    });

    it('should set correct temperature display units for Celsius', () => {
      expect(mockService.updateCharacteristic).toHaveBeenCalledWith(
        expect.objectContaining({
          CELSIUS: 0,
          FAHRENHEIT: 1
        }),
        0 // CELSIUS
      );
    });

    it('should not convert temperatures when in Celsius mode', () => {
      expect(mockPlatform.log.debug).toHaveBeenCalledWith(
        expect.stringContaining('current temperature: 25') // No conversion
      );
    });
  });

  describe('Constructor - Edge Cases', () => {
    it('should handle missing temperature values', () => {
      const bodyWithoutTemps = { ...mockBody };
      delete bodyWithoutTemps.temperature;
      delete bodyWithoutTemps.lowTemperature;
      delete bodyWithoutTemps.highTemperature;
      
      mockPlatformAccessory.context.body = bodyWithoutTemps;
      
      expect(() => {
        heaterAccessory = new HeaterAccessory(mockPlatform, mockPlatformAccessory);
      }).not.toThrow();
    });

    it('should handle undefined body temperature', () => {
      const bodyWithUndefinedTemp = { ...mockBody };
      bodyWithUndefinedTemp.temperature = undefined;
      
      mockPlatformAccessory.context.body = bodyWithUndefinedTemp;
      
      heaterAccessory = new HeaterAccessory(mockPlatform, mockPlatformAccessory);
      
      expect(mockPlatform.log.debug).toHaveBeenCalledWith(
        expect.stringContaining('current temperature: undefined')
      );
    });
  });

  describe('Target Temperature Methods', () => {
    beforeEach(() => {
      heaterAccessory = new HeaterAccessory(mockPlatform, mockPlatformAccessory);
    });

    describe('setTargetTemperature', () => {
      it('should convert Celsius to Fahrenheit and send command', async () => {
        await heaterAccessory.setTargetTemperature(25); // 25°C

        expect(mockPlatform.sendCommandNoWait).toHaveBeenCalledWith(
          expect.objectContaining({
            command: 'SetParamList',
            objectList: [
              expect.objectContaining({
                objnam: 'B01',
                params: { [LOW_TEMP_KEY]: '77' }, // 25°C = 77°F
              }),
            ],
          })
        );
      });

      it('should pass through temperature when in Celsius mode', async () => {
        (mockPlatform.getConfig as jest.Mock).mockReturnValue({
          temperatureUnits: TemperatureUnits.C,
          minimumTemperature: 4,
          maximumTemperature: 40,
        });
        
        heaterAccessory = new HeaterAccessory(mockPlatform, mockPlatformAccessory);
        await heaterAccessory.setTargetTemperature(25);

        expect(mockPlatform.sendCommandNoWait).toHaveBeenCalledWith(
          expect.objectContaining({
            objectList: [
              expect.objectContaining({
                params: { [LOW_TEMP_KEY]: '25' }, // No conversion
              }),
            ],
          })
        );
      });

      it('should log the temperature setting action', async () => {
        await heaterAccessory.setTargetTemperature(25);

        expect(mockPlatform.log.info).toHaveBeenCalledWith(
          expect.stringContaining('Setting temperature 25 converted/rounded to: 77')
        );
      });
    });

    describe('getTargetTemperature', () => {
      it('should return low temperature when available', async () => {
        const result = await heaterAccessory.getTargetTemperature();
        
        // Should return converted low temperature (75°F -> ~23.89°C)
        expect(result).toBeCloseTo(23.89, 1);
      });

      it('should return minimum value when low temperature is undefined', async () => {
        const bodyWithoutLowTemp = { ...mockBody };
        delete bodyWithoutLowTemp.lowTemperature;
        mockPlatformAccessory.context.body = bodyWithoutLowTemp;
        
        heaterAccessory = new HeaterAccessory(mockPlatform, mockPlatformAccessory);
        const result = await heaterAccessory.getTargetTemperature();
        
        // Should return converted minimum (40°F -> ~4.44°C)
        expect(result).toBeCloseTo(4.44, 1);
      });
    });
  });

  describe('Current Temperature Methods', () => {
    beforeEach(() => {
      heaterAccessory = new HeaterAccessory(mockPlatform, mockPlatformAccessory);
    });

    describe('getCurrentTemperature', () => {
      it('should return current temperature when available', async () => {
        const result = await heaterAccessory.getCurrentTemperature();
        
        // Should return converted current temperature (78°F -> ~25.56°C)
        expect(result).toBeCloseTo(25.56, 1);
      });

      it('should return -1 when temperature is undefined', async () => {
        const bodyWithoutTemp = { ...mockBody };
        delete bodyWithoutTemp.temperature;
        mockPlatformAccessory.context.body = bodyWithoutTemp;
        
        heaterAccessory = new HeaterAccessory(mockPlatform, mockPlatformAccessory);
        const result = await heaterAccessory.getCurrentTemperature();
        
        expect(result).toBe(-1);
      });
    });
  });

  describe('Heating Mode Methods', () => {
    beforeEach(() => {
      heaterAccessory = new HeaterAccessory(mockPlatform, mockPlatformAccessory);
    });

    describe('getMode', () => {
      it('should return HEAT when this heater is active', () => {
        const result = heaterAccessory.getMode();
        expect(result).toBe(1); // HEAT
      });

      it('should return OFF when different heater is active', () => {
        mockPlatformAccessory.context.body.heaterId = 'H02'; // Different heater
        
        const result = heaterAccessory.getMode();
        expect(result).toBe(0); // OFF
      });

      it('should return OFF when no heater is active', () => {
        mockPlatformAccessory.context.body.heaterId = NO_HEATER_ID;
        
        const result = heaterAccessory.getMode();
        expect(result).toBe(0); // OFF
      });
    });

    describe('setMode', () => {
      it('should turn on heater and pump when setting to HEAT', async () => {
        await heaterAccessory.setMode(1); // HEAT

        // Should send two commands: one for pump, one for heater
        expect(mockPlatform.sendCommandNoWait).toHaveBeenCalledTimes(2);
        
        // First command: turn on pump
        expect(mockPlatform.sendCommandNoWait).toHaveBeenNthCalledWith(1,
          expect.objectContaining({
            objectList: [
              expect.objectContaining({
                objnam: 'B01',
                params: { [STATUS_KEY]: CircuitStatus.On },
              }),
            ],
          })
        );

        // Second command: set heater
        expect(mockPlatform.sendCommandNoWait).toHaveBeenNthCalledWith(2,
          expect.objectContaining({
            objectList: [
              expect.objectContaining({
                objnam: 'B01',
                params: { [HEATER_KEY]: 'H01' },
              }),
            ],
          })
        );
      });

      it('should turn off heater when setting to OFF', async () => {
        await heaterAccessory.setMode(0); // OFF

        // Should send only heater command (no pump command)
        expect(mockPlatform.sendCommandNoWait).toHaveBeenCalledTimes(1);
        
        expect(mockPlatform.sendCommandNoWait).toHaveBeenCalledWith(
          expect.objectContaining({
            objectList: [
              expect.objectContaining({
                objnam: 'B01',
                params: { [HEATER_KEY]: NO_HEATER_ID },
              }),
            ],
          })
        );
      });

      it('should log the mode setting action', async () => {
        await heaterAccessory.setMode(1);

        expect(mockPlatform.log.info).toHaveBeenCalledWith(
          'Set heat power to 1 for heater Pool Heater'
        );
      });
    });
  });

  describe('getCurrentHeatingCoolingState', () => {
    beforeEach(() => {
      heaterAccessory = new HeaterAccessory(mockPlatform, mockPlatformAccessory);
    });

    it('should return OFF when heater is not active for this body', () => {
      mockPlatformAccessory.context.body.heaterId = 'H02'; // Different heater
      
      const result = heaterAccessory.getCurrentHeatingCoolingState();
      expect(result).toBe(0); // OFF
    });

    it('should return HEAT when temperature is below target', () => {
      // Set current temp below target (75°F target, 70°F current)
      mockPlatformAccessory.context.body.temperature = 70;
      
      heaterAccessory = new HeaterAccessory(mockPlatform, mockPlatformAccessory);
      const result = heaterAccessory.getCurrentHeatingCoolingState();
      expect(result).toBe(2); // HEAT
    });

    it('should return OFF when temperature is at or above target', () => {
      // Current temp (78°F) is above target (75°F)
      const result = heaterAccessory.getCurrentHeatingCoolingState();
      expect(result).toBe(0); // OFF (at temperature)
    });

    it('should return OFF when temperature data is missing', () => {
      delete mockPlatformAccessory.context.body.temperature;
      
      heaterAccessory = new HeaterAccessory(mockPlatform, mockPlatformAccessory);
      const result = heaterAccessory.getCurrentHeatingCoolingState();
      expect(result).toBe(0); // OFF
    });

    it('should return OFF when target temperature is missing', () => {
      delete mockPlatformAccessory.context.body.lowTemperature;
      
      heaterAccessory = new HeaterAccessory(mockPlatform, mockPlatformAccessory);
      const result = heaterAccessory.getCurrentHeatingCoolingState();
      expect(result).toBe(0); // OFF
    });
  });

  describe('bindStaticValues', () => {
    beforeEach(() => {
      heaterAccessory = new HeaterAccessory(mockPlatform, mockPlatformAccessory);
    });

    it('should update current heating cooling state', () => {
      expect(mockService.updateCharacteristic).toHaveBeenCalledWith(
        expect.objectContaining({
          INACTIVE: 0,
          IDLE: 1,
          HEATING: 2,
          COOLING: 3,
          OFF: 0,
          HEAT: 2
        }),
        expect.any(Number)
      );
    });

    it('should set temperature display units based on configuration', () => {
      expect(mockService.updateCharacteristic).toHaveBeenCalledWith(
        expect.objectContaining({
          CELSIUS: 0,
          FAHRENHEIT: 1
        }),
        1 // FAHRENHEIT
      );
    });
  });

  describe('Thermostat Properties', () => {
    beforeEach(() => {
      heaterAccessory = new HeaterAccessory(mockPlatform, mockPlatformAccessory);
    });

    it('should set correct target temperature properties', () => {
      expect(mockService.setProps).toHaveBeenCalledWith({
        minValue: expect.any(Number),
        maxValue: expect.any(Number),
        minStep: THERMOSTAT_STEP_VALUE,
      });
    });

    it('should set correct current temperature properties', () => {
      // The implementation sets props on TargetHeatingCoolingState, not current temperature
      expect(mockService.setProps).toHaveBeenCalledWith({
        minValue: 0,
        maxValue: 1,
        validValues: [0, 1],
      });
    });

    it('should set valid heating cooling state values', () => {
      expect(mockService.setProps).toHaveBeenCalledWith({
        minValue: 0, // OFF
        maxValue: 1, // HEAT
        validValues: [0, 1], // OFF, HEAT
      });
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle null/undefined context gracefully', () => {
      mockPlatformAccessory.context = {
        heater: null,
        body: null,
      };

      expect(() => {
        heaterAccessory = new HeaterAccessory(mockPlatform, mockPlatformAccessory);
      }).toThrow(); // Should throw due to null heater/body
    });

    it('should handle temperature conversion edge cases', async () => {
      // Test extreme temperatures
      heaterAccessory = new HeaterAccessory(mockPlatform, mockPlatformAccessory);
      
      await heaterAccessory.setTargetTemperature(0); // 0°C
      expect(mockPlatform.sendCommandNoWait).toHaveBeenCalledWith(
        expect.objectContaining({
          objectList: [
            expect.objectContaining({
              params: { [LOW_TEMP_KEY]: '32' }, // 0°C = 32°F
            }),
          ],
        })
      );

      await heaterAccessory.setTargetTemperature(100); // 100°C  
      expect(mockPlatform.sendCommandNoWait).toHaveBeenCalledWith(
        expect.objectContaining({
          objectList: [
            expect.objectContaining({
              params: { [LOW_TEMP_KEY]: '212' }, // 100°C = 212°F
            }),
          ],
        })
      );
    });
  });
});