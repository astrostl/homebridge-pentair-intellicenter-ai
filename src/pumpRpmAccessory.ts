import { PlatformAccessory, Service } from 'homebridge';

import { PentairPlatform } from './platform';
import { Pump, CircuitStatus } from './types';
import { MANUFACTURER } from './settings';

const MODEL = 'Pump RPM Sensor';

/**
 * Pump RPM Accessory
 * Displays RPM for pumps as a light sensor (lux value) for easy visualization in Home app
 * Each pump gets its own dedicated RPM sensor showing the current operating RPM
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

    // Set the service name to match the accessory display name
    this.service.setCharacteristic(this.platform.Characteristic.Name, this.accessory.displayName);

    // Set initial RPM value
    this.updateRpm(this.getCurrentRpm());

    // Configure the current ambient light level characteristic
    this.service.getCharacteristic(this.platform.Characteristic.CurrentAmbientLightLevel).onGet(this.getRpm.bind(this));
  }

  /**
   * Get current RPM from this pump
   * Shows the pump's actual operating RPM based on active circuits
   */
  private getCurrentRpm(): number {
    this.platform.log.debug(`${this.accessory.displayName}: Dynamically calculating RPM for pump ${this.pump.id}`);

    // Find the highest speed from all active pump circuits (same logic as WATTS sensor)
    const highestActiveRpm = this.getHighestActivePumpSpeed();

    this.platform.log.debug(`  Highest active RPM: ${highestActiveRpm}`);

    if (highestActiveRpm > 0) {
      this.platform.log.debug(`  Result: ${highestActiveRpm} RPM (active circuits)`);
      return highestActiveRpm;
    } else {
      this.platform.log.debug('  Result: 0.0001 RPM (no active circuits)');
      return 0.0001; // HomeKit Light Sensor minimum value
    }
  }

  /**
   * Find the highest speed from all active pump circuits (same logic as WATTS sensor)
   */
  private getHighestActivePumpSpeed(): number {
    if (!this.pump.circuits || this.pump.circuits.length === 0) {
      return 0;
    }

    let highestSpeed = 0;
    const activeSpeeds: number[] = [];

    // Check all pump circuits and find active ones with their speeds
    for (const pumpCircuit of this.pump.circuits) {
      this.platform.log.debug(`  Checking pump circuit ${pumpCircuit.id} -> ${pumpCircuit.circuitId}:`);
      this.platform.log.debug(`    - Speed: ${pumpCircuit.speed} (type: ${typeof pumpCircuit.speed})`);

      // Ensure speed is a number
      const speed = Number(pumpCircuit.speed);

      if (speed && speed > 0) {
        // Check if this circuit is active by finding corresponding feature/circuit
        const isActive = this.isPumpCircuitActive(pumpCircuit.circuitId);
        this.platform.log.debug(`    - Is Active: ${isActive}`);

        if (isActive) {
          activeSpeeds.push(speed);
          this.platform.log.debug(`    - Added to active speeds: ${speed} RPM`);

          if (speed > highestSpeed) {
            this.platform.log.debug(`    - NEW HIGHEST: ${speed} RPM (was ${highestSpeed}) [${speed} > ${highestSpeed}]`);
            highestSpeed = speed;
          } else {
            this.platform.log.debug(`    - Not highest: ${speed} <= ${highestSpeed} [${speed} <= ${highestSpeed}]`);
          }
        } else {
          this.platform.log.debug('    - Circuit inactive, skipping');
        }
      } else {
        this.platform.log.debug(`    - No speed or zero speed, skipping (speed=${speed})`);
      }
    }

    this.platform.log.debug(`${this.pump.name}: Active pump speeds: [${activeSpeeds.join(', ')}], highest: ${highestSpeed} RPM`);
    return highestSpeed;
  }

  /**
   * Check if a pump circuit is currently active by looking for corresponding feature/circuit status
   */
  private isPumpCircuitActive(circuitId: string): boolean {
    this.platform.log.debug(`      Looking for circuit ${circuitId} in accessories...`);

    // Search through all discovered accessories to find the one with this circuit ID
    for (const [, accessory] of this.platform.accessoryMap) {
      if (accessory.context.circuit && accessory.context.circuit.id === circuitId) {
        const isOn = accessory.context.circuit.status === CircuitStatus.On;
        this.platform.log.debug(`      Found circuit ${circuitId}: status = ${accessory.context.circuit.status}, active = ${isOn}`);
        return isOn;
      }
      // Also check feature contexts
      if (accessory.context.feature && accessory.context.feature.id === circuitId) {
        const isOn = accessory.context.feature.status === CircuitStatus.On;
        this.platform.log.debug(`      Found feature ${circuitId}: status = ${accessory.context.feature.status}, active = ${isOn}`);
        return isOn;
      }
      // Also check body contexts (for Pool, Spa, etc.)
      if (accessory.context.body && accessory.context.body.circuit?.id === circuitId) {
        const isOn = accessory.context.body.status === CircuitStatus.On;
        this.platform.log.debug(`      Found body circuit ${circuitId}: status = ${accessory.context.body.status}, active = ${isOn}`);
        return isOn;
      }
    }

    // Check if this is an internal heater circuit (like X0051) that should be active when heaters are running
    if (circuitId && circuitId.startsWith('X')) {
      this.platform.log.debug(`      Circuit ${circuitId} appears to be internal heater circuit, checking heater status...`);

      // Check if any body has a heater that is actively calling for heat
      for (const [, accessory] of this.platform.accessoryMap) {
        if (accessory.context.body && accessory.context.body.status === CircuitStatus.On) {
          const body = accessory.context.body;

          // Check if this body has a heater assigned and is actively heating
          if (body.heaterId && body.heaterId !== '00000') {
            // Debug: log all body fields to see what's available
            this.platform.log.debug(`[homebridge-pentair-intellicenter-ai] Body ${body.name} ALL FIELDS: ${JSON.stringify(body)}`);

            // Check if heater is actively calling for heat by comparing current temp to set point
            const currentTemp = Number(body.temperature) || 0;
            const setPoint = Number(body.lowTemperature) || 0;
            const isActivelyHeating = currentTemp < setPoint;

            this.platform.log.debug(
              `[homebridge-pentair-intellicenter-ai] Body ${body.name}: heater ${body.heaterId}, ` +
                `temp ${currentTemp}°F, setpoint ${setPoint}°F, actively heating: ${isActivelyHeating} ` +
                `[${currentTemp} < ${setPoint} = ${currentTemp < setPoint}]`,
            );

            if (isActivelyHeating) {
              this.platform.log.debug(`      Found actively heating heater for body ${body.name}, circuit ${circuitId} is active`);
              return true;
            }
          }
        }
      }

      this.platform.log.debug(`      No actively heating heaters found, circuit ${circuitId} is inactive`);
      return false;
    }

    // If we can't find the circuit, assume it's inactive
    this.platform.log.debug(`      Circuit ${circuitId} not found in accessories, assuming inactive`);
    return false;
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
   * Update the RPM display (called when pump RPM changes)
   */
  updateRpm(rpm: number) {
    this.platform.log.debug(`Updating ${this.pump.name} RPM display to: ${rpm}`);

    // Update the light sensor value - RPM maps directly to lux (1:1 ratio)
    this.service.updateCharacteristic(this.platform.Characteristic.CurrentAmbientLightLevel, rpm);
  }
}
