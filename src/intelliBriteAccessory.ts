import { CharacteristicValue, PlatformAccessory, Service } from 'homebridge';
import { v4 as uuidv4 } from 'uuid';

import { PentairPlatform } from './platform';
import { Circuit, CircuitStatus, CircuitStatusMessage, IntelliCenterRequest, IntelliCenterRequestCommand, Module, Panel } from './types';
import { MANUFACTURER } from './settings';
import { STATUS_KEY } from './constants';

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

    // IntelliBrite doesn't support variable brightness - fix at 100% when on
    if (this.lightbulbService.testCharacteristic(this.platform.Characteristic.Brightness)) {
      this.lightbulbService.getCharacteristic(this.platform.Characteristic.Brightness).onGet(() => {
        return this.circuit.status === CircuitStatus.On ? 100 : 0;
      });
    }

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
   * Called when active color changes - not used in light-only accessory
   * but kept for API compatibility with platform updates.
   */
  public updateActiveColor(): void {
    // Color is handled by the separate colors accessory
    // Just update status in case it changed
    this.updateStatus();
  }
}
