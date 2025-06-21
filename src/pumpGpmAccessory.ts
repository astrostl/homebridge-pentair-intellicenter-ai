import { PlatformAccessory, Service } from 'homebridge';

import { PentairPlatform } from './platform';
import { Pump, CircuitStatus } from './types';
import { MANUFACTURER } from './settings';
import { PUMP_TYPE_MAPPING, PUMP_PERFORMANCE_CURVES } from './constants';

const MODEL = 'Pump GPM Sensor';

/**
 * Pump GPM Accessory
 * Displays calculated GPM (flow rate) for pumps as a light sensor (lux value) for easy visualization in Home app
 * Each physical pump gets its own dedicated GPM sensor based on the pump name and type
 */
export class PumpGpmAccessory {
  private service: Service;
  private pump: Pump;
  private pumpType: string;
  private currentRpm = 0;

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
      .setCharacteristic(this.platform.Characteristic.SerialNumber, `GPM-${this.pump.id}`);

    // Get or create the Light Sensor service
    this.service =
      this.accessory.getService(this.platform.Service.LightSensor) || this.accessory.addService(this.platform.Service.LightSensor);

    // Set the service name to match the accessory display name
    this.service.setCharacteristic(this.platform.Characteristic.Name, this.accessory.displayName);

    // Set initial GPM value
    this.updateGpm(this.getCurrentGpm());

    // Configure the current ambient light level characteristic
    this.service.getCharacteristic(this.platform.Characteristic.CurrentAmbientLightLevel).onGet(this.getGpm.bind(this));
  }

  /**
   * Calculate current GPM from pump speed using pump performance curves
   */
  private getCurrentGpm(): number {
    // Find the highest speed from all active pump circuits (same logic as WATTS sensor)
    const highestActiveRpm = this.getHighestActivePumpSpeed();

    this.platform.log.debug(`${this.accessory.displayName}: Dynamically calculating GPM with RPM: ${highestActiveRpm}`);

    if (highestActiveRpm <= 0) {
      return 0.0001; // HomeKit Light Sensor minimum value for inactive pumps
    }

    const pumpCurve = PUMP_PERFORMANCE_CURVES[this.pumpType as keyof typeof PUMP_PERFORMANCE_CURVES];
    if (!pumpCurve) {
      this.platform.log.warn(`Unknown pump type: ${this.pumpType} for pump ${this.pump.name}. Using VS curves.`);
      return PUMP_PERFORMANCE_CURVES.VS.calculateGPM(highestActiveRpm);
    }

    const calculatedGpm = pumpCurve.calculateGPM(highestActiveRpm);
    this.platform.log.debug(
      `${this.accessory.displayName}: Calculating GPM for ${this.pumpType} pump at ` +
        `${highestActiveRpm} RPM = ${calculatedGpm.toFixed(1)} GPM`,
    );

    return Math.max(0.0001, calculatedGpm); // Ensure minimum HomeKit value
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
      this.platform.log.debug(`  GPM - Checking pump circuit ${pumpCircuit.id} -> ${pumpCircuit.circuitId}: speed=${pumpCircuit.speed}`);

      // Ensure speed is a number
      const speed = Number(pumpCircuit.speed);

      if (speed && speed > 0) {
        // Check if this circuit is active by finding corresponding feature/circuit
        const isActive = this.isPumpCircuitActive(pumpCircuit.circuitId);
        this.platform.log.debug(`    GPM - Circuit active: ${isActive}`);

        if (isActive) {
          activeSpeeds.push(speed);
          if (speed > highestSpeed) {
            this.platform.log.debug(`    GPM - NEW HIGHEST: ${speed} RPM [${speed} > ${highestSpeed}]`);
            highestSpeed = speed;
          } else {
            this.platform.log.debug(`    GPM - Not highest: ${speed} <= ${highestSpeed}`);
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
    for (const [, accessory] of this.platform.accessoryMap) {
      if (accessory.context.circuit && accessory.context.circuit.id === circuitId) {
        const isOn = accessory.context.circuit.status === CircuitStatus.On;
        this.platform.log.debug(`Found circuit ${circuitId}: status = ${accessory.context.circuit.status}, active = ${isOn}`);
        return isOn;
      }
      // Also check feature contexts
      if (accessory.context.feature && accessory.context.feature.id === circuitId) {
        const isOn = accessory.context.feature.status === CircuitStatus.On;
        this.platform.log.debug(`Found feature ${circuitId}: status = ${accessory.context.feature.status}, active = ${isOn}`);
        return isOn;
      }
      // Also check body contexts (for Pool, Spa, etc.)
      if (accessory.context.body && accessory.context.body.circuit?.id === circuitId) {
        const isOn = accessory.context.body.status === CircuitStatus.On;
        this.platform.log.debug(`Found body circuit ${circuitId}: status = ${accessory.context.body.status}, active = ${isOn}`);
        return isOn;
      }
    }

    // Check if this is an internal heater circuit (like X0051) that should be active when heaters are running
    if (circuitId.startsWith('X')) {
      this.platform.log.debug(`Circuit ${circuitId} appears to be internal heater circuit, checking heater status...`);

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
              this.platform.log.debug(`Found actively heating heater for body ${body.name}, circuit ${circuitId} is active`);
              return true;
            }
          }
        }
      }

      this.platform.log.debug(`No actively heating heaters found, circuit ${circuitId} is inactive`);
      return false;
    }

    // If we can't find the circuit, assume it's inactive
    this.platform.log.debug(`Circuit ${circuitId} not found in accessories, assuming inactive`);
    return false;
  }

  /**
   * Handle requests to get the current GPM value
   */
  async getGpm() {
    const gpm = this.getCurrentGpm();
    this.platform.log.debug(`Get GPM for ${this.pump.name}: ${gpm.toFixed(1)}`);
    return gpm;
  }

  /**
   * Update the current RPM and recalculate GPM
   */
  updateSpeed(rpm: number) {
    this.platform.log.debug(`${this.pump.name} GPM sensor receiving RPM update: ${rpm} (previous: ${this.currentRpm})`);
    this.currentRpm = rpm;
    const newGpm = this.getCurrentGpm();
    this.updateGpm(newGpm);
    this.platform.log.debug(`${this.pump.name} speed updated to ${rpm} RPM, calculated GPM: ${newGpm.toFixed(1)}`);
  }

  /**
   * Update the GPM display (called when pump speed changes)
   */
  updateGpm(gpm: number) {
    this.platform.log.debug(`Updating ${this.pump.name} GPM display to: ${gpm.toFixed(1)}`);

    // Update the light sensor value - GPM maps directly to lux (1:1 ratio)
    this.service.updateCharacteristic(this.platform.Characteristic.CurrentAmbientLightLevel, gpm);
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
