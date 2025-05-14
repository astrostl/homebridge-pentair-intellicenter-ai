import {API, Characteristic, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig, Service} from 'homebridge';

import {PLATFORM_NAME, PLUGIN_NAME} from './settings';
import {CircuitAccessory} from './circuitAccessory';
import Telnet from 'telnet-client';
import {
  BaseCircuit,
  Body,
  Circuit,
  CircuitStatusMessage,
  CircuitTypes,
  Heater,
  IntelliCenterQueryName,
  IntelliCenterRequest,
  IntelliCenterRequestCommand,
  IntelliCenterResponse,
  IntelliCenterResponseCommand,
  IntelliCenterResponseStatus,
  Module,
  ObjectType,
  Panel,
  PumpCircuit,
  Sensor,
  SensorTypes,
  TemperatureSensorType,
  TemperatureUnits,
} from './types';
import {v4 as uuidv4} from 'uuid';
import {mergeResponse, transformPanels, updateBody, updateCircuit, updatePump} from './util';
import {
  ACT_KEY,
  DISCOVER_COMMANDS,
  HEAT_SOURCE_KEY,
  HEATER_KEY,
  LAST_TEMP_KEY,
  MODE_KEY,
  PROBE_KEY,
  SELECT_KEY,
  SPEED_KEY,
  STATUS_KEY,
} from './constants';
import {HeaterAccessory} from './heaterAccessory';
import EventEmitter from 'events';
import { TemperatureAccessory } from './temperatureAccessory';

type PentairConfig = {
  ipAddress: string;
  username: string;
  password: string;
  maxBufferSize: number;
  temperatureUnits: TemperatureUnits;
  minimumTemperature: number;
  maximumTemperature: number;
  supportVSP: boolean;
  airTemp: boolean;
} & PlatformConfig;

/**
 * HomebridgePlatform
 * This class is the main constructor for your plugin, this is where you should
 * parse the user config and discover/register accessories with Homebridge.
 */
export class PentairPlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service = this.api.hap.Service;
  public readonly Characteristic: typeof Characteristic = this.api.hap.Characteristic;

  // this is used to track restored cached accessories
  public readonly accessoryMap: Map<string, PlatformAccessory> = new Map();
  public readonly heaters: Map<string, PlatformAccessory> = new Map();

  private readonly connection: Telnet;
  private readonly maxBufferSize: number;
  private readonly discoverCommandsSent: Array<string>;
  private discoveryBuffer: never | never[] | undefined;
  private buffer = '';
  private readonly pumpIdToCircuitMap: Map<string, Circuit>;

  // Telnet connection status
  private lastMessageReceived = Date.now();
  private isSocketAlive = false;
  // Used by "maybereconnect" logic
  private reconnecting = false;
  private lastReconnectTime = 0;

  constructor(
    public readonly log: Logger,
    public readonly config: PlatformConfig,
    public readonly api: API,
  ) {
    this.log.debug('Finished initializing platform:', this.config.name);

    this.connection = new Telnet();
    this.setupSocketEventHandlers();
    const co = this.getConfig();
    this.maxBufferSize = co.maxBufferSize || 1048576; // Default to 1MB
    this.discoverCommandsSent = [];
    this.discoveryBuffer = undefined;
    this.pumpIdToCircuitMap = new Map<string, Circuit>();

    if (!co.ipAddress) {
      this.log.error('IP address is not configured. Cannot connect to Intellicenter');
      return;
    }

    // When this event is fired it means Homebridge has restored all cached accessories from disk.
    // Dynamic Platform plugins should only register new accessories after this event was fired,
    // in order to ensure they weren't added to homebridge already. This event can also be used
    // to start discovery of new accessories.
    this.api.on('didFinishLaunching', async () => {
      await this.connectToIntellicenter();
    });

    setInterval(() => {
      const now = Date.now();
      const silence = now - this.lastMessageReceived;

      if (this.isSocketAlive && silence > 4 * 60 * 60 * 1000 /* 4 hours */) {
        this.log.warn('No data from IntelliCenter in over 4 hours. Closing and restarting connection.');
        this.connection.destroy();
        this.isSocketAlive = false;
        this.delay(30 * 1000).then(async () => {
          await this.maybeReconnect();
        });
      }
    }, 60000);
  }

  async connectToIntellicenter() {
    const co = this.getConfig();
    const telnetParams = {
      host: co.ipAddress,
      port: 6681, //doesn't look like there's any reason to make configurable.
      negotiationMandatory: false,
      timeout: 1500,
      debug: true,
      username: co.username,
      password: co.password,
    };
    try {
      await this.connection.connect(telnetParams);
    } catch (error) {
      this.log.error(`Connection to IntelliCenter failed. Check config: ${this.json(telnetParams)}`, error);
    }
  }

  setupSocketEventHandlers() {
    EventEmitter.defaultMaxListeners = 50;
    this.connection.on('data', async (chunk) => {
      if (chunk.length > 0 && chunk[chunk.length - 1] === 10) {
        this.lastMessageReceived = Date.now();
        const bufferedData = this.buffer + chunk;
        this.buffer = '';
        const lines = bufferedData.split(/\n/);
        for (const line of lines) {
          try {
            if (line) {
              const response = JSON.parse(line) as IntelliCenterResponse;
              await this.handleUpdate(response);
            }
          } catch (error) {
            this.log.error(`Failed to parse line in response from IntelliCenter. Response will not be handled: ${line}`, error);
          }
        }
      } else if (this.buffer.length > this.maxBufferSize) {
        this.log.error(`Exceeded max buffer size ${this.maxBufferSize} without a newline. Discarding buffer.`);
        this.buffer = '';
      } else {
        this.log.debug('Received incomplete data in data handler.');
        this.buffer += chunk;
      }
    });

    this.connection.on('connect', () => {
      this.isSocketAlive = true;
      this.log.debug('IntelliCenter socket connection has been established.');
      this.discoverCommandsSent.length = 0;
      this.discoveryBuffer = undefined;
      try {
        this.discoverDevices();
      } catch (error) {
        this.log.error('IntelliCenter device discovery failed.', error);
      }
    });

    this.connection.on('ready', () => {
      this.isSocketAlive = true;
      this.log.debug('IntelliCenter socket connection is ready.');

    });

    this.connection.on('failedlogin', (data) => {
      this.isSocketAlive = false;
      this.log.error(`IntelliCenter login failed. Check configured username/password. ${data}`);
    });

    this.connection.on('close', () => {
      this.isSocketAlive = false;
      this.log.error('IntelliCenter socket has been closed. Waiting 30 seconds and attempting to reconnect...');
      this.delay(30000).then(async () => {
        this.log.info('Finished waiting. Attempting reconnect...');
        await this.maybeReconnect();
      });
    });

    this.connection.on('error', (data) => {
      this.isSocketAlive = false;
      this.log.error(`IntelliCenter socket error has been detected. Socket will be closed. ${data}`);
    });

    this.connection.on('end', (data) => {
      this.isSocketAlive = false;
      this.log.error(`IntelliCenter socket connection has ended. ${data}`);
    });

    this.connection.on('responseready', (data) => {
      this.log.error(`IntelliCenter responseready. ${data}`);
    });
  }

  /**
   * This function is invoked when homebridge restores cached accessories from disk at startup.
   * It should be used to setup event handlers for characteristics and update respective values.
   */
  configureAccessory(accessory: PlatformAccessory) {
    this.log.debug('Loading accessory from cache:', accessory.displayName);

    // const config = this.getConfig();
    // const sensor = accessory.context.sensor;
    const heater = accessory.context.heater;

    // add the restored accessory to the accessories cache so we can track if it has already been registered
    this.accessoryMap.set(accessory.UUID, accessory);
    if (heater) {
      this.heaters.set(accessory.UUID, heater);
    }
  }

  async handleUpdate(response: IntelliCenterResponse) {
    if (response.response && response.response !== IntelliCenterResponseStatus.Ok) {
      this.log.error(`Received unsuccessful response code ${response.response} from IntelliCenter. Message: ${this.json(response)}`);
      return;
    } else if (Object.values(IntelliCenterRequestCommand).includes(response.command as never)) {
      this.log.debug(`Request with message ID ${response.messageID} was successful.`);
      return;
    } else if (IntelliCenterResponseCommand.SendQuery === response.command &&
      IntelliCenterQueryName.GetHardwareDefinition === response.queryName) {
      this.handleDiscoveryResponse(response);
    } else if ([IntelliCenterResponseCommand.NotifyList, IntelliCenterResponseCommand.WriteParamList].includes(response.command)) {
      this.log.debug(`Handling IntelliCenter ${response.response} response to` +
        `${response.command}.${response.queryName} for message ID ${response.messageID}: ${this.json(response)}`);
      if (!response.objectList) {
        this.log.error('Object list missing in NotifyList response.');
        return;
      }
      response.objectList.forEach((objListResponse) => {
        const changes = (objListResponse.changes || [objListResponse]) as ReadonlyArray<CircuitStatusMessage>;
        changes.forEach((change) => {
          if (change.objnam && change.params) {
            this.log.debug(`Handling update for ${change.objnam}`);
            const circuit = this.pumpIdToCircuitMap.get(change.objnam);
            if (circuit) {
              this.log.debug(`Update is for pump ID ${change.objnam}. Updating circuit ${circuit.id}`);
              const uuid = this.api.hap.uuid.generate(circuit.id);
              const existingAccessory = this.accessoryMap.get(uuid) as PlatformAccessory;
              this.updatePump(existingAccessory, change.params);
            } else {
              const uuid = this.api.hap.uuid.generate(change.objnam);
              const existingAccessory = this.accessoryMap.get(uuid);
              if (existingAccessory) {
                if (CircuitTypes.has(existingAccessory.context.circuit?.objectType)) {
                  this.log.debug(`Object is a circuit. Updating circuit: ${change.objnam}`);
                  this.updateCircuit(existingAccessory, change.params);
                } else if (SensorTypes.has(existingAccessory.context.sensor?.objectType)) {
                  this.log.debug(`Object is a sensor. Updating sensor: ${change.objnam}`);
                  this.updateSensor(existingAccessory, change.params);
                } else {
                  this.log.warn(`Unhandled object type on accessory: ${JSON.stringify(existingAccessory.context)}`);
                }
              } else {
                this.log.warn(`Existing accessory not found: ${change.objnam}. Skipping update.`);
              }
            }
          }
        });
      });

    } else {
      this.log.debug(`Unhandled command in handleUpdate: ${this.json(response)}`);
    }
  }

  updatePump(accessory: PlatformAccessory, params: never) {
    updateCircuit(accessory.context.pumpCircuit, params);
    updatePump(accessory.context.pumpCircuit, params);
    this.api.updatePlatformAccessories([accessory]);
    new CircuitAccessory(this, accessory);
  }


  updateCircuit(accessory: PlatformAccessory, params: never) {
    updateCircuit(accessory.context.circuit, params);
    if (accessory.context.circuit.objectType === ObjectType.Body) {
      const body = accessory.context.circuit as Body;
      updateBody(body, params);
      this.updateHeaterStatuses(body);
    }
    this.api.updatePlatformAccessories([accessory]);
    new CircuitAccessory(this, accessory);
  }

  updateSensor(accessory: PlatformAccessory, params: never) {
    if (accessory.context.sensor) {
      const sensor = accessory.context.sensor;
      if (sensor.objectType === ObjectType.Sensor) {
        this.log.debug(`Updating temperature sensor ${sensor.name}`);
        if (params[PROBE_KEY]) {
          const probeValue = parseFloat(params[PROBE_KEY]);
          sensor.probe = probeValue;
          new TemperatureAccessory(this, accessory).updateTemperature(probeValue);
        }
      }
    }
    this.api.updatePlatformAccessories([accessory]);
  }

  updateHeaterStatuses(body: Body) {
    this.heaters.forEach(((heaterAccessory) => {
      if (heaterAccessory.context?.body?.id === body.id) {
        this.log.debug(`Updating heater ${heaterAccessory.displayName}`);
        heaterAccessory.context.body = body;
        this.api.updatePlatformAccessories([heaterAccessory]);
        new HeaterAccessory(this, heaterAccessory);
      } else {
        this.log.debug(`Not updating heater because body id of heater ${heaterAccessory.context.body?.id} ` +
          `doesn't match input body ID ${body.id}`);
      }
    }));
  }


  /**
   * This is an example method showing how to register discovered accessories.
   * Accessories must only be registered once, previously created accessories
   * must not be registered again to prevent "duplicate UUID" errors.
   */
  discoverDevices() {
    this.discoverDeviceType(DISCOVER_COMMANDS[0]);
  }

  discoverDeviceType(deviceType: string) {
    this.discoverCommandsSent.push(deviceType);
    const command = {
      command: IntelliCenterRequestCommand.GetQuery,
      queryName: IntelliCenterQueryName.GetHardwareDefinition,
      arguments: deviceType,
      messageID: uuidv4(),
    } as IntelliCenterRequest;
    this.sendCommandNoWait(command);
  }

  handleDiscoveryResponse(response: IntelliCenterResponse) {
    this.log.debug(`Discovery response from IntelliCenter: ${this.json(response)} ` +
      `of type ${this.discoverCommandsSent[this.discoverCommandsSent.length - 1]}`);
    if (this.discoveryBuffer === undefined) {
      this.discoveryBuffer = response.answer;
    } else {
      mergeResponse(this.discoveryBuffer, response.answer);
    }

    if (this.discoverCommandsSent.length !== DISCOVER_COMMANDS.length) {
      // Send next discovery command and return until we're done.
      this.log.debug(`Merged ${this.discoverCommandsSent.length} of ${DISCOVER_COMMANDS.length} so far. Sending next command..`);
      this.discoverDeviceType(DISCOVER_COMMANDS[this.discoverCommandsSent.length]);
      return;
    }

    this.log.debug(`Discovery commands completed. Response: ${this.json(this.discoveryBuffer)}`);

    const panels = transformPanels(this.discoveryBuffer);
    this.log.debug(`Transformed panels from IntelliCenter: ${this.json(panels)}`);

    this.pumpIdToCircuitMap.clear();
    const circuitIdPumpMap = new Map<string, PumpCircuit>();
    const bodyIdMap = new Map<string, Body>();
    let heaters = [] as ReadonlyArray<Heater>;
    for (const panel of panels) {
      for (const sensor of panel.sensors) {
        this.discoverTemperatureSensor(panel, null, sensor);
      }
      for (const pump of panel.pumps) {
        for (const pumpCircuit of pump.circuits as ReadonlyArray<PumpCircuit>) {
          circuitIdPumpMap.set(pumpCircuit.circuitId, pumpCircuit);
          this.subscribeForUpdates(pumpCircuit, [STATUS_KEY, ACT_KEY, SPEED_KEY, SELECT_KEY]);
        }
      }
      for (const module of panel.modules) {
        for (const body of module.bodies) {
          this.discoverCircuit(panel, module, body, circuitIdPumpMap.get(body.circuit?.id as string));
          this.subscribeForUpdates(body, [STATUS_KEY, LAST_TEMP_KEY, HEAT_SOURCE_KEY, HEATER_KEY, MODE_KEY]);
          bodyIdMap.set(body.id, body);
        }
        for (const feature of module.features) {
          this.discoverCircuit(panel, module, feature, circuitIdPumpMap.get(feature.id));
          this.subscribeForUpdates(feature, [STATUS_KEY, ACT_KEY]);
        }
        heaters = heaters.concat(module.heaters);
      }
      for (const feature of panel.features) {
        this.discoverCircuit(panel, null, feature, circuitIdPumpMap.get(feature.id));
        this.subscribeForUpdates(feature, [STATUS_KEY, ACT_KEY]);
      }
    }
    for (const heater of heaters) {
      this.discoverHeater(heater, bodyIdMap);
    }
  }

  discoverHeater(heater: Heater, bodyMap: ReadonlyMap<string, Body>) {
    heater.bodyIds.forEach((bodyId) => {
      const body = bodyMap.get(bodyId);

      if (body) {
        const uuid = this.api.hap.uuid.generate(`${heater.id}.${bodyId}`);

        let accessory = this.accessoryMap.get(uuid);
        const name = `${body.name} ${heater.name}`;
        if (accessory) {
          this.log.debug(`Restoring existing heater from cache: ${accessory.displayName}`);
          accessory.context.body = body;
          accessory.context.heater = heater;
          this.api.updatePlatformAccessories([accessory]);
          new HeaterAccessory(this, accessory);
        } else {
          this.log.debug(`Adding new heater: ${heater.name}`);
          accessory = new this.api.platformAccessory(name, uuid);
          accessory.context.body = body;
          accessory.context.heater = heater;
          new HeaterAccessory(this, accessory);
          this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
          this.accessoryMap.set(accessory.UUID, accessory);
        }
        this.heaters.set(uuid, accessory);
      } else {
        this.log.error(`Body not in bodyMap for ID ${bodyId}. Map: ${this.json(bodyMap)}`);
      }
    });
  }

  discoverCircuit(panel: Panel, module: Module | null, circuit: Circuit, pumpCircuit: PumpCircuit | undefined) {
    const uuid = this.api.hap.uuid.generate(circuit.id);

    const existingAccessory = this.accessoryMap.get(uuid);

    if (existingAccessory) {
      this.log.debug(`Restoring existing circuit from cache: ${existingAccessory.displayName}`);
      existingAccessory.context.circuit = circuit;
      existingAccessory.context.module = module;
      existingAccessory.context.panel = panel;
      existingAccessory.context.pumpCircuit = pumpCircuit;
      this.api.updatePlatformAccessories([existingAccessory]);
      new CircuitAccessory(this, existingAccessory);
    } else {
      this.log.debug(`Adding new circuit: ${circuit.name}`);
      const accessory = new this.api.platformAccessory(circuit.name, uuid);
      accessory.context.circuit = circuit;
      accessory.context.module = module;
      accessory.context.panel = panel;
      accessory.context.pumpCircuit = pumpCircuit;
      new CircuitAccessory(this, accessory);
      this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
      this.accessoryMap.set(accessory.UUID, accessory);
    }
    if (pumpCircuit) {
      this.pumpIdToCircuitMap.set(pumpCircuit.id, circuit);
    }
  }

  discoverTemperatureSensor(panel: Panel, module: Module | null, sensor: Sensor) {
    const uuid = this.api.hap.uuid.generate(sensor.id);

    const hasHeater = panel.modules.some(m => m.heaters.length > 0);
    const existingAccessory = this.accessoryMap.get(uuid);
    let remove = false;
    this.log.debug(`Config ${this.json(this.getConfig())}`);
    if (!this.getConfig().airTemp && sensor.type === TemperatureSensorType.Air) {
      this.log.debug(`Skipping air temperature sensor ${sensor.name} because air temperature is disabled in config`);
      remove = true;
    }

    if (sensor.type === TemperatureSensorType.Pool && hasHeater) {
      this.log.debug(`Skipping water temperature sensor ${sensor.name} because a heater is installed`);
      remove = true;
    }

    if (remove) {
      if (existingAccessory) {
        this.accessoryMap.delete(uuid);
        this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [existingAccessory]);
      }
      return;
    }

    if (existingAccessory) {
      this.log.debug(`Restoring existing temperature sensor from cache: ${existingAccessory.displayName}`);
      existingAccessory.context.sensor = sensor;
      existingAccessory.context.module = module;
      existingAccessory.context.panel = panel;
      this.api.updatePlatformAccessories([existingAccessory]);

      new TemperatureAccessory(this, existingAccessory);
    } else {
      this.log.debug(`Adding new temperature sensor: ${sensor.name} of type ${sensor.type}`);
      const accessory = new this.api.platformAccessory(sensor.name, uuid);
      accessory.context.sensor = sensor;
      accessory.context.module = module;
      accessory.context.panel = panel;
      new TemperatureAccessory(this, accessory);
      this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
      this.accessoryMap.set(accessory.UUID, accessory);
    }

    this.subscribeForUpdates(sensor, [PROBE_KEY]);
  }

  subscribeForUpdates(circuit: BaseCircuit, keys: ReadonlyArray<string>) {
    const command = {
      command: IntelliCenterRequestCommand.RequestParamList,
      messageID: uuidv4(),
      objectList: [
        {
          objnam: circuit.id,
          keys: keys,
        },
      ],
    } as IntelliCenterRequest;
    // No need to await. We'll handle in the update handler.
    this.sendCommandNoWait(command);
  }

  getConfig(): PentairConfig {
    return this.config as PentairConfig;
  }

  json(data) {
    return JSON.stringify(data, null, 2);
  }

  sendCommandNoWait(command: IntelliCenterRequest): void {
    if (!this.isSocketAlive) {
      this.log.warn(`Cannot send command, socket is not alive: ${this.json(command)}`);
      this.maybeReconnect();
      return;
    }

    const commandString = JSON.stringify(command);
    this.log.debug(`Sending fire and forget command to IntelliCenter: ${commandString}`);
    this.connection.send(commandString).catch((error) => {
      this.log.error(`Caught error in sendCommandNoWait for command ${this.json(command)}`, error);
      this.maybeReconnect();
    });
  }

  delay(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private async maybeReconnect() {
    const now = Date.now();

    if (this.reconnecting) {
      this.log.warn('Reconnect already in progress. Skipping.');
      return;
    }

    if (now - this.lastReconnectTime < 30 * 1000) {
      this.log.warn('Reconnect suppressed: too soon after last one.');
      return;
    }

    this.reconnecting = true;
    this.lastReconnectTime = now;

    try {
      this.log.warn('Attempting reconnect to IntelliCenter...');
      this.connection.destroy();
      await this.connectToIntellicenter();
      this.log.info('Reconnect requested.');
    } catch (error) {
      this.log.error('Reconnect failed.', error);
    } finally {
      this.reconnecting = false;
    }
  }
}
