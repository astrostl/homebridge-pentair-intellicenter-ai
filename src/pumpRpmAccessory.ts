import { PlatformAccessory, Service } from 'homebridge';

import { PentairPlatform } from './platform';
import { Pump, CircuitStatus } from './types';
import { MANUFACTURER } from './settings';

const MODEL = 'Pump RPM Sensor';

/**
 * Pump RPM Accessory
 * Displays pump RPM as a light sensor (lux value) for easy visualization in Home app
 */
export class PumpRpmAccessory {
  private service: Service;
  private pump: Pump;

  constructor(
    private readonly platform: PentairPlatform,
    private readonly accessory: PlatformAccessory,
  ) {
    this.pump = accessory.context.pump as Pump;

    // Set accessory information
    this.accessory
      .getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, MANUFACTURER)
      .setCharacteristic(this.platform.Characteristic.Model, MODEL)
      .setCharacteristic(this.platform.Characteristic.SerialNumber, `RPM-${this.pump.id}`);

    // Get or create the Light Sensor service
    this.service =
      this.accessory.getService(this.platform.Service.LightSensor) || this.accessory.addService(this.platform.Service.LightSensor);

    // Set the service name
    this.service.setCharacteristic(this.platform.Characteristic.Name, `${this.pump.name} RPM`);

    // Set initial RPM value
    this.updateRpm(this.getCurrentRpm());

    // Configure the current ambient light level characteristic
    this.service.getCharacteristic(this.platform.Characteristic.CurrentAmbientLightLevel).onGet(this.getRpm.bind(this));
  }

  /**
   * Get current RPM from pump circuits
   */
  private getCurrentRpm(): number {
    if (!this.pump.circuits || this.pump.circuits.length === 0) {
      this.platform.log.debug(`${this.pump.name} RPM: No circuits available`);
      return 0.0001; // HomeKit Light Sensor minimum value
    }

    // Find the pump circuit with the highest RPM that is currently active (ON)
    // In VSP systems, only active circuits should contribute to the displayed RPM
    let maxRpm = 0;
    this.platform.log.debug(`${this.pump.name} RPM: Checking ${this.pump.circuits.length} circuits:`);

    for (const circuit of this.pump.circuits) {
      this.platform.log.debug(`  Circuit ${circuit.id}: status=${circuit.status}, speed=${circuit.speed}, speedType=${circuit.speedType}`);
      this.platform.log.debug(`    Linked to circuit ID: ${circuit.circuitId}`);

      // Check if speed exists and is greater than current max
      if (circuit.speed && circuit.speed > maxRpm) {
        this.platform.log.debug(`    -> Potential RPM: ${circuit.speed} (status: ${circuit.status})`);

        // Get the status from the linked circuit if pump circuit status is undefined
        let circuitIsActive = circuit.status === CircuitStatus.On;

        if (!circuit.status && circuit.circuitId) {
          // Try to find the linked circuit in the platform's accessory map
          const linkedCircuitUUID = this.platform.api.hap.uuid.generate(circuit.circuitId);
          const linkedAccessory = this.platform.accessoryMap.get(linkedCircuitUUID);

          this.platform.log.debug(`    -> Looking for linked circuit ${circuit.circuitId} with UUID: ${linkedCircuitUUID}`);

          if (linkedAccessory && linkedAccessory.context.circuit) {
            const linkedCircuitStatus = linkedAccessory.context.circuit.status;
            this.platform.log.debug(`    -> Linked circuit ${circuit.circuitId} status: ${linkedCircuitStatus}`);
            circuitIsActive = linkedCircuitStatus === CircuitStatus.On;
          } else {
            this.platform.log.debug(`    -> Linked circuit ${circuit.circuitId} not found in accessory map`);

            // Dynamic fallback: Search for active circuits that could be related to this pump
            // This is a heuristic approach for systems where pump circuits don't directly map
            this.platform.log.debug(`    -> Searching for active circuits as fallback for pump circuit ${circuit.circuitId}`);

            let foundActiveCircuit = false;
            this.platform.accessoryMap.forEach((accessory, _uuid) => {
              if (accessory.context.circuit && accessory.context.circuit.status === CircuitStatus.On) {
                const circuitName = accessory.context.circuit.name?.toLowerCase() || '';
                const pumpName = this.pump.name?.toLowerCase() || '';

                // Check if the active circuit name relates to this pump (pool pump → pool circuit, spa pump → spa circuit, etc.)
                if (pumpName.includes('pool') && circuitName.includes('pool') && !circuitName.includes('light')) {
                  this.platform.log.debug(
                    `    -> Found potential pool circuit match: ${accessory.context.circuit.name} (${accessory.context.circuit.id})`,
                  );
                  circuitIsActive = true;
                  foundActiveCircuit = true;
                } else if (pumpName.includes('spa') && circuitName.includes('spa') && !circuitName.includes('light')) {
                  this.platform.log.debug(
                    `    -> Found potential spa circuit match: ${accessory.context.circuit.name} (${accessory.context.circuit.id})`,
                  );
                  circuitIsActive = true;
                  foundActiveCircuit = true;
                }
              }
            });

            if (!foundActiveCircuit) {
              this.platform.log.debug(`    -> No active related circuits found for pump ${this.pump.name}, circuit ${circuit.circuitId}`);
            }
          }
        }

        // Only use this RPM if the circuit (or its linked circuit) is active
        if (circuitIsActive) {
          maxRpm = circuit.speed;
          this.platform.log.debug(`    -> New max RPM: ${maxRpm} (circuit active)`);
        } else {
          this.platform.log.debug(`    -> Skipping RPM: ${circuit.speed} (circuit inactive)`);
        }
      }
    }

    // HomeKit Light Sensor minimum value is 0.0001, so use that instead of 0
    const result = maxRpm > 0 ? maxRpm : 0.0001;
    this.platform.log.debug(`${this.pump.name} RPM: Final result = ${result}`);
    return result;
  }

  /**
   * Handle requests to get the current RPM value
   */
  async getRpm() {
    const rpm = this.getCurrentRpm();
    this.platform.log.debug(`Get RPM for ${this.pump.name}: ${rpm}`);
    return rpm;
  }

  /**
   * Update the RPM display (called when pump speed changes)
   */
  updateRpm(rpm: number) {
    this.platform.log.debug(`Updating ${this.pump.name} RPM display to: ${rpm}`);

    // Update the light sensor value - RPM maps directly to lux (1:1 ratio)
    this.service.updateCharacteristic(this.platform.Characteristic.CurrentAmbientLightLevel, rpm);
  }
}
