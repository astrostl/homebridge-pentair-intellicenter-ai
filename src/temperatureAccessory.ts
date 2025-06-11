import { PlatformAccessory, Service, CharacteristicValue } from 'homebridge';
import { PentairPlatform } from './platform';
import { MANUFACTURER } from './settings';
import { TemperatureSensorType, TemperatureUnits } from './types';
import { fahrenheitToCelsius } from './util';

const MODEL = 'Temperature Sensor';

export class TemperatureAccessory {
  private service: Service;
  private type: TemperatureSensorType;
  private name: string;

  constructor(
    private readonly platform: PentairPlatform,
    private readonly accessory: PlatformAccessory,
  ) {
    this.type = accessory.context.sensor.type;
    this.name = accessory.context.sensor.name;

    this.accessory.getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, MANUFACTURER)
      .setCharacteristic(this.platform.Characteristic.Model, MODEL)
      .setCharacteristic(this.platform.Characteristic.SerialNumber, this.accessory.UUID);

    this.service = this.accessory.getService(this.platform.Service.TemperatureSensor)
      || this.accessory.addService(this.platform.Service.TemperatureSensor, this.name);

    this.service.setCharacteristic(this.platform.Characteristic.Name, this.name);

    this.service.getCharacteristic(this.platform.Characteristic.CurrentTemperature)
      .onGet(this.getCurrentTemperature.bind(this));
  }

  async getCurrentTemperature(): Promise<CharacteristicValue> {
    const isFahrenheit = this.platform.getConfig().temperatureUnits === TemperatureUnits.F;
    const temp = this.accessory.context.sensor?.probe;

    if (temp === undefined || temp === null || isNaN(temp)) {
      this.platform.log.warn(`[${this.name}] Invalid temperature value: ${temp}, returning 0`);
      return 0;
    }

    const celsius = isFahrenheit ? fahrenheitToCelsius(temp) : temp;
    return celsius;
  }

  updateTemperature(value: number) {
    if (value === undefined || value === null || isNaN(value)) {
      this.platform.log.warn(`[${this.name}] Invalid temperature update value: ${value}, skipping update`);
      return;
    }

    const isFahrenheit = this.platform.getConfig().temperatureUnits === TemperatureUnits.F;
    const celsius = isFahrenheit ? fahrenheitToCelsius(value) : value;

    this.accessory.context.sensor.probe = value;
    this.service.updateCharacteristic(this.platform.Characteristic.CurrentTemperature, celsius);
    this.platform.log.debug(`[${this.name}] Updated temperature: ${value}${isFahrenheit ? 'F' : 'C'} -> ${celsius}C`);
  }
}
