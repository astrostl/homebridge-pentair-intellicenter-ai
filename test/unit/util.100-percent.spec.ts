import { transformPanels } from '../../src/util';

// Import test-only functions using require to access the conditional exports
// Set NODE_ENV to 'test' to enable conditional exports
process.env.NODE_ENV = 'test';

const utilModule = require('../../src/util');
const {
  transformHeaters,
  transformBodies,
  transformFeatures,
  transformPumps,
  transformTempSensors,
  transformPumpCircuits,
  transformModules,
} = utilModule;

describe('util.ts 100% coverage tests', () => {
  it('should cover all null checks in internal transform functions', () => {
    // Lines 52-53: transformHeaters with null input
    expect(transformHeaters(null)).toEqual([]);
    expect(transformHeaters(undefined)).toEqual([]);

    // Lines 117-118: transformBodies with null input
    expect(transformBodies(null)).toEqual([]);
    expect(transformBodies(undefined)).toEqual([]);

    // Lines 159-160: transformFeatures with null input
    expect(transformFeatures(null)).toEqual([]);
    expect(transformFeatures(undefined)).toEqual([]);

    // Lines 207-208: transformPumps with null input
    expect(transformPumps(null)).toEqual([]);
    expect(transformPumps(undefined)).toEqual([]);

    // Lines 258-259: transformTempSensors with null input
    expect(transformTempSensors(null)).toEqual([]);
    expect(transformTempSensors(undefined)).toEqual([]);

    // Lines 288-289: transformPumpCircuits with null input
    const mockPump = { id: 'P1', name: 'Test Pump' } as any;
    expect(transformPumpCircuits(mockPump, null)).toEqual([]);
    expect(transformPumpCircuits(mockPump, undefined)).toEqual([]);

    // Lines 303-304: transformModules with null input
    expect(transformModules(null)).toEqual([]);
    expect(transformModules(undefined)).toEqual([]);
  });

  it('should cover null params checks in transform functions', () => {
    // Lines 168-169: transformFeatures with object having null params
    const featureWithNullParams = [
      {
        objnam: 'FEATURE1',
        params: null, // This should trigger the null params check
      },
    ];
    expect(transformFeatures(featureWithNullParams)).toEqual([]);

    // Lines 215-216: transformPumps with object having null params
    const pumpWithNullParams = [
      {
        objnam: 'PUMP1',
        params: null, // This should trigger the null params check
      },
    ];
    expect(transformPumps(pumpWithNullParams)).toEqual([]);
  });

  it('should still work with transformPanels for integration', () => {
    // Test that we didn't break the main public API
    const testData = {
      panels: [
        {
          objnam: 'P1',
          params: {
            OBJTYP: 'PANEL',
            SNAME: 'Panel 1',
            OBJLIST: null,
          },
        },
      ],
    };

    const result = transformPanels(testData as any);
    expect(result).toHaveLength(1);
    expect(result[0]?.modules).toEqual([]);
  });

  it('should cover invalid object filtering lines', () => {
    // Lines 340-341: transformPanels with invalid objects
    const testDataWithInvalidObjects = {
      panels: [
        'invalid_string', // This should trigger lines 340-341
        null, // This should trigger lines 340-341
        {
          // Valid object
          objnam: 'P1',
          params: {
            OBJTYP: 'PANEL',
            SNAME: 'Panel 1',
            OBJLIST: [],
          },
        },
      ],
    };

    const result = transformPanels(testDataWithInvalidObjects as any);
    expect(result).toHaveLength(1); // Only the valid object should be processed

    // Lines 144-145: findBodyCircuit with invalid circuit objects
    const testDataWithInvalidCircuits = {
      panels: [
        {
          objnam: 'P1',
          params: {
            OBJTYP: 'PANEL',
            SNAME: 'Panel 1',
            OBJLIST: [
              {
                objnam: 'M1',
                params: {
                  OBJTYP: 'MODULE',
                  SNAME: 'Module 1',
                  CIRCUITS: [
                    'invalid_circuit', // This should trigger lines 144-145
                    null, // This should trigger lines 144-145
                    {
                      objnam: 'B1',
                      params: {
                        OBJTYP: 'BODY',
                        SNAME: 'Pool',
                      },
                    },
                  ],
                },
              },
            ],
          },
        },
      ],
    };

    const result2 = transformPanels(testDataWithInvalidCircuits as any);
    expect(result2).toHaveLength(1);
  });
});
