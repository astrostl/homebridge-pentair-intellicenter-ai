import { transformPanels, findBodyCircuit } from '../../src/util';
import { ObjectType, BodyType } from '../../src/types';
import { OBJ_ID_KEY, OBJ_TYPE_KEY, PARAMS_KEY, OBJ_SUBTYPE_KEY, OBJ_NAME_KEY } from '../../src/constants';

describe('Util Direct Null Input Tests', () => {
  it('should cover transformPanels null input check', () => {
    // This directly tests transformPanels with null input to cover lines 329-331
    const result = transformPanels(null);
    expect(result).toEqual([]);
  });

  it('should cover transformPanels undefined input check', () => {
    // This directly tests transformPanels with undefined input
    const result = transformPanels(undefined as any);
    expect(result).toEqual([]);
  });

  it('should handle invalid object arrays in transformPanels', () => {
    // Test with array of invalid objects to trigger isIntelliCenterObject checks
    const invalidData = {
      panels: [
        null, // This should be filtered out
        undefined, // This should be filtered out
        'invalid', // This should be filtered out
        { [OBJ_ID_KEY]: 'test' }, // Missing PARAMS_KEY - should be filtered out
        { [PARAMS_KEY]: {} }, // Missing OBJ_ID_KEY - should be filtered out
        {
          [OBJ_ID_KEY]: 'valid-panel',
          [PARAMS_KEY]: {
            [OBJ_TYPE_KEY]: ObjectType.Panel,
          },
        }, // This should be processed
      ],
    };

    const result = transformPanels(invalidData);
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe('valid-panel');
  });

  it('should return undefined for findBodyCircuit when no matching circuit found', () => {
    // Test findBodyCircuit return undefined case (line 155)
    const body = {
      id: 'body1',
      name: 'Test Body',
      type: BodyType.Spa,
      objectType: ObjectType.Body,
    };

    const circuits = [
      {
        [OBJ_ID_KEY]: 'circuit1',
        [PARAMS_KEY]: {
          [OBJ_TYPE_KEY]: ObjectType.Circuit,
          [OBJ_SUBTYPE_KEY]: 'POOL', // Different type
          [OBJ_NAME_KEY]: 'Different Name',
        },
      },
    ];

    const result = findBodyCircuit(body, circuits);
    expect(result).toBeUndefined();
  });

  it('should handle invalid circuits in findBodyCircuit', () => {
    // Test findBodyCircuit with invalid objects to trigger continue statement (line 144-145)
    const body = {
      id: 'body1',
      name: 'Test Body',
      type: BodyType.Spa,
      objectType: ObjectType.Body,
    };

    const circuits = [
      null, // Should be skipped
      'invalid', // Should be skipped
      { invalid: 'object' }, // Should be skipped
      {
        [OBJ_ID_KEY]: 'circuit1',
        [PARAMS_KEY]: {
          [OBJ_TYPE_KEY]: ObjectType.Circuit,
          [OBJ_SUBTYPE_KEY]: BodyType.Spa,
          [OBJ_NAME_KEY]: 'Test Body',
        },
      },
    ];

    const result = findBodyCircuit(body, circuits);
    expect(result).toEqual({
      id: 'circuit1',
      name: 'Test Body',
      objectType: ObjectType.Circuit,
    });
  });
});
