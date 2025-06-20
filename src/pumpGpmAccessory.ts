import { PlatformAccessory, Service } from 'homebridge';

import { PentairPlatform } from './platform';
import { Pump } from './types';
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
    if (this.currentRpm <= 0) {
      return 0.0001; // HomeKit Light Sensor minimum value for inactive pumps
    }

    const pumpCurve = PUMP_PERFORMANCE_CURVES[this.pumpType as keyof typeof PUMP_PERFORMANCE_CURVES];
    if (!pumpCurve) {
      this.platform.log.warn(`Unknown pump type: ${this.pumpType} for pump ${this.pump.name}. Using VS curves.`);
      return PUMP_PERFORMANCE_CURVES.VS.calculateGPM(this.currentRpm);
    }

    const calculatedGpm = pumpCurve.calculateGPM(this.currentRpm);
    this.platform.log.debug(
      `${this.accessory.displayName}: Calculating GPM for ${this.pumpType} pump at ` +
        `${this.currentRpm} RPM = ${calculatedGpm.toFixed(1)} GPM`,
    );

    return Math.max(0.0001, calculatedGpm); // Ensure minimum HomeKit value
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
