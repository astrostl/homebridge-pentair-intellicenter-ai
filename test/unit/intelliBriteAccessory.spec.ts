import { CharacteristicValue, PlatformAccessory, Service } from 'homebridge';
import { IntelliBriteAccessory } from '../../src/intelliBriteAccessory';
import { PentairPlatform } from '../../src/platform';
import { Circuit, CircuitStatus, CircuitType, Module, Panel, ObjectType } from '../../src/types';
import { MANUFACTURER } from '../../src/settings';
import { INTELLIBRITE_OPTIONS, STATUS_KEY, USE_KEY, ACT_KEY } from '../../src/constants';

// Create mock services for each color switch
const createMockSwitchService = () => ({
  setCharacteristic: jest.fn().mockReturnThis(),
  updateCharacteristic: jest.fn().mockReturnThis(),
  getCharacteristic: jest.fn().mockReturnThis(),
  onSet: jest.fn().mockReturnThis(),
  onGet: jest.fn().mockReturnThis(),
  UUID: 'switch-uuid',
  subtype: '',
});

const mockAccessoryInformation = {
  setCharacteristic: jest.fn().mockReturnThis(),
};

// Track all created services
let createdServices: Map<string, any>;

const createMockPlatformAccessory = () => {
  createdServices = new Map();

  return {
    getService: jest.fn((serviceType: any) => {
      if (serviceType === 'AccessoryInformation') {
        return mockAccessoryInformation;
      }
      return null;
    }),
    getServiceById: jest.fn((serviceType: any, subtype: string) => {
      return createdServices.get(subtype) || null;
    }),
    addService: jest.fn((serviceType: any, name: string, subtype: string) => {
      const service = createMockSwitchService();
      service.subtype = subtype;
      createdServices.set(subtype, service);
      return service;
    }),
    removeService: jest.fn(),
    services: [] as any[],
    context: {} as any,
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

const mockLightShowGroupCircuit: Circuit = {
  id: 'GRP01',
  name: 'All Lights',
  objectType: ObjectType.Circuit,
  type: CircuitType.LightShowGroup,
  status: CircuitStatus.Off,
};

describe('IntelliBriteAccessory', () => {
  let mockAccessory: PlatformAccessory;

  beforeEach(() => {
    jest.clearAllMocks();
    mockAccessory = createMockPlatformAccessory();
  });

  describe('Constructor and Initialization', () => {
    it('should create an IntelliBrite accessory with all 12 color switches', () => {
      mockAccessory.context = {
        panel: mockPanel,
        module: mockModule,
        circuit: mockIntelliBriteCircuit,
      };

      new IntelliBriteAccessory(mockPlatform, mockAccessory);

      // Should create 12 switch services (5 colors + 7 shows)
      expect(mockAccessory.addService).toHaveBeenCalledTimes(INTELLIBRITE_OPTIONS.length);

      // Verify each color/show option was added
      for (const option of INTELLIBRITE_OPTIONS) {
        expect(mockAccessory.addService).toHaveBeenCalledWith(mockPlatform.Service.Switch, option.name, `intellibrite_${option.code}`);
      }
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

    it('should remove legacy Lightbulb service if present', () => {
      const mockLightbulbService = { UUID: 'lightbulb-uuid' } as unknown as Service;
      (mockAccessory.getService as jest.Mock) = jest.fn((serviceType: any) => {
        if (serviceType === 'AccessoryInformation') {
          return mockAccessoryInformation;
        }
        if (serviceType === mockPlatform.Service.Lightbulb) {
          return mockLightbulbService;
        }
        return undefined;
      });

      mockAccessory.context = {
        panel: mockPanel,
        module: mockModule,
        circuit: mockIntelliBriteCircuit,
      };

      new IntelliBriteAccessory(mockPlatform, mockAccessory);

      expect(mockAccessory.removeService).toHaveBeenCalledWith(mockLightbulbService);
      expect(mockPlatform.log.info).toHaveBeenCalledWith(expect.stringContaining('Removing legacy Lightbulb service'));
    });

    it('should reuse existing switch services', () => {
      const existingService = createMockSwitchService();
      existingService.subtype = 'intellibrite_WHITER';
      createdServices.set('intellibrite_WHITER', existingService);

      mockAccessory.getServiceById = jest.fn((serviceType: any, subtype: string) => {
        return createdServices.get(subtype) || null;
      });

      mockAccessory.context = {
        panel: mockPanel,
        module: mockModule,
        circuit: mockIntelliBriteCircuit,
      };

      new IntelliBriteAccessory(mockPlatform, mockAccessory);

      // Should not add a new service for WHITER since it already exists
      expect(mockAccessory.addService).toHaveBeenCalledTimes(INTELLIBRITE_OPTIONS.length - 1);
    });
  });

  describe('Color Selection', () => {
    it('should send USE parameter for individual IntelliBrite lights', async () => {
      mockAccessory.context = {
        panel: mockPanel,
        module: mockModule,
        circuit: mockIntelliBriteCircuit,
      };

      new IntelliBriteAccessory(mockPlatform, mockAccessory);

      // Get the first switch service and its set handler
      const firstService = createdServices.get('intellibrite_WHITER');
      expect(firstService).toBeDefined();

      // Get the onSet callback
      const onSetCallback = firstService.getCharacteristic().onSet.mock.calls[0]?.[0];
      expect(onSetCallback).toBeDefined();

      // Call the set handler with true (turn on)
      await onSetCallback(true);

      expect(mockPlatform.sendCommandNoWait).toHaveBeenCalledWith(
        expect.objectContaining({
          command: 'SetParamList',
          objectList: expect.arrayContaining([
            expect.objectContaining({
              objnam: mockIntelliBriteCircuit.id,
              params: { [USE_KEY]: 'WHITER' },
            }),
          ]),
        }),
      );
    });

    it('should send ACT parameter for light show groups', async () => {
      mockAccessory.context = {
        panel: mockPanel,
        module: mockModule,
        circuit: mockLightShowGroupCircuit,
      };

      new IntelliBriteAccessory(mockPlatform, mockAccessory);

      // Get the first switch service and its set handler
      const firstService = createdServices.get('intellibrite_WHITER');
      const onSetCallback = firstService.getCharacteristic().onSet.mock.calls[0]?.[0];

      await onSetCallback(true);

      expect(mockPlatform.sendCommandNoWait).toHaveBeenCalledWith(
        expect.objectContaining({
          command: 'SetParamList',
          objectList: expect.arrayContaining([
            expect.objectContaining({
              objnam: mockLightShowGroupCircuit.id,
              params: { [ACT_KEY]: 'WHITER' },
            }),
          ]),
        }),
      );
    });

    it('should not send command when turning switch off', async () => {
      mockAccessory.context = {
        panel: mockPanel,
        module: mockModule,
        circuit: mockIntelliBriteCircuit,
      };

      new IntelliBriteAccessory(mockPlatform, mockAccessory);

      const firstService = createdServices.get('intellibrite_WHITER');
      const onSetCallback = firstService.getCharacteristic().onSet.mock.calls[0]?.[0];

      await onSetCallback(false);

      expect(mockPlatform.sendCommandNoWait).not.toHaveBeenCalled();
    });

    it('should optimistically update activeColor on set', async () => {
      mockAccessory.context = {
        panel: mockPanel,
        module: mockModule,
        circuit: mockIntelliBriteCircuit,
      };

      new IntelliBriteAccessory(mockPlatform, mockAccessory);

      const redService = createdServices.get('intellibrite_REDR');
      const onSetCallback = redService.getCharacteristic().onSet.mock.calls[0]?.[0];

      await onSetCallback(true);

      expect(mockAccessory.context.activeColor).toBe('REDR');
    });
  });

  describe('Color State Queries', () => {
    it('should return true for active color switch', async () => {
      mockAccessory.context = {
        panel: mockPanel,
        module: mockModule,
        circuit: mockIntelliBriteCircuit,
        activeColor: 'BLUER',
      };

      new IntelliBriteAccessory(mockPlatform, mockAccessory);

      const blueService = createdServices.get('intellibrite_BLUER');
      const onGetCallback = blueService.getCharacteristic().onGet.mock.calls[0]?.[0];

      const result = await onGetCallback();

      expect(result).toBe(true);
    });

    it('should return false for inactive color switch', async () => {
      mockAccessory.context = {
        panel: mockPanel,
        module: mockModule,
        circuit: mockIntelliBriteCircuit,
        activeColor: 'BLUER',
      };

      new IntelliBriteAccessory(mockPlatform, mockAccessory);

      const redService = createdServices.get('intellibrite_REDR');
      const onGetCallback = redService.getCharacteristic().onGet.mock.calls[0]?.[0];

      const result = await onGetCallback();

      expect(result).toBe(false);
    });

    it('should return false when no color is active', async () => {
      mockAccessory.context = {
        panel: mockPanel,
        module: mockModule,
        circuit: mockIntelliBriteCircuit,
        activeColor: undefined,
      };

      new IntelliBriteAccessory(mockPlatform, mockAccessory);

      const whiteService = createdServices.get('intellibrite_WHITER');
      const onGetCallback = whiteService.getCharacteristic().onGet.mock.calls[0]?.[0];

      const result = await onGetCallback();

      expect(result).toBe(false);
    });
  });

  describe('Update Methods', () => {
    it('should update all switch states based on active color', () => {
      mockAccessory.context = {
        panel: mockPanel,
        module: mockModule,
        circuit: mockIntelliBriteCircuit,
        activeColor: 'PARTY',
      };

      const accessory = new IntelliBriteAccessory(mockPlatform, mockAccessory);

      // Call updateActiveColor
      accessory.updateActiveColor();

      // Check that only PARTY switch is ON
      const partyService = createdServices.get('intellibrite_PARTY');
      expect(partyService.updateCharacteristic).toHaveBeenCalledWith('On', true);

      // Check that other switches are OFF
      const whiteService = createdServices.get('intellibrite_WHITER');
      expect(whiteService.updateCharacteristic).toHaveBeenCalledWith('On', false);
    });

    it('should turn off all switches when light is off', () => {
      mockAccessory.context = {
        panel: mockPanel,
        module: mockModule,
        circuit: { ...mockIntelliBriteCircuit, status: CircuitStatus.Off },
        activeColor: 'PARTY',
      };

      const accessory = new IntelliBriteAccessory(mockPlatform, mockAccessory);

      // Call updateStatus
      accessory.updateStatus();

      // All switches should be OFF when circuit is off
      for (const [, service] of createdServices) {
        expect(service.updateCharacteristic).toHaveBeenCalledWith('On', false);
      }
    });

    it('should show active color when light is on', () => {
      mockAccessory.context = {
        panel: mockPanel,
        module: mockModule,
        circuit: { ...mockIntelliBriteCircuit, status: CircuitStatus.On },
        activeColor: 'ROMAN',
      };

      const accessory = new IntelliBriteAccessory(mockPlatform, mockAccessory);

      // Call updateStatus
      accessory.updateStatus();

      // ROMAN should be ON
      const romanService = createdServices.get('intellibrite_ROMAN');
      expect(romanService.updateCharacteristic).toHaveBeenCalledWith('On', true);
    });
  });

  describe('On/Off Control', () => {
    it('should send ON command', async () => {
      mockAccessory.context = {
        panel: mockPanel,
        module: mockModule,
        circuit: mockIntelliBriteCircuit,
      };

      const accessory = new IntelliBriteAccessory(mockPlatform, mockAccessory);

      await accessory.setOn(true);

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

    it('should send OFF command', async () => {
      mockAccessory.context = {
        panel: mockPanel,
        module: mockModule,
        circuit: mockIntelliBriteCircuit,
      };

      const accessory = new IntelliBriteAccessory(mockPlatform, mockAccessory);

      await accessory.setOn(false);

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
  });

  describe('Service Cleanup', () => {
    it('should remove obsolete switches', () => {
      // Add an obsolete service to the services array
      const obsoleteService = {
        UUID: 'switch-uuid',
        subtype: 'intellibrite_OBSOLETE',
      } as unknown as Service;

      (mockAccessory as any).services = [obsoleteService];

      mockAccessory.context = {
        panel: mockPanel,
        module: mockModule,
        circuit: mockIntelliBriteCircuit,
      };

      new IntelliBriteAccessory(mockPlatform, mockAccessory);

      expect(mockAccessory.removeService).toHaveBeenCalledWith(obsoleteService);
      expect(mockPlatform.log.info).toHaveBeenCalledWith(expect.stringContaining('Removing obsolete IntelliBrite switch'));
    });

    it('should not remove non-IntelliBrite switches', () => {
      // Add a non-IntelliBrite service
      const otherService = {
        UUID: 'switch-uuid',
        subtype: 'some_other_switch',
      } as unknown as Service;

      (mockAccessory as any).services = [otherService];

      mockAccessory.context = {
        panel: mockPanel,
        module: mockModule,
        circuit: mockIntelliBriteCircuit,
      };

      new IntelliBriteAccessory(mockPlatform, mockAccessory);

      expect(mockAccessory.removeService).not.toHaveBeenCalledWith(otherService);
    });
  });

  describe('All Color Options', () => {
    it('should support all 5 fixed colors', () => {
      const colors = ['WHITER', 'REDR', 'GREENR', 'BLUER', 'MAGNTAR'];

      mockAccessory.context = {
        panel: mockPanel,
        module: mockModule,
        circuit: mockIntelliBriteCircuit,
      };

      new IntelliBriteAccessory(mockPlatform, mockAccessory);

      for (const color of colors) {
        expect(createdServices.has(`intellibrite_${color}`)).toBe(true);
      }
    });

    it('should support all 7 light shows', () => {
      const shows = ['SAMMOD', 'PARTY', 'ROMAN', 'CARIB', 'AMERCA', 'SSET', 'ROYAL'];

      mockAccessory.context = {
        panel: mockPanel,
        module: mockModule,
        circuit: mockIntelliBriteCircuit,
      };

      new IntelliBriteAccessory(mockPlatform, mockAccessory);

      for (const show of shows) {
        expect(createdServices.has(`intellibrite_${show}`)).toBe(true);
      }
    });
  });
});
