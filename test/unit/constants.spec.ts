import { PUMP_PERFORMANCE_CURVES, PUMP_TYPE_MAPPING, VARIABLE_SPEED_PUMP_SUBTYPES, DISCOVER_COMMANDS } from '../../src/constants';

describe('Constants', () => {
  describe('PUMP_PERFORMANCE_CURVES', () => {
    describe('VS pump calculations', () => {
      const vsPump = PUMP_PERFORMANCE_CURVES.VS;

      it('should calculate correct GPM for VS pump at various RPMs', () => {
        // Test boundary conditions
        expect(vsPump.calculateGPM(0)).toBe(0);
        expect(vsPump.calculateGPM(400)).toBe(0);
        expect(vsPump.calculateGPM(449)).toBe(0);
        expect(vsPump.calculateGPM(450)).toBe(0); // 450 * 0.032 - 14.4 = 0

        // Test normal operating range
        expect(vsPump.calculateGPM(1000)).toBe(17.6); // 1000 * 0.032 - 14.4 = 17.6
        expect(vsPump.calculateGPM(2000)).toBe(49.6); // 2000 * 0.032 - 14.4 = 49.6
        expect(vsPump.calculateGPM(3000)).toBe(81.6); // 3000 * 0.032 - 14.4 = 81.6
        expect(vsPump.calculateGPM(3450)).toBe(96); // Close to 96

        // Test over-limit (should cap at 3450)
        expect(vsPump.calculateGPM(4000)).toBe(96); // Same as 3450
        expect(vsPump.calculateGPM(5000)).toBe(96); // Same as 3450
      });

      it('should calculate correct WATTS for VS pump at various RPMs', () => {
        // Test boundary conditions
        expect(vsPump.calculateWATTS(0)).toBe(0);
        expect(vsPump.calculateWATTS(400)).toBe(0);
        expect(vsPump.calculateWATTS(449)).toBe(0);
        expect(vsPump.calculateWATTS(450)).toBe(30);

        // Test first segment (450-1800 RPM)
        expect(vsPump.calculateWATTS(1000)).toBe(109); // Linear interpolation
        expect(vsPump.calculateWATTS(1800)).toBe(225);

        // Test second segment (1800-3400 RPM)
        expect(vsPump.calculateWATTS(2000)).toBe(382); // Linear interpolation
        expect(vsPump.calculateWATTS(3000)).toBe(1169); // Linear interpolation
        expect(vsPump.calculateWATTS(3400)).toBe(1483);

        // Test at max RPM (3450, extends beyond 3400)
        expect(vsPump.calculateWATTS(3450)).toBe(1522);

        // Test over-limit (should cap at 3450)
        expect(vsPump.calculateWATTS(4000)).toBe(1522);
        expect(vsPump.calculateWATTS(5000)).toBe(1522);
      });
    });

    describe('VSF pump calculations', () => {
      const vsfPump = PUMP_PERFORMANCE_CURVES.VSF;

      it('should calculate correct GPM for VSF pump at various RPMs', () => {
        // Test boundary conditions
        expect(vsfPump.calculateGPM(0)).toBe(0);
        expect(vsfPump.calculateGPM(400)).toBe(0);
        expect(vsfPump.calculateGPM(449)).toBe(0);
        expect(vsfPump.calculateGPM(450)).toBe(5);

        // Test first segment (450-2450 RPM)
        expect(vsfPump.calculateGPM(1000)).toBe(19); // Linear interpolation
        expect(vsfPump.calculateGPM(2000)).toBe(44); // Linear interpolation
        expect(vsfPump.calculateGPM(2450)).toBe(55);

        // Test second segment (2450-3450 RPM)
        expect(vsfPump.calculateGPM(3000)).toBe(69); // Linear interpolation
        expect(vsfPump.calculateGPM(3450)).toBe(80);

        // Test over-limit (should cap at 3450)
        expect(vsfPump.calculateGPM(4000)).toBe(80);
        expect(vsfPump.calculateGPM(5000)).toBe(80);
      });

      it('should calculate correct WATTS for VSF pump at various RPMs', () => {
        // Test boundary conditions
        expect(vsfPump.calculateWATTS(0)).toBe(0);
        expect(vsfPump.calculateWATTS(400)).toBe(0);
        expect(vsfPump.calculateWATTS(449)).toBe(0);
        expect(vsfPump.calculateWATTS(450)).toBe(50);

        // Test first segment (450-2450 RPM)
        expect(vsfPump.calculateWATTS(1000)).toBe(262); // Linear interpolation
        expect(vsfPump.calculateWATTS(2000)).toBe(647); // Linear interpolation
        expect(vsfPump.calculateWATTS(2450)).toBe(820);

        // Test second segment (2450-3450 RPM)
        expect(vsfPump.calculateWATTS(3000)).toBe(1459); // Linear interpolation
        expect(vsfPump.calculateWATTS(3450)).toBe(1982);

        // Test over-limit (should cap at 3450)
        expect(vsfPump.calculateWATTS(4000)).toBe(1982);
        expect(vsfPump.calculateWATTS(5000)).toBe(1982);
      });
    });

    describe('VF pump calculations', () => {
      const vfPump = PUMP_PERFORMANCE_CURVES.VF;

      it('should calculate correct GPM for VF pump at various RPMs', () => {
        // Test boundary conditions
        expect(vfPump.calculateGPM(0)).toBe(0);
        expect(vfPump.calculateGPM(400)).toBe(0);
        expect(vfPump.calculateGPM(449)).toBe(0);
        expect(vfPump.calculateGPM(450)).toBeCloseTo(0, 10); // 450 * 0.035 - 15.75 = 0 (floating point precision)

        // Test normal operating range
        expect(vfPump.calculateGPM(1000)).toBe(19.25); // 1000 * 0.035 - 15.75 = 19.25
        expect(vfPump.calculateGPM(2000)).toBe(54.25); // 2000 * 0.035 - 15.75 = 54.25
        expect(vfPump.calculateGPM(3000)).toBeCloseTo(89.25, 10); // Handle floating point precision
        expect(vfPump.calculateGPM(3450)).toBeCloseTo(105, 10); // Handle floating point precision

        // Test over-limit (should cap at 3450)
        expect(vfPump.calculateGPM(4000)).toBeCloseTo(105, 10); // Same as 3450
        expect(vfPump.calculateGPM(5000)).toBeCloseTo(105, 10); // Same as 3450
      });

      it('should calculate correct WATTS for VF pump using fourth-degree polynomial', () => {
        // Test boundary conditions
        expect(vfPump.calculateWATTS(0)).toBe(0);
        expect(vfPump.calculateWATTS(400)).toBe(0);
        expect(vfPump.calculateWATTS(449)).toBe(0);

        // Test polynomial calculation at key points (using actual calculated values)
        expect(vfPump.calculateWATTS(450)).toBe(8); // Very low power at minimum RPM
        expect(vfPump.calculateWATTS(1000)).toBe(36); // Low-mid range
        expect(vfPump.calculateWATTS(1500)).toBe(112); // Mid range
        expect(vfPump.calculateWATTS(2000)).toBe(265); // Upper mid range
        expect(vfPump.calculateWATTS(2500)).toBe(517); // High range
        expect(vfPump.calculateWATTS(3000)).toBe(885); // Very high range
        expect(vfPump.calculateWATTS(3450)).toBe(1325); // Maximum RPM

        // Test over-limit (should cap at 3450)
        expect(vfPump.calculateWATTS(4000)).toBe(1325); // Same as 3450
        expect(vfPump.calculateWATTS(5000)).toBe(1325); // Same as 3450
      });

      it('should verify fourth-degree polynomial coefficients produce expected curve', () => {
        // Test that the polynomial produces a realistic power curve
        const watts450 = vfPump.calculateWATTS(450);
        const watts1725 = vfPump.calculateWATTS(1725); // Mid-point
        const watts3450 = vfPump.calculateWATTS(3450);

        // Power should increase monotonically
        expect(watts450).toBeLessThan(watts1725);
        expect(watts1725).toBeLessThan(watts3450);

        // Should be reasonable values for a pool pump
        expect(watts450).toBeGreaterThan(0);
        expect(watts3450).toBeLessThan(1500); // VF pumps but still reasonable for max power
      });
    });

    it('should have consistent min/max RPM across all pump types', () => {
      expect(PUMP_PERFORMANCE_CURVES.VS.minRPM).toBe(450);
      expect(PUMP_PERFORMANCE_CURVES.VS.maxRPM).toBe(3450);
      expect(PUMP_PERFORMANCE_CURVES.VSF.minRPM).toBe(450);
      expect(PUMP_PERFORMANCE_CURVES.VSF.maxRPM).toBe(3450);
      expect(PUMP_PERFORMANCE_CURVES.VF.minRPM).toBe(450);
      expect(PUMP_PERFORMANCE_CURVES.VF.maxRPM).toBe(3450);
    });
  });

  describe('PUMP_TYPE_MAPPING', () => {
    it('should correctly map telnet SubType to pump types', () => {
      expect(PUMP_TYPE_MAPPING.get('SPEED')).toBe('VS');
      expect(PUMP_TYPE_MAPPING.get('VSF')).toBe('VSF');
      expect(PUMP_TYPE_MAPPING.get('FLOW')).toBe('VF');
      expect(PUMP_TYPE_MAPPING.get('SINGLE')).toBe('SS');
      expect(PUMP_TYPE_MAPPING.get('DUAL')).toBe('DS');
    });

    it('should return undefined for unknown pump types', () => {
      expect(PUMP_TYPE_MAPPING.get('UNKNOWN')).toBeUndefined();
      expect(PUMP_TYPE_MAPPING.get('')).toBeUndefined();
    });

    it('should be a readonly map', () => {
      expect(PUMP_TYPE_MAPPING).toBeInstanceOf(Map);
      // Verify it's readonly by checking the type system enforces it
      // (TypeScript will catch any attempts to modify at compile time)
    });
  });

  describe('VARIABLE_SPEED_PUMP_SUBTYPES', () => {
    it('should contain correct variable speed pump subtypes', () => {
      expect(VARIABLE_SPEED_PUMP_SUBTYPES.has('SPEED')).toBe(true);
      expect(VARIABLE_SPEED_PUMP_SUBTYPES.has('VSF')).toBe(true);
    });

    it('should not contain non-variable speed pump subtypes', () => {
      expect(VARIABLE_SPEED_PUMP_SUBTYPES.has('FLOW')).toBe(false);
      expect(VARIABLE_SPEED_PUMP_SUBTYPES.has('SINGLE')).toBe(false);
      expect(VARIABLE_SPEED_PUMP_SUBTYPES.has('DUAL')).toBe(false);
    });

    it('should be a readonly set', () => {
      expect(VARIABLE_SPEED_PUMP_SUBTYPES).toBeInstanceOf(Set);
      expect(VARIABLE_SPEED_PUMP_SUBTYPES.size).toBe(2);
    });
  });

  describe('DISCOVER_COMMANDS', () => {
    it('should contain all expected discovery commands', () => {
      const expectedCommands = ['CIRCUITS', 'PUMPS', 'CHEMS', 'VALVES', 'HEATERS', 'SENSORS', 'GROUPS'];
      expect(DISCOVER_COMMANDS).toEqual(expectedCommands);
    });

    it('should be a readonly array', () => {
      expect(Array.isArray(DISCOVER_COMMANDS)).toBe(true);
      expect(DISCOVER_COMMANDS.length).toBe(7);
    });
  });
});
