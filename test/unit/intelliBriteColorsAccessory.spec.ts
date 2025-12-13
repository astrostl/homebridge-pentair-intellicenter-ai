import { PlatformAccessory, Service } from 'homebridge';
import { IntelliBriteColorsAccessory } from '../../src/intelliBriteColorsAccessory';
import { PentairPlatform } from '../../src/platform';
import { Circuit, CircuitStatus, CircuitType, Module, Panel, ObjectType } from '../../src/types';
import { MANUFACTURER } from '../../src/settings';
import { INTELLIBRITE_OPTIONS, ACT_KEY, STATUS_KEY } from '../../src/constants';

// Track created services and their handlers
let createdServices: Map<string, ReturnType<typeof createMockSwitchService>>;
let capturedSetHandlers: Map<string, (value: unknown) => Promise<void>>;
let capturedGetHandlers: Map<string, () => Promise<unknown>>;

// Mock characteristic type
interface MockCharacteristic {
  onSet: jest.Mock;
  onGet: jest.Mock;
}

// Create mock switch service
const createMockSwitchService = () => {
  const handlers = {
    set: null as ((value: unknown) => Promise<void>) | null,
    get: null as (() => Promise<unknown>) | null,
  };

  const mockCharacteristic: MockCharacteristic = {
    onSet: jest.fn(),
    onGet: jest.fn(),
  };

  // Set up chained returns
  mockCharacteristic.onSet.mockImplementation(handler => {
    handlers.set = handler;
    return mockCharacteristic;
  });
  mockCharacteristic.onGet.mockImplementation(handler => {
    handlers.get = handler;
    return mockCharacteristic;
  });

  return {
    setCharacteristic: jest.fn().mockReturnThis(),
    updateCharacteristic: jest.fn().mockReturnThis(),
    getCharacteristic: jest.fn().mockReturnValue(mockCharacteristic),
    addOptionalCharacteristic: jest.fn().mockReturnThis(),
    UUID: 'switch-uuid',
    subtype: '',
    displayName: '',
    handlers,
  };
};

const mockAccessoryInformation = {
  setCharacteristic: jest.fn().mockReturnThis(),
};

const createMockPlatformAccessory = () => {
  createdServices = new Map();
  capturedSetHandlers = new Map();
  capturedGetHandlers = new Map();

  return {
    getService: jest.fn((serviceType: unknown) => {
      if (serviceType === 'AccessoryInformation') {
        return mockAccessoryInformation;
      }
      return null;
    }),
    getServiceById: jest.fn((serviceType: unknown, subtype: string) => {
      return createdServices.get(subtype) || null;
    }),
    addService: jest.fn((serviceType: unknown, name: string, subtype?: string) => {
      const service = createMockSwitchService();
      if (subtype) {
        service.subtype = subtype;
        service.displayName = name;
        createdServices.set(subtype, service);
        // Store handlers after they're bound
        setTimeout(() => {
          if (service.handlers.set) capturedSetHandlers.set(subtype, service.handlers.set);
          if (service.handlers.get) capturedGetHandlers.set(subtype, service.handlers.get);
        }, 0);
      }
      return service;
    }),
    removeService: jest.fn(),
    services: [] as unknown[],
    context: {} as Record<string, unknown>,
    UUID: 'test-uuid',
    displayName: 'Test Colors Accessory',
  } as unknown as PlatformAccessory;
};

const mockPlatform = {
  Service: {
    AccessoryInformation: 'AccessoryInformation',
    Switch: { UUID: 'switch-uuid' },
  },
  Characteristic: {
    Manufacturer: 'Manufacturer',
    Model: 'Model',
    SerialNumber: 'SerialNumber',
    Name: 'Name',
    ConfiguredName: 'ConfiguredName',
    On: 'On',
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

describe('IntelliBriteColorsAccessory', () => {
  let mockAccessory: PlatformAccessory;

  beforeEach(() => {
    jest.clearAllMocks();
    mockAccessory = createMockPlatformAccessory();
  });

  describe('Constructor and Initialization', () => {
    it('should create switch services for all color options', () => {
      mockAccessory.context = {
        panel: mockPanel,
        module: mockModule,
        circuit: mockIntelliBriteCircuit,
      };

      new IntelliBriteColorsAccessory(mockPlatform, mockAccessory);

      // Should create 12 switch services (5 colors + 7 shows)
      expect(mockAccessory.addService).toHaveBeenCalledTimes(INTELLIBRITE_OPTIONS.length);

      // Verify each color/show option was added
      for (const option of INTELLIBRITE_OPTIONS) {
        expect(mockAccessory.addService).toHaveBeenCalledWith(mockPlatform.Service.Switch, option.name, `intellibrite_${option.code}`);
      }
    });

    it('should set correct accessory information with module', () => {
      mockAccessory.context = {
        panel: mockPanel,
        module: mockModule,
        circuit: mockIntelliBriteCircuit,
      };

      new IntelliBriteColorsAccessory(mockPlatform, mockAccessory);

      expect(mockAccessoryInformation.setCharacteristic).toHaveBeenCalledWith('Manufacturer', MANUFACTURER);
      expect(mockAccessoryInformation.setCharacteristic).toHaveBeenCalledWith('Model', 'IntelliBrite Colors');
      expect(mockAccessoryInformation.setCharacteristic).toHaveBeenCalledWith(
        'SerialNumber',
        `${mockPanel.id}.${mockModule.id}.${mockIntelliBriteCircuit.id}.colors`,
      );
    });

    it('should set correct serial number without module', () => {
      mockAccessory.context = {
        panel: mockPanel,
        module: null,
        circuit: mockIntelliBriteCircuit,
      };

      new IntelliBriteColorsAccessory(mockPlatform, mockAccessory);

      expect(mockAccessoryInformation.setCharacteristic).toHaveBeenCalledWith(
        'SerialNumber',
        `${mockPanel.id}.${mockIntelliBriteCircuit.id}.colors`,
      );
    });

    it('should reuse existing switch services', () => {
      const existingService = createMockSwitchService();
      existingService.subtype = 'intellibrite_WHITER';
      createdServices.set('intellibrite_WHITER', existingService);

      (mockAccessory as unknown as { getServiceById: jest.Mock }).getServiceById = jest.fn((serviceType: unknown, subtype: string) => {
        return createdServices.get(subtype) || undefined;
      });

      mockAccessory.context = {
        panel: mockPanel,
        module: mockModule,
        circuit: mockIntelliBriteCircuit,
      };

      new IntelliBriteColorsAccessory(mockPlatform, mockAccessory);

      // Should create 11 switches (12 - 1 existing)
      expect(mockAccessory.addService).toHaveBeenCalledTimes(INTELLIBRITE_OPTIONS.length - 1);
    });

    it('should configure Name and ConfiguredName characteristics', () => {
      mockAccessory.context = {
        panel: mockPanel,
        module: mockModule,
        circuit: mockIntelliBriteCircuit,
      };

      new IntelliBriteColorsAccessory(mockPlatform, mockAccessory);

      // Check that each created service had characteristics set
      for (const [, service] of createdServices) {
        expect(service.setCharacteristic).toHaveBeenCalledWith('Name', expect.any(String));
        expect(service.addOptionalCharacteristic).toHaveBeenCalledWith('ConfiguredName');
        expect(service.setCharacteristic).toHaveBeenCalledWith('ConfiguredName', expect.any(String));
      }
    });

    it('should log when adding new color switches', () => {
      mockAccessory.context = {
        panel: mockPanel,
        module: mockModule,
        circuit: mockIntelliBriteCircuit,
      };

      new IntelliBriteColorsAccessory(mockPlatform, mockAccessory);

      // Should log for each color option
      for (const option of INTELLIBRITE_OPTIONS) {
        expect(mockPlatform.log.debug).toHaveBeenCalledWith(
          `Added IntelliBrite color switch: ${option.name} (${option.code}) to ${mockIntelliBriteCircuit.name}`,
        );
      }
    });
  });

  describe('Color Selection', () => {
    it('should send color command when turning on a color switch', async () => {
      const circuit = { ...mockIntelliBriteCircuit };
      mockAccessory.context = {
        panel: mockPanel,
        module: mockModule,
        circuit,
      };

      new IntelliBriteColorsAccessory(mockPlatform, mockAccessory);

      // Wait for handlers to be captured
      await new Promise(resolve => setTimeout(resolve, 10));

      // Get the set handler for a specific color
      const whiterService = createdServices.get('intellibrite_WHITER');
      expect(whiterService).toBeDefined();

      // Invoke the set handler directly
      const setHandler = whiterService!.handlers.set;
      expect(setHandler).not.toBeNull();
      await setHandler!(true);

      expect(mockPlatform.sendCommandNoWait).toHaveBeenCalledWith(
        expect.objectContaining({
          command: 'SetParamList',
          objectList: expect.arrayContaining([
            expect.objectContaining({
              objnam: mockIntelliBriteCircuit.id,
              params: {
                [STATUS_KEY]: CircuitStatus.On,
                [ACT_KEY]: 'WHITER',
              },
            }),
          ]),
        }),
      );
    });

    it('should turn off light when turning off active color switch', async () => {
      const circuit = { ...mockIntelliBriteCircuit, status: CircuitStatus.On };
      mockAccessory.context = {
        panel: mockPanel,
        module: mockModule,
        circuit,
        activeColor: 'WHITER',
      };

      new IntelliBriteColorsAccessory(mockPlatform, mockAccessory);
      await new Promise(resolve => setTimeout(resolve, 10));

      const whiterService = createdServices.get('intellibrite_WHITER');
      const setHandler = whiterService!.handlers.set;
      await setHandler!(false);

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

    it('should not send command when turning off non-active color switch', async () => {
      const circuit = { ...mockIntelliBriteCircuit, status: CircuitStatus.On };
      mockAccessory.context = {
        panel: mockPanel,
        module: mockModule,
        circuit,
        activeColor: 'GREEN', // Different from WHITER
      };

      new IntelliBriteColorsAccessory(mockPlatform, mockAccessory);
      await new Promise(resolve => setTimeout(resolve, 10));

      // Turn off WHITER when GREEN is active - should do nothing
      const whiterService = createdServices.get('intellibrite_WHITER');
      const setHandler = whiterService!.handlers.set;
      await setHandler!(false);

      expect(mockPlatform.sendCommandNoWait).not.toHaveBeenCalled();
    });

    it('should log when setting color', async () => {
      const circuit = { ...mockIntelliBriteCircuit };
      mockAccessory.context = {
        panel: mockPanel,
        module: mockModule,
        circuit,
      };

      new IntelliBriteColorsAccessory(mockPlatform, mockAccessory);
      await new Promise(resolve => setTimeout(resolve, 10));

      const blueService = createdServices.get('intellibrite_BLUER');
      const setHandler = blueService!.handlers.set;
      await setHandler!(true);

      expect(mockPlatform.log.info).toHaveBeenCalledWith(`Setting ${mockIntelliBriteCircuit.name} to BLUER via colors accessory`);
    });
  });

  describe('Get Handlers', () => {
    it('should return true when circuit is on and this is active color', async () => {
      const circuit = { ...mockIntelliBriteCircuit, status: CircuitStatus.On };
      mockAccessory.context = {
        panel: mockPanel,
        module: mockModule,
        circuit,
        activeColor: 'WHITER',
      };

      new IntelliBriteColorsAccessory(mockPlatform, mockAccessory);
      await new Promise(resolve => setTimeout(resolve, 10));

      const whiterService = createdServices.get('intellibrite_WHITER');
      const getHandler = whiterService!.handlers.get;
      const result = await getHandler!();

      expect(result).toBe(true);
    });

    it('should return false when circuit is on but different color is active', async () => {
      const circuit = { ...mockIntelliBriteCircuit, status: CircuitStatus.On };
      mockAccessory.context = {
        panel: mockPanel,
        module: mockModule,
        circuit,
        activeColor: 'GREEN',
      };

      new IntelliBriteColorsAccessory(mockPlatform, mockAccessory);
      await new Promise(resolve => setTimeout(resolve, 10));

      const whiterService = createdServices.get('intellibrite_WHITER');
      const getHandler = whiterService!.handlers.get;
      const result = await getHandler!();

      expect(result).toBe(false);
    });

    it('should return false when circuit is off', async () => {
      const circuit = { ...mockIntelliBriteCircuit, status: CircuitStatus.Off };
      mockAccessory.context = {
        panel: mockPanel,
        module: mockModule,
        circuit,
        activeColor: 'WHITER',
      };

      new IntelliBriteColorsAccessory(mockPlatform, mockAccessory);
      await new Promise(resolve => setTimeout(resolve, 10));

      const whiterService = createdServices.get('intellibrite_WHITER');
      const getHandler = whiterService!.handlers.get;
      const result = await getHandler!();

      expect(result).toBe(false);
    });
  });

  describe('Status Updates', () => {
    it('should update all switches when updateActiveColor is called', () => {
      const circuit = { ...mockIntelliBriteCircuit, status: CircuitStatus.On };
      mockAccessory.context = {
        panel: mockPanel,
        module: mockModule,
        circuit,
        activeColor: 'BLUE',
      };

      const accessory = new IntelliBriteColorsAccessory(mockPlatform, mockAccessory);
      jest.clearAllMocks();

      accessory.updateActiveColor();

      // All switches should be updated
      for (const [code, service] of createdServices) {
        const expectedState = code === 'intellibrite_BLUE';
        expect(service.updateCharacteristic).toHaveBeenCalledWith('On', expectedState);
      }
    });

    it('should turn off all switches when updateStatus is called with OFF', () => {
      const circuit = { ...mockIntelliBriteCircuit, status: CircuitStatus.Off };
      mockAccessory.context = {
        panel: mockPanel,
        module: mockModule,
        circuit,
        activeColor: 'BLUE',
      };

      const accessory = new IntelliBriteColorsAccessory(mockPlatform, mockAccessory);
      jest.clearAllMocks();

      accessory.updateStatus();

      // All switches should be OFF when circuit is off
      for (const [, service] of createdServices) {
        expect(service.updateCharacteristic).toHaveBeenCalledWith('On', false);
      }
    });

    it('should show active color when updateStatus is called with ON', () => {
      const circuit = { ...mockIntelliBriteCircuit, status: CircuitStatus.On };
      mockAccessory.context = {
        panel: mockPanel,
        module: mockModule,
        circuit,
        activeColor: 'GREEN',
      };

      const accessory = new IntelliBriteColorsAccessory(mockPlatform, mockAccessory);
      jest.clearAllMocks();

      accessory.updateStatus();

      // GREEN should be ON, others OFF
      for (const [code, service] of createdServices) {
        const expectedState = code === 'intellibrite_GREEN';
        expect(service.updateCharacteristic).toHaveBeenCalledWith('On', expectedState);
      }
    });

    it('should log active color on update', () => {
      mockAccessory.context = {
        panel: mockPanel,
        module: mockModule,
        circuit: { ...mockIntelliBriteCircuit, status: CircuitStatus.On },
        activeColor: 'ROMAN',
      };

      const accessory = new IntelliBriteColorsAccessory(mockPlatform, mockAccessory);
      jest.clearAllMocks();

      accessory.updateActiveColor();

      expect(mockPlatform.log.debug).toHaveBeenCalledWith(`${mockIntelliBriteCircuit.name} Colors active color: ROMAN`);
    });
  });

  describe('Service Cleanup', () => {
    it('should remove obsolete switch services', () => {
      const obsoleteService = {
        UUID: 'switch-uuid',
        subtype: 'intellibrite_OLDCOLOR',
      };

      mockAccessory.services = [obsoleteService] as unknown as Service[];
      mockAccessory.context = {
        panel: mockPanel,
        module: mockModule,
        circuit: mockIntelliBriteCircuit,
      };

      new IntelliBriteColorsAccessory(mockPlatform, mockAccessory);

      expect(mockAccessory.removeService).toHaveBeenCalledWith(obsoleteService);
      expect(mockPlatform.log.info).toHaveBeenCalledWith('Removing obsolete IntelliBrite color switch: intellibrite_OLDCOLOR');
    });

    it('should not remove valid color services', () => {
      // No obsolete services
      mockAccessory.services = [];
      mockAccessory.context = {
        panel: mockPanel,
        module: mockModule,
        circuit: mockIntelliBriteCircuit,
      };

      new IntelliBriteColorsAccessory(mockPlatform, mockAccessory);

      expect(mockAccessory.removeService).not.toHaveBeenCalled();
    });
  });
});
