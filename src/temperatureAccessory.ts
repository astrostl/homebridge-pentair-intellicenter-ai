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
    const temp = this.accessory.context.probe;
    const celsius = isFahrenheit ? fahrenheitToCelsius(temp) : temp;

    return celsius ?? 0;
  }

  updateTemperature(value: number) {
    const isFahrenheit = this.platform.getConfig().temperatureUnits === TemperatureUnits.F;
    const temp = this.accessory.context.probe;
    const celsius = isFahrenheit ? fahrenheitToCelsius(temp) : temp;

    this.accessory.context.probe = value;
    this.service.updateCharacteristic(this.platform.Characteristic.CurrentTemperature, celsius);
    this.platform.log.debug(`[${this.name}] Updated temperature: ${value}F or ${celsius}C`);
  }
}
