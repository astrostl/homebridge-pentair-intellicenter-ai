// These functions are only exported for testing in NODE_ENV=test
const { transformHeaters, transformTempSensors, transformPumpCircuits, transformPumps, transformFeatures } = require('../../src/util');

describe('Final Branch Coverage Tests', () => {
  describe('Util.ts optional chaining branches', () => {
    it('should handle optional chaining in transformHeaters type', () => {
      const heaters = [
        {
          objnam: 'heater1',
          params: {
            OBJTYP: 'HEATER',
            SNAME: 'Test Heater',
            SUBTYP: undefined, // This triggers optional chaining ?.toUpperCase()
            BODY: 'body1',
          },
        },
      ];

      const result = transformHeaters(heaters);
      expect(result).toHaveLength(1);
      expect(result[0].type).toBeUndefined();
    });

    it('should handle optional chaining in transformHeaters bodyIds', () => {
      const heaters = [
        {
          objnam: 'heater1',
          params: {
            OBJTYP: 'HEATER',
            SNAME: 'Test Heater',
            SUBTYP: 'GAS',
            BODY: undefined, // This triggers optional chaining ?.split()
          },
        },
      ];

      const result = transformHeaters(heaters);
      expect(result).toHaveLength(1);
      expect(result[0].bodyIds).toEqual([]);
    });

    it('should handle nullish coalescing in transformTempSensors probe', () => {
      const sensors = [
        {
          objnam: 'sensor1',
          params: {
            OBJTYP: 'SENSE',
            SNAME: 'Test Sensor',
            SUBTYP: 'AIR',
            PROBE: undefined, // This triggers nullish coalescing ?? '0'
          },
        },
      ];

      const result = transformTempSensors(sensors);
      expect(result).toHaveLength(1);
      expect(result[0].probe).toBe(0);
    });

    it('should handle isNaN check in transformTempSensors', () => {
      const sensors = [
        {
          objnam: 'sensor1',
          params: {
            OBJTYP: 'SENSE',
            SNAME: 'Test Sensor',
            SUBTYP: 'AIR',
            PROBE: 'invalid', // This triggers isNaN check ? 0 : probeValue
          },
        },
      ];

      const result = transformTempSensors(sensors);
      expect(result).toHaveLength(1);
      expect(result[0].probe).toBe(0);
    });

    it('should handle optional chaining in transformPumpCircuits speed', () => {
      const pump = {
        id: 'pump1',
        name: 'Test Pump',
        minRpm: 1000,
        maxRpm: 3000,
      };

      const pumpObjList = [
        {
          objnam: 'circuit1',
          params: {
            CIRCUIT: 'circ1',
            SPEED: undefined, // This triggers nullish coalescing ?? '0'
            SELECT: 'RPM',
          },
        },
      ];

      const result = transformPumpCircuits(pump, pumpObjList);
      expect(result).toHaveLength(1);
      expect(result[0].speed).toBe(0);
    });

    it('should handle optional chaining in transformPumpCircuits speedType', () => {
      const pump = {
        id: 'pump1',
        name: 'Test Pump',
        minRpm: 1000,
        maxRpm: 3000,
      };

      const pumpObjList = [
        {
          objnam: 'circuit1',
          params: {
            CIRCUIT: 'circ1',
            SPEED: '1500',
            SELECT: undefined, // This triggers optional chaining ?.toUpperCase()
          },
        },
      ];

      const result = transformPumpCircuits(pump, pumpObjList);
      expect(result).toHaveLength(1);
      expect(result[0].speedType).toBeUndefined();
    });

    it('should handle optional chaining in transformPumps type', () => {
      const pumps = [
        {
          objnam: 'pump1',
          params: {
            OBJTYP: 'PUMP',
            SNAME: 'Test Pump',
            SUBTYP: undefined, // This triggers optional chaining ?.toUpperCase()
            MIN: '1000',
            MAX: '3000',
            MINF: '10',
            MAXF: '100',
            OBJLIST: [],
          },
        },
      ];

      const result = transformPumps(pumps);
      expect(result).toHaveLength(0); // Should be filtered out due to undefined subtype
    });

    it('should handle optional chaining in transformFeatures type', () => {
      const circuits = [
        {
          objnam: 'circuit1',
          params: {
            OBJTYP: 'CIRCUIT',
            SNAME: 'Test Circuit',
            SUBTYP: undefined, // This triggers optional chaining ?.toUpperCase()
            FEATR: 'ON',
          },
        },
      ];

      const result = transformFeatures(circuits);
      expect(result).toHaveLength(1);
      expect(result[0].type).toBeUndefined();
    });

    it('should include GRP-prefixed circuits regardless of FEATR value', () => {
      const circuits = [
        {
          objnam: 'GRP01', // GRP prefix should always be included
          params: {
            OBJTYP: 'CIRCUIT',
            SNAME: 'Pool Mode',
            SUBTYP: 'CIRCGRP',
            FEATR: 'FEATR', // Not 'ON', but should still be included due to GRP prefix
          },
        },
        {
          objnam: 'C0005', // Regular circuit with FEATR=FEATR should be excluded
          params: {
            OBJTYP: 'CIRCUIT',
            SNAME: 'Regular Circuit',
            SUBTYP: 'GENERIC',
            FEATR: 'FEATR',
          },
        },
        {
          objnam: 'GRP02', // Another GRP circuit
          params: {
            OBJTYP: 'CIRCUIT',
            SNAME: 'Spa Mode',
            SUBTYP: 'CIRCGRP',
            FEATR: 'OFF',
          },
        },
      ];

      const result = transformFeatures(circuits, false); // includeAllCircuits = false
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('GRP01');
      expect(result[0].name).toBe('Pool Mode');
      expect(result[1].id).toBe('GRP02');
      expect(result[1].name).toBe('Spa Mode');
    });

    it('should include both GRP and FEATR=ON circuits', () => {
      const circuits = [
        {
          objnam: 'GRP01',
          params: {
            OBJTYP: 'CIRCUIT',
            SNAME: 'Pool Mode',
            SUBTYP: 'CIRCGRP',
            FEATR: 'FEATR',
          },
        },
        {
          objnam: 'C0005',
          params: {
            OBJTYP: 'CIRCUIT',
            SNAME: 'Pool Light',
            SUBTYP: 'GENERIC',
            FEATR: 'ON', // This should be included due to FEATR=ON
          },
        },
      ];

      const result = transformFeatures(circuits, false);
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('GRP01');
      expect(result[1].id).toBe('C0005');
    });
  });
});
