import { CharacteristicValue, PlatformAccessory, Service } from 'homebridge';
import { v4 as uuidv4 } from 'uuid';

import { PentairPlatform } from './platform';
import {
  Circuit,
  CircuitStatus,
  CircuitStatusMessage,
  CircuitType,
  IntelliCenterRequest,
  IntelliCenterRequestCommand,
  Module,
  Panel,
} from './types';
import { MANUFACTURER } from './settings';
import { ACT_KEY, INTELLIBRITE_OPTIONS, STATUS_KEY, USE_KEY } from './constants';

const MODEL = 'IntelliBrite';

/**
 * IntelliBrite Accessory
 * Exposes IntelliBrite color-changing lights as a set of Switch services.
 * Each color/show option is a separate switch - HomeKit groups them into a collapsible tile.
 * Only the active color/show switch is ON; all others are OFF.
 */
export class IntelliBriteAccessory {
  private circuit!: Circuit;
  private panel!: Panel;
  private module!: Module | null;
  private colorSwitches: Map<string, Service> = new Map();

  constructor(
    private readonly platform: PentairPlatform,
    private readonly accessory: PlatformAccessory,
  ) {
    this.initializeContext();
    this.setupAccessoryInformation();
    this.setupColorSwitches();
    this.updateActiveColor();
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

  private setupColorSwitches(): void {
    // Remove any existing Lightbulb service from previous implementation
    const existingLightbulb = this.accessory.getService(this.platform.Service.Lightbulb);
    if (existingLightbulb) {
      this.platform.log.info(`Removing legacy Lightbulb service from ${this.circuit.name}`);
      this.accessory.removeService(existingLightbulb);
    }

    // Create a switch for each color/show option
    for (const option of INTELLIBRITE_OPTIONS) {
      const subtype = `intellibrite_${option.code}`;
      let service = this.accessory.getServiceById(this.platform.Service.Switch, subtype);

      if (!service) {
        service = this.accessory.addService(this.platform.Service.Switch, option.name, subtype);
        this.platform.log.debug(`Added IntelliBrite switch: ${option.name} (${option.code}) to ${this.circuit.name}`);
      }

      service.setCharacteristic(this.platform.Characteristic.Name, option.name);
      service
        .getCharacteristic(this.platform.Characteristic.On)
        .onSet(this.createSetHandler(option.code))
        .onGet(this.createGetHandler(option.code));

      this.colorSwitches.set(option.code, service);
    }

    // Clean up any old switches that are no longer in INTELLIBRITE_OPTIONS
    this.cleanupOldServices();
  }

  private cleanupOldServices(): void {
    const validSubtypes = new Set(INTELLIBRITE_OPTIONS.map(o => `intellibrite_${o.code}`));
    const servicesToRemove: Service[] = [];

    for (const service of this.accessory.services) {
      if (service.UUID === this.platform.Service.Switch.UUID) {
        const subtype = service.subtype;
        if (subtype && subtype.startsWith('intellibrite_') && !validSubtypes.has(subtype)) {
          servicesToRemove.push(service);
        }
      }
    }

    for (const service of servicesToRemove) {
      this.platform.log.info(`Removing obsolete IntelliBrite switch: ${service.subtype}`);
      this.accessory.removeService(service);
    }
  }

  private createSetHandler(colorCode: string): (value: CharacteristicValue) => Promise<void> {
    return async (value: CharacteristicValue) => {
      if (value) {
        await this.setColor(colorCode);
      }
      // If turning off, we don't send a command - just update the UI
      // The switch will auto-correct based on the actual state from IntelliCenter
    };
  }

  private createGetHandler(colorCode: string): () => Promise<CharacteristicValue> {
    return async () => {
      const activeColor = this.accessory.context.activeColor as string | undefined;
      return activeColor === colorCode;
    };
  }

  private async setColor(colorCode: string): Promise<void> {
    this.platform.log.info(`Setting ${this.circuit.name} to ${colorCode}`);

    // Determine which parameter to use based on circuit type
    // Individual IntelliBrite lights use USE, light groups use ACT
    const paramKey = this.circuit.type === CircuitType.LightShowGroup ? ACT_KEY : USE_KEY;

    const command = {
      command: IntelliCenterRequestCommand.SetParamList,
      messageID: uuidv4(),
      objectList: [
        {
          objnam: this.circuit.id,
          params: { [paramKey]: colorCode } as never,
        } as CircuitStatusMessage,
      ],
    } as IntelliCenterRequest;

    this.platform.sendCommandNoWait(command);

    // Optimistically update the UI
    this.accessory.context.activeColor = colorCode;
    this.updateSwitchStates();
  }

  /**
   * Update all switch states based on the active color.
   * Called when we receive an update from IntelliCenter or after setting a color.
   */
  public updateActiveColor(): void {
    const activeColor = this.accessory.context.activeColor as string | undefined;
    this.platform.log.debug(`${this.circuit.name} active color: ${activeColor ?? 'unknown'}`);
    this.updateSwitchStates();
  }

  private updateSwitchStates(): void {
    const activeColor = this.accessory.context.activeColor as string | undefined;

    for (const [code, service] of this.colorSwitches) {
      const isActive = code === activeColor;
      service.updateCharacteristic(this.platform.Characteristic.On, isActive);
    }
  }

  /**
   * Handle the circuit on/off status update.
   * When the light is off, all color switches should show as off.
   */
  public updateStatus(): void {
    const status = this.accessory.context.circuit?.status;
    this.platform.log.debug(`${this.circuit.name} status: ${status}`);

    if (status === CircuitStatus.Off) {
      // When light is off, clear all switches
      for (const service of this.colorSwitches.values()) {
        service.updateCharacteristic(this.platform.Characteristic.On, false);
      }
    } else {
      // When light is on, show the active color
      this.updateSwitchStates();
    }
  }

  /**
   * Turn the light on or off.
   * This is separate from color selection.
   */
  public async setOn(value: CharacteristicValue): Promise<void> {
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
  }
}
