import { PlatformAccessory, Service } from 'homebridge';

import { PentairPlatform } from './platform';
import { Circuit, PumpCircuit, CircuitStatus } from './types';
import { MANUFACTURER } from './settings';

const MODEL = 'Feature RPM Sensor';

/**
 * Feature RPM Accessory
 * Displays RPM for features that control pumps as a light sensor (lux value) for easy visualization in Home app
 * Each feature gets its own dedicated RPM sensor based on the feature name
 */
export class PumpRpmAccessory {
  private service: Service;
  private feature: Circuit;
  private pumpCircuit: PumpCircuit;

  constructor(
    private readonly platform: PentairPlatform,
    private readonly accessory: PlatformAccessory,
  ) {
    this.feature = accessory.context.feature as Circuit;
    this.pumpCircuit = accessory.context.pumpCircuit as PumpCircuit;

    // Set accessory information
    this.accessory
      .getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, MANUFACTURER)
      .setCharacteristic(this.platform.Characteristic.Model, MODEL)
      .setCharacteristic(this.platform.Characteristic.SerialNumber, `RPM-${this.feature.id}`);

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
   * Get current RPM from this feature's pump circuit
   * Simple and clean - check if feature is active and return its pump circuit RPM
   */
  private getCurrentRpm(): number {
    // Check if this feature is active and has pump circuit speed data
    this.platform.log.debug(`${this.accessory.displayName}: Checking feature ${this.feature.id}`);
    this.platform.log.debug(`  Feature status: ${this.feature.status}, Pump circuit speed: ${this.pumpCircuit.speed}`);

    // If feature is active and pump circuit has speed, return the RPM
    if (this.feature.status === CircuitStatus.On && this.pumpCircuit.speed && this.pumpCircuit.speed > 0) {
      this.platform.log.debug(`  Result: ${this.pumpCircuit.speed} RPM (feature active)`);
      return this.pumpCircuit.speed;
    } else {
      this.platform.log.debug('  Result: 0.0001 RPM (feature inactive or no speed)');
      return 0.0001; // HomeKit Light Sensor minimum value
    }
  }

  /**
   * Handle requests to get the current RPM value
   */
  async getRpm() {
    const rpm = this.getCurrentRpm();
    this.platform.log.debug(`Get RPM for ${this.feature.name}: ${rpm}`);
    return rpm;
  }

  /**
   * Update the RPM display (called when feature or pump circuit changes)
   */
  updateRpm(rpm: number) {
    this.platform.log.debug(`Updating ${this.feature.name} RPM display to: ${rpm}`);

    // Update the light sensor value - RPM maps directly to lux (1:1 ratio)
    this.service.updateCharacteristic(this.platform.Characteristic.CurrentAmbientLightLevel, rpm);
  }
}
