// Additional tests to cover null input paths in util.ts transformation functions
import { transformPanels } from '../../src/util';
import { ObjectType } from '../../src/types';
import { OBJ_ID_KEY, OBJ_TYPE_KEY, PARAMS_KEY, OBJ_LIST_KEY, CIRCUITS_KEY, OBJ_SUBTYPE_KEY } from '../../src/constants';

describe('Util Null Transform Tests', () => {
  
  it('should handle transformHeaters with null input to cover lines 52-53', () => {
    // Create a module with null circuits to trigger transformHeaters(null)
    const data = {
      panels: [{
        [OBJ_ID_KEY]: 'panel1',
        [PARAMS_KEY]: {
          [OBJ_TYPE_KEY]: ObjectType.Panel,
          [OBJ_LIST_KEY]: [{
            [OBJ_ID_KEY]: 'module1',
            [PARAMS_KEY]: {
              [OBJ_TYPE_KEY]: ObjectType.Module,
              [CIRCUITS_KEY]: null // This will trigger transformHeaters(null)
            }
          }]
        }
      }]
    };
    
    const result = transformPanels(data);
    expect(result).toHaveLength(1);
    expect(result[0]?.modules).toHaveLength(1);
    expect(result[0]?.modules?.[0]?.heaters).toEqual([]);
  });

  it('should handle transformBodies with null input to cover lines 117-118', () => {
    // Create a module with null circuits to trigger transformBodies(null) 
    const data = {
      panels: [{
        [OBJ_ID_KEY]: 'panel1',
        [PARAMS_KEY]: {
          [OBJ_TYPE_KEY]: ObjectType.Panel,
          [OBJ_LIST_KEY]: [{
            [OBJ_ID_KEY]: 'module1',
            [PARAMS_KEY]: {
              [OBJ_TYPE_KEY]: ObjectType.Module,
              [CIRCUITS_KEY]: null // This will trigger transformBodies(null)
            }
          }]
        }
      }]
    };
    
    const result = transformPanels(data);
    expect(result).toHaveLength(1);
    expect(result[0]?.modules).toHaveLength(1);
    expect(result[0]?.modules?.[0]?.bodies).toEqual([]);
  });

  it('should handle transformFeatures with null input to cover lines 159-160', () => {
    // Create a module with null circuits to trigger transformFeatures(null)
    const data = {
      panels: [{
        [OBJ_ID_KEY]: 'panel1',
        [PARAMS_KEY]: {
          [OBJ_TYPE_KEY]: ObjectType.Panel,
          [OBJ_LIST_KEY]: [{
            [OBJ_ID_KEY]: 'module1', 
            [PARAMS_KEY]: {
              [OBJ_TYPE_KEY]: ObjectType.Module,
              [CIRCUITS_KEY]: null // This will trigger transformFeatures(null)
            }
          }]
        }
      }]
    };
    
    const result = transformPanels(data);
    expect(result).toHaveLength(1);
    expect(result[0]?.modules).toHaveLength(1);
    expect(result[0]?.modules?.[0]?.features).toEqual([]);
  });

  it('should handle transformPumps with null input to cover lines 207-208', () => {
    // Create a panel with null objList to trigger transformPumps(null)
    const data = {
      panels: [{
        [OBJ_ID_KEY]: 'panel1',
        [PARAMS_KEY]: {
          [OBJ_TYPE_KEY]: ObjectType.Panel,
          [OBJ_LIST_KEY]: null // This will trigger transformPumps(null)
        }
      }]
    };
    
    const result = transformPanels(data);
    expect(result).toHaveLength(1);
    expect(result[0]?.pumps).toEqual([]);
  });

  it('should handle transformTempSensors with null input to cover lines 258-259', () => {
    // Create a panel with null objList to trigger transformTempSensors(null)
    const data = {
      panels: [{
        [OBJ_ID_KEY]: 'panel1',
        [PARAMS_KEY]: {
          [OBJ_TYPE_KEY]: ObjectType.Panel,
          [OBJ_LIST_KEY]: null // This will trigger transformTempSensors(null)
        }
      }]
    };
    
    const result = transformPanels(data);
    expect(result).toHaveLength(1);
    expect(result[0]?.sensors).toEqual([]);
  });

  it('should handle transformPumpCircuits with null input to cover lines 288-289', () => {
    // Create a pump with null OBJ_LIST_KEY to trigger transformPumpCircuits(null)
    const data = {
      panels: [{
        [OBJ_ID_KEY]: 'panel1',
        [PARAMS_KEY]: {
          [OBJ_TYPE_KEY]: ObjectType.Panel,
          [OBJ_LIST_KEY]: [{
            [OBJ_ID_KEY]: 'pump1',
            [PARAMS_KEY]: {
              [OBJ_TYPE_KEY]: ObjectType.Pump,
              [OBJ_SUBTYPE_KEY]: 'SPEED',
              'NAME': 'Test Pump',
              'MIN': '600',
              'MAX': '3000',
              'MINFLOW': '10',
              'MAXFLOW': '130',
              [OBJ_LIST_KEY]: null // This will trigger transformPumpCircuits(null)
            }
          }]
        }
      }]
    };
    
    const result = transformPanels(data);
    expect(result).toHaveLength(1);
    expect(result[0]?.pumps).toHaveLength(1);
    expect(result[0]?.pumps?.[0]?.circuits).toEqual([]);
  });

  it('should handle transformModules with null input to cover lines 303-304', () => {
    // Create a panel with null objList to trigger transformModules(null)
    const data = {
      panels: [{
        [OBJ_ID_KEY]: 'panel1',
        [PARAMS_KEY]: {
          [OBJ_TYPE_KEY]: ObjectType.Panel,
          [OBJ_LIST_KEY]: null // This will trigger transformModules(null)
        }
      }]
    };
    
    const result = transformPanels(data);
    expect(result).toHaveLength(1);
    expect(result[0]?.modules).toEqual([]);
  });

  it('should handle non-IntelliCenter objects in transforms to cover filter conditions', () => {
    // Test objects that fail isIntelliCenterObject check
    const data = {
      panels: [{
        [OBJ_ID_KEY]: 'panel1',
        [PARAMS_KEY]: {
          [OBJ_TYPE_KEY]: ObjectType.Panel,
          [OBJ_LIST_KEY]: [
            null, // Should be filtered out
            'invalid', // Should be filtered out
            { invalid: 'object' }, // Should be filtered out
            {
              [OBJ_ID_KEY]: 'module1',
              [PARAMS_KEY]: {
                [OBJ_TYPE_KEY]: ObjectType.Module,
                [CIRCUITS_KEY]: [
                  null, // Should be filtered out in all transform functions
                  'invalid', // Should be filtered out
                  { missing: 'required fields' } // Should be filtered out
                ]
              }
            }
          ]
        }
      }]
    };
    
    const result = transformPanels(data);
    expect(result).toHaveLength(1);
    expect(result[0]?.modules).toHaveLength(1);
    // All the invalid objects should have been filtered out
    expect(result[0]?.modules?.[0]?.heaters).toEqual([]);
    expect(result[0]?.modules?.[0]?.bodies).toEqual([]);
    expect(result[0]?.modules?.[0]?.features).toEqual([]);
  });

});