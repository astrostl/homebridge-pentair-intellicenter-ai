import { PUMP_PERFORMANCE_CURVES } from '../../src/constants';

describe('Constants Complete Coverage', () => {
  describe('PUMP_PERFORMANCE_CURVES', () => {
    describe('VS pump calculations', () => {
      it('should handle RPM below minimum threshold', () => {
        const result = PUMP_PERFORMANCE_CURVES.VS.calculateWATTS(400);
        expect(result).toBe(0);
      });

      it('should cap RPM at maximum threshold', () => {
        const result = PUMP_PERFORMANCE_CURVES.VS.calculateWATTS(4000);
        // Should cap at 3450 RPM and calculate accordingly
        expect(result).toBeGreaterThan(0);
        expect(result).toBeLessThan(2000); // Reasonable upper bound
      });

      it('should calculate WATTS for RPM in lower range (≤1800)', () => {
        const result = PUMP_PERFORMANCE_CURVES.VS.calculateWATTS(1500);
        expect(result).toBeGreaterThan(0);
        expect(result).toBeLessThan(300); // Should be in reasonable range
      });

      it('should calculate WATTS for RPM in upper range (>1800)', () => {
        const result = PUMP_PERFORMANCE_CURVES.VS.calculateWATTS(2500);
        expect(result).toBeGreaterThan(200);
        expect(result).toBeLessThan(1500); // Should be in reasonable range
      });

      it('should handle exact boundary values', () => {
        const result450 = PUMP_PERFORMANCE_CURVES.VS.calculateWATTS(450);
        const result1800 = PUMP_PERFORMANCE_CURVES.VS.calculateWATTS(1800);
        const result3450 = PUMP_PERFORMANCE_CURVES.VS.calculateWATTS(3450);

        expect(result450).toBeGreaterThan(0);
        expect(result1800).toBe(225); // Known calibration point
        expect(result3450).toBeGreaterThan(result1800);
      });
    });

    describe('VSF pump calculations', () => {
      it('should handle RPM below minimum threshold', () => {
        const result = PUMP_PERFORMANCE_CURVES.VSF.calculateWATTS(400);
        expect(result).toBe(0);
      });

      it('should cap RPM at maximum threshold', () => {
        const result = PUMP_PERFORMANCE_CURVES.VSF.calculateWATTS(4000);
        // Should cap at 3450 RPM and calculate accordingly
        expect(result).toBeGreaterThan(0);
        expect(result).toBeLessThan(2500); // Reasonable upper bound for VSF
      });

      it('should calculate WATTS for RPM in lower range (≤2450)', () => {
        const result = PUMP_PERFORMANCE_CURVES.VSF.calculateWATTS(2000);
        expect(result).toBeGreaterThan(0);
        expect(result).toBeLessThan(900); // Should be in reasonable range
      });

      it('should calculate WATTS for RPM in upper range (>2450)', () => {
        const result = PUMP_PERFORMANCE_CURVES.VSF.calculateWATTS(3000);
        expect(result).toBeGreaterThan(800);
        expect(result).toBeLessThan(2000); // Should be in reasonable range
      });

      it('should handle exact boundary values', () => {
        const result450 = PUMP_PERFORMANCE_CURVES.VSF.calculateWATTS(450);
        const result2450 = PUMP_PERFORMANCE_CURVES.VSF.calculateWATTS(2450);
        const result3450 = PUMP_PERFORMANCE_CURVES.VSF.calculateWATTS(3450);

        expect(result450).toBeGreaterThan(0);
        expect(result2450).toBe(820); // Known calibration point
        expect(result3450).toBe(1982); // Known calibration point
      });

      it('should have different performance characteristics than VS pump', () => {
        const vsResult = PUMP_PERFORMANCE_CURVES.VS.calculateWATTS(3000);
        const vsfResult = PUMP_PERFORMANCE_CURVES.VSF.calculateWATTS(3000);

        // VSF pumps typically consume more power than VS pumps at same RPM
        expect(vsfResult).toBeGreaterThan(vsResult);
      });
    });

    describe('Edge cases and validation', () => {
      it('should handle zero RPM', () => {
        expect(PUMP_PERFORMANCE_CURVES.VS.calculateWATTS(0)).toBe(0);
        expect(PUMP_PERFORMANCE_CURVES.VSF.calculateWATTS(0)).toBe(0);
      });

      it('should handle negative RPM', () => {
        expect(PUMP_PERFORMANCE_CURVES.VS.calculateWATTS(-100)).toBe(0);
        expect(PUMP_PERFORMANCE_CURVES.VSF.calculateWATTS(-100)).toBe(0);
      });

      it('should return integer values (rounded)', () => {
        const vsResult = PUMP_PERFORMANCE_CURVES.VS.calculateWATTS(1234);
        const vsfResult = PUMP_PERFORMANCE_CURVES.VSF.calculateWATTS(2345);

        expect(Number.isInteger(vsResult)).toBe(true);
        expect(Number.isInteger(vsfResult)).toBe(true);
      });

      it('should be monotonically increasing within valid range', () => {
        const testRPMs = [500, 1000, 1500, 2000, 2500, 3000, 3400];

        // Test VS pump
        let previousVSWatts = 0;
        testRPMs.forEach(rpm => {
          const watts = PUMP_PERFORMANCE_CURVES.VS.calculateWATTS(rpm);
          expect(watts).toBeGreaterThanOrEqual(previousVSWatts);
          previousVSWatts = watts;
        });

        // Test VSF pump
        let previousVSFWatts = 0;
        testRPMs.forEach(rpm => {
          const watts = PUMP_PERFORMANCE_CURVES.VSF.calculateWATTS(rpm);
          expect(watts).toBeGreaterThanOrEqual(previousVSFWatts);
          previousVSFWatts = watts;
        });
      });

      it('should have reasonable power consumption ranges', () => {
        // Test various RPM values for realistic power consumption
        const testCases = [
          { rpm: 600, minWatts: 20, maxWatts: 150 },
          { rpm: 1200, minWatts: 80, maxWatts: 400 },
          { rpm: 2400, minWatts: 300, maxWatts: 1200 },
          { rpm: 3200, minWatts: 800, maxWatts: 2200 },
        ];

        testCases.forEach(({ rpm, minWatts, maxWatts }) => {
          const vsWatts = PUMP_PERFORMANCE_CURVES.VS.calculateWATTS(rpm);
          const vsfWatts = PUMP_PERFORMANCE_CURVES.VSF.calculateWATTS(rpm);

          expect(vsWatts).toBeGreaterThanOrEqual(minWatts);
          expect(vsWatts).toBeLessThanOrEqual(maxWatts);
          expect(vsfWatts).toBeGreaterThanOrEqual(minWatts);
          expect(vsfWatts).toBeLessThanOrEqual(maxWatts);
        });
      });
    });

    describe('Performance curve consistency', () => {
      it('should maintain consistent calculation methods between pump types', () => {
        // Both pump types should handle edge cases consistently
        expect(PUMP_PERFORMANCE_CURVES.VS.calculateWATTS(449)).toBe(0);
        expect(PUMP_PERFORMANCE_CURVES.VSF.calculateWATTS(449)).toBe(0);

        // Both should cap at max RPM
        const vsMax = PUMP_PERFORMANCE_CURVES.VS.calculateWATTS(5000);
        const vsfMax = PUMP_PERFORMANCE_CURVES.VSF.calculateWATTS(5000);
        const vs3450 = PUMP_PERFORMANCE_CURVES.VS.calculateWATTS(3450);
        const vsf3450 = PUMP_PERFORMANCE_CURVES.VSF.calculateWATTS(3450);

        expect(vsMax).toBe(vs3450);
        expect(vsfMax).toBe(vsf3450);
      });

      it('should provide smooth transitions at boundary points', () => {
        // Test smooth transitions around boundary points
        const vsJustBelow1800 = PUMP_PERFORMANCE_CURVES.VS.calculateWATTS(1799);
        const vsJustAt1800 = PUMP_PERFORMANCE_CURVES.VS.calculateWATTS(1800);
        const vsJustAbove1800 = PUMP_PERFORMANCE_CURVES.VS.calculateWATTS(1801);

        // Should be close values (smooth transition)
        expect(Math.abs(vsJustAt1800 - vsJustBelow1800)).toBeLessThan(5);
        expect(Math.abs(vsJustAbove1800 - vsJustAt1800)).toBeLessThan(5);

        const vsfJustBelow2450 = PUMP_PERFORMANCE_CURVES.VSF.calculateWATTS(2449);
        const vsfJustAt2450 = PUMP_PERFORMANCE_CURVES.VSF.calculateWATTS(2450);
        const vsfJustAbove2450 = PUMP_PERFORMANCE_CURVES.VSF.calculateWATTS(2451);

        expect(Math.abs(vsfJustAt2450 - vsfJustBelow2450)).toBeLessThan(5);
        expect(Math.abs(vsfJustAbove2450 - vsfJustAt2450)).toBeLessThan(5);
      });
    });
  });
});
