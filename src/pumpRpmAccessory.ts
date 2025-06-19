import { PlatformAccessory, Service } from 'homebridge';

import { PentairPlatform } from './platform';
import { Pump } from './types';
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
      return 0;
    }

    // Find the pump circuit with the highest RPM (most likely the active one)
    // In VSP systems, when multiple circuits are configured, the highest RPM typically indicates the active setting
    let maxRpm = 0;
    for (const circuit of this.pump.circuits) {
      if (circuit.speed && circuit.speed > maxRpm) {
        maxRpm = circuit.speed;
      }
    }

    return maxRpm;
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
