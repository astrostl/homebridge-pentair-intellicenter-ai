import { CharacteristicValue, PlatformAccessory, Service } from 'homebridge';
import { v4 as uuidv4 } from 'uuid';

import { PentairPlatform } from './platform';
import { Circuit, CircuitStatus, CircuitStatusMessage, IntelliCenterRequest, IntelliCenterRequestCommand, Module, Panel } from './types';
import { MANUFACTURER } from './settings';
import { ACT_KEY, INTELLIBRITE_OPTIONS, STATUS_KEY } from './constants';

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
  private primaryService!: Service;

  constructor(
    private readonly platform: PentairPlatform,
    private readonly accessory: PlatformAccessory,
  ) {
    this.initializeContext();
    this.setupAccessoryInformation();
    this.setupPrimaryService();
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

  private setupPrimaryService(): void {
    // Create or get the primary Lightbulb service for overall ON/OFF control
    // This makes the HomeKit tile show ON when any color is active
    this.primaryService =
      this.accessory.getService(this.platform.Service.Lightbulb) ||
      this.accessory.addService(this.platform.Service.Lightbulb, this.circuit.name);

    this.primaryService.setCharacteristic(this.platform.Characteristic.Name, this.circuit.name);

    // Set as primary service so HomeKit uses it for tile state
    this.primaryService.setPrimaryService(true);

    // Handle ON/OFF for the primary service
    this.primaryService
      .getCharacteristic(this.platform.Characteristic.On)
      .onSet(this.handlePrimarySet.bind(this))
      .onGet(this.handlePrimaryGet.bind(this));

    // IntelliBrite doesn't support variable brightness - fix at 100%
    if (this.primaryService.testCharacteristic(this.platform.Characteristic.Brightness)) {
      this.primaryService.getCharacteristic(this.platform.Characteristic.Brightness).onGet(() => 100);
    }

    this.platform.log.debug(`[${this.circuit.name}] Primary Lightbulb service configured`);
  }

  private async handlePrimarySet(value: CharacteristicValue): Promise<void> {
    this.platform.log.info(`Setting ${this.circuit.name} to ${value ? 'ON' : 'OFF'}`);

    if (value) {
      // Turning on - use the last active color, or default to first option
      const lastColor = this.accessory.context.activeColor as string | undefined;
      const defaultColor = INTELLIBRITE_OPTIONS[0]?.code ?? 'White';
      const colorToUse = lastColor || defaultColor;
      await this.setColor(colorToUse);
    } else {
      // Turning off
      await this.turnOff();
    }
  }

  private async handlePrimaryGet(): Promise<CharacteristicValue> {
    return this.circuit.status === CircuitStatus.On;
  }

  private setupColorSwitches(): void {
    // Create a switch for each color/show option
    for (const option of INTELLIBRITE_OPTIONS) {
      const subtype = `intellibrite_${option.code}`;
      let service = this.accessory.getServiceById(this.platform.Service.Switch, subtype);

      if (!service) {
        service = this.accessory.addService(this.platform.Service.Switch, option.name, subtype);
        this.platform.log.debug(`Added IntelliBrite switch: ${option.name} (${option.code}) to ${this.circuit.name}`);
      }

      // Set both displayName and characteristics for proper HomeKit display
      service.displayName = option.name;
      service.setCharacteristic(this.platform.Characteristic.Name, option.name);
      service.addOptionalCharacteristic(this.platform.Characteristic.ConfiguredName);
      service.setCharacteristic(this.platform.Characteristic.ConfiguredName, option.name);

      const characteristic = service.getCharacteristic(this.platform.Characteristic.On);
      characteristic.onSet(this.createSetHandler(option.code));
      characteristic.onGet(this.createGetHandler(option.code));

      this.platform.log.debug(`[${this.circuit.name}] Bound handlers for ${option.name} (${option.code})`);
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
      this.platform.log.debug(`[${this.circuit.name}] Switch ${colorCode} set to ${value}`);
      if (value) {
        // Turning on - set color and turn on light
        await this.setColor(colorCode);
      } else {
        // Turning off the active color switch turns off the light
        const activeColor = this.accessory.context.activeColor as string | undefined;
        if (colorCode === activeColor) {
          await this.turnOff();
        }
        // If turning off a non-active switch, do nothing (it's already off)
      }
    };
  }

  private async turnOff(): Promise<void> {
    this.platform.log.info(`Turning off ${this.circuit.name}`);

    const command = {
      command: IntelliCenterRequestCommand.SetParamList,
      messageID: uuidv4(),
      objectList: [
        {
          objnam: this.circuit.id,
          params: { [STATUS_KEY]: CircuitStatus.Off } as never,
        } as CircuitStatusMessage,
      ],
    } as IntelliCenterRequest;

    this.platform.sendCommandNoWait(command);

    // Optimistically update the UI
    this.circuit.status = CircuitStatus.Off;
    this.primaryService.updateCharacteristic(this.platform.Characteristic.On, false);
    this.updateSwitchStates();
  }

  private createGetHandler(colorCode: string): () => Promise<CharacteristicValue> {
    return async () => {
      const activeColor = this.accessory.context.activeColor as string | undefined;
      const isCircuitOn = this.circuit.status === CircuitStatus.On;
      // Only return true if circuit is ON and this is the active color
      return isCircuitOn && activeColor === colorCode;
    };
  }

  private async setColor(colorCode: string): Promise<void> {
    this.platform.log.info(`Setting ${this.circuit.name} to ${colorCode}`);

    // Use ACT to directly trigger color changes (USE is read-only for the selected default)
    const paramKey = ACT_KEY;

    // Turn on the light AND set the color in one command
    const command = {
      command: IntelliCenterRequestCommand.SetParamList,
      messageID: uuidv4(),
      objectList: [
        {
          objnam: this.circuit.id,
          params: {
            [STATUS_KEY]: CircuitStatus.On,
            [paramKey]: colorCode,
          } as never,
        } as CircuitStatusMessage,
      ],
    } as IntelliCenterRequest;

    this.platform.sendCommandNoWait(command);

    // Optimistically update the UI
    this.circuit.status = CircuitStatus.On;
    this.accessory.context.activeColor = colorCode;
    this.primaryService.updateCharacteristic(this.platform.Characteristic.On, true);
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
    const circuitStatus = this.circuit.status;
    const isCircuitOn = circuitStatus === CircuitStatus.On;

    // Update primary service to reflect overall ON/OFF state
    this.primaryService.updateCharacteristic(this.platform.Characteristic.On, isCircuitOn);

    for (const [code, service] of this.colorSwitches) {
      // Only show color as active if the circuit is ON and this is the active color
      const isActive = isCircuitOn && code === activeColor;
      service.updateCharacteristic(this.platform.Characteristic.On, isActive);
    }
  }

  /**
   * Handle the circuit on/off status update.
   * When the light is off, all color switches should show as off.
   */
  public updateStatus(): void {
    const status = this.accessory.context.circuit?.status;
    const isOn = status === CircuitStatus.On;
    this.platform.log.debug(`${this.circuit.name} status: ${status}`);

    // Always update primary service to reflect ON/OFF state
    this.primaryService.updateCharacteristic(this.platform.Characteristic.On, isOn);

    if (!isOn) {
      // When light is off, clear all color switches
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
