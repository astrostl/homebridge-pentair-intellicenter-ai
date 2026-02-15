import { PlatformAccessory, Service } from 'homebridge';
import { IntelliBriteAccessory } from '../../src/intelliBriteAccessory';
import { PentairPlatform } from '../../src/platform';
import { Circuit, CircuitStatus, CircuitType, Module, Panel, ObjectType } from '../../src/types';
import { MANUFACTURER } from '../../src/settings';
import { STATUS_KEY } from '../../src/constants';

// Track captured handlers
let capturedOnSetHandler: ((value: unknown) => Promise<void>) | null = null;
let capturedOnGetHandler: (() => Promise<unknown>) | null = null;
let capturedBrightnessGetHandler: (() => Promise<unknown>) | null = null;

// Mock characteristic type
interface MockCharacteristic {
  onSet: jest.Mock;
  onGet: jest.Mock;
}

// Create mock Lightbulb service
const createMockLightbulbService = () => {
  const mockCharacteristic: MockCharacteristic = {
    onSet: jest.fn(),
    onGet: jest.fn(),
  };

  // Set up chained returns
  mockCharacteristic.onSet.mockImplementation(handler => {
    capturedOnSetHandler = handler;
    return mockCharacteristic;
  });
  mockCharacteristic.onGet.mockImplementation(handler => {
    capturedOnGetHandler = handler;
    return mockCharacteristic;
  });

  const mockBrightnessCharacteristic: MockCharacteristic = {
    onSet: jest.fn(),
    onGet: jest.fn(),
  };
  mockBrightnessCharacteristic.onGet.mockImplementation(handler => {
    capturedBrightnessGetHandler = handler;
    return mockBrightnessCharacteristic;
  });

  return {
    setCharacteristic: jest.fn().mockReturnThis(),
    updateCharacteristic: jest.fn().mockReturnThis(),
    getCharacteristic: jest.fn((type: string) => {
      if (type === 'On') return mockCharacteristic;
      if (type === 'Brightness') return mockBrightnessCharacteristic;
      return mockCharacteristic;
    }),
    testCharacteristic: jest.fn().mockReturnValue(false),
    UUID: 'lightbulb-uuid',
    subtype: '',
    displayName: '',
  };
};

const mockAccessoryInformation = {
  setCharacteristic: jest.fn().mockReturnThis(),
};

let mockLightbulbService: ReturnType<typeof createMockLightbulbService> | null;

const createMockPlatformAccessory = () => {
  mockLightbulbService = null;
  capturedOnSetHandler = null;
  capturedOnGetHandler = null;
  capturedBrightnessGetHandler = null;

  return {
    getService: jest.fn((serviceType: unknown) => {
      if (serviceType === 'AccessoryInformation') {
        return mockAccessoryInformation;
      }
      if (serviceType === 'Lightbulb') {
        return mockLightbulbService;
      }
      return null;
    }),
    addService: jest.fn((serviceType: unknown) => {
      if (serviceType === 'Lightbulb') {
        mockLightbulbService = createMockLightbulbService();
        return mockLightbulbService;
      }
      return null;
    }),
    removeService: jest.fn(),
    services: [] as unknown[],
    context: {} as Record<string, unknown>,
    UUID: 'test-uuid',
    displayName: 'Test Accessory',
  } as unknown as PlatformAccessory;
};

const mockPlatform = {
  Service: {
    AccessoryInformation: 'AccessoryInformation',
    Lightbulb: 'Lightbulb',
    Switch: { UUID: 'switch-uuid' },
  },
  Characteristic: {
    Manufacturer: 'Manufacturer',
    Model: 'Model',
    SerialNumber: 'SerialNumber',
    Name: 'Name',
    On: 'On',
    Brightness: 'Brightness',
  },
  log: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
  sendCommandNoWait: jest.fn(),
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

const mockIntelliBriteCircuit: Circuit = {
  id: 'C02',
  name: 'Pool Light',
  objectType: ObjectType.Circuit,
  type: CircuitType.IntelliBrite,
  status: CircuitStatus.Off,
};

describe('IntelliBriteAccessory', () => {
  let mockAccessory: PlatformAccessory;

  beforeEach(() => {
    jest.clearAllMocks();
    mockAccessory = createMockPlatformAccessory();
  });

  describe('Constructor and Initialization', () => {
    it('should create a Lightbulb accessory for IntelliBrite', () => {
      mockAccessory.context = {
        panel: mockPanel,
        module: mockModule,
        circuit: mockIntelliBriteCircuit,
      };

      new IntelliBriteAccessory(mockPlatform, mockAccessory);

      // Should create only 1 Lightbulb service
      expect(mockAccessory.addService).toHaveBeenCalledTimes(1);
      expect(mockAccessory.addService).toHaveBeenCalledWith(mockPlatform.Service.Lightbulb, mockIntelliBriteCircuit.name);
    });

    it('should set correct accessory information', () => {
      mockAccessory.context = {
        panel: mockPanel,
        module: mockModule,
        circuit: mockIntelliBriteCircuit,
      };

      new IntelliBriteAccessory(mockPlatform, mockAccessory);

      expect(mockAccessoryInformation.setCharacteristic).toHaveBeenCalledWith('Manufacturer', MANUFACTURER);
      expect(mockAccessoryInformation.setCharacteristic).toHaveBeenCalledWith('Model', 'IntelliBrite');
      expect(mockAccessoryInformation.setCharacteristic).toHaveBeenCalledWith(
        'SerialNumber',
        `${mockPanel.id}.${mockModule.id}.${mockIntelliBriteCircuit.id}`,
      );
    });

    it('should set correct serial number without module', () => {
      mockAccessory.context = {
        panel: mockPanel,
        module: null,
        circuit: mockIntelliBriteCircuit,
      };

      new IntelliBriteAccessory(mockPlatform, mockAccessory);

      expect(mockAccessoryInformation.setCharacteristic).toHaveBeenCalledWith(
        'SerialNumber',
        `${mockPanel.id}.${mockIntelliBriteCircuit.id}`,
      );
    });

    it('should reuse existing Lightbulb service', () => {
      const existingLightbulbService = createMockLightbulbService();
      (mockAccessory.getService as jest.Mock) = jest.fn((serviceType: unknown) => {
        if (serviceType === 'AccessoryInformation') {
          return mockAccessoryInformation;
        }
        if (serviceType === mockPlatform.Service.Lightbulb) {
          return existingLightbulbService;
        }
        return undefined;
      });

      mockAccessory.context = {
        panel: mockPanel,
        module: mockModule,
        circuit: mockIntelliBriteCircuit,
      };

      new IntelliBriteAccessory(mockPlatform, mockAccessory);

      // Should NOT add a new Lightbulb service - reuse existing
      expect(mockAccessory.addService).not.toHaveBeenCalled();
    });

    it('should configure On characteristic handlers', () => {
      mockAccessory.context = {
        panel: mockPanel,
        module: mockModule,
        circuit: mockIntelliBriteCircuit,
      };

      new IntelliBriteAccessory(mockPlatform, mockAccessory);

      expect(capturedOnSetHandler).not.toBeNull();
      expect(capturedOnGetHandler).not.toBeNull();
    });

    it('should log service configuration', () => {
      mockAccessory.context = {
        panel: mockPanel,
        module: mockModule,
        circuit: mockIntelliBriteCircuit,
      };

      new IntelliBriteAccessory(mockPlatform, mockAccessory);

      expect(mockPlatform.log.debug).toHaveBeenCalledWith(`[${mockIntelliBriteCircuit.name}] Lightbulb service configured`);
    });
  });

  describe('On/Off Control', () => {
    it('should send ON command via handleSet', async () => {
      mockAccessory.context = {
        panel: mockPanel,
        module: mockModule,
        circuit: { ...mockIntelliBriteCircuit },
      };

      new IntelliBriteAccessory(mockPlatform, mockAccessory);

      // Invoke the captured handler
      await capturedOnSetHandler!(true);

      expect(mockPlatform.sendCommandNoWait).toHaveBeenCalledWith(
        expect.objectContaining({
          command: 'SetParamList',
          objectList: expect.arrayContaining([
            expect.objectContaining({
              objnam: mockIntelliBriteCircuit.id,
              params: { [STATUS_KEY]: CircuitStatus.On },
            }),
          ]),
        }),
      );
    });

    it('should send OFF command via handleSet', async () => {
      mockAccessory.context = {
        panel: mockPanel,
        module: mockModule,
        circuit: { ...mockIntelliBriteCircuit },
      };

      new IntelliBriteAccessory(mockPlatform, mockAccessory);

      // Invoke the captured handler
      await capturedOnSetHandler!(false);

      expect(mockPlatform.sendCommandNoWait).toHaveBeenCalledWith(
        expect.objectContaining({
          command: 'SetParamList',
          objectList: expect.arrayContaining([
            expect.objectContaining({
              objnam: mockIntelliBriteCircuit.id,
              params: { [STATUS_KEY]: CircuitStatus.Off },
            }),
          ]),
        }),
      );
    });

    it('should log when setting ON', async () => {
      mockAccessory.context = {
        panel: mockPanel,
        module: mockModule,
        circuit: { ...mockIntelliBriteCircuit },
      };

      new IntelliBriteAccessory(mockPlatform, mockAccessory);
      await capturedOnSetHandler!(true);

      expect(mockPlatform.log.info).toHaveBeenCalledWith(`Setting ${mockIntelliBriteCircuit.name} to ON`);
    });

    it('should log when setting OFF', async () => {
      mockAccessory.context = {
        panel: mockPanel,
        module: mockModule,
        circuit: { ...mockIntelliBriteCircuit },
      };

      new IntelliBriteAccessory(mockPlatform, mockAccessory);
      await capturedOnSetHandler!(false);

      expect(mockPlatform.log.info).toHaveBeenCalledWith(`Setting ${mockIntelliBriteCircuit.name} to OFF`);
    });

    it('should optimistically update UI on set', async () => {
      mockAccessory.context = {
        panel: mockPanel,
        module: mockModule,
        circuit: { ...mockIntelliBriteCircuit },
      };

      new IntelliBriteAccessory(mockPlatform, mockAccessory);
      await capturedOnSetHandler!(true);

      expect(mockLightbulbService!.updateCharacteristic).toHaveBeenCalledWith('On', true);
    });

    it('should return correct status on get', async () => {
      const circuitOn = { ...mockIntelliBriteCircuit, status: CircuitStatus.On };
      mockAccessory.context = {
        panel: mockPanel,
        module: mockModule,
        circuit: circuitOn,
      };

      new IntelliBriteAccessory(mockPlatform, mockAccessory);

      const result = await capturedOnGetHandler!();
      expect(result).toBe(true);
    });

    it('should return false when circuit is off', async () => {
      mockAccessory.context = {
        panel: mockPanel,
        module: mockModule,
        circuit: { ...mockIntelliBriteCircuit, status: CircuitStatus.Off },
      };

      new IntelliBriteAccessory(mockPlatform, mockAccessory);

      const result = await capturedOnGetHandler!();
      expect(result).toBe(false);
    });
  });

  describe('Brightness Handling', () => {
    it('should return 100 when on and brightness characteristic exists', async () => {
      mockAccessory.context = {
        panel: mockPanel,
        module: mockModule,
        circuit: { ...mockIntelliBriteCircuit, status: CircuitStatus.On },
      };

      // Mock testCharacteristic to return true for Brightness
      const serviceMock = createMockLightbulbService();
      serviceMock.testCharacteristic = jest.fn().mockReturnValue(true);
      mockLightbulbService = serviceMock;

      (mockAccessory.getService as jest.Mock) = jest.fn((serviceType: unknown) => {
        if (serviceType === 'AccessoryInformation') return mockAccessoryInformation;
        if (serviceType === 'Lightbulb') return serviceMock;
        return null;
      });

      new IntelliBriteAccessory(mockPlatform, mockAccessory);

      // The brightness handler should be captured
      expect(capturedBrightnessGetHandler).not.toBeNull();
      const brightness = await capturedBrightnessGetHandler!();
      expect(brightness).toBe(100);
    });

    it('should return 0 when off and brightness characteristic exists', async () => {
      mockAccessory.context = {
        panel: mockPanel,
        module: mockModule,
        circuit: { ...mockIntelliBriteCircuit, status: CircuitStatus.Off },
      };

      const serviceMock = createMockLightbulbService();
      serviceMock.testCharacteristic = jest.fn().mockReturnValue(true);
      mockLightbulbService = serviceMock;

      (mockAccessory.getService as jest.Mock) = jest.fn((serviceType: unknown) => {
        if (serviceType === 'AccessoryInformation') return mockAccessoryInformation;
        if (serviceType === 'Lightbulb') return serviceMock;
        return null;
      });

      new IntelliBriteAccessory(mockPlatform, mockAccessory);

      const brightness = await capturedBrightnessGetHandler!();
      expect(brightness).toBe(0);
    });
  });

  describe('Legacy Service Cleanup', () => {
    it('should remove legacy intellibrite switch services', () => {
      const legacySwitch1 = {
        UUID: 'switch-uuid',
        subtype: 'intellibrite_WHITER',
      };
      const legacySwitch2 = {
        UUID: 'switch-uuid',
        subtype: 'intellibrite_GREEN',
      };
      const regularService = {
        UUID: 'other-uuid',
        subtype: 'some_other',
      };

      mockAccessory.services = [legacySwitch1, legacySwitch2, regularService] as unknown as Service[];
      mockAccessory.context = {
        panel: mockPanel,
        module: mockModule,
        circuit: mockIntelliBriteCircuit,
      };

      new IntelliBriteAccessory(mockPlatform, mockAccessory);

      expect(mockAccessory.removeService).toHaveBeenCalledTimes(2);
      expect(mockAccessory.removeService).toHaveBeenCalledWith(legacySwitch1);
      expect(mockAccessory.removeService).toHaveBeenCalledWith(legacySwitch2);
    });

    it('should log when removing legacy services', () => {
      const legacySwitch = {
        UUID: 'switch-uuid',
        subtype: 'intellibrite_BLUE',
      };

      mockAccessory.services = [legacySwitch] as unknown as Service[];
      mockAccessory.context = {
        panel: mockPanel,
        module: mockModule,
        circuit: mockIntelliBriteCircuit,
      };

      new IntelliBriteAccessory(mockPlatform, mockAccessory);

      expect(mockPlatform.log.info).toHaveBeenCalledWith(
        `[${mockIntelliBriteCircuit.name}] Removing 1 legacy color switches (now in separate accessory)`,
      );
    });

    it('should not remove non-intellibrite switch services', () => {
      const regularSwitch = {
        UUID: 'switch-uuid',
        subtype: 'some_other_switch',
      };

      mockAccessory.services = [regularSwitch] as unknown as Service[];
      mockAccessory.context = {
        panel: mockPanel,
        module: mockModule,
        circuit: mockIntelliBriteCircuit,
      };

      new IntelliBriteAccessory(mockPlatform, mockAccessory);

      expect(mockAccessory.removeService).not.toHaveBeenCalled();
    });

    it('should not remove switch services without subtype', () => {
      const noSubtypeSwitch = {
        UUID: 'switch-uuid',
        subtype: undefined,
      };

      mockAccessory.services = [noSubtypeSwitch] as unknown as Service[];
      mockAccessory.context = {
        panel: mockPanel,
        module: mockModule,
        circuit: mockIntelliBriteCircuit,
      };

      new IntelliBriteAccessory(mockPlatform, mockAccessory);

      expect(mockAccessory.removeService).not.toHaveBeenCalled();
    });
  });

  describe('Status Updates', () => {
    it('should update characteristic when updateStatus is called with ON', () => {
      const circuitOn = { ...mockIntelliBriteCircuit, status: CircuitStatus.On };
      mockAccessory.context = {
        panel: mockPanel,
        module: mockModule,
        circuit: circuitOn,
      };

      const accessory = new IntelliBriteAccessory(mockPlatform, mockAccessory);

      // Clear the initial update calls
      jest.clearAllMocks();

      accessory.updateStatus();

      expect(mockLightbulbService!.updateCharacteristic).toHaveBeenCalledWith('On', true);
    });

    it('should update characteristic when updateStatus is called with OFF', () => {
      const circuitOff = { ...mockIntelliBriteCircuit, status: CircuitStatus.Off };
      mockAccessory.context = {
        panel: mockPanel,
        module: mockModule,
        circuit: circuitOff,
      };

      const accessory = new IntelliBriteAccessory(mockPlatform, mockAccessory);
      jest.clearAllMocks();

      accessory.updateStatus();

      expect(mockLightbulbService!.updateCharacteristic).toHaveBeenCalledWith('On', false);
    });

    it('should log status on update', () => {
      mockAccessory.context = {
        panel: mockPanel,
        module: mockModule,
        circuit: { ...mockIntelliBriteCircuit, status: CircuitStatus.On },
      };

      const accessory = new IntelliBriteAccessory(mockPlatform, mockAccessory);
      jest.clearAllMocks();

      accessory.updateStatus();

      expect(mockPlatform.log.debug).toHaveBeenCalledWith(`${mockIntelliBriteCircuit.name} status: ${CircuitStatus.On}`);
    });

    it('updateActiveColor should call updateStatus', () => {
      mockAccessory.context = {
        panel: mockPanel,
        module: mockModule,
        circuit: { ...mockIntelliBriteCircuit, status: CircuitStatus.On },
      };

      const accessory = new IntelliBriteAccessory(mockPlatform, mockAccessory);
      jest.clearAllMocks();

      accessory.updateActiveColor();

      // updateActiveColor calls updateStatus, which updates the characteristic
      expect(mockLightbulbService!.updateCharacteristic).toHaveBeenCalledWith('On', true);
    });
  });
});
