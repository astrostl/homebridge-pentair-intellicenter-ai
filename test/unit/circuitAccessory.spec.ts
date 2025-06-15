import { CharacteristicValue, PlatformAccessory, Service } from 'homebridge';
import { CircuitAccessory } from '../../src/circuitAccessory';
import { PentairPlatform } from '../../src/platform';
import {
  Circuit,
  CircuitStatus,
  CircuitType,
  Color,
  Module,
  Panel,
  PumpCircuit,
  PumpSpeedType,
  ObjectType,
} from '../../src/types';
import { MANUFACTURER } from '../../src/settings';
import { ACT_KEY, DEFAULT_BRIGHTNESS, DEFAULT_COLOR_TEMPERATURE, SPEED_KEY, STATUS_KEY } from '../../src/constants';

// Mock Homebridge services and characteristics
const mockService = {
  setCharacteristic: jest.fn().mockReturnThis(),
  updateCharacteristic: jest.fn().mockReturnThis(),
  getCharacteristic: jest.fn().mockReturnThis(),
  onSet: jest.fn().mockReturnThis(),
  onGet: jest.fn().mockReturnThis(),
  updateValue: jest.fn().mockReturnThis(),
};

const mockAccessoryInformation = {
  setCharacteristic: jest.fn().mockReturnThis(),
};

const mockPlatformAccessory = {
  getService: jest.fn(),
  addService: jest.fn().mockReturnValue(mockService),
  removeService: jest.fn(),
  context: {} as any,
  UUID: 'test-uuid',
} as unknown as PlatformAccessory;

const mockPlatform = {
  Service: {
    AccessoryInformation: 'AccessoryInformation',
    Lightbulb: 'Lightbulb',
    Switch: 'Switch',
    Fan: 'Fan',
  },
  Characteristic: {
    Manufacturer: 'Manufacturer',
    Model: 'Model',
    SerialNumber: 'SerialNumber',
    Name: 'Name',
    On: 'On',
    Hue: 'Hue',
    Saturation: 'Saturation',
    ColorTemperature: 'ColorTemperature',
    Brightness: 'Brightness',
    RotationSpeed: 'RotationSpeed',
  },
  log: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
  sendCommandNoWait: jest.fn(),
  delay: jest.fn().mockResolvedValue(undefined),
  getConfig: jest.fn().mockReturnValue({
    supportVSP: true,
  }),
} as unknown as PentairPlatform;

// Test data
const mockPanel: Panel = {
  id: 'PNL01',
  modules: [],
  features: [],
  pumps: [],
  sensors: [],
};

const mockModule: Module = {
  id: 'M01',
  features: [],
  bodies: [],
  heaters: [],
};

const mockCircuit: Circuit = {
  id: 'C01',
  name: 'Pool Light',
  objectType: ObjectType.Circuit,
  type: CircuitType.Generic,
  status: CircuitStatus.Off,
};

const mockIntelliBriteCircuit: Circuit = {
  id: 'C02',
  name: 'IntelliBrite Light',
  objectType: ObjectType.Circuit,
  type: CircuitType.IntelliBrite,
  status: CircuitStatus.Off,
};

const mockPumpCircuit: PumpCircuit = {
  id: 'PC01',
  pump: {
    id: 'P01',
    name: 'Pool Pump',
    objectType: ObjectType.Pump,
    type: CircuitType.Generic,
    minRpm: 450,
    maxRpm: 3450,
    minFlow: 15,
    maxFlow: 130,
    circuits: [],
  },
  circuitId: 'C01',
  speed: 2000,
  speedType: PumpSpeedType.RPM,
};

describe('CircuitAccessory', () => {
  let circuitAccessory: CircuitAccessory;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Reset platform accessory context
    mockPlatformAccessory.context = {
      panel: mockPanel,
      module: mockModule,
      circuit: mockCircuit,
    };

    // Setup default mock returns
    (mockPlatformAccessory.getService as jest.Mock).mockImplementation((serviceType) => {
      if (serviceType === 'AccessoryInformation') {
        return mockAccessoryInformation;
      }
      return null;
    });
  });

  describe('Constructor - Basic Circuit', () => {
    beforeEach(() => {
      circuitAccessory = new CircuitAccessory(mockPlatform, mockPlatformAccessory);
    });

    it('should initialize with correct accessory information', () => {
      expect(mockAccessoryInformation.setCharacteristic).toHaveBeenCalledWith('Manufacturer', MANUFACTURER);
      expect(mockAccessoryInformation.setCharacteristic).toHaveBeenCalledWith('Model', 'Circuit');
      expect(mockAccessoryInformation.setCharacteristic).toHaveBeenCalledWith('SerialNumber', 'PNL01.M01.C01');
    });

    it('should create a Switch service for non-IntelliBrite circuits', () => {
      expect(mockPlatformAccessory.addService).toHaveBeenCalledWith('Switch');
      expect(mockService.setCharacteristic).toHaveBeenCalledWith('Name', 'Pool Light');
    });

    it('should bind On characteristic handlers', () => {
      expect(mockService.getCharacteristic).toHaveBeenCalledWith('On');
      expect(mockService.onSet).toHaveBeenCalled();
      expect(mockService.onGet).toHaveBeenCalled();
    });

    it('should update initial On characteristic value', () => {
      expect(mockService.updateCharacteristic).toHaveBeenCalledWith('On', false);
    });
  });

  describe('Constructor - IntelliBrite Circuit', () => {
    beforeEach(() => {
      mockPlatformAccessory.context.circuit = mockIntelliBriteCircuit;
      circuitAccessory = new CircuitAccessory(mockPlatform, mockPlatformAccessory);
    });

    it('should create a Lightbulb service for IntelliBrite circuits', () => {
      expect(mockPlatformAccessory.addService).toHaveBeenCalledWith('Lightbulb');
    });

    it('should bind color characteristics for IntelliBrite', () => {
      expect(mockService.getCharacteristic).toHaveBeenCalledWith('Hue');
      expect(mockService.getCharacteristic).toHaveBeenCalledWith('Saturation');
      expect(mockService.getCharacteristic).toHaveBeenCalledWith('ColorTemperature');
      expect(mockService.getCharacteristic).toHaveBeenCalledWith('Brightness');
    });
  });

  describe('Constructor - With Pump Circuit', () => {
    beforeEach(() => {
      mockPlatformAccessory.context.pumpCircuit = mockPumpCircuit;
      circuitAccessory = new CircuitAccessory(mockPlatform, mockPlatformAccessory);
    });

    it('should create Fan service when VSP is supported', () => {
      expect(mockPlatformAccessory.addService).toHaveBeenCalledWith('Fan');
      expect(mockService.getCharacteristic).toHaveBeenCalledWith('RotationSpeed');
    });

    it('should remove Fan service when VSP is not supported', () => {
      (mockPlatform.getConfig as jest.Mock).mockReturnValue({ supportVSP: false });
      (mockPlatformAccessory.getService as jest.Mock).mockReturnValue(mockService);
      
      circuitAccessory = new CircuitAccessory(mockPlatform, mockPlatformAccessory);
      
      expect(mockPlatform.log.info).toHaveBeenCalledWith(
        expect.stringContaining('Removing VSP Fan service')
      );
      expect(mockPlatformAccessory.removeService).toHaveBeenCalledWith(mockService);
    });
  });

  describe('setOn', () => {
    beforeEach(() => {
      circuitAccessory = new CircuitAccessory(mockPlatform, mockPlatformAccessory);
    });

    it('should send correct command when turning on', async () => {
      await circuitAccessory.setOn(true);

      expect(mockPlatform.sendCommandNoWait).toHaveBeenCalledWith(
        expect.objectContaining({
          command: 'SetParamList',
          objectList: [
            expect.objectContaining({
              objnam: 'C01',
              params: { [STATUS_KEY]: CircuitStatus.On },
            }),
          ],
        })
      );
    });

    it('should send correct command when turning off', async () => {
      await circuitAccessory.setOn(false);

      expect(mockPlatform.sendCommandNoWait).toHaveBeenCalledWith(
        expect.objectContaining({
          objectList: [
            expect.objectContaining({
              params: { [STATUS_KEY]: CircuitStatus.Off },
            }),
          ],
        })
      );
    });

    it('should log the action', async () => {
      await circuitAccessory.setOn(true);
      expect(mockPlatform.log.info).toHaveBeenCalledWith('Setting Pool Light to true');
    });
  });

  describe('getOn and getCircuitStatus', () => {
    beforeEach(() => {
      circuitAccessory = new CircuitAccessory(mockPlatform, mockPlatformAccessory);
    });

    it('should return true when circuit status is On', async () => {
      mockPlatformAccessory.context.circuit.status = CircuitStatus.On;
      
      const result = await circuitAccessory.getOn();
      expect(result).toBe(true);
    });

    it('should return false when circuit status is Off', async () => {
      mockPlatformAccessory.context.circuit.status = CircuitStatus.Off;
      
      const result = await circuitAccessory.getOn();
      expect(result).toBe(false);
    });

    it('should return false when circuit status is undefined', async () => {
      delete mockPlatformAccessory.context.circuit.status;
      
      const result = await circuitAccessory.getOn();
      expect(result).toBe(false);
    });

    it('should return false when context is invalid', async () => {
      mockPlatformAccessory.context = {};
      
      const result = await circuitAccessory.getOn();
      expect(result).toBe(false);
    });
  });

  describe('IntelliBrite Color Methods', () => {
    beforeEach(() => {
      mockPlatformAccessory.context.circuit = mockIntelliBriteCircuit;
      mockPlatformAccessory.context.color = Color.Blue;
      mockPlatformAccessory.context.saturation = 50;
      circuitAccessory = new CircuitAccessory(mockPlatform, mockPlatformAccessory);
    });

    describe('setColorHue', () => {
      it('should set color and send command', async () => {
        await circuitAccessory.setColorHue(240); // Blue hue

        expect(mockPlatform.delay).toHaveBeenCalledWith(10);
        expect(mockPlatform.sendCommandNoWait).toHaveBeenCalledWith(
          expect.objectContaining({
            objectList: [
              expect.objectContaining({
                objnam: 'C02',
                params: { [ACT_KEY]: expect.any(String) },
              }),
            ],
          })
        );
      });

      it('should update service characteristics', async () => {
        await circuitAccessory.setColorHue(240);

        expect(mockService.updateCharacteristic).toHaveBeenCalledWith('Hue', expect.any(Number));
        expect(mockService.updateCharacteristic).toHaveBeenCalledWith('Saturation', expect.any(Number));
      });
    });

    describe('setColorSaturation', () => {
      it('should update context saturation', async () => {
        await circuitAccessory.setColorSaturation(75);

        expect(mockPlatformAccessory.context.saturation).toBe(75);
        expect(mockPlatform.log.info).toHaveBeenCalledWith(
          'Setting IntelliBrite Light saturation to 75'
        );
      });
    });

    describe('setColorTemperature', () => {
      it('should ignore and reset to default', async () => {
        await circuitAccessory.setColorTemperature(300);

        expect(mockPlatform.log.warn).toHaveBeenCalledWith(
          expect.stringContaining('Ignoring color temperature')
        );
        expect(mockService.updateCharacteristic).toHaveBeenCalledWith(
          'ColorTemperature',
          DEFAULT_COLOR_TEMPERATURE
        );
      });
    });

    describe('setBrightness', () => {
      it('should ignore and reset to default', async () => {
        await circuitAccessory.setBrightness(50);

        expect(mockPlatform.log.warn).toHaveBeenCalledWith(
          expect.stringContaining('Ignoring brightness value')
        );
        expect(mockService.updateCharacteristic).toHaveBeenCalledWith(
          'Brightness',
          DEFAULT_BRIGHTNESS
        );
      });
    });

    describe('Color getters', () => {
      it('should return color hue when available', async () => {
        const result = await circuitAccessory.getColorHue();
        expect(result).toBe(Color.Blue.hue);
      });

      it('should return default hue when color is undefined', async () => {
        delete mockPlatformAccessory.context.color;
        const result = await circuitAccessory.getColorHue();
        expect(result).toBe(Color.White.saturation);
      });

      it('should return color saturation when available', async () => {
        const result = await circuitAccessory.getColorSaturation();
        expect(result).toBe(Color.Blue.saturation);
      });

      it('should return default brightness', async () => {
        const result = await circuitAccessory.getBrightness();
        expect(result).toBe(DEFAULT_BRIGHTNESS);
      });

      it('should return default color temperature', async () => {
        const result = await circuitAccessory.getColorTemperature();
        expect(result).toBe(DEFAULT_COLOR_TEMPERATURE);
      });
    });
  });

  describe('Pump Speed Methods', () => {
    beforeEach(() => {
      // Reset pump circuit to default values for each test
      mockPumpCircuit.speedType = PumpSpeedType.RPM;
      mockPumpCircuit.speed = 2000;
      mockPlatformAccessory.context.pumpCircuit = mockPumpCircuit;
      circuitAccessory = new CircuitAccessory(mockPlatform, mockPlatformAccessory);
    });

    describe('setSpeed', () => {
      it('should convert power level to speed and send command', async () => {
        await circuitAccessory.setSpeed(50); // 50% power

        expect(mockPlatform.sendCommandNoWait).toHaveBeenCalledWith(
          expect.objectContaining({
            objectList: [
              expect.objectContaining({
                objnam: 'PC01',
                params: { [SPEED_KEY]: expect.any(String) },
              }),
            ],
          })
        );
      });

      it('should handle missing pump circuit', async () => {
        // Create new accessory without pump circuit
        const accessoryWithoutPump = {
          ...mockPlatformAccessory,
          context: {
            panel: mockPanel,
            module: mockModule,
            circuit: mockCircuit,
            // No pumpCircuit
          },
        };
        
        const accessoryInstance = new CircuitAccessory(mockPlatform, accessoryWithoutPump as unknown as PlatformAccessory);
        await accessoryInstance.setSpeed(50);

        expect(mockPlatform.log.error).toHaveBeenCalledWith(
          'Tried to set speed when pump circuit is undefined.'
        );
        expect(mockPlatform.sendCommandNoWait).not.toHaveBeenCalled();
      });

      it('should log speed conversion', async () => {
        await circuitAccessory.setSpeed(50);

        expect(mockPlatform.log.info).toHaveBeenCalledWith(
          expect.stringContaining('Setting speed for Pool Pump to 50')
        );
      });
    });

    describe('getSpeed', () => {
      it('should return converted speed as power level', async () => {
        const result = await circuitAccessory.getSpeed();
        
        // Speed 2000 RPM, range 450-3450, should be about 52%
        expect(result).toBeCloseTo(52, 0);
      });

      it('should return 0 when pump circuit is undefined', async () => {
        // Create new accessory without pump circuit
        const accessoryWithoutPump = {
          ...mockPlatformAccessory,
          context: {
            panel: mockPanel,
            module: mockModule,
            circuit: mockCircuit,
            // No pumpCircuit
          },
        };
        
        const accessoryInstance = new CircuitAccessory(mockPlatform, accessoryWithoutPump as unknown as PlatformAccessory);
        const result = await accessoryInstance.getSpeed();
        expect(result).toBe(0);
      });
    });

    describe('convertSpeedToPowerLevel', () => {
      it('should convert RPM correctly', () => {
        const result = circuitAccessory.convertSpeedToPowerLevel();
        
        // Speed 2000, min 450, max 3450, range 3000
        // (2000 - 450) / 3000 * 100 = 51.67, rounded = 52
        expect(result).toBe(52);
      });

      it('should convert GPM correctly', () => {
        mockPumpCircuit.speedType = PumpSpeedType.GPM;
        mockPumpCircuit.speed = 50;
        
        const result = circuitAccessory.convertSpeedToPowerLevel();
        
        // Speed 50, min 15, max 130, range 115
        // (50 - 15) / 115 * 100 = 30.43, rounded = 30
        expect(result).toBe(30);
      });

      it('should return 0 when speed is undefined', () => {
        delete (mockPumpCircuit as any).speed;
        
        const result = circuitAccessory.convertSpeedToPowerLevel();
        expect(result).toBe(0);
      });

      it('should handle edge case at minimum speed', () => {
        // Create accessory with minimum speed
        const minSpeedPumpCircuit = { ...mockPumpCircuit, speed: 450, speedType: PumpSpeedType.RPM };
        const accessoryWithMinSpeed = {
          ...mockPlatformAccessory,
          context: {
            panel: mockPanel,
            module: mockModule,
            circuit: mockCircuit,
            pumpCircuit: minSpeedPumpCircuit,
          },
        };
        
        const accessoryInstance = new CircuitAccessory(mockPlatform, accessoryWithMinSpeed as unknown as PlatformAccessory);
        const result = accessoryInstance.convertSpeedToPowerLevel();
        expect(result).toBe(0);
      });

      it('should handle edge case at maximum speed', () => {
        // Create accessory with maximum speed
        const maxSpeedPumpCircuit = { ...mockPumpCircuit, speed: 3450, speedType: PumpSpeedType.RPM };
        const accessoryWithMaxSpeed = {
          ...mockPlatformAccessory,
          context: {
            panel: mockPanel,
            module: mockModule,
            circuit: mockCircuit,
            pumpCircuit: maxSpeedPumpCircuit,
          },
        };
        
        const accessoryInstance = new CircuitAccessory(mockPlatform, accessoryWithMaxSpeed as unknown as PlatformAccessory);
        const result = accessoryInstance.convertSpeedToPowerLevel();
        expect(result).toBe(100);
      });
    });

    describe('convertPowerLevelToSpeed', () => {
      it('should convert power level to RPM correctly', () => {
        // Reset speedType to RPM in case previous test changed it
        mockPumpCircuit.speedType = PumpSpeedType.RPM;
        
        const result = circuitAccessory.convertPowerLevelToSpeed(50);
        
        // 50% of range (3000) + min (450) = 1950, rounded to nearest 50 = 1950
        expect(result).toBe(1950);
      });

      it('should convert power level to GPM correctly', () => {
        mockPumpCircuit.speedType = PumpSpeedType.GPM;
        
        const result = circuitAccessory.convertPowerLevelToSpeed(50);
        
        // 50% of range (115) + min (15) = 72.5, rounded = 73
        expect(result).toBe(73);
      });

      it('should handle missing pump circuit', () => {
        // Create accessory without pump circuit
        const accessoryWithoutPump = {
          ...mockPlatformAccessory,
          context: {
            panel: mockPanel,
            module: mockModule,
            circuit: mockCircuit,
            // No pumpCircuit
          },
        };
        
        const accessoryInstance = new CircuitAccessory(mockPlatform, accessoryWithoutPump as unknown as PlatformAccessory);
        const result = accessoryInstance.convertPowerLevelToSpeed(50);
        
        expect(mockPlatform.log.error).toHaveBeenCalledWith(
          'Cannot convert power level when pumpCircuit is null'
        );
        expect(result).toBe(0);
      });

      it('should round GPM to nearest integer', () => {
        mockPumpCircuit.speedType = PumpSpeedType.GPM;
        const result = circuitAccessory.convertPowerLevelToSpeed(33);
        
        // 33% of 115 + 15 = 52.95, rounded = 53
        expect(result).toBe(53);
      });

      it('should handle edge cases', () => {
        // Reset speedType to RPM in case previous test changed it
        mockPumpCircuit.speedType = PumpSpeedType.RPM;
        
        // For RPM speed type: 0% = 450 RPM (min), 100% = 3450 RPM (max)
        expect(circuitAccessory.convertPowerLevelToSpeed(0)).toBe(450); // minRpm for RPM speed type
        expect(circuitAccessory.convertPowerLevelToSpeed(100)).toBe(3450); // maxRpm for RPM speed type
      });
    });
  });

  describe('Serial Number Generation', () => {
    it('should generate correct serial for circuit with module', () => {
      circuitAccessory = new CircuitAccessory(mockPlatform, mockPlatformAccessory);
      
      expect(mockAccessoryInformation.setCharacteristic).toHaveBeenCalledWith(
        'SerialNumber',
        'PNL01.M01.C01'
      );
    });

    it('should generate correct serial for circuit without module', () => {
      mockPlatformAccessory.context.module = null;
      
      circuitAccessory = new CircuitAccessory(mockPlatform, mockPlatformAccessory);
      
      expect(mockAccessoryInformation.setCharacteristic).toHaveBeenCalledWith(
        'SerialNumber',
        'PNL01.C01'
      );
    });
  });
});