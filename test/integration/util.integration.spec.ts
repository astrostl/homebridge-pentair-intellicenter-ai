import { transformPanels, mergeResponse, mergeResponseArray } from '../../src/util';
import { Logger } from 'homebridge';

// Test fixtures
import circuitResponse from '../resources/circuitResponse.json';
import pumpResponse from '../resources/pumpResponse.json';
import sensorResponse from '../resources/sensorResponse.json';
import heaterResponse from '../resources/heaterResponse.json';
import beforeTransform from '../resources/beforeTransform.json';

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
      expect(panels[0]?.id).toBe('PNL01');
      expect(panels[0]?.modules.length).toBeGreaterThan(0);
      
      const module = panels[0]?.modules[0];
      expect(module?.id).toBe('M0101');
      expect(module?.bodies.length).toBeGreaterThan(0);
      expect(module?.features.length).toBeGreaterThan(0);
      
      // Verify body transformation
      const body = module?.bodies[0];
      expect(body?.id).toBe('B1101');
      expect(body?.name).toBe('Pool');
      expect(body?.type).toBe('POOL');
    });

    it('should transform pump response data correctly', () => {
      const panels = transformPanels(pumpResponse as any, false, mockLogger);

      expect(panels).toHaveLength(1);
      expect(panels[0]?.pumps.length).toBeGreaterThan(0);
      
      const pump = panels[0]?.pumps[0];
      expect(pump?.id).toBeDefined();
      expect(pump?.name).toBeDefined();
      expect(pump?.type).toBeDefined();
      expect(pump?.circuits?.length).toBeGreaterThan(0);
    });

    it('should transform sensor response data correctly', () => {
      const panels = transformPanels(sensorResponse as any, false, mockLogger);

      expect(panels).toHaveLength(1);
      expect(panels[0]?.sensors.length).toBeGreaterThan(0);
      
      const sensors = panels[0]?.sensors;
      // Verify we have temperature sensors
      expect(sensors?.some(s => s.type)).toBe(true);
      expect(sensors?.every(s => s.objectType)).toBe(true);
    });

    it('should transform heater response data correctly', () => {
      const panels = transformPanels(heaterResponse as any, false, mockLogger);

      expect(panels).toHaveLength(1);
      expect(panels[0]?.modules.length).toBeGreaterThan(0);
      
      // Check for heaters in any module
      const allHeaters = panels[0]?.modules.flatMap(m => m.heaters);
      if (allHeaters && allHeaters.length > 0) {
        const heater = allHeaters[0];
        expect(heater?.objectType).toBeDefined();
        expect(heater?.name).toBeDefined();
        expect(heater?.bodyIds).toBeDefined();
      }
    });

    it('should handle includeAllCircuits flag correctly', () => {
      const panelsExclusive = transformPanels(circuitResponse as any, false, mockLogger);
      const panelsInclusive = transformPanels(circuitResponse as any, true, mockLogger);

      const exclusiveFeatures = panelsExclusive[0]?.modules.flatMap(m => m.features).length || 0;
      const inclusiveFeatures = panelsInclusive[0]?.modules.flatMap(m => m.features).length || 0;

      // Should have more or equal features when includeAllCircuits is true
      expect(inclusiveFeatures).toBeGreaterThanOrEqual(exclusiveFeatures);
    });

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
});