import { CharacteristicValue, PlatformAccessory, Service } from 'homebridge';
import { v4 as uuidv4 } from 'uuid';

import { PentairPlatform } from './platform';
import { Circuit, CircuitStatus, CircuitStatusMessage, Color, IntelliCenterRequest, IntelliCenterRequestCommand, Module, Panel } from './types';
import { MANUFACTURER } from './settings';
import { ACT_KEY, DEFAULT_BRIGHTNESS, DEFAULT_COLOR_TEMPERATURE, STATUS_KEY } from './constants';
import { getIntelliBriteColor } from './util';

const MODEL = 'IntelliBrite';

/**
 * IntelliBrite Accessory (Light Only)
 * Exposes IntelliBrite as a simple Lightbulb for ON/OFF control.
 * The tile will light up when the light is on.
 * Color selection is handled by the separate IntelliBriteColorsAccessory.
 *
 * When turned ON, IntelliCenter uses the last active color automatically.
 */
export class IntelliBriteAccessory {
  private circuit!: Circuit;
  private panel!: Panel;
  private module!: Module | null;
  private lightbulbService!: Service;

  constructor(
    private readonly platform: PentairPlatform,
    private readonly accessory: PlatformAccessory,
  ) {
    this.initializeContext();
    this.setupAccessoryInformation();
    this.setupLightbulbService();
    this.cleanupLegacyServices();
    this.updateStatus();
    this.syncColorFromActiveColor();
  }

  private initializeContext(): void {
    this.module = this.accessory.context.module as Module;
    this.panel = this.accessory.context.panel as Panel;
    this.circuit = this.accessory.context.circuit as Circuit;
  }

  private setupAccessoryInformation(): void {
    const serial = this.module ? `${this.panel.id}.${this.module.id}.${this.circuit.id}` : `${this.panel.id}.${this.circuit.id}`;
    this.accessory
      .getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, MANUFACTURER)
      .setCharacteristic(this.platform.Characteristic.Model, MODEL)
      .setCharacteristic(this.platform.Characteristic.SerialNumber, serial);
  }

  private setupLightbulbService(): void {
    // Create or get the Lightbulb service for ON/OFF control
    this.lightbulbService =
      this.accessory.getService(this.platform.Service.Lightbulb) ||
      this.accessory.addService(this.platform.Service.Lightbulb, this.circuit.name);

    this.lightbulbService.setCharacteristic(this.platform.Characteristic.Name, this.circuit.name);

    // Handle ON/OFF
    this.lightbulbService
      .getCharacteristic(this.platform.Characteristic.On)
      .onSet(this.handleSet.bind(this))
      .onGet(this.handleGet.bind(this));

    // Color wheel (snaps to nearest IntelliBrite preset)
    this.lightbulbService
      .getCharacteristic(this.platform.Characteristic.Hue)
      .onSet(this.setColorHue.bind(this))
      .onGet(this.getColorHue.bind(this));

    this.lightbulbService
      .getCharacteristic(this.platform.Characteristic.Saturation)
      .onSet(this.setColorSaturation.bind(this))
      .onGet(this.getColorSaturation.bind(this));

    this.lightbulbService
      .getCharacteristic(this.platform.Characteristic.ColorTemperature)
      .onSet(this.setColorTemperature.bind(this))
      .onGet(this.getColorTemperature.bind(this));

    // IntelliBrite doesn't support variable brightness - fix at 100%
    this.lightbulbService
      .getCharacteristic(this.platform.Characteristic.Brightness)
      .onSet(this.setBrightness.bind(this))
      .onGet(this.getBrightness.bind(this));

    this.platform.log.debug(`[${this.circuit.name}] Lightbulb service configured`);
  }

  /**
   * Remove any legacy Switch services from previous implementation.
   * Color switches are now in a separate accessory.
   */
  private cleanupLegacyServices(): void {
    const servicesToRemove: Service[] = [];

    for (const service of this.accessory.services) {
      if (service.UUID === this.platform.Service.Switch.UUID) {
        const subtype = service.subtype;
        if (subtype && subtype.startsWith('intellibrite_')) {
          servicesToRemove.push(service);
        }
      }
    }

    if (servicesToRemove.length > 0) {
      const count = servicesToRemove.length;
      this.platform.log.info(`[${this.circuit.name}] Removing ${count} legacy color switches (now in separate accessory)`);
      for (const service of servicesToRemove) {
        this.accessory.removeService(service);
      }
    }
  }

  private async setColorHue(value: CharacteristicValue): Promise<void> {
    // Wait for saturation first. 10ms chosen arbitrarily.
    await this.platform.delay(10);
    const saturation = this.accessory.context.saturation;
    this.platform.log.info(`Setting ${this.circuit.name} hue to ${value}. Saturation is ${saturation}`);
    this.accessory.context.color = getIntelliBriteColor(value as number, saturation);
    const command = {
      command: IntelliCenterRequestCommand.SetParamList,
      messageID: uuidv4(),
      objectList: [
        {
          objnam: this.circuit.id,
          params: { [ACT_KEY]: this.accessory.context.color.intellicenterCode } as never,
        } as CircuitStatusMessage,
      ],
    } as IntelliCenterRequest;
    this.platform.sendCommandNoWait(command);
    this.accessory.context.saturation = this.accessory.context.color.saturation;
    this.lightbulbService.updateCharacteristic(this.platform.Characteristic.Hue, this.accessory.context.color.hue);
    this.lightbulbService.updateCharacteristic(this.platform.Characteristic.Saturation, this.accessory.context.color.saturation);
  }

  private async setColorSaturation(value: CharacteristicValue): Promise<void> {
    this.platform.log.info(`Setting ${this.circuit.name} saturation to ${value}`);
    this.accessory.context.saturation = value as number;
  }

  private async setColorTemperature(value: CharacteristicValue): Promise<void> {
    this.platform.log.warn(`Ignoring color temperature on ${this.circuit.name} to ${value}`);
    this.lightbulbService.updateCharacteristic(this.platform.Characteristic.ColorTemperature, DEFAULT_COLOR_TEMPERATURE);
  }

  private async setBrightness(value: CharacteristicValue): Promise<void> {
    this.platform.log.warn(`Ignoring brightness value on ${this.circuit.name} to ${value}`);
    this.lightbulbService.updateCharacteristic(this.platform.Characteristic.Brightness, DEFAULT_BRIGHTNESS);
  }

  private async getColorHue(): Promise<CharacteristicValue> {
    return this.accessory.context.color?.hue ?? Color.White.hue;
  }

  private async getColorSaturation(): Promise<CharacteristicValue> {
    return this.accessory.context.color?.saturation ?? Color.White.saturation;
  }

  private async getColorTemperature(): Promise<CharacteristicValue> {
    return DEFAULT_COLOR_TEMPERATURE;
  }

  private async getBrightness(): Promise<CharacteristicValue> {
    return DEFAULT_BRIGHTNESS;
  }

  private syncColorFromActiveColor(): void {
    const activeColor = this.accessory.context.activeColor as string | undefined;
    if (!activeColor) {
      return;
    }

    const allColors = [Color.White, Color.Red, Color.Green, Color.Blue, Color.Magenta];
    const matched = allColors.find(c => c.intellicenterCode === activeColor);
    if (!matched) {
      return;
    }

    this.accessory.context.color = matched;
    this.accessory.context.saturation = matched.saturation;
    this.lightbulbService.updateCharacteristic(this.platform.Characteristic.Hue, matched.hue);
    this.lightbulbService.updateCharacteristic(this.platform.Characteristic.Saturation, matched.saturation);
    this.platform.log.debug(`Synced ${this.circuit.name} color wheel to ${activeColor} (hue=${matched.hue}, sat=${matched.saturation})`);
  }

  private async handleSet(value: CharacteristicValue): Promise<void> {
    this.platform.log.info(`Setting ${this.circuit.name} to ${value ? 'ON' : 'OFF'}`);

    const command = {
      command: IntelliCenterRequestCommand.SetParamList,
      messageID: uuidv4(),
      objectList: [
        {
          objnam: this.circuit.id,
          params: { [STATUS_KEY]: value ? CircuitStatus.On : CircuitStatus.Off } as never,
        } as CircuitStatusMessage,
      ],
    } as IntelliCenterRequest;

    this.platform.sendCommandNoWait(command);

    // Optimistically update the UI
    this.circuit.status = value ? CircuitStatus.On : CircuitStatus.Off;
    this.lightbulbService.updateCharacteristic(this.platform.Characteristic.On, !!value);
  }

  private async handleGet(): Promise<CharacteristicValue> {
    return this.circuit.status === CircuitStatus.On;
  }

  /**
   * Handle the circuit on/off status update from IntelliCenter.
   */
  public updateStatus(): void {
    const status = this.accessory.context.circuit?.status;
    const isOn = status === CircuitStatus.On;
    this.platform.log.debug(`${this.circuit.name} status: ${status}`);
    this.lightbulbService.updateCharacteristic(this.platform.Characteristic.On, isOn);
  }

  /**
   * Called when active color changes from IntelliCenter or the colors accessory.
   */
  public updateActiveColor(): void {
    this.updateStatus();
    this.syncColorFromActiveColor();
  }
}
