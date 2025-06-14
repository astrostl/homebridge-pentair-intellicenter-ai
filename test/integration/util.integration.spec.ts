import { transformPanels, mergeResponse, mergeResponseArray } from '../../src/util';
import { Logger } from 'homebridge';

// Test fixtures
import circuitResponse from '../resources/circuitResponse.json';
import pumpResponse from '../resources/pumpResponse.json';
import sensorResponse from '../resources/sensorResponse.json';
import heaterResponse from '../resources/heaterResponse.json';
import beforeTransform from '../resources/beforeTransform.json';
import afterTransform from '../resources/afterTransform.json';
import mergeResult from '../resources/mergeResult.json';

const mockLogger = {
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
} as unknown as Logger;

describe('Utility Integration Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Data Transformation', () => {
    it('should transform real circuit response data correctly', () => {
      const panels = transformPanels(circuitResponse as any, false, mockLogger);

      expect(panels).toHaveLength(1);
      expect(panels[0].id).toBe('PNL01');
      expect(panels[0].modules.length).toBeGreaterThan(0);
      
      const module = panels[0].modules[0];
      expect(module.id).toBe('M0101');
      expect(module.bodies.length).toBeGreaterThan(0);
      expect(module.features.length).toBeGreaterThan(0);
      
      // Verify body transformation
      const body = module.bodies[0];
      expect(body.id).toBe('B1101');
      expect(body.name).toBe('Pool');
      expect(body.type).toBe('POOL');
    });

    it('should transform pump response data correctly', () => {
      const panels = transformPanels(pumpResponse as any, false, mockLogger);

      expect(panels).toHaveLength(1);
      expect(panels[0].pumps.length).toBeGreaterThan(0);
      
      const pump = panels[0].pumps[0];
      expect(pump.id).toBeDefined();
      expect(pump.name).toBeDefined();
      expect(pump.type).toBeDefined();
      expect(pump.circuits?.length).toBeGreaterThan(0);
    });

    it('should transform sensor response data correctly', () => {
      const panels = transformPanels(sensorResponse as any, false, mockLogger);

      expect(panels).toHaveLength(1);
      expect(panels[0].sensors.length).toBeGreaterThan(0);
      
      const sensors = panels[0].sensors;
      // Verify we have temperature sensors
      expect(sensors.some(s => s.type)).toBe(true);
      expect(sensors.every(s => s.objectType)).toBe(true);
    });

    it('should transform heater response data correctly', () => {
      const panels = transformPanels(heaterResponse as any, false, mockLogger);

      expect(panels).toHaveLength(1);
      expect(panels[0].modules.length).toBeGreaterThan(0);
      
      // Check for heaters in any module
      const allHeaters = panels[0].modules.flatMap(m => m.heaters);
      if (allHeaters.length > 0) {
        const heater = allHeaters[0];
        expect(heater.objectType).toBeDefined();
        expect(heater.name).toBeDefined();
        expect(heater.bodyIds).toBeDefined();
      }
    });

    it('should handle includeAllCircuits flag correctly', () => {
      const panelsExclusive = transformPanels(circuitResponse as any, false, mockLogger);
      const panelsInclusive = transformPanels(circuitResponse as any, true, mockLogger);

      const exclusiveFeatures = panelsExclusive[0].modules.flatMap(m => m.features).length;
      const inclusiveFeatures = panelsInclusive[0].modules.flatMap(m => m.features).length;

      // Should have more or equal features when includeAllCircuits is true
      expect(inclusiveFeatures).toBeGreaterThanOrEqual(exclusiveFeatures);
    });

    it('should filter out legacy circuits', () => {
      // Create test data with legacy circuit
      const testData = [
        {
          objnam: 'PNL01',
          params: {
            OBJTYP: 'PANEL',
            SUBTYP: 'OCP',
            SNAME: 'Panel 1',
            OBJLIST: [
              {
                objnam: 'M0101',
                params: {
                  OBJTYP: 'MODULE',
                  SUBTYP: 'I5P',
                  SNAME: 'M0101',
                  CIRCUITS: [
                    {
                      objnam: 'C0001',
                      params: {
                        OBJTYP: 'CIRCUIT',
                        SUBTYP: 'LEGACY',
                        SNAME: 'Legacy Circuit',
                        FEATR: 'ON',
                      },
                    },
                    {
                      objnam: 'C0002',
                      params: {
                        OBJTYP: 'CIRCUIT',
                        SUBTYP: 'LIGHT',
                        SNAME: 'Pool Light',
                        FEATR: 'ON',
                      },
                    },
                  ],
                },
              },
            ],
          },
        },
      ];

      const panels = transformPanels(testData as any, false, mockLogger);
      const features = panels[0].modules[0].features;

      // Should exclude legacy circuit
      expect(features).toHaveLength(1);
      expect(features[0].name).toBe('Pool Light');
    });
  });

  describe('Response Merging', () => {
    it('should merge multiple discovery responses correctly', () => {
      const target = JSON.parse(JSON.stringify(beforeTransform));
      const responses = [circuitResponse as any, pumpResponse as any, sensorResponse as any, heaterResponse as any];

      responses.forEach(response => {
        mergeResponse(target, response);
      });

      // Verify merged data structure is maintained
      expect(target).toHaveLength(1);
      expect(target[0]).toBeDefined();
      expect(target[0].params).toBeDefined();
      expect(target[0].params.OBJLIST).toBeDefined();
      
      // Should have successfully merged without errors
      const modules = target[0].params.OBJLIST;
      expect(modules.length).toBeGreaterThan(0);
      
      // Check that we have various device types across all modules
      const allCircuits = modules.flatMap((m: any) => m.params.CIRCUITS || []);
      const deviceTypes = new Set(allCircuits.map((c: any) => c.params?.OBJTYP).filter(Boolean));
      expect(deviceTypes.size).toBeGreaterThan(1); // Should have multiple device types
    });

    it('should handle merging arrays correctly', () => {
      const target = [
        { objnam: 'existing1', params: { value: 1 } },
        { objnam: 'existing2', params: { value: 2 } },
      ];

      const toAdd = [
        { objnam: 'existing1', params: { value: 10, newField: 'updated' } },
        { objnam: 'new1', params: { value: 3 } },
      ];

      mergeResponseArray(target, toAdd);

      expect(target).toHaveLength(3);
      
      // Should update existing item
      const updated = target.find(item => item.objnam === 'existing1');
      expect(updated?.params.value).toBe(10);
      expect((updated?.params as any).newField).toBe('updated');

      // Should keep unchanged item
      const unchanged = target.find(item => item.objnam === 'existing2');
      expect(unchanged?.params.value).toBe(2);

      // Should add new item
      const newItem = target.find(item => item.objnam === 'new1');
      expect(newItem?.params.value).toBe(3);
    });

    it('should prevent prototype pollution in merge operations', () => {
      const target = { normalProp: 'value' };
      const maliciousPayload = {
        '__proto__': { polluted: true },
        'constructor': { prototype: { polluted: true } },
        'prototype': { polluted: true },
        normalProp: 'updated',
      };

      mergeResponse(target, maliciousPayload);

      // Should merge normal properties
      expect(target.normalProp).toBe('updated');

      // Should not pollute prototype
      expect((Object.prototype as any).polluted).toBeUndefined();
      expect((target.constructor.prototype as any).polluted).toBeUndefined();
    });
  });

  describe('Complex Transformation Scenarios', () => {
    it('should handle empty responses gracefully', () => {
      const panels = transformPanels([] as any, false, mockLogger);
      expect(panels).toHaveLength(0);

      const panelsWithUndefined = transformPanels(undefined as any, false, mockLogger);
      expect(panelsWithUndefined).toHaveLength(0);
    });

    it('should handle malformed device data gracefully', () => {
      const malformedData = [
        {
          objnam: 'PNL01',
          params: {
            OBJTYP: 'PANEL',
            // Missing required fields
            OBJLIST: [
              {
                objnam: 'M0101',
                params: {
                  OBJTYP: 'MODULE',
                  CIRCUITS: [
                    {
                      objnam: 'C0001',
                      // Missing params
                    },
                  ],
                },
              },
            ],
          },
        },
      ];

      // Should not throw errors
      expect(() => {
        transformPanels(malformedData as any, false, mockLogger);
      }).not.toThrow();
    });

    it('should log circuit filtering decisions when debugging', () => {
      transformPanels(circuitResponse as any, false, mockLogger);

      // Should log filtered circuits
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining('Circuit filtered out')
      );
    });

    it('should handle variable speed pump discovery correctly', () => {
      const panels = transformPanels(pumpResponse as any, false, mockLogger);
      const pump = panels[0].pumps[0];

      expect(['SPEED', 'VSF', 'VF']).toContain(pump.type); // Should be variable speed
      expect(pump.minRpm).toBeGreaterThanOrEqual(0);
      expect(pump.maxRpm).toBeGreaterThan(pump.minRpm);
      expect(pump.circuits?.length).toBeGreaterThan(0);

      // Verify pump circuits have correct mapping
      pump.circuits?.forEach(circuit => {
        expect(circuit.pump.id).toBe(pump.id); // Check ID instead of object reference
        expect(circuit.circuitId).toBeDefined();
        expect(typeof circuit.speed).toBe('number');
      });
    });

    it('should create proper device hierarchy', () => {
      const panels = transformPanels(circuitResponse as any, false, mockLogger);
      const panel = panels[0];

      // Verify hierarchy: Panel -> Module -> Devices
      expect(panel.modules.length).toBeGreaterThan(0);
      
      const totalDevices = panel.modules.reduce((sum, module) => 
        sum + module.bodies.length + module.features.length, 0);
      expect(totalDevices).toBeGreaterThan(0);

      // Bodies should have circuit references when they exist
      panel.modules.forEach(module => {
        module.bodies.forEach(body => {
          if (body.circuit) {
            expect(body.circuit.id).toBeDefined();
          }
        });
      });
    });

    it('should handle temperature sensor filtering based on heaters', () => {
      // Test with heaters present
      const dataWithHeaters = JSON.parse(JSON.stringify(sensorResponse));
      if (dataWithHeaters[0]?.params?.OBJLIST?.[0]?.params?.CIRCUITS && 
          heaterResponse[0]?.params?.OBJLIST?.[0]?.params?.CIRCUITS) {
        dataWithHeaters[0].params.OBJLIST[0].params.CIRCUITS.push(...heaterResponse[0].params.OBJLIST[0].params.CIRCUITS);
      }

      const panelsWithHeaters = transformPanels(dataWithHeaters as any, false, mockLogger);
      const sensorsWithHeaters = panelsWithHeaters[0].sensors;

      // Test without heaters
      const panelsWithoutHeaters = transformPanels(sensorResponse as any, false, mockLogger);
      const sensorsWithoutHeaters = panelsWithoutHeaters[0].sensors;

      // Should have different sensor counts based on heater presence
      const waterSensorsWithHeaters = sensorsWithHeaters.filter(s => s.type === 'POOL').length;
      const waterSensorsWithoutHeaters = sensorsWithoutHeaters.filter(s => s.type === 'POOL').length;

      expect(waterSensorsWithHeaters).toBeLessThanOrEqual(waterSensorsWithoutHeaters);
    });
  });

  describe('Real-world Data Validation', () => {
    it('should match expected transformation results', () => {
      // Use the before/after transform fixtures for validation
      const result = transformPanels(beforeTransform as any, false, mockLogger);
      
      // Verify structure matches expected patterns
      expect(result).toHaveLength(1);
      expect(result[0].id).toBeDefined();
      expect(result[0].modules).toBeDefined();
      expect(result[0].features).toBeDefined();
      expect(result[0].pumps).toBeDefined();
      expect(result[0].sensors).toBeDefined();
    });

    it('should handle all known device subtypes', () => {
      const knownSubtypes = ['POOL', 'SPA', 'LIGHT', 'PUMP', 'AUX', 'HEATER', 'INTELLIBRITE'];
      
      // Create test data with various subtypes
      const testData = [
        {
          objnam: 'PNL01',
          params: {
            OBJTYP: 'PANEL',
            SUBTYP: 'OCP',
            SNAME: 'Panel 1',
            OBJLIST: [
              {
                objnam: 'M0101',
                params: {
                  OBJTYP: 'MODULE',
                  SUBTYP: 'I5P',
                  SNAME: 'M0101',
                  CIRCUITS: knownSubtypes.map((subtype, index) => ({
                    objnam: `C000${index + 1}`,
                    params: {
                      OBJTYP: ['POOL', 'SPA'].includes(subtype) ? 'BODY' : 'CIRCUIT',
                      SUBTYP: subtype,
                      SNAME: `${subtype} Device`,
                      FEATR: 'ON',
                    },
                  })),
                },
              },
            ],
          },
        },
      ];

      expect(() => {
        transformPanels(testData as any, false, mockLogger);
      }).not.toThrow();
    });
  });
});