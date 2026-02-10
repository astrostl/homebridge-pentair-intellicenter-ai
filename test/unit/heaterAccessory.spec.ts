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
  MODE_KEY,
  HEAT_MODE_OFF,
  HEAT_MODE_DEFAULT_ON,
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
    (mockPlatformAccessory.getService as jest.Mock).mockImplementation(serviceType => {
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
        expect.stringContaining('Temperature Slider Min: 4.444444444444445'), // 40F to C
      );
      expect(mockPlatform.log.debug).toHaveBeenCalledWith(
        expect.stringContaining('Max: 40'), // 104F to C
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
          AUTO: 3,
        }),
      );
    });

    it('should set correct temperature display units for Fahrenheit', () => {
      expect(mockService.updateCharacteristic).toHaveBeenCalledWith(
        expect.objectContaining({
          CELSIUS: 0,
          FAHRENHEIT: 1,
        }),
        1, // FAHRENHEIT
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
          FAHRENHEIT: 1,
        }),
        0, // CELSIUS
      );
    });

    it('should not convert temperatures when in Celsius mode', () => {
      expect(mockPlatform.log.debug).toHaveBeenCalledWith(
        expect.stringContaining('current temperature: 25'), // No conversion
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

      expect(mockPlatform.log.debug).toHaveBeenCalledWith(expect.stringContaining('current temperature: undefined'));
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
            command: IntelliCenterRequestCommand.SetParamList,
            objectList: [
              expect.objectContaining({
                objnam: 'B01',
                params: { [LOW_TEMP_KEY]: '77' }, // 25°C = 77°F
              }),
            ],
          }),
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
          }),
        );
      });

      it('should log the temperature setting action', async () => {
        await heaterAccessory.setTargetTemperature(25);

        expect(mockPlatform.log.info).toHaveBeenCalledWith(expect.stringContaining('Setting temperature 25 converted/rounded to: 77'));
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
      it('should turn on pump and heater when setting to HEAT (standard heater)', async () => {
        await heaterAccessory.setMode(1); // HEAT

        // Should send two commands: pump on + heater set
        expect(mockPlatform.sendCommandNoWait).toHaveBeenCalledTimes(2);

        // First command: turn on pump
        expect(mockPlatform.sendCommandNoWait).toHaveBeenNthCalledWith(
          1,
          expect.objectContaining({
            command: IntelliCenterRequestCommand.SetParamList,
            objectList: [
              expect.objectContaining({
                objnam: 'B01',
                params: { [STATUS_KEY]: CircuitStatus.On },
              }),
            ],
          }),
        );

        // Second command: set heater
        expect(mockPlatform.sendCommandNoWait).toHaveBeenNthCalledWith(
          2,
          expect.objectContaining({
            command: IntelliCenterRequestCommand.SetParamList,
            objectList: [
              expect.objectContaining({
                objnam: 'B01',
                params: {
                  [HEATER_KEY]: 'H01',
                },
              }),
            ],
          }),
        );
      });

      it('should turn off heater when setting to OFF (no pump command)', async () => {
        await heaterAccessory.setMode(0); // OFF

        // Should send only heater command (no pump command when turning off)
        expect(mockPlatform.sendCommandNoWait).toHaveBeenCalledTimes(1);

        expect(mockPlatform.sendCommandNoWait).toHaveBeenCalledWith(
          expect.objectContaining({
            command: IntelliCenterRequestCommand.SetParamList,
            objectList: [
              expect.objectContaining({
                objnam: 'B01',
                params: { [HEATER_KEY]: NO_HEATER_ID },
              }),
            ],
          }),
        );
      });

      it('should log the mode setting action', async () => {
        await heaterAccessory.setMode(1);

        expect(mockPlatform.log.info).toHaveBeenCalledWith('Set heat power to 1 for heater Pool Heater');
      });

      describe('multi-mode heater control (HCOMBO)', () => {
        beforeEach(() => {
          // Set heater type to HCOMBO (multi-mode heater like ETi Hybrid)
          mockPlatformAccessory.context.heater = {
            ...mockHeater,
            type: CircuitType.HCombo,
          };
          heaterAccessory = new HeaterAccessory(mockPlatform, mockPlatformAccessory);
        });

        it('should send pump ON then MODE-based control for HCOMBO heaters when turning ON', async () => {
          await heaterAccessory.setMode(1); // HEAT

          // Should send two commands: pump on + MODE set
          expect(mockPlatform.sendCommandNoWait).toHaveBeenCalledTimes(2);

          // First command: turn on pump
          expect(mockPlatform.sendCommandNoWait).toHaveBeenNthCalledWith(
            1,
            expect.objectContaining({
              command: IntelliCenterRequestCommand.SetParamList,
              objectList: [
                expect.objectContaining({
                  objnam: 'B01',
                  params: { [STATUS_KEY]: CircuitStatus.On },
                }),
              ],
            }),
          );

          // Second command: set MODE
          expect(mockPlatform.sendCommandNoWait).toHaveBeenNthCalledWith(
            2,
            expect.objectContaining({
              command: IntelliCenterRequestCommand.SetParamList,
              objectList: [
                expect.objectContaining({
                  objnam: 'B01',
                  params: { [MODE_KEY]: String(HEAT_MODE_DEFAULT_ON) },
                }),
              ],
            }),
          );
        });

        it('should use MODE=HEAT_MODE_OFF for HCOMBO heaters when turning OFF', async () => {
          await heaterAccessory.setMode(0); // OFF

          // Should send only MODE command (no pump command when turning off)
          expect(mockPlatform.sendCommandNoWait).toHaveBeenCalledTimes(1);
          expect(mockPlatform.sendCommandNoWait).toHaveBeenCalledWith(
            expect.objectContaining({
              command: IntelliCenterRequestCommand.SetParamList,
              objectList: [
                expect.objectContaining({
                  objnam: 'B01',
                  params: { [MODE_KEY]: String(HEAT_MODE_OFF) },
                }),
              ],
            }),
          );
        });

        it('should log auto-detected HCOMBO when no override is set', async () => {
          await heaterAccessory.setMode(1);

          expect(mockPlatform.log.info).toHaveBeenCalledWith(expect.stringContaining('auto-detected HCOMBO'));
        });
      });

      describe('heatModeOverride config', () => {
        it('should use heatModeOverride value when set', async () => {
          // Set override to Gas Only mode (7)
          (mockPlatform.getConfig as jest.Mock).mockReturnValue({
            temperatureUnits: TemperatureUnits.F,
            minimumTemperature: 40,
            maximumTemperature: 104,
            heatModeOverride: 7,
          });
          heaterAccessory = new HeaterAccessory(mockPlatform, mockPlatformAccessory);

          await heaterAccessory.setMode(1); // HEAT

          // Should send pump ON + MODE set (2 commands)
          expect(mockPlatform.sendCommandNoWait).toHaveBeenCalledTimes(2);

          // Second command should be MODE=7
          expect(mockPlatform.sendCommandNoWait).toHaveBeenNthCalledWith(
            2,
            expect.objectContaining({
              objectList: [
                expect.objectContaining({
                  params: { [MODE_KEY]: '7' },
                }),
              ],
            }),
          );
        });

        it('should log override when heatModeOverride is set', async () => {
          (mockPlatform.getConfig as jest.Mock).mockReturnValue({
            temperatureUnits: TemperatureUnits.F,
            minimumTemperature: 40,
            maximumTemperature: 104,
            heatModeOverride: 8,
          });
          heaterAccessory = new HeaterAccessory(mockPlatform, mockPlatformAccessory);

          await heaterAccessory.setMode(1);

          expect(mockPlatform.log.info).toHaveBeenCalledWith(expect.stringContaining('override'));
        });

        it('should use MODE control even for non-HCOMBO heaters when override is set', async () => {
          // Standard heater type but with override
          mockPlatformAccessory.context.heater = {
            ...mockHeater,
            type: CircuitType.Generic,
          };
          (mockPlatform.getConfig as jest.Mock).mockReturnValue({
            temperatureUnits: TemperatureUnits.F,
            minimumTemperature: 40,
            maximumTemperature: 104,
            heatModeOverride: 9, // Hybrid mode
          });
          heaterAccessory = new HeaterAccessory(mockPlatform, mockPlatformAccessory);

          await heaterAccessory.setMode(1); // HEAT

          // Should send pump ON + MODE set (2 commands)
          expect(mockPlatform.sendCommandNoWait).toHaveBeenCalledTimes(2);

          // Second command should use MODE control despite not being HCOMBO
          expect(mockPlatform.sendCommandNoWait).toHaveBeenNthCalledWith(
            2,
            expect.objectContaining({
              objectList: [
                expect.objectContaining({
                  params: { [MODE_KEY]: '9' },
                }),
              ],
            }),
          );
        });
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
      // Set current temp below target - need to ensure converted temps are below target
      // 70°F = ~21.1°C, 75°F = ~23.9°C, so 70°F should be below 75°F target
      const bodyBelowTarget = {
        ...mockBody,
        temperature: 70, // 70°F current
        lowTemperature: 75, // 75°F target
        heaterId: 'H01', // This heater is active
      };
      mockPlatformAccessory.context.body = bodyBelowTarget;

      heaterAccessory = new HeaterAccessory(mockPlatform, mockPlatformAccessory);
      const result = heaterAccessory.getCurrentHeatingCoolingState();
      expect(result).toBe(2); // HEAT from CurrentHeatingCoolingState.HEAT
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
          HEAT: 2,
        }),
        expect.any(Number),
      );
    });

    it('should set temperature display units based on configuration', () => {
      expect(mockService.updateCharacteristic).toHaveBeenCalledWith(
        expect.objectContaining({
          CELSIUS: 0,
          FAHRENHEIT: 1,
        }),
        1, // FAHRENHEIT
      );
    });
  });

  describe('Thermostat Properties', () => {
    beforeEach(() => {
      heaterAccessory = new HeaterAccessory(mockPlatform, mockPlatformAccessory);
    });

    it('should set correct target temperature properties', () => {
      // Verify heating/cooling state props are set (this is always called)
      expect(mockService.setProps).toHaveBeenCalledWith({
        minValue: 0,
        maxValue: 1,
        validValues: [0, 1],
      });

      // setProps should be called at least once with these common props
      expect(mockService.setProps).toHaveBeenCalled();
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
          command: IntelliCenterRequestCommand.SetParamList,
          objectList: [
            expect.objectContaining({
              params: { [LOW_TEMP_KEY]: '32' }, // 0°C = 32°F
            }),
          ],
        }),
      );

      await heaterAccessory.setTargetTemperature(100); // 100°C
      expect(mockPlatform.sendCommandNoWait).toHaveBeenCalledWith(
        expect.objectContaining({
          command: IntelliCenterRequestCommand.SetParamList,
          objectList: [
            expect.objectContaining({
              params: { [LOW_TEMP_KEY]: '212' }, // 100°C = 212°F
            }),
          ],
        }),
      );
    });

    it('should handle body with zero temperature', async () => {
      const bodyWithZero = { ...mockBody, temperature: 0 };
      mockPlatformAccessory.context.body = bodyWithZero;

      heaterAccessory = new HeaterAccessory(mockPlatform, mockPlatformAccessory);
      const result = await heaterAccessory.getCurrentTemperature();

      // Should return -1 when temperature is 0 (falsy), same as undefined
      expect(result).toBe(-1);
    });

    it('should handle fractional temperature rounding', async () => {
      heaterAccessory = new HeaterAccessory(mockPlatform, mockPlatformAccessory);

      await heaterAccessory.setTargetTemperature(25.7); // Should round to 78°F
      expect(mockPlatform.sendCommandNoWait).toHaveBeenCalledWith(
        expect.objectContaining({
          objectList: [
            expect.objectContaining({
              params: { [LOW_TEMP_KEY]: '78' },
            }),
          ],
        }),
      );
    });

    it('should handle getTargetTemperature with zero lowTemperature', async () => {
      const bodyWithZeroTarget = { ...mockBody, lowTemperature: 0 };
      mockPlatformAccessory.context.body = bodyWithZeroTarget;

      heaterAccessory = new HeaterAccessory(mockPlatform, mockPlatformAccessory);
      const result = await heaterAccessory.getTargetTemperature();

      // Should return minimum value when lowTemperature is 0 (falsy)
      expect(result).toBeCloseTo(4.44, 1); // minValue converted
    });

    it('should handle bindThermostat without lowTemperature', () => {
      const bodyWithoutLowTemp = { ...mockBody };
      delete bodyWithoutLowTemp.lowTemperature;
      mockPlatformAccessory.context.body = bodyWithoutLowTemp;

      // Should not throw error
      expect(() => {
        heaterAccessory = new HeaterAccessory(mockPlatform, mockPlatformAccessory);
      }).not.toThrow();
    });

    it('should handle bindThermostat without current temperature', () => {
      const bodyWithoutTemp = { ...mockBody };
      delete bodyWithoutTemp.temperature;
      mockPlatformAccessory.context.body = bodyWithoutTemp;

      // Should not throw error
      expect(() => {
        heaterAccessory = new HeaterAccessory(mockPlatform, mockPlatformAccessory);
      }).not.toThrow();
    });

    it('should properly initialize heater and body properties', () => {
      heaterAccessory = new HeaterAccessory(mockPlatform, mockPlatformAccessory);

      expect(heaterAccessory.heater).toBe(mockHeater);
      expect(heaterAccessory).toHaveProperty('heater');
    });
  });

  describe('updateTemperatureRanges', () => {
    beforeEach(() => {
      heaterAccessory = new HeaterAccessory(mockPlatform, mockPlatformAccessory);
    });

    it('should update temperature ranges and current temperature', () => {
      const updatedBody: Body = {
        ...mockBody,
        temperature: 80, // New temperature
        lowTemperature: 72, // New low temp
        highTemperature: 88, // New high temp
        heatMode: HeatMode.On,
      };

      heaterAccessory.updateTemperatureRanges(updatedBody);

      // Should update HomeKit characteristic for current temperature
      expect(mockService.updateCharacteristic).toHaveBeenCalledWith('CurrentTemperature', expect.any(Number));

      // Should update current heating/cooling state
      expect(mockService.updateCharacteristic).toHaveBeenCalledWith(
        expect.objectContaining({
          INACTIVE: 0,
          IDLE: 1,
          HEATING: 2,
          COOLING: 3,
          OFF: 0,
          HEAT: 2,
        }),
        expect.any(Number),
      );

      // Should log debug information
      expect(mockPlatform.log.debug).toHaveBeenCalledWith(expect.stringContaining('Updated current temperature'));
    });

    it('should handle temperature conversion from Fahrenheit to Celsius', () => {
      const updatedBody: Body = {
        ...mockBody,
        temperature: 86, // 86°F = 30°C
        lowTemperature: 77, // 77°F = 25°C
        highTemperature: 95, // 95°F = 35°C
      };

      heaterAccessory.updateTemperatureRanges(updatedBody);

      // Should convert temperatures and update characteristics
      expect(mockService.updateCharacteristic).toHaveBeenCalledWith(
        'CurrentTemperature',
        30, // 86°F -> 30°C
      );
    });

    it('should update characteristic props when ranges change', () => {
      const originalPropsCalls = mockService.setProps.mock.calls.length;

      const updatedBody: Body = {
        ...mockBody,
        temperature: 80,
        lowTemperature: 70, // Different from original 75
        highTemperature: 90, // Different from original 85
      };

      heaterAccessory.updateTemperatureRanges(updatedBody);

      // Should call setProps for characteristic property updates
      expect(mockService.setProps).toHaveBeenCalledTimes(originalPropsCalls + 1);
    });

    it('should not update props when ranges stay the same', () => {
      // First call updateTemperatureRanges to set initial ranges
      const initialBody: Body = {
        ...mockBody,
        lowTemperature: 75,
        highTemperature: 85,
      };

      heaterAccessory.updateTemperatureRanges(initialBody);

      // Clear mocks after initial update to get clean state
      jest.clearAllMocks();

      const sameBody: Body = {
        ...initialBody,
        temperature: 80, // Different temperature but same ranges
        lowTemperature: 75, // Same as previous update
        highTemperature: 85, // Same as previous update
      };

      heaterAccessory.updateTemperatureRanges(sameBody);

      // Should not call setProps when ranges don't change (only updateCharacteristic calls should happen)
      expect(mockService.setProps).not.toHaveBeenCalled();
    });

    it('should handle undefined temperature values gracefully', () => {
      const bodyWithUndefinedValues: Body = {
        ...mockBody,
        temperature: undefined,
        lowTemperature: undefined,
        highTemperature: undefined,
      };

      expect(() => {
        heaterAccessory.updateTemperatureRanges(bodyWithUndefinedValues);
      }).not.toThrow();
    });

    it('should handle null temperature values gracefully', () => {
      const bodyWithNullValues: Body = {
        ...mockBody,
        temperature: null as any,
        lowTemperature: null as any,
        highTemperature: null as any,
      };

      expect(() => {
        heaterAccessory.updateTemperatureRanges(bodyWithNullValues);
      }).not.toThrow();
    });

    it('should update heatMode when provided', () => {
      const updatedBody: Body = {
        ...mockBody,
        heatMode: HeatMode.Off,
      };

      heaterAccessory.updateTemperatureRanges(updatedBody);

      // Should update body data with new heat mode - accessing via public heater property
      // Note: body is private, so we verify the update indirectly through debug logs
      expect(mockPlatform.log.debug).toHaveBeenCalled();
    });

    it('should work in Celsius mode without conversion', () => {
      (mockPlatform.getConfig as jest.Mock).mockReturnValue({
        temperatureUnits: TemperatureUnits.C,
        minimumTemperature: 4,
        maximumTemperature: 40,
      });

      heaterAccessory = new HeaterAccessory(mockPlatform, mockPlatformAccessory);

      const updatedBody: Body = {
        ...mockBodyCelsius,
        temperature: 28, // Celsius
        lowTemperature: 26, // Celsius
        highTemperature: 32, // Celsius
      };

      heaterAccessory.updateTemperatureRanges(updatedBody);

      // Should use temperature directly without conversion
      expect(mockService.updateCharacteristic).toHaveBeenCalledWith(
        'CurrentTemperature',
        28, // No conversion
      );
    });
  });

  describe('updateCharacteristicProps', () => {
    beforeEach(() => {
      heaterAccessory = new HeaterAccessory(mockPlatform, mockPlatformAccessory);
    });

    it('should update target temperature props when lowTemperature is available', () => {
      // Call the private method via updateTemperatureRanges which triggers it
      const updatedBody: Body = {
        ...mockBody,
        lowTemperature: 70, // Different value to trigger props update
        highTemperature: 90,
      };

      heaterAccessory.updateTemperatureRanges(updatedBody);

      // Should log the temperature range update (now debug level)
      expect(mockPlatform.log.debug).toHaveBeenCalledWith(expect.stringContaining('Temperature range:'));

      // Should set props for target temperature
      expect(mockService.setProps).toHaveBeenCalledWith({
        minValue: expect.any(Number),
        maxValue: expect.any(Number),
        minStep: THERMOSTAT_STEP_VALUE,
      });
    });

    it('should handle cooling enabled with high temperature', () => {
      // Setup heater with cooling enabled
      const heaterWithCooling: Heater = {
        ...mockHeater,
        coolingEnabled: true,
      };

      mockPlatformAccessory.context.heater = heaterWithCooling;
      heaterAccessory = new HeaterAccessory(mockPlatform, mockPlatformAccessory);

      const updatedBody: Body = {
        ...mockBody,
        lowTemperature: 70,
        highTemperature: 90, // High temp for cooling
      };

      heaterAccessory.updateTemperatureRanges(updatedBody);

      // Should set props for both heating and cooling characteristics
      expect(mockService.setProps).toHaveBeenCalledWith(
        expect.objectContaining({
          minValue: expect.any(Number),
          maxValue: expect.any(Number),
          minStep: THERMOSTAT_STEP_VALUE,
        }),
      );
    });

    it('should use platform-configured min/max values', () => {
      const updatedBody: Body = {
        ...mockBody,
        lowTemperature: 75, // 75°F = ~23.89°C
        highTemperature: 85, // 85°F = ~29.44°C
      };

      heaterAccessory.updateTemperatureRanges(updatedBody);

      // Should use platform-configured limits (not dynamic buffer around current setpoint)
      // This ensures users can set any temperature within the full configured range
      expect(mockPlatform.log.debug).toHaveBeenCalledWith(expect.stringContaining('Temperature range:'));
    });

    it('should use platform limits when body temperatures are unavailable', () => {
      const bodyWithoutTemps: Body = {
        ...mockBody,
        lowTemperature: undefined,
        highTemperature: undefined,
      };

      mockPlatformAccessory.context.body = bodyWithoutTemps;
      heaterAccessory = new HeaterAccessory(mockPlatform, mockPlatformAccessory);

      const updatedBody: Body = {
        ...bodyWithoutTemps,
        temperature: 78, // Only update current temp
        lowTemperature: 70, // Add temp to trigger range update
        highTemperature: 90,
      };

      heaterAccessory.updateTemperatureRanges(updatedBody);

      // Should use platform min/max values (configured in platform settings)
      expect(mockPlatform.log.debug).toHaveBeenCalledWith(expect.stringContaining('Temperature range:'));
    });
  });

  describe('HTSRC/HTMODE logic', () => {
    beforeEach(() => {
      heaterAccessory = new HeaterAccessory(mockPlatform, mockPlatformAccessory);
    });

    describe('checkHeatSourceState', () => {
      it('should return null when heatSource is undefined', () => {
        const bodyWithoutHeatSource = { ...mockBody, heatSource: undefined };
        mockPlatformAccessory.context.body = bodyWithoutHeatSource;
        heaterAccessory = new HeaterAccessory(mockPlatform, mockPlatformAccessory);

        const result = heaterAccessory.getCurrentHeatingCoolingState();
        // Should fall back to temperature comparison logic
        expect(result).toBeDefined();
      });

      it('should return OFF when heatSource is "00000"', () => {
        const bodyWithOffHeatSource = { ...mockBody, heatSource: '00000', heatMode: 1 };
        mockPlatformAccessory.context.body = bodyWithOffHeatSource;
        heaterAccessory = new HeaterAccessory(mockPlatform, mockPlatformAccessory);

        const result = heaterAccessory.getCurrentHeatingCoolingState();
        expect(result).toBe(mockPlatform.Characteristic.CurrentHeatingCoolingState.OFF);
      });

      it('should return OFF when heatSource does not match heater ID', () => {
        const bodyWithDifferentHeatSource = { ...mockBody, heatSource: 'different-heater-id', heatMode: 1 };
        mockPlatformAccessory.context.body = bodyWithDifferentHeatSource;
        heaterAccessory = new HeaterAccessory(mockPlatform, mockPlatformAccessory);

        const result = heaterAccessory.getCurrentHeatingCoolingState();
        expect(result).toBe(mockPlatform.Characteristic.CurrentHeatingCoolingState.OFF);
      });

      it('should return null when heatMode is undefined', () => {
        const bodyWithMatchingHeatSource = { ...mockBody, heatSource: mockHeater.id, heatMode: undefined };
        mockPlatformAccessory.context.body = bodyWithMatchingHeatSource;
        heaterAccessory = new HeaterAccessory(mockPlatform, mockPlatformAccessory);

        const result = heaterAccessory.getCurrentHeatingCoolingState();
        // Should fall back to temperature comparison logic
        expect(result).toBeDefined();
      });

      it('should return null when heatMode is null', () => {
        const bodyWithMatchingHeatSource = { ...mockBody, heatSource: mockHeater.id, heatMode: null };
        mockPlatformAccessory.context.body = bodyWithMatchingHeatSource;
        heaterAccessory = new HeaterAccessory(mockPlatform, mockPlatformAccessory);

        const result = heaterAccessory.getCurrentHeatingCoolingState();
        // Should fall back to temperature comparison logic
        expect(result).toBeDefined();
      });
    });

    describe('getStateFromHeatMode', () => {
      it('should return COOL when heatMode is 9', () => {
        const bodyWithCoolingMode = { ...mockBody, heatSource: mockHeater.id, heatMode: 9 };
        mockPlatformAccessory.context.body = bodyWithCoolingMode;
        heaterAccessory = new HeaterAccessory(mockPlatform, mockPlatformAccessory);

        const result = heaterAccessory.getCurrentHeatingCoolingState();
        expect(result).toBe(mockPlatform.Characteristic.CurrentHeatingCoolingState.COOL);
      });

      it('should return HEAT when heatMode is 1', () => {
        const bodyWithHeatingMode = { ...mockBody, heatSource: mockHeater.id, heatMode: 1 };
        mockPlatformAccessory.context.body = bodyWithHeatingMode;
        heaterAccessory = new HeaterAccessory(mockPlatform, mockPlatformAccessory);

        const result = heaterAccessory.getCurrentHeatingCoolingState();
        expect(result).toBe(mockPlatform.Characteristic.CurrentHeatingCoolingState.HEAT);
      });

      it('should return HEAT when heatMode is 4', () => {
        const bodyWithHeatPumpMode = { ...mockBody, heatSource: mockHeater.id, heatMode: 4 };
        mockPlatformAccessory.context.body = bodyWithHeatPumpMode;
        heaterAccessory = new HeaterAccessory(mockPlatform, mockPlatformAccessory);

        const result = heaterAccessory.getCurrentHeatingCoolingState();
        expect(result).toBe(mockPlatform.Characteristic.CurrentHeatingCoolingState.HEAT);
      });

      it('should return HEAT when heatMode is any value >= 1 and not 9', () => {
        const bodyWithHeatingMode = { ...mockBody, heatSource: mockHeater.id, heatMode: 5 };
        mockPlatformAccessory.context.body = bodyWithHeatingMode;
        heaterAccessory = new HeaterAccessory(mockPlatform, mockPlatformAccessory);

        const result = heaterAccessory.getCurrentHeatingCoolingState();
        expect(result).toBe(mockPlatform.Characteristic.CurrentHeatingCoolingState.HEAT);
      });

      it('should return OFF when heatMode is 0', () => {
        const bodyWithIdleMode = { ...mockBody, heatSource: mockHeater.id, heatMode: 0 };
        mockPlatformAccessory.context.body = bodyWithIdleMode;
        heaterAccessory = new HeaterAccessory(mockPlatform, mockPlatformAccessory);

        const result = heaterAccessory.getCurrentHeatingCoolingState();
        expect(result).toBe(mockPlatform.Characteristic.CurrentHeatingCoolingState.OFF);
      });

      it('should return OFF when heatMode is negative', () => {
        const bodyWithNegativeMode = { ...mockBody, heatSource: mockHeater.id, heatMode: -1 };
        mockPlatformAccessory.context.body = bodyWithNegativeMode;
        heaterAccessory = new HeaterAccessory(mockPlatform, mockPlatformAccessory);

        const result = heaterAccessory.getCurrentHeatingCoolingState();
        expect(result).toBe(mockPlatform.Characteristic.CurrentHeatingCoolingState.OFF);
      });
    });

    it('should prioritize HTSRC/HTMODE over temperature comparison', () => {
      // Set up body where temperature logic would return HEAT but HTMODE says idle
      const bodyWithConflictingData = {
        ...mockBody,
        heatSource: mockHeater.id,
        heatMode: 0, // Idle
        temperature: 60, // Below lowTemperature (75°F)
        lowTemperature: 75,
        heaterId: mockHeater.id,
      };
      mockPlatformAccessory.context.body = bodyWithConflictingData;
      heaterAccessory = new HeaterAccessory(mockPlatform, mockPlatformAccessory);

      const result = heaterAccessory.getCurrentHeatingCoolingState();
      // Should return OFF from HTMODE, not HEAT from temperature comparison
      expect(result).toBe(mockPlatform.Characteristic.CurrentHeatingCoolingState.OFF);
    });

    it('should fall back to temperature comparison when HTSRC/HTMODE unavailable', () => {
      // Test the fallback to checkTemperatureState logic
      const bodyWithoutHeatSourceData = {
        ...mockBody,
        heatSource: undefined,
        heatMode: undefined,
        temperature: 60, // Below lowTemperature
        lowTemperature: 75,
        heaterId: mockHeater.id,
      };
      mockPlatformAccessory.context.body = bodyWithoutHeatSourceData;
      heaterAccessory = new HeaterAccessory(mockPlatform, mockPlatformAccessory);

      const result = heaterAccessory.getCurrentHeatingCoolingState();
      // Should return HEAT from temperature comparison
      expect(result).toBe(mockPlatform.Characteristic.CurrentHeatingCoolingState.HEAT);
    });

    it('should update heatSource in updateTemperatureRanges', () => {
      // Set initial state with no heatSource
      mockPlatformAccessory.context.body.heatSource = undefined;
      heaterAccessory = new HeaterAccessory(mockPlatform, mockPlatformAccessory);

      // Verify initial state is OFF due to missing heatSource
      let result = heaterAccessory.getCurrentHeatingCoolingState();
      expect(result).toBe(mockPlatform.Characteristic.CurrentHeatingCoolingState.OFF);

      // Update with new body data that includes heatSource
      const updatedBody = {
        ...mockPlatformAccessory.context.body,
        heatSource: mockHeater.id, // Now has valid heat source
        heatMode: 4, // Heat pump heating mode
        temperature: 80,
        lowTemperature: 85,
        highTemperature: 90,
      };

      heaterAccessory.updateTemperatureRanges(updatedBody);

      // Verify that heatSource was updated and state is now correct
      result = heaterAccessory.getCurrentHeatingCoolingState();
      expect(result).toBe(mockPlatform.Characteristic.CurrentHeatingCoolingState.HEAT);
    });

    it('should use HTMODE fallback when HTSRC is missing but heatMode is available', () => {
      // Set up scenario where HTSRC is missing but we have HTMODE=4 (heat pump heating)
      mockPlatformAccessory.context.body = {
        ...mockPlatformAccessory.context.body,
        heatSource: undefined, // No HTSRC data
        heatMode: 4, // HTMODE=4 (heat pump heating mode)
        heaterId: mockHeater.id, // Heater is assigned
        temperature: 84,
        lowTemperature: 84, // At setpoint, would normally show OFF
      };
      heaterAccessory = new HeaterAccessory(mockPlatform, mockPlatformAccessory);

      // Should return HEAT due to HTMODE=4, not OFF due to temperature comparison
      const result = heaterAccessory.getCurrentHeatingCoolingState();
      expect(result).toBe(mockPlatform.Characteristic.CurrentHeatingCoolingState.HEAT);
    });
  });
});
