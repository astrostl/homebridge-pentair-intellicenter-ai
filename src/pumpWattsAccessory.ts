import { PlatformAccessory, Service } from 'homebridge';

import { PentairPlatform } from './platform';
import { Pump, CircuitStatus } from './types';
import { MANUFACTURER } from './settings';
import { PUMP_TYPE_MAPPING, PUMP_PERFORMANCE_CURVES } from './constants';

const MODEL = 'Pump WATTS Sensor';

/**
 * Pump WATTS Accessory
 * Displays calculated WATTS (power consumption) for pumps as a light sensor (lux value) for easy visualization in Home app
 * Each physical pump gets its own dedicated WATTS sensor based on the pump name and type
 */
export class PumpWattsAccessory {
  private service: Service;
  private pump: Pump;
  private pumpType: string;
  private currentRpm = 0;
  private systemDrivenRpm = 0; // Track heater/system driven speeds separately
  private lastSystemUpdate = 0; // Timestamp of last system update

  constructor(
    private readonly platform: PentairPlatform,
    private readonly accessory: PlatformAccessory,
  ) {
    this.pump = accessory.context.pump as Pump;

    // Map telnet SubType to actual pump type (SPEED -> VS, VSF -> VSF)
    this.pumpType = PUMP_TYPE_MAPPING.get(this.pump.type) || 'VS';

    // Set accessory information
    this.accessory
      .getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, MANUFACTURER)
      .setCharacteristic(this.platform.Characteristic.Model, MODEL)
      .setCharacteristic(this.platform.Characteristic.SerialNumber, `WATTS-${this.pump.id}`);

    // Get or create the Light Sensor service
    this.service =
      this.accessory.getService(this.platform.Service.LightSensor) || this.accessory.addService(this.platform.Service.LightSensor);

    // Set the service name to match the accessory display name
    this.service.setCharacteristic(this.platform.Characteristic.Name, this.accessory.displayName);

    // Set initial WATTS value
    this.updateWatts(this.getCurrentWatts());

    // Configure the current ambient light level characteristic
    this.service.getCharacteristic(this.platform.Characteristic.CurrentAmbientLightLevel).onGet(this.getWatts.bind(this));
  }

  /**
   * Calculate current WATTS from highest active pump circuit speed or system-driven speed
   */
  private getCurrentWatts(): number {
    // Find the highest speed from all active pump circuits
    const highestActiveRpm = this.getHighestActivePumpSpeed();

    // Strategy: Use system-driven speeds (heater) if recent, otherwise use active circuits
    let effectiveRpm = highestActiveRpm;
    let source = 'active circuits';

    // Check if we have a recent system-driven speed update (within last 30 seconds)
    const now = Date.now();
    const systemUpdateAge = now - this.lastSystemUpdate;
    const isSystemUpdateRecent = systemUpdateAge < 30000; // 30 seconds

    if (isSystemUpdateRecent && this.systemDrivenRpm > 0) {
      effectiveRpm = this.systemDrivenRpm;
      source = `system update (${Math.round(systemUpdateAge / 1000)}s ago)`;
      this.platform.log.debug(
        `${this.accessory.displayName}: Using system-driven speed ${this.systemDrivenRpm} RPM ` +
          `(age: ${Math.round(systemUpdateAge / 1000)}s, active circuits: ${highestActiveRpm} RPM)`,
      );
    } else if (this.systemDrivenRpm > 0 && !isSystemUpdateRecent) {
      // System update is old, fall back to active circuits
      this.systemDrivenRpm = 0; // Clear old system speed
      this.platform.log.debug(
        `${this.accessory.displayName}: System update too old (${Math.round(systemUpdateAge / 1000)}s), ` +
          `falling back to active circuits: ${highestActiveRpm} RPM`,
      );
    }

    if (effectiveRpm <= 0) {
      return 0.0001; // HomeKit Light Sensor minimum value for inactive pumps
    }

    const pumpCurve = PUMP_PERFORMANCE_CURVES[this.pumpType as keyof typeof PUMP_PERFORMANCE_CURVES];
    if (!pumpCurve) {
      this.platform.log.warn(`Unknown pump type: ${this.pumpType} for pump ${this.pump.name}. Using VS curves.`);
      return PUMP_PERFORMANCE_CURVES.VS.calculateWATTS(effectiveRpm);
    }

    const calculatedWatts = pumpCurve.calculateWATTS(effectiveRpm);
    this.platform.log.debug(
      `${this.accessory.displayName}: Calculating WATTS for ${this.pumpType} pump at ${effectiveRpm} RPM ` +
        `(source: ${source}) = ${calculatedWatts} WATTS`,
    );

    return Math.max(0.0001, calculatedWatts); // Ensure minimum HomeKit value
  }

  /**
   * Find the highest speed from all active pump circuits
   */
  private getHighestActivePumpSpeed(): number {
    if (!this.pump.circuits || this.pump.circuits.length === 0) {
      return 0;
    }

    let highestSpeed = 0;
    const activeSpeeds: number[] = [];

    // Check all pump circuits and find active ones with their speeds
    for (const pumpCircuit of this.pump.circuits) {
      // We need to find the corresponding feature/circuit to check if it's active
      // For now, we'll use the pump circuit speed if it's > 0 and has status
      if (pumpCircuit.speed && pumpCircuit.speed > 0) {
        // Try to determine if this circuit is active by checking if we can find
        // a corresponding feature or circuit that's ON
        const isActive = this.isPumpCircuitActive(pumpCircuit.circuitId);
        if (isActive) {
          activeSpeeds.push(pumpCircuit.speed);
          if (pumpCircuit.speed > highestSpeed) {
            highestSpeed = pumpCircuit.speed;
          }
        }
      }
    }

    this.platform.log.debug(`${this.pump.name}: Active pump speeds: [${activeSpeeds.join(', ')}], highest: ${highestSpeed} RPM`);

    return highestSpeed;
  }

  /**
   * Check if a pump circuit is currently active by looking for corresponding feature/circuit status
   */
  private isPumpCircuitActive(circuitId: string): boolean {
    // Search through all discovered accessories to find the one with this circuit ID
    // and check if its status is ON
    for (const [, accessory] of this.platform.accessoryMap) {
      if (accessory.context.circuit && accessory.context.circuit.id === circuitId) {
        const isOn = accessory.context.circuit.status === CircuitStatus.On;
        this.platform.log.debug(`Found circuit ${circuitId}: status = ${accessory.context.circuit.status}, active = ${isOn}`);
        return isOn;
      }
      // Also check body contexts (for Pool, Spa, etc.)
      if (accessory.context.body && accessory.context.body.circuit?.id === circuitId) {
        const isOn = accessory.context.body.status === CircuitStatus.On;
        this.platform.log.debug(`Found body circuit ${circuitId}: status = ${accessory.context.body.status}, active = ${isOn}`);
        return isOn;
      }
    }

    // If we can't find the circuit, assume it's inactive
    this.platform.log.debug(`Circuit ${circuitId} not found in accessories, assuming inactive`);
    return false;
  }

  /**
   * Handle requests to get the current WATTS value
   */
  async getWatts() {
    const watts = this.getCurrentWatts();
    this.platform.log.debug(`Get WATTS for ${this.pump.name}: ${watts}`);
    return watts;
  }

  /**
   * Update the current RPM and recalculate WATTS (for circuit-driven updates)
   */
  updateSpeed(rpm: number) {
    this.platform.log.debug(`${this.pump.name} updateSpeed called with ${rpm} RPM (previous: ${this.currentRpm} RPM)`);
    this.currentRpm = rpm;
    const newWatts = this.getCurrentWatts();
    this.updateWatts(newWatts);
    this.platform.log.debug(`${this.pump.name} speed updated to ${rpm} RPM, calculated WATTS: ${newWatts}`);
  }

  /**
   * Update system-driven RPM (for heater/standalone pump updates)
   */
  updateSystemSpeed(rpm: number) {
    this.platform.log.debug(`${this.pump.name} updateSystemSpeed called with ${rpm} RPM (previous system: ${this.systemDrivenRpm} RPM)`);
    this.systemDrivenRpm = rpm;
    this.lastSystemUpdate = Date.now();
    const newWatts = this.getCurrentWatts();
    this.updateWatts(newWatts);
    this.platform.log.debug(`${this.pump.name} system speed updated to ${rpm} RPM, calculated WATTS: ${newWatts}`);
  }

  /**
   * Update the WATTS display (called when pump speed changes)
   */
  updateWatts(watts: number) {
    this.platform.log.debug(`Updating ${this.pump.name} WATTS display to: ${watts}`);

    // Update the light sensor value - WATTS maps directly to lux (1:1 ratio)
    this.service.updateCharacteristic(this.platform.Characteristic.CurrentAmbientLightLevel, watts);
  }

  /**
   * Get the current pump type for debugging
   */
  getPumpType(): string {
    return this.pumpType;
  }

  /**
   * Get the current RPM for debugging
   */
  getCurrentRpm(): number {
    return this.currentRpm;
  }
}
