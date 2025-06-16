import { transformPanels } from '../../src/util';

describe('util.ts edge cases for 100% coverage', () => {
  it('should trigger null checks in all transform functions', () => {
    // To trigger all null checks (lines 52-53, 117-118, 159-160, 207-208, 258-259, 288-289, 303-304)
    // we pass null as the OBJLIST to the panel, which will be passed to all transform functions

    const testDataWithNullObjList = {
      panels: [
        {
          objnam: 'P1',
          params: {
            OBJTYP: 'PANEL',
            SNAME: 'Panel 1',
            OBJLIST: null, // This null will be passed to all transform functions
          },
        },
      ],
    };

    const result = transformPanels(testDataWithNullObjList as any);
    expect(result).toHaveLength(1);
    expect(result[0]?.modules).toEqual([]);
    expect(result[0]?.features).toEqual([]);
    expect(result[0]?.pumps).toEqual([]);
    expect(result[0]?.sensors).toEqual([]);
  });

  // Note: util.ts line 241 optional chaining test was attempted but had issues with transformPanels data structure
});
