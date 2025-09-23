import { CharacteristicValue, Nullable, PlatformAccessory, Service } from 'homebridge';

import { PentairPlatform } from './platform';
import {
  Body,
  CircuitStatus,
  CircuitStatusMessage,
  Heater,
  HeatMode,
  IntelliCenterRequest,
  IntelliCenterRequestCommand,
  TemperatureUnits,
} from './types';
import { celsiusToFahrenheit, fahrenheitToCelsius } from './util';
import { MANUFACTURER } from './settings';
import {
  HEATER_KEY,
  NO_HEATER_ID,
  LOW_TEMP_KEY,
  HIGH_TEMP_KEY,
  STATUS_KEY,
  THERMOSTAT_STEP_VALUE,
  CURRENT_TEMP_MIN_C,
  CURRENT_TEMP_MAX_C,
} from './constants';
import { v4 as uuidv4 } from 'uuid';

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export class HeaterAccessory {
  private service: Service;
  public heater: Heater;
  private body: Body;
  private readonly isFahrenheit: boolean;
  private readonly minValue: number;
  private readonly maxValue: number;
  private temperature: number | undefined;
  private lowTemperature: number | undefined;
  private highTemperature: number | undefined;

  constructor(
    private readonly platform: PentairPlatform,
    private readonly accessory: PlatformAccessory,
  ) {
    this.heater = this.accessory.context.heater;
    this.body = this.accessory.context.body;

    this.platform.log.debug(`Setting accessory details for device: ${JSON.stringify(this.heater, null, 2)}`);
    this.isFahrenheit = this.platform.getConfig().temperatureUnits !== TemperatureUnits.C;

    this.minValue = this.platform.getConfig().minimumTemperature;
    this.maxValue = this.platform.getConfig().maximumTemperature;

    this.lowTemperature = this.body.lowTemperature;
    this.highTemperature = this.body.highTemperature;

    if (this.isFahrenheit) {
      this.minValue = fahrenheitToCelsius(this.minValue);
      this.maxValue = fahrenheitToCelsius(this.maxValue);
      if (this.lowTemperature) {
        this.lowTemperature = fahrenheitToCelsius(this.lowTemperature);
      }
      if (this.highTemperature) {
        this.highTemperature = fahrenheitToCelsius(this.highTemperature);
      }
    }

    if (this.body?.temperature) {
      this.temperature = this.isFahrenheit && this.body.temperature ? fahrenheitToCelsius(this.body.temperature) : this.body.temperature;
    } else {
      this.temperature = undefined;
    }

    this.platform.log.debug(
      `Temperature Slider Min: ${this.minValue}, Max: ${this.maxValue}, ` + `current temperature: ${this.temperature}`,
    );

    this.accessory
      .getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, MANUFACTURER)
      .setCharacteristic(this.platform.Characteristic.Model, this.heater.type)
      .setCharacteristic(this.platform.Characteristic.SerialNumber, `${this.body.id}.${this.heater.id}`);

    this.service =
      this.accessory.getService(this.platform.Service.Thermostat) || this.accessory.addService(this.platform.Service.Thermostat);
    this.service.setCharacteristic(this.platform.Characteristic.Name, `${this.body.name} ${this.heater.name}`);

    this.bindStaticValues();
    this.bindThermostat();
  }

  bindThermostat() {
    if (this.lowTemperature) {
      this.service
        .getCharacteristic(this.platform.Characteristic.TargetTemperature)
        .onSet(this.setTargetTemperature.bind(this))
        .onGet(this.getTargetTemperature.bind(this))
        .setProps({
          minValue: this.minValue,
          maxValue: this.maxValue,
          minStep: THERMOSTAT_STEP_VALUE,
        })
        .updateValue(this.lowTemperature || 0);
    }

    // Add cooling setpoint support for heat pumps
    if (this.heater.coolingEnabled && this.highTemperature) {
      this.service
        .getCharacteristic(this.platform.Characteristic.CoolingThresholdTemperature)
        .onSet(this.setCoolingThresholdTemperature.bind(this))
        .onGet(this.getCoolingThresholdTemperature.bind(this))
        .setProps({
          minValue: this.minValue,
          maxValue: this.maxValue,
          minStep: THERMOSTAT_STEP_VALUE,
        })
        .updateValue(this.highTemperature || 0);

      this.service
        .getCharacteristic(this.platform.Characteristic.HeatingThresholdTemperature)
        .onSet(this.setHeatingThresholdTemperature.bind(this))
        .onGet(this.getHeatingThresholdTemperature.bind(this))
        .setProps({
          minValue: this.minValue,
          maxValue: this.maxValue,
          minStep: THERMOSTAT_STEP_VALUE,
        })
        .updateValue(this.lowTemperature || 0);
    }

    if (this.temperature) {
      this.service
        .getCharacteristic(this.platform.Characteristic.CurrentTemperature)
        .onGet(this.getCurrentTemperature.bind(this))
        .updateValue(this.temperature)
        .setProps({
          minValue: CURRENT_TEMP_MIN_C,
          maxValue: CURRENT_TEMP_MAX_C,
          minStep: THERMOSTAT_STEP_VALUE,
        });
    }

    // Determine valid values based on cooling capability
    const validValues = [this.platform.Characteristic.TargetHeatingCoolingState.OFF];
    let maxValue = this.platform.Characteristic.TargetHeatingCoolingState.HEAT;

    if (this.heater.coolingEnabled) {
      // For devices with both heating and cooling, only show OFF and AUTO
      validValues.push(this.platform.Characteristic.TargetHeatingCoolingState.AUTO);
      maxValue = this.platform.Characteristic.TargetHeatingCoolingState.AUTO;
    } else {
      // For heating-only devices, show OFF and HEAT
      validValues.push(this.platform.Characteristic.TargetHeatingCoolingState.HEAT);
    }

    this.service
      .getCharacteristic(this.platform.Characteristic.TargetHeatingCoolingState)
      .onGet(this.getMode.bind(this))
      .onSet(this.setMode.bind(this))
      .updateValue(this.getMode())
      .setProps({
        minValue: this.platform.Characteristic.TargetHeatingCoolingState.OFF,
        maxValue: maxValue,
        validValues: validValues,
      });
  }

  getMode(): CharacteristicValue {
    // If heater is not selected for this body, it's OFF
    if (this.body.heaterId !== this.heater.id) {
      return this.platform.Characteristic.TargetHeatingCoolingState.OFF;
    }

    // If heater is selected but no cooling capability, it's HEAT
    if (!this.heater.coolingEnabled) {
      return this.platform.Characteristic.TargetHeatingCoolingState.HEAT;
    }

    // For cooling-enabled heaters, if heater is selected it's AUTO
    return this.platform.Characteristic.TargetHeatingCoolingState.AUTO;
  }

  async setMode(value: CharacteristicValue) {
    this.platform.log.info(`Set heat power to ${value} for heater ${this.heater.name}`);
    let heater = this.heater.id;
    let mode = HeatMode.On;

    if (value === this.platform.Characteristic.TargetHeatingCoolingState.OFF) {
      heater = NO_HEATER_ID;
      mode = HeatMode.Off;
    } else if (
      value === this.platform.Characteristic.TargetHeatingCoolingState.AUTO ||
      value === this.platform.Characteristic.TargetHeatingCoolingState.HEAT ||
      value === this.platform.Characteristic.TargetHeatingCoolingState.COOL
    ) {
      // For AUTO, HEAT, or COOL modes, select this heater
      heater = this.heater.id;
      mode = HeatMode.On;
    }

    if (mode === HeatMode.On) {
      // Turn on the pump.
      const command = {
        command: IntelliCenterRequestCommand.SetParamList,
        messageID: uuidv4(),
        objectList: [
          {
            objnam: this.body.id,
            params: { [STATUS_KEY]: CircuitStatus.On } as never,
          } as CircuitStatusMessage,
        ],
      } as IntelliCenterRequest;
      this.platform.sendCommandNoWait(command);
    }

    const command = {
      command: IntelliCenterRequestCommand.SetParamList,
      messageID: uuidv4(),
      objectList: [
        {
          objnam: this.body.id,
          params: { [HEATER_KEY]: heater } as never,
        } as CircuitStatusMessage,
      ],
    } as IntelliCenterRequest;
    this.platform.sendCommandNoWait(command);
  }

  bindStaticValues() {
    this.service.updateCharacteristic(
      this.platform.Characteristic.TemperatureDisplayUnits,
      this.platform.getConfig().temperatureUnits === TemperatureUnits.F
        ? this.platform.Characteristic.TemperatureDisplayUnits.FAHRENHEIT
        : this.platform.Characteristic.TemperatureDisplayUnits.CELSIUS,
    );
    this.service.updateCharacteristic(this.platform.Characteristic.CurrentHeatingCoolingState, this.getCurrentHeatingCoolingState());
  }

  getCurrentHeatingCoolingState(): CharacteristicValue {
    const heatSource = this.body.heatSource;
    const heatMode = this.body.heatMode;

    this.platform.log.debug(
      `[${this.heater.name}] HTSRC: ${heatSource}, HTMODE: ${heatMode}, ` +
        `heater.id: ${this.heater.id}, temp: ${this.temperature}°C, low: ${this.lowTemperature}°C, high: ${this.highTemperature}°C`,
    );

    // Check HTSRC + HTMODE logic first if available
    const htSrcState = this.checkHeatSourceState(heatSource, heatMode);
    if (htSrcState !== null) {
      return htSrcState;
    }

    // Fallback to temperature comparison logic
    return this.checkTemperatureState();
  }

  private checkHeatSourceState(heatSource: string | undefined, heatMode: number | undefined): CharacteristicValue | null {
    // If we have no heatSource data, skip this check and fall back to heaterId/temperature logic
    if (!heatSource) {
      return null;
    }

    // If HTSRC is 00000, heater is completely OFF
    if (heatSource === '00000') {
      this.platform.log.debug(`[${this.heater.name}] HTSRC = ${heatSource}, heater is OFF`);
      return this.platform.Characteristic.CurrentHeatingCoolingState.OFF;
    }

    // If this heater is not the one assigned to the body, it's OFF
    if (heatSource !== this.heater.id) {
      this.platform.log.debug(`[${this.heater.name}] HTSRC = ${heatSource} != ${this.heater.id}, heater not selected`);
      return this.platform.Characteristic.CurrentHeatingCoolingState.OFF;
    }

    // Non-00000 HTSRC + valid HTMODE determines heating status
    if (heatMode !== undefined && heatMode !== null) {
      // Ensure heatMode is a number (defensive type conversion)
      const heatModeNum = typeof heatMode === 'string' ? Number(heatMode) : heatMode;
      if (!isNaN(heatModeNum)) {
        return this.getStateFromHeatMode(heatSource, heatModeNum);
      }
    }

    return null; // No valid HTMODE, fall back to temperature comparison
  }

  private getStateFromHeatMode(heatSource: string, heatMode: number): CharacteristicValue {
    if (heatMode === 9) {
      this.platform.log.debug(`[${this.heater.name}] HTSRC = ${heatSource}, HTMODE = 9, actively cooling`);
      return this.platform.Characteristic.CurrentHeatingCoolingState.COOL;
    } else if (heatMode >= 1) {
      this.platform.log.debug(`[${this.heater.name}] HTSRC = ${heatSource}, HTMODE = ${heatMode}, actively heating`);
      return this.platform.Characteristic.CurrentHeatingCoolingState.HEAT;
    } else {
      this.platform.log.debug(`[${this.heater.name}] HTSRC = ${heatSource}, HTMODE = 0, heater idle`);
      return this.platform.Characteristic.CurrentHeatingCoolingState.OFF;
    }
  }

  private checkTemperatureState(): CharacteristicValue {
    // First check if this heater is even assigned to this body via heaterId
    if (this.body.heaterId !== this.heater.id) {
      return this.platform.Characteristic.CurrentHeatingCoolingState.OFF;
    }

    if (!this.temperature) {
      return this.platform.Characteristic.CurrentHeatingCoolingState.OFF;
    }

    if (this.heater.coolingEnabled) {
      if (this.highTemperature && this.temperature > this.highTemperature) {
        return this.platform.Characteristic.CurrentHeatingCoolingState.COOL;
      }
      if (this.lowTemperature && this.temperature < this.lowTemperature) {
        return this.platform.Characteristic.CurrentHeatingCoolingState.HEAT;
      }
      return this.platform.Characteristic.CurrentHeatingCoolingState.OFF;
    }

    if (this.lowTemperature && this.temperature < this.lowTemperature) {
      return this.platform.Characteristic.CurrentHeatingCoolingState.HEAT;
    }

    return this.platform.Characteristic.CurrentHeatingCoolingState.OFF;
  }

  async setTargetTemperature(value: CharacteristicValue) {
    const convertedValue: number = this.isFahrenheit
      ? Math.round(celsiusToFahrenheit(value as number)) // Round to nearest 5
      : (value as number);

    this.platform.log.info(`Setting temperature ${value} converted/rounded to: ${convertedValue}` + `for heater ${this.heater.name}`);
    const command = {
      command: IntelliCenterRequestCommand.SetParamList, //Weirdly required.
      messageID: uuidv4(),
      objectList: [
        {
          objnam: this.body.id,
          params: { [LOW_TEMP_KEY]: `${convertedValue}` } as never,
        } as CircuitStatusMessage,
      ],
    } as IntelliCenterRequest;
    this.platform.sendCommandNoWait(command);
  }

  async getCurrentTemperature(): Promise<Nullable<CharacteristicValue>> {
    return this.temperature || -1;
  }

  async getTargetTemperature(): Promise<Nullable<CharacteristicValue>> {
    return this.lowTemperature || this.minValue;
  }

  async setCoolingThresholdTemperature(value: CharacteristicValue) {
    const convertedValue: number = this.isFahrenheit ? Math.round(celsiusToFahrenheit(value as number)) : (value as number);

    this.platform.log.info(
      `Setting cooling threshold temperature ${value} converted/rounded to: ${convertedValue} for heater ${this.heater.name}`,
    );
    const command = {
      command: IntelliCenterRequestCommand.SetParamList,
      messageID: uuidv4(),
      objectList: [
        {
          objnam: this.body.id,
          params: { [HIGH_TEMP_KEY]: `${convertedValue}` } as never,
        } as CircuitStatusMessage,
      ],
    } as IntelliCenterRequest;
    this.platform.sendCommandNoWait(command);
  }

  async getCoolingThresholdTemperature(): Promise<Nullable<CharacteristicValue>> {
    return this.highTemperature || this.maxValue;
  }

  async setHeatingThresholdTemperature(value: CharacteristicValue) {
    const convertedValue: number = this.isFahrenheit ? Math.round(celsiusToFahrenheit(value as number)) : (value as number);

    this.platform.log.info(
      `Setting heating threshold temperature ${value} converted/rounded to: ${convertedValue} for heater ${this.heater.name}`,
    );
    const command = {
      command: IntelliCenterRequestCommand.SetParamList,
      messageID: uuidv4(),
      objectList: [
        {
          objnam: this.body.id,
          params: { [LOW_TEMP_KEY]: `${convertedValue}` } as never,
        } as CircuitStatusMessage,
      ],
    } as IntelliCenterRequest;
    this.platform.sendCommandNoWait(command);
  }

  async getHeatingThresholdTemperature(): Promise<Nullable<CharacteristicValue>> {
    return this.lowTemperature || this.minValue;
  }

  updateTemperatureRanges(body: Body): void {
    const oldLowTemp = this.lowTemperature;
    const oldHighTemp = this.highTemperature;
    const oldTemperature = this.temperature;

    this.lowTemperature = body.lowTemperature;
    this.highTemperature = body.highTemperature;

    // Update current body temperature and body data
    if (body.temperature !== undefined && body.temperature !== null) {
      this.temperature = this.isFahrenheit ? fahrenheitToCelsius(body.temperature) : body.temperature;
      this.body.temperature = body.temperature;
    }

    // Update body heating mode for HTMODE-based status
    if (body.heatMode !== undefined) {
      this.body.heatMode = body.heatMode;
    }

    if (this.isFahrenheit) {
      if (this.lowTemperature) {
        this.lowTemperature = fahrenheitToCelsius(this.lowTemperature);
      }
      if (this.highTemperature) {
        this.highTemperature = fahrenheitToCelsius(this.highTemperature);
      }
    }

    // Update HomeKit characteristic if current temperature changed
    if (this.temperature !== oldTemperature && this.temperature !== undefined) {
      this.service.updateCharacteristic(this.platform.Characteristic.CurrentTemperature, this.temperature);
      this.platform.log.debug(
        `[${this.heater.name}] Updated current temperature: ` +
          `${body.temperature}${this.isFahrenheit ? 'F' : 'C'} -> ${this.temperature}C`,
      );
    }

    // Update heating/cooling status based on new body data (including HTMODE)
    this.service.updateCharacteristic(this.platform.Characteristic.CurrentHeatingCoolingState, this.getCurrentHeatingCoolingState());

    // Update HomeKit characteristic props if ranges changed
    const rangeChanged = oldLowTemp !== this.lowTemperature || oldHighTemp !== this.highTemperature;
    if (rangeChanged) {
      this.updateCharacteristicProps();
    }
  }

  private updateCharacteristicProps(): void {
    // Use actual body temperature limits if available, otherwise use platform limits
    const actualMinValue = this.lowTemperature ? this.lowTemperature - 5 : this.minValue;
    const actualMaxValue = this.highTemperature ? this.highTemperature + 5 : this.maxValue;

    this.platform.log.info(
      `Updating heater ${this.heater.name} temperature range: ${actualMinValue}°-${actualMaxValue}° ` +
        `(low: ${this.lowTemperature}, high: ${this.highTemperature}) ${this.isFahrenheit ? 'F' : 'C'}`,
    );

    if (this.lowTemperature) {
      this.service.getCharacteristic(this.platform.Characteristic.TargetTemperature).setProps({
        minValue: actualMinValue,
        maxValue: actualMaxValue,
        minStep: THERMOSTAT_STEP_VALUE,
      });
    }

    if (this.heater.coolingEnabled && this.highTemperature) {
      this.service.getCharacteristic(this.platform.Characteristic.CoolingThresholdTemperature).setProps({
        minValue: actualMinValue,
        maxValue: actualMaxValue,
        minStep: THERMOSTAT_STEP_VALUE,
      });

      this.service.getCharacteristic(this.platform.Characteristic.HeatingThresholdTemperature).setProps({
        minValue: actualMinValue,
        maxValue: actualMaxValue,
        minStep: THERMOSTAT_STEP_VALUE,
      });
    }
  }
}
