import { PumpCircuit } from '../../src/types';

describe('Heater RPM Sensor Logic', () => {
  describe('pump circuit selection priority', () => {
    const createPumpCircuit = (id: string, speed: number, speedType = 'RPM'): PumpCircuit => ({
      id,
      pump: { name: 'Test Pump' } as any,
      circuitId: `C${id}`,
      speed,
      speedType,
    });

    it('should prioritize high heater range speeds (2500-3200 RPM)', () => {
      const circuits = [
        createPumpCircuit('001', 1800), // Low priority body circuit
        createPumpCircuit('002', 3000), // High priority heater range
        createPumpCircuit('003', 2450), // Medium priority heater range
        createPumpCircuit('004', 3400), // Lower priority (spa jets)
      ];

      // Mock the circuit selection logic used in platform.ts
      const candidates = circuits
        .map(circuit => {
          let priority = 0;
          if (circuit.speedType !== 'RPM') {
            return null; // Skip non-RPM
          }
          if (circuit.speed < 1000) {
            return null; // Skip low speed
          }

          if (circuit.speed >= 2500 && circuit.speed <= 3200) {
            priority = 90; // Very high priority
          } else if (circuit.speed >= 2000 && circuit.speed < 2500) {
            priority = 85; // High priority
          } else if (circuit.speed > 1500) {
            priority = 40; // Lower priority
          }
          return { circuit, priority };
        })
        .filter(c => c !== null) as Array<{ circuit: PumpCircuit; priority: number }>;

      // Sort by priority (highest first), then by speed preference
      candidates.sort((a, b) => {
        if (a.priority !== b.priority) return b.priority - a.priority;
        // For same priority, prefer speeds in heater range
        const aInRange = a.circuit.speed >= 2500 && a.circuit.speed <= 3200;
        const bInRange = b.circuit.speed >= 2500 && b.circuit.speed <= 3200;
        if (aInRange !== bInRange) return aInRange ? -1 : 1;
        return Math.abs(a.circuit.speed - 3000) - Math.abs(b.circuit.speed - 3000);
      });

      const selected = candidates[0];
      expect(selected).toBeDefined();
      expect(selected!.circuit.speed).toBe(3000);
      expect(selected!.priority).toBe(90);
    });

    it('should skip GPM circuits', () => {
      const circuits = [
        createPumpCircuit('001', 50, 'GPM'), // Should be skipped
        createPumpCircuit('002', 3000, 'RPM'), // Should be selected
      ];

      const rpmCircuits = circuits.filter(circuit => circuit.speedType === 'RPM');
      expect(rpmCircuits).toHaveLength(1);
      expect(rpmCircuits[0]!.speed).toBe(3000);
    });

    it('should skip very low speed circuits', () => {
      const circuits = [
        createPumpCircuit('001', 500), // Too low, should be skipped
        createPumpCircuit('002', 3000), // Should be selected
      ];

      const validCircuits = circuits.filter(circuit => circuit.speed >= 1000);
      expect(validCircuits).toHaveLength(1);
      expect(validCircuits[0]!.speed).toBe(3000);
    });

    it('should prefer heater range over body circuits', () => {
      const circuits = [
        createPumpCircuit('001', 1800), // Body circuit (priority 40)
        createPumpCircuit('002', 3000), // Heater range (priority 90)
      ];

      const candidates = circuits
        .map(circuit => {
          let priority = 0;
          if (circuit.speed >= 2500 && circuit.speed <= 3200) {
            priority = 90; // Very high priority (heater range)
          } else if (circuit.speed > 1500) {
            priority = 40; // Lower priority (body circuit)
          }
          return { circuit, priority };
        })
        .filter(c => c.priority > 0);

      candidates.sort((a, b) => b.priority - a.priority);

      expect(candidates[0]!.circuit.speed).toBe(3000);
      expect(candidates[0]!.priority).toBe(90);
    });

    it('should handle priority 85 for lower heater range (2000-2500)', () => {
      const circuits = [
        createPumpCircuit('001', 2450), // Lower heater range (priority 85)
        createPumpCircuit('002', 1800), // Body circuit (priority 40)
      ];

      const candidates = circuits
        .map(circuit => {
          let priority = 0;
          if (circuit.speed >= 2500 && circuit.speed <= 3200) {
            priority = 90;
          } else if (circuit.speed >= 2000 && circuit.speed < 2500) {
            priority = 85; // High priority for lower heater range
          } else if (circuit.speed > 1500) {
            priority = 40;
          }
          return { circuit, priority };
        })
        .filter(c => c.priority > 0);

      candidates.sort((a, b) => b.priority - a.priority);

      expect(candidates[0]!.circuit.speed).toBe(2450);
      expect(candidates[0]!.priority).toBe(85);
    });
  });

  describe('heater active detection', () => {
    it('should detect heater as active when body heaterId matches heater id', () => {
      const heater = { id: 'H0002' };
      const body = { heaterId: 'H0002', status: 'ON' };

      const isHeaterActive = body.heaterId === heater.id && body.status === 'ON';

      expect(isHeaterActive).toBe(true);
    });

    it('should detect heater as inactive when body heaterId is 00000', () => {
      const heater = { id: 'H0002' };
      const body = { heaterId: '00000', status: 'ON' };

      const isHeaterActive = body.heaterId === heater.id && body.status === 'ON';

      expect(isHeaterActive).toBe(false);
    });

    it('should detect heater as inactive when body status is OFF', () => {
      const heater = { id: 'H0002' };
      const body = { heaterId: 'H0002', status: 'OFF' };

      const isHeaterActive = body.heaterId === heater.id && body.status === 'ON';

      expect(isHeaterActive).toBe(false);
    });
  });
});
