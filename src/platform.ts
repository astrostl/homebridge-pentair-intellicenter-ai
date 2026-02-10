import { API, Characteristic, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig, Service } from 'homebridge';
import * as net from 'net';

import { PLATFORM_NAME, PLUGIN_NAME } from './settings';
import { CircuitAccessory } from './circuitAccessory';
import { IntelliBriteAccessory } from './intelliBriteAccessory';
import { Telnet } from 'telnet-client';
import {
  BaseCircuit,
  Body,
  Circuit,
  CircuitStatus,
  CircuitStatusMessage,
  CircuitType,
  CircuitTypes,
  DiscoveryAnswer,
  Heater,
  IntelliCenterParams,
  IntelliCenterQueryName,
  IntelliCenterRequest,
  IntelliCenterRequestCommand,
  IntelliCenterResponse,
  IntelliCenterResponseCommand,
  IntelliCenterResponseStatus,
  Module,
  ObjectType,
  Panel,
  Pump,
  PumpCircuit,
  Sensor,
  SensorTypes,
  TemperatureSensorType,
} from './types';
import { v4 as uuidv4 } from 'uuid';
import { mergeResponse, transformPanels, updateBody, updateCircuit, updatePump } from './util';
import {
  ACT_KEY,
  DISCOVER_COMMANDS,
  HEAT_SOURCE_KEY,
  HEATER_KEY,
  HIGH_TEMP_KEY,
  LAST_TEMP_KEY,
  LOW_TEMP_KEY,
  HTMODE_KEY,
  MODE_KEY,
  PROBE_KEY,
  PUMP_TYPE_MAPPING,
  SELECT_KEY,
  SPEED_KEY,
  STATUS_KEY,
  USE_KEY,
} from './constants';
import { HeaterAccessory } from './heaterAccessory';
import EventEmitter from 'events';
import { TemperatureAccessory } from './temperatureAccessory';
import { PumpRpmAccessory } from './pumpRpmAccessory';
import { PumpGpmAccessory } from './pumpGpmAccessory';
import { PumpWattsAccessory } from './pumpWattsAccessory';
import { CircuitBreaker, RetryManager, HealthMonitor, RateLimiter, CircuitBreakerState, DeadLetterQueue } from './errorHandling';
import { ConfigValidator } from './configValidation';

import { PentairConfig } from './configValidation';

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
  public readonly heaterInstances: Map<string, HeaterAccessory> = new Map();
  public readonly intelliBriteInstances: Map<string, IntelliBriteAccessory> = new Map();

  private connection!: Telnet;
  private maxBufferSize!: number;
  private discoverCommandsSent!: Array<string>;
  private discoverCommandsFailed!: Array<string>;
  private discoveryBuffer: DiscoveryAnswer | null = null;
  private discoveryTimeout: NodeJS.Timeout | null = null;
  private buffer = '';
  private pumpIdToCircuitMap!: Map<string, Circuit>;

  // New pump-circuit association mappings
  private pumpToCircuitsMap!: Map<string, Set<string>>; // PMP01 -> {C0006, C0001, ...}
  private circuitToPumpMap!: Map<string, string>; // C0006 -> PMP01
  private pumpCircuitToPumpMap!: Map<string, string>; // p0101 -> PMP01

  // Track pump circuits and their current data for highest RPM calculation
  private activePumpCircuits!: Map<string, PumpCircuit>; // pumpCircuitId -> PumpCircuit

  // Track if shutdown handlers have been setup to prevent duplicates
  private static shutdownHandlersSetup = false;

  // Temperature unit validation tracking
  private temperatureReadings: number[] = [];
  private temperatureUnitValidated = false;
  private temperatureValidationInterval: NodeJS.Timeout | null = null;

  // Telnet connection status
  private lastMessageReceived = Date.now();
  private isSocketAlive = false;
  // Used by "maybereconnect" logic
  private reconnecting = false;
  private lastReconnectTime = 0;
  // Error tracking for ParseError issues
  private parseErrorCount = 0;
  private parseErrorResetTime = Date.now();
  // Command queue to prevent overwhelming IntelliCenter
  private commandQueue: IntelliCenterRequest[] = [];
  private processingQueue = false;
  // Heartbeat interval for cleanup
  private heartbeatInterval: NodeJS.Timeout | null = null;

  // Error handling and resilience components
  private circuitBreaker!: CircuitBreaker;
  private healthMonitor!: HealthMonitor;
  private rateLimiter!: RateLimiter;
  private deadLetterQueue!: DeadLetterQueue;
  private validatedConfig: PentairConfig | null = null;

  constructor(
    public readonly log: Logger,
    public readonly config: PlatformConfig,
    public readonly api: API,
  ) {
    this.log.debug('Finished initializing platform:', this.config.name);

    if (!this.validateConfiguration()) {
      return;
    }

    this.initializeComponents();
    this.initializeDataStructures();
    this.setupGracefulShutdown();
    this.setupApiEventHandlers();
    this.setupHeartbeatMonitoring();
  }

  private validateConfiguration(): boolean {
    const validation = ConfigValidator.validate(this.config);
    if (!validation.isValid) {
      this.log.error('Configuration validation failed:');
      validation.errors.forEach(error => this.log.error(`  - ${error}`));
      return false;
    }

    validation.warnings?.forEach(warning => this.log.warn(`Config Warning: ${warning}`));
    this.validatedConfig = validation.sanitizedConfig!;
    this.log.info('Configuration validated successfully');
    return true;
  }

  private initializeComponents(): void {
    this.circuitBreaker = new CircuitBreaker({
      failureThreshold: 5,
      resetTimeout: 300000, // 5 minutes
      monitoringPeriod: 60000, // 1 minute
    });

    this.healthMonitor = new HealthMonitor();
    this.rateLimiter = new RateLimiter(40, 60000); // 40 requests per minute - more reasonable for normal operation
    this.deadLetterQueue = new DeadLetterQueue(100, 24 * 60 * 60 * 1000); // 100 items, 24 hour retention

    this.connection = new Telnet();
    this.setupSocketEventHandlers();
  }

  private initializeDataStructures(): void {
    this.maxBufferSize = this.validatedConfig!.maxBufferSize;
    this.discoverCommandsSent = [];
    this.discoverCommandsFailed = [];
    this.discoveryBuffer = null;
    this.discoveryTimeout = null;
    this.pumpIdToCircuitMap = new Map<string, Circuit>();

    // Initialize new pump-circuit association mappings
    this.pumpToCircuitsMap = new Map<string, Set<string>>();
    this.circuitToPumpMap = new Map<string, string>();
    this.pumpCircuitToPumpMap = new Map<string, string>();
    this.activePumpCircuits = new Map<string, PumpCircuit>();
  }

  private setupApiEventHandlers(): void {
    this.api.on('didFinishLaunching', async () => {
      await this.connectToIntellicenter();
    });
  }

  private setupHeartbeatMonitoring(): void {
    this.heartbeatInterval = setInterval(() => {
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

  /**
   * Validate network connectivity to IntelliCenter before attempting Telnet connection
   */
  private async validateNetworkConnectivity(host: string, port: number): Promise<boolean> {
    return new Promise(resolve => {
      const context = this.createNetworkCheckContext(host, port, resolve);
      this.setupNetworkCheckHandlers(context);
      this.initiateNetworkConnection(context);
    });
  }

  private createNetworkCheckContext(host: string, port: number, resolve: (value: boolean) => void) {
    const socket = new net.Socket();
    const timeout = 5000; // 5 second timeout
    let hasResolved = false;

    const resolveOnce = (result: boolean) => {
      if (!hasResolved) {
        hasResolved = true;
        socket.destroy();
        resolve(result);
      }
    };

    const timer = setTimeout(() => {
      this.log.warn(`Network connectivity check timeout for ${host}:${port}`);
      resolveOnce(false);
    }, timeout);

    return { socket, timer, host, port, resolveOnce };
  }

  private setupNetworkCheckHandlers(context: {
    socket: net.Socket;
    timer: NodeJS.Timeout;
    host: string;
    port: number;
    resolveOnce: (result: boolean) => void;
  }) {
    const { socket, timer, host, port, resolveOnce } = context;

    socket.on('connect', () => {
      clearTimeout(timer);
      this.log.debug(`Network connectivity confirmed for ${host}:${port}`);
      resolveOnce(true);
    });

    socket.on('error', error => {
      clearTimeout(timer);
      this.log.warn(`Network connectivity check failed for ${host}:${port}: ${error.message}`);
      resolveOnce(false);
    });
  }

  private initiateNetworkConnection(context: {
    socket: net.Socket;
    timer: NodeJS.Timeout;
    host: string;
    port: number;
    resolveOnce: (result: boolean) => void;
  }) {
    const { socket, timer, host, port, resolveOnce } = context;

    try {
      socket.connect(port, host);
    } catch (error) {
      clearTimeout(timer);
      this.log.warn(`Network connectivity check error for ${host}:${port}: ${error instanceof Error ? error.message : String(error)}`);
      resolveOnce(false);
    }
  }

  async connectToIntellicenter() {
    if (!this.validatedConfig) {
      this.log.error('Cannot connect: Configuration validation failed');
      return;
    }

    const telnetParams = this.buildTelnetParams();

    if (!(await this.validateNetworkConnectivityIfNeeded(telnetParams))) {
      return;
    }

    await this.attemptConnection(telnetParams);
  }

  private buildTelnetParams() {
    return {
      host: this.validatedConfig!.ipAddress,
      port: 6681, // Standard IntelliCenter port
      negotiationMandatory: false,
      timeout: 1500,
      debug: true,
      username: this.validatedConfig!.username,
      password: this.validatedConfig!.password,
    };
  }

  private async validateNetworkConnectivityIfNeeded(telnetParams: any): Promise<boolean> {
    // Skip network validation in test environments to avoid timeouts
    /* eslint-disable-next-line no-undef */
    const isTestEnvironment = process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID !== undefined;
    if (isTestEnvironment) {
      return true;
    }

    this.log.debug(`Validating network connectivity to ${telnetParams.host}:${telnetParams.port}...`);
    const isReachable = await this.validateNetworkConnectivity(telnetParams.host, telnetParams.port);

    if (!isReachable) {
      const errorMessage =
        `IntelliCenter at ${telnetParams.host}:${telnetParams.port} is not reachable. ` + 'Check network connectivity and configuration.';
      this.log.error(errorMessage);
      this.healthMonitor.recordFailure(errorMessage);
      return false;
    }

    return true;
  }

  private async attemptConnection(telnetParams: any): Promise<void> {
    try {
      const startTime = Date.now();

      await this.circuitBreaker.execute(async () => {
        await RetryManager.withRetry(
          async () => {
            this.log.debug(`Attempting connection to IntelliCenter at ${telnetParams.host}:${telnetParams.port}`);
            await this.connection.connect(telnetParams);
          },
          {
            maxAttempts: 3,
            baseDelay: 1000,
            maxDelay: 5000,
            backoffFactor: 2,
            retryableErrors: ['ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', 'EHOSTUNREACH'],
          },
          message => this.log.warn(`Connection retry: ${message}`),
        );
      });

      const responseTime = Date.now() - startTime;
      this.healthMonitor.recordSuccess(responseTime);
      this.log.info(`Successfully connected to IntelliCenter (${responseTime}ms)`);
    } catch (error) {
      this.handleConnectionError(error);
    }
  }

  private handleConnectionError(error: unknown): void {
    const errorMessage = error instanceof Error ? error.message : String(error);
    this.healthMonitor.recordFailure(errorMessage);

    if (this.circuitBreaker.getState() === CircuitBreakerState.OPEN) {
      this.log.error('Circuit breaker is OPEN - connection attempts are being rejected. Will retry after cooldown period.');
    } else {
      this.log.error(`Connection to IntelliCenter failed after retries: ${errorMessage}`);
    }

    // Log health status for debugging
    const health = this.healthMonitor.getHealth();
    this.log.debug(
      `Connection health: ${health.consecutiveFailures} consecutive failures, ` +
        `last success: ${new Date(health.lastSuccessfulOperation)}`,
    );
  }

  setupSocketEventHandlers() {
    EventEmitter.defaultMaxListeners = 50;
    this.connection.on('data', this.handleDataReceived.bind(this));
    this.connection.on('connect', this.handleConnectionEstablished.bind(this));
    this.connection.on('ready', this.handleConnectionReady.bind(this));
    this.connection.on('failedlogin', this.handleLoginFailed.bind(this));
    this.connection.on('close', this.handleConnectionClosed.bind(this));
    this.connection.on('error', this.handleSocketError.bind(this));
    this.connection.on('end', this.handleConnectionEnded.bind(this));
    this.connection.on('responseready', this.handleResponseReady.bind(this));
  }

  private async handleDataReceived(chunk: any): Promise<void> {
    if (this.isCompleteMessage(chunk)) {
      await this.processCompleteMessage(chunk);
    } else {
      this.bufferIncompleteData(chunk);
    }
  }

  private isCompleteMessage(chunk: any): boolean {
    return chunk.length > 0 && chunk[chunk.length - 1] === 10;
  }

  private async processCompleteMessage(chunk: any): Promise<void> {
    this.lastMessageReceived = Date.now();
    const bufferedData = this.buffer + chunk;
    this.buffer = '';
    const lines = bufferedData.split(/\n/);

    for (const line of lines) {
      await this.processMessageLine(line);
    }
  }

  private async processMessageLine(line: string): Promise<void> {
    if (!line?.trim()) {
      return;
    }

    const trimmedLine = line.trim();
    if (!this.isValidJsonStructure(trimmedLine)) {
      this.log.warn(`Skipping malformed JSON line (not properly bracketed): ${trimmedLine}`);
      return;
    }

    try {
      const response = JSON.parse(trimmedLine) as IntelliCenterResponse;
      await this.handleUpdate(response);
    } catch (error) {
      this.log.error(
        `Failed to parse JSON from IntelliCenter. Line length: ${line.length}, ` +
          `First 50 chars: "${line.substring(0, 50)}", Last 50 chars: "${line.substring(Math.max(0, line.length - 50))}"`,
        error,
      );
    }
  }

  private isValidJsonStructure(line: string): boolean {
    return line.startsWith('{') && line.endsWith('}');
  }

  private bufferIncompleteData(chunk: any): void {
    if (this.buffer.length + chunk.length > this.maxBufferSize) {
      this.log.error(`Exceeded max buffer size ${this.maxBufferSize} without a newline. Discarding buffer.`);
      this.buffer = '';
    } else {
      this.log.debug('Received incomplete data in data handler.');
      this.buffer += chunk;
    }
  }

  private handleConnectionEstablished(): void {
    this.isSocketAlive = true;
    this.log.debug('IntelliCenter socket connection has been established.');
    this.resetDiscoveryState();
    this.startDeviceDiscovery();
  }

  private resetDiscoveryState(): void {
    this.discoverCommandsSent.length = 0;
    this.discoveryBuffer = null;
    this.commandQueue.length = 0;
    this.processingQueue = false;
  }

  private startDeviceDiscovery(): void {
    try {
      this.discoverDevices();
    } catch (error) {
      this.log.error('IntelliCenter device discovery failed.', error);
    }
  }

  private handleConnectionReady(): void {
    this.isSocketAlive = true;
    this.log.debug('IntelliCenter socket connection is ready.');
  }

  private handleLoginFailed(data: unknown): void {
    this.isSocketAlive = false;
    this.log.error(`IntelliCenter login failed. Check configured username/password. ${data}`);
  }

  private handleConnectionClosed(): void {
    this.isSocketAlive = false;
    this.log.error('IntelliCenter socket has been closed. Waiting 30 seconds and attempting to reconnect...');
    this.delay(30000).then(async () => {
      this.log.info('Finished waiting. Attempting reconnect...');
      await this.maybeReconnect();
    });
  }

  private handleSocketError(data: unknown): void {
    this.isSocketAlive = false;
    this.log.error(`IntelliCenter socket error has been detected. Socket will be closed. ${data}`);
  }

  private handleConnectionEnded(data: unknown): void {
    this.isSocketAlive = false;
    this.log.error(`IntelliCenter socket connection has ended. ${data}`);
  }

  private handleResponseReady(data: unknown): void {
    this.log.error(`IntelliCenter responseready. ${data}`);
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

  private logPumpCircuitUpdate(objnam: string, circuitId: string, controllingPumpId: string | undefined, params: any) {
    this.log.debug(
      `[PUMP CIRCUIT UPDATE] ${objnam} -> Circuit ${circuitId} ` + `(Pump: ${controllingPumpId || 'unknown'}): Initial parameter data:`,
    );
    this.log.debug(`  - STATUS: ${params['STATUS'] || 'N/A'}`);
    this.log.debug(`  - SPEED: ${params['SPEED'] || 'N/A'}`);
    this.log.debug(`  - SELECT: ${params['SELECT'] || 'N/A'}`);
    this.log.debug(`  - RPM: ${params['RPM'] || 'N/A'}`);
    this.log.debug(`  - GPM: ${params['GPM'] || 'N/A'}`);
    this.log.debug(`  - WATTS: ${params['WATTS'] || 'N/A'}`);
    this.log.debug(`  - All parameters: ${this.json(params)}`);
  }

  private logStandalonePumpUpdate(objnam: string, controllingPumpId: string | undefined, params: any) {
    this.log.debug(`[STANDALONE PUMP UPDATE] ${objnam} (Pump: ${controllingPumpId || 'unknown'}): Full parameter data:`);
    this.log.debug(`  - STATUS: ${params['STATUS'] || 'N/A'}`);
    this.log.debug(`  - SPEED: ${params['SPEED'] || 'N/A'}`);
    this.log.debug(`  - SELECT: ${params['SELECT'] || 'N/A'}`);
    this.log.debug(`  - RPM: ${params['RPM'] || 'N/A'}`);
    this.log.debug(`  - GPM: ${params['GPM'] || 'N/A'}`);
    this.log.debug(`  - WATTS: ${params['WATTS'] || 'N/A'}`);
    this.log.debug(`  - All parameters: ${this.json(params)}`);
  }

  private handlePumpCircuitUpdate(change: CircuitStatusMessage) {
    const circuit = this.pumpIdToCircuitMap.get(change.objnam!);
    if (!circuit) {
      return false;
    }

    const controllingPumpId = this.getPumpForPumpCircuit(change.objnam!);
    this.log.debug(
      `Update is for pump circuit ${change.objnam} -> Circuit ${circuit.id} ` + `(controlled by pump ${controllingPumpId || 'unknown'})`,
    );

    this.logPumpCircuitUpdate(change.objnam!, circuit.id, controllingPumpId, change.params);

    const uuid = this.api.hap.uuid.generate(circuit.id);
    const existingAccessory = this.accessoryMap.get(uuid) as PlatformAccessory;
    this.updatePump(existingAccessory, change.params!);
    return true;
  }

  private handleExistingAccessoryUpdate(change: CircuitStatusMessage) {
    const uuid = this.api.hap.uuid.generate(change.objnam!);
    const existingAccessory = this.accessoryMap.get(uuid);
    if (!existingAccessory) {
      return false;
    }

    if (CircuitTypes.has(existingAccessory.context.circuit?.objectType)) {
      this.log.debug(`Object is a circuit. Updating circuit: ${change.objnam}`);
      this.updateCircuit(existingAccessory, change.params!);
    } else if (SensorTypes.has(existingAccessory.context.sensor?.objectType)) {
      this.log.debug(`Object is a sensor. Updating sensor: ${change.objnam}`);
      this.updateSensor(existingAccessory, change.params!);
    } else {
      this.log.warn(`Unhandled object type on accessory: ${JSON.stringify(existingAccessory.context)}`);
    }
    return true;
  }

  private handleStandalonePumpUpdate(change: CircuitStatusMessage) {
    const speed = change.params!['SPEED'];
    const select = change.params!['SELECT'];

    if (!speed || !select) {
      return false;
    }

    const controllingPumpId = this.getPumpForPumpCircuit(change.objnam!);
    this.log.debug(`Standalone pump ${change.objnam} update: ${speed} ${select} (controlled by pump ${controllingPumpId || 'unknown'})`);
    this.log.debug(`All pump parameters for ${change.objnam}: ${JSON.stringify(change.params)}`);

    this.logStandalonePumpUpdate(change.objnam!, controllingPumpId, change.params);

    if (controllingPumpId) {
      this.log.debug(
        `[STANDALONE PUMP SENSOR UPDATE] Updating sensors for pump ${controllingPumpId} ` + `due to circuit ${change.objnam} change`,
      );

      const pumpCircuit = {
        id: change.objnam!,
        speed: parseInt(speed as string, 10),
        speedType: select as string,
        circuitId: (change.params!['CIRCUIT'] as string) || 'unknown',
        pump: {} as Pump,
      } as PumpCircuit;

      this.activePumpCircuits.set(change.objnam!, pumpCircuit);
      this.log.debug(`Updated activePumpCircuits map for ${change.objnam} with new speed ${speed}`);

      this.updatePumpObjectCircuits(controllingPumpId, change.objnam!, parseInt(speed as string, 10));
      this.updateAllPumpSensorsForChangedCircuit(pumpCircuit);
    }
    return true;
  }

  private handleUnregisteredDevice(change: CircuitStatusMessage) {
    this.log.warn(`Device ${change.objnam} sending updates but not registered as accessory. ` + `Params: ${JSON.stringify(change.params)}`);

    const objType = change.params!['OBJTYP'];
    const subType = change.params!['SUBTYP'];
    const name = change.params!['SNAME'];
    const feature = change.params!['FEATR'];

    this.log.info(
      `Unregistered device details - ID: ${change.objnam}, ` + `Type: ${objType}, SubType: ${subType}, Name: ${name}, Feature: ${feature}`,
    );
  }

  private processChange(change: CircuitStatusMessage) {
    if (!change.objnam || !change.params) {
      if (change.objnam) {
        this.log.warn(
          `Device ${change.objnam} sending updates but not registered as accessory. ` + 'No params available for identification.',
        );
      }
      return;
    }

    this.log.debug(`Handling update for ${change.objnam}`);

    // Try pump circuit update first
    if (this.handlePumpCircuitUpdate(change)) {
      return;
    }

    // Try existing accessory update
    if (this.handleExistingAccessoryUpdate(change)) {
      return;
    }

    // Try standalone pump update
    if (this.handleStandalonePumpUpdate(change)) {
      return;
    }

    // Handle unregistered device
    this.handleUnregisteredDevice(change);
  }

  private handleParseError(response: IntelliCenterResponse) {
    const now = Date.now();
    if (now - this.parseErrorResetTime > 300000) {
      // Reset counter every 5 minutes
      this.parseErrorCount = 0;
      this.parseErrorResetTime = now;
    }

    this.parseErrorCount++;

    if (this.parseErrorCount <= 3) {
      this.log.warn(`IntelliCenter ParseError (${this.parseErrorCount}/3 in 5min): ${response.description}`);
    } else if (this.parseErrorCount === 4) {
      this.log.error(
        `Frequent IntelliCenter ParseErrors detected (${this.parseErrorCount} in 5min). ` +
          'This indicates a firmware issue. Consider rebooting your IntelliCenter device.',
      );
    } else if (this.parseErrorCount >= 10) {
      this.log.error(`Excessive ParseErrors (${this.parseErrorCount}). Attempting to reconnect...`);
      this.maybeReconnect();
    }
  }

  private handleErrorResponse(response: IntelliCenterResponse): boolean {
    if (!response.response || response.response === IntelliCenterResponseStatus.Ok) {
      return false; // Not an error
    }

    // Handle specific known error cases
    if (response.command === IntelliCenterResponseCommand.Error && response.response === '400') {
      if (response.description?.includes('ParseError')) {
        this.handleParseError(response);
        return true; // Handled
      }
    }

    this.log.error(`Received unsuccessful response code ${response.response} from IntelliCenter. Message: ${this.json(response)}`);
    return true; // Handled
  }

  private handleNotifyListResponse(response: IntelliCenterResponse) {
    this.log.debug(
      `Handling IntelliCenter ${response.response} response to` +
        `${response.command}.${response.queryName} for message ID ${response.messageID}: ${this.json(response)}`,
    );
    if (!response.objectList) {
      this.log.error('Object list missing in NotifyList response.');
      return;
    }
    response.objectList.forEach(objListResponse => {
      const changes = (objListResponse.changes || [objListResponse]) as ReadonlyArray<CircuitStatusMessage>;
      changes.forEach(change => this.processChange(change));
    });
  }

  async handleUpdate(response: IntelliCenterResponse) {
    // Handle errors first
    if (this.handleErrorResponse(response)) {
      return;
    }

    // Handle successful requests
    if (Object.values(IntelliCenterRequestCommand).includes(response.command as never)) {
      this.log.debug(`Request with message ID ${response.messageID} was successful.`);
      return;
    }

    // Handle specific response types
    if (
      IntelliCenterResponseCommand.SendQuery === response.command &&
      IntelliCenterQueryName.GetHardwareDefinition === response.queryName
    ) {
      this.handleDiscoveryResponse(response);
    } else if ([IntelliCenterResponseCommand.NotifyList, IntelliCenterResponseCommand.WriteParamList].includes(response.command)) {
      this.handleNotifyListResponse(response);
    } else {
      this.log.debug(`Unhandled command in handleUpdate: ${this.json(response)}`);
    }
  }

  private logPumpUpdateStart(pumpCircuitId: string, params: IntelliCenterParams) {
    this.log.debug(`Updating pump circuit ${pumpCircuitId} with params:`, this.json(params));
    this.log.debug(`[PUMP UPDATE] ${pumpCircuitId}: Full parameter data:`);
    this.log.debug(`  - STATUS: ${params['STATUS'] || 'N/A'}`);
    this.log.debug(`  - SPEED: ${params['SPEED'] || 'N/A'}`);
    this.log.debug(`  - SELECT: ${params['SELECT'] || 'N/A'}`);
    this.log.debug(`  - RPM: ${params['RPM'] || 'N/A'}`);
    this.log.debug(`  - GPM: ${params['GPM'] || 'N/A'}`);
    this.log.debug(`  - WATTS: ${params['WATTS'] || 'N/A'}`);
    this.log.debug(`  - All parameters: ${this.json(params)}`);
  }

  private updatePumpCircuitProperties(pumpCircuit: PumpCircuit, params: IntelliCenterParams) {
    if (params['STATUS']) {
      pumpCircuit.status = params['STATUS'] as CircuitStatus;
    }
    if (params['SPEED']) {
      pumpCircuit.speed = Number(params['SPEED']);
    }
    if (params['RPM']) {
      pumpCircuit.rpm = Number(params['RPM']);
    }
    if (params['GPM']) {
      pumpCircuit.gpm = Number(params['GPM']);
    }
    if (params['WATTS']) {
      pumpCircuit.watts = Number(params['WATTS']);
    }
  }

  private logPumpUpdateComplete(pumpCircuit: PumpCircuit) {
    this.log.debug(`After update - pump circuit status: ${pumpCircuit.status}, ` + `speed: ${pumpCircuit.speed}, rpm: ${pumpCircuit.rpm}`);
    this.log.debug(`[PUMP UPDATE COMPLETE] ${pumpCircuit.id}: Updated values:`);
    this.log.debug(`  - Final Status: ${pumpCircuit.status || 'N/A'}`);
    this.log.debug(`  - Final Speed: ${pumpCircuit.speed || 'N/A'}`);
    this.log.debug(`  - Final Speed Type: ${pumpCircuit.speedType || 'N/A'}`);
    this.log.debug(`  - Final RPM: ${pumpCircuit.rpm || 'N/A'}`);
    this.log.debug(`  - Final GPM: ${pumpCircuit.gpm || 'N/A'}`);
    this.log.debug(`  - Final WATTS: ${pumpCircuit.watts || 'N/A'}`);
  }

  updatePump(accessory: PlatformAccessory, params: IntelliCenterParams) {
    const pumpCircuit = accessory.context.pumpCircuit;
    this.logPumpUpdateStart(pumpCircuit.id, params);

    this.updatePumpCircuitProperties(pumpCircuit, params);

    if (pumpCircuit.pump) {
      updatePump(pumpCircuit.pump, params);
    }

    this.logPumpUpdateComplete(pumpCircuit);
    this.api.updatePlatformAccessories([accessory]);
    this.createCircuitAccessory(accessory);
    this.updateAllPumpSensorsForChangedCircuit(pumpCircuit);
  }

  updateCircuit(accessory: PlatformAccessory, params: IntelliCenterParams) {
    this.logCircuitUpdate(accessory, params);
    this.performCircuitUpdate(accessory, params);
    this.updateAccessoryAndCreateCircuit(accessory);
    this.handlePumpSensorUpdates(accessory);
  }

  private logCircuitUpdate(accessory: PlatformAccessory, params: IntelliCenterParams): void {
    this.log.debug(`[CIRCUIT UPDATE] ${accessory.context.circuit.id}: Processing circuit update`);
    this.log.debug(`  - Circuit Type: ${accessory.context.circuit.objectType}`);
    this.log.debug(`  - Update params: ${JSON.stringify(params)}`);
  }

  private performCircuitUpdate(accessory: PlatformAccessory, params: IntelliCenterParams): void {
    updateCircuit(accessory.context.circuit, params);

    if (accessory.context.circuit.objectType === ObjectType.Body) {
      this.updateBodyCircuit(accessory.context.circuit as Body, params);
    }

    // Handle IntelliBrite color/show updates
    this.updateIntelliBriteColor(accessory, params);
  }

  private updateIntelliBriteColor(accessory: PlatformAccessory, params: IntelliCenterParams): void {
    const circuit = accessory.context.circuit as Circuit | undefined;
    const circuitType = circuit?.type;
    const isIntelliBrite = circuitType === CircuitType.IntelliBrite || circuitType === CircuitType.LightShowGroup;

    if (!isIntelliBrite || !circuit) {
      return;
    }

    // USE stores the selected color. ACT=65535 means "fixed color mode" (color is in USE)
    // ACT contains color name only for light shows. Check USE first, fall back to ACT if it's not 65535
    const useColor = params[USE_KEY] as string | undefined;
    const actColor = params[ACT_KEY] as string | undefined;
    const newColor = useColor ?? (actColor !== '65535' ? actColor : undefined);

    if (newColor !== undefined) {
      this.log.debug(`[IntelliBrite] ${circuit.name} color update: ${newColor}`);
      accessory.context.activeColor = newColor;
    }
  }

  private updateBodyCircuit(body: Body, params: IntelliCenterParams): void {
    updateBody(body, params);

    if (body.temperature !== undefined && body.temperature !== null) {
      this.collectTemperatureReading(body.temperature);
    }

    // Always update heater accessories when body data changes
    this.updateHeaterStatuses(body);
  }

  private updateAccessoryAndCreateCircuit(accessory: PlatformAccessory): void {
    this.api.updatePlatformAccessories([accessory]);
    this.createCircuitAccessory(accessory);
  }

  private createCircuitAccessory(accessory: PlatformAccessory): void {
    const circuit = accessory.context.circuit as Circuit | undefined;
    const circuitType = circuit?.type;
    const isIntelliBrite = circuitType === CircuitType.IntelliBrite || circuitType === CircuitType.LightShowGroup;

    if (isIntelliBrite) {
      const circuitId = circuit?.id;
      if (circuitId) {
        // Check if we already have an instance for this circuit
        const existingInstance = this.intelliBriteInstances.get(circuitId);
        if (existingInstance) {
          // Update existing instance instead of recreating
          existingInstance.updateStatus();
          existingInstance.updateActiveColor();
        } else {
          // Create new instance and track it
          const instance = new IntelliBriteAccessory(this, accessory);
          this.intelliBriteInstances.set(circuitId, instance);
        }
      }
    } else {
      new CircuitAccessory(this, accessory);
    }
  }

  private handlePumpSensorUpdates(accessory: PlatformAccessory): void {
    const circuitId = accessory.context.circuit.id;
    const pumpId = this.getPumpForCircuit(circuitId);

    if (pumpId) {
      this.handlePumpControlledCircuitUpdate(circuitId);
    } else {
      this.handleNonPumpControlledCircuitUpdate(accessory, circuitId);
    }
  }

  private handlePumpControlledCircuitUpdate(circuitId: string): void {
    this.log.debug(`  - Circuit ${circuitId} is controlled by pump, triggering sensor updates`);
    const pumpCircuitId = this.findPumpCircuitForCircuit(circuitId);

    if (pumpCircuitId) {
      const pumpCircuit = { id: pumpCircuitId } as PumpCircuit;
      this.updateAllPumpSensorsForChangedCircuit(pumpCircuit);
    }
  }

  private handleNonPumpControlledCircuitUpdate(accessory: PlatformAccessory, circuitId: string): void {
    if (accessory.context.circuit.objectType === ObjectType.Body) {
      this.handleBodyCircuitHeaterUpdate(accessory.context.circuit as Body, circuitId);
    } else {
      this.log.debug(`  - Circuit ${circuitId} is not controlled by any pump, no sensor updates needed`);
    }
  }

  private handleBodyCircuitHeaterUpdate(body: Body, circuitId: string): void {
    if (body.heaterId && body.heaterId !== '00000') {
      this.log.info(`  - Body circuit ${circuitId} has heater ${body.heaterId}, triggering sensor updates for all pumps`);
      this.updateAllPumpSensorsForHeaterChange();
    } else {
      this.log.debug(`  - Circuit ${circuitId} is not controlled by any pump, no sensor updates needed`);
    }
  }

  updateSensor(accessory: PlatformAccessory, params: IntelliCenterParams) {
    if (accessory.context.sensor) {
      const sensor = accessory.context.sensor;
      if (sensor.objectType === ObjectType.Sensor) {
        this.log.debug(`Updating temperature sensor ${sensor.name}`);
        if (params[PROBE_KEY]) {
          const probeValue = parseFloat(String(params[PROBE_KEY]));
          if (isNaN(probeValue)) {
            this.log.warn(`Invalid probe value received for sensor ${sensor.name}: ${params[PROBE_KEY]}, skipping update`);
            return;
          }
          sensor.probe = probeValue;

          // Collect temperature reading for unit validation
          this.collectTemperatureReading(probeValue);

          new TemperatureAccessory(this, accessory).updateTemperature(probeValue);
        }
      }
    }
    this.api.updatePlatformAccessories([accessory]);
  }

  updateFeatureRpmSensorForPumpCircuit(pumpCircuit: PumpCircuit) {
    const featureRpmAccessory = this.findFeatureRpmAccessory(pumpCircuit);

    if (featureRpmAccessory) {
      this.updateFeatureRpmAccessory(featureRpmAccessory, pumpCircuit);
    } else {
      this.logRpmSensorNotFound(pumpCircuit);
    }
  }

  private findFeatureRpmAccessory(pumpCircuit: PumpCircuit): PlatformAccessory | undefined {
    // First try with the pump circuit's circuitId
    const primarySensorId = `${pumpCircuit.circuitId}-rpm`;
    const uuid = this.api.hap.uuid.generate(primarySensorId);
    let featureRpmAccessory = this.accessoryMap.get(uuid);

    this.log.debug(
      `Looking for feature RPM sensor with ID: ${primarySensorId} (pump circuit: ${pumpCircuit.id} -> circuit: ${pumpCircuit.circuitId})`,
    );

    // If not found, search through all RPM sensors to find one that uses this pump circuit
    if (!featureRpmAccessory) {
      featureRpmAccessory = this.searchForMatchingRpmSensor(pumpCircuit);
    }

    return featureRpmAccessory;
  }

  private searchForMatchingRpmSensor(pumpCircuit: PumpCircuit): PlatformAccessory | undefined {
    this.log.debug(`Primary sensor ID not found, searching for RPM sensor that uses pump circuit ${pumpCircuit.id}`);

    let foundAccessory: PlatformAccessory | undefined;
    this.accessoryMap.forEach(accessory => {
      if (this.isMatchingRpmSensor(accessory, pumpCircuit)) {
        foundAccessory = accessory;
        this.log.debug(`Found matching RPM sensor: ${accessory.displayName} (ID: ${accessory.context.feature.id}-rpm)`);
      }
    });

    return foundAccessory;
  }

  private isMatchingRpmSensor(accessory: PlatformAccessory, pumpCircuit: PumpCircuit): boolean {
    return !!(
      accessory.context.feature &&
      accessory.context.pumpCircuit &&
      accessory.context.pumpCircuit.id === pumpCircuit.id &&
      accessory.displayName?.includes('RPM') &&
      !accessory.displayName?.includes('Heater') &&
      !accessory.displayName?.includes('Gas')
    );
  }

  private updateFeatureRpmAccessory(featureRpmAccessory: PlatformAccessory, pumpCircuit: PumpCircuit): void {
    if (!featureRpmAccessory.context.feature || !featureRpmAccessory.context.pumpCircuit) {
      return;
    }

    this.log.debug(`Found and updating feature RPM sensor for ${featureRpmAccessory.context.feature.name}: ${pumpCircuit.speed} RPM`);

    // Update the pump circuit data in the accessory context
    featureRpmAccessory.context.pumpCircuit = pumpCircuit;
    this.api.updatePlatformAccessories([featureRpmAccessory]);

    // Create new PumpRpmAccessory instance and trigger immediate RPM update
    const rpmAccessory = new PumpRpmAccessory(this, featureRpmAccessory);
    const isActive = featureRpmAccessory.context.feature.status === CircuitStatus.On && pumpCircuit.speed > 0;
    const rpmValue = isActive ? pumpCircuit.speed : 0.0001; // HomeKit minimum for inactive

    rpmAccessory.updateRpm(rpmValue);
  }

  private logRpmSensorNotFound(pumpCircuit: PumpCircuit): void {
    const primarySensorId = `${pumpCircuit.circuitId}-rpm`;
    this.log.debug(
      `No feature RPM sensor found for pump circuit ${pumpCircuit.id} -> circuit ${pumpCircuit.circuitId} ` +
        `(tried both direct ID ${primarySensorId} and pump circuit matching)`,
    );
  }

  updateFeatureRpmSensorForCircuit(circuit: Circuit) {
    // Find the feature RPM sensor for this circuit
    const featureRpmSensorId = `${circuit.id}-rpm`;
    const uuid = this.api.hap.uuid.generate(featureRpmSensorId);
    const featureRpmAccessory = this.accessoryMap.get(uuid);

    if (featureRpmAccessory && featureRpmAccessory.context.feature && featureRpmAccessory.context.pumpCircuit) {
      this.log.debug(`Updating feature RPM sensor for circuit change: ${circuit.name}`);

      // Update the feature data in the accessory context
      featureRpmAccessory.context.feature = circuit;

      // Refresh the RPM display (pump circuit data is already current)
      const rpmAccessory = new PumpRpmAccessory(this, featureRpmAccessory);

      // Trigger immediate RPM update based on current status
      if (circuit.status === CircuitStatus.On && featureRpmAccessory.context.pumpCircuit?.speed > 0) {
        rpmAccessory.updateRpm(featureRpmAccessory.context.pumpCircuit.speed);
      } else {
        rpmAccessory.updateRpm(0.0001); // HomeKit minimum for inactive
      }
    }
  }

  updateHeaterStatuses(body: Body) {
    this.heaters.forEach(heaterAccessory => {
      if (heaterAccessory.context?.body?.id === body.id) {
        this.log.debug(
          `Updating heater ${heaterAccessory.displayName} with live body data ` + `(temp: ${body.temperature}, heatMode: ${body.heatMode})`,
        );

        // Update the accessory context with latest body data
        heaterAccessory.context.body = body;
        this.api.updatePlatformAccessories([heaterAccessory]);

        // Get or create HeaterAccessory instance and update temperature ranges
        let heaterInstance = this.heaterInstances.get(heaterAccessory.UUID);
        if (!heaterInstance) {
          heaterInstance = new HeaterAccessory(this, heaterAccessory);
          this.heaterInstances.set(heaterAccessory.UUID, heaterInstance);
        } else {
          // Critical: Update the heater accessory with live body data
          heaterInstance.updateTemperatureRanges(body);
        }

        // Update the corresponding heater RPM sensor
        this.updateHeaterRpmSensor(heaterAccessory.context.heater, body);
      } else {
        this.log.debug(
          `Not updating heater because body id of heater ${heaterAccessory.context.body?.id} ` + `doesn't match input body ID ${body.id}`,
        );
      }
    });
  }

  updateHeaterRpmSensor(heater: Heater, body: Body) {
    // Guard against undefined heater or body
    if (!heater || !body) {
      this.log.warn(`Cannot update heater RPM sensor: heater or body is undefined (heater: ${heater}, body: ${body})`);
      return;
    }

    // Find the heater RPM sensor for this heater and body
    const heaterRpmSensorId = `${heater.id}.${body.id}-rpm`;
    const uuid = this.api.hap.uuid.generate(heaterRpmSensorId);
    const heaterRpmAccessory = this.accessoryMap.get(uuid);

    if (heaterRpmAccessory && heaterRpmAccessory.context.feature && heaterRpmAccessory.context.pumpCircuit) {
      this.log.debug(`Updating heater RPM sensor for ${heater.name}: checking heater status`);

      // Determine if this heater is currently active for this body
      // A heater is active if it's selected for the body and the body is on
      const isHeaterActive = body.heaterId === heater.id && body.status === CircuitStatus.On;

      // Update the feature status to reflect the heater's active state
      heaterRpmAccessory.context.feature.status = isHeaterActive ? CircuitStatus.On : CircuitStatus.Off;

      this.log.debug(
        `  Heater ${heater.name} active: ${isHeaterActive} ` +
          `(body status: ${body.status}, body heaterId: ${body.heaterId}, heater id: ${heater.id})`,
      );

      // Update the accessory and refresh the RPM display
      this.api.updatePlatformAccessories([heaterRpmAccessory]);
      new PumpRpmAccessory(this, heaterRpmAccessory);
    }
  }

  updateHeaterRpmSensorsForPumpCircuit(pumpCircuit: PumpCircuit) {
    // Find all heater RPM sensors that use this pump circuit by matching the pump circuit ID
    this.accessoryMap.forEach((accessory, _uuid) => {
      // Check if this is a heater RPM sensor by examining the context
      if (
        accessory.context.feature &&
        accessory.context.pumpCircuit &&
        accessory.context.feature.bodyId &&
        (accessory.displayName?.includes('Heater') || accessory.displayName?.includes('Gas'))
      ) {
        // Check if this heater RPM sensor uses the same pump circuit by ID
        // This is more reliable than matching by speed since IDs are unique
        if (accessory.context.pumpCircuit.id === pumpCircuit.id) {
          this.log.debug(
            `Updating heater RPM sensor pump circuit for ${accessory.displayName}: ${pumpCircuit.speed} RPM ` +
              `(was ${accessory.context.pumpCircuit.speed} RPM)`,
          );

          // Update the pump circuit data in the accessory context
          accessory.context.pumpCircuit = { ...pumpCircuit };

          // Update the accessory and refresh the RPM display
          this.api.updatePlatformAccessories([accessory]);

          // Create new PumpRpmAccessory instance to refresh the display with updated data
          const rpmAccessory = new PumpRpmAccessory(this, accessory);

          // If the heater is currently active, also trigger an immediate RPM update
          if (accessory.context.feature.status === CircuitStatus.On && pumpCircuit.speed > 0) {
            rpmAccessory.updateRpm(pumpCircuit.speed);
          }
        }
      }
    });
  }

  /**
   * Validate speed value for standalone pump
   */
  private validateStandalonePumpSpeed(pumpId: string, speed: string): number | null {
    const speedValue = parseInt(speed, 10);
    if (isNaN(speedValue)) {
      this.log.warn(`Invalid speed value for standalone pump ${pumpId}: ${speed}`);
      return null;
    }
    return speedValue;
  }

  /**
   * Check if accessory is a heater RPM sensor
   */
  private isHeaterRpmSensor(accessory: PlatformAccessory): boolean {
    return !!(
      accessory.context.feature &&
      accessory.context.pumpCircuit &&
      accessory.context.feature.bodyId &&
      (accessory.displayName?.includes('Heater') || accessory.displayName?.includes('Gas'))
    );
  }

  /**
   * Check if speed is in heater range
   */
  private isSpeedInHeaterRange(speedValue: number, speedType: string): boolean {
    return speedValue >= 2000 && speedValue <= 3500 && speedType === 'RPM';
  }

  /**
   * Update a single heater RPM sensor
   */
  private updateSingleHeaterRpmSensor(accessory: PlatformAccessory, pumpId: string, speedValue: number, speedType: string) {
    this.log.debug(
      `Updating heater RPM sensor ${accessory.displayName} with standalone pump ${pumpId}: ${speedValue} RPM ` +
        `(heater ${accessory.context.feature.status})`,
    );

    // Update the pump circuit speed in the accessory context
    accessory.context.pumpCircuit.speed = speedValue;
    accessory.context.pumpCircuit.speedType = speedType;

    // Update the accessory and refresh the RPM display
    this.api.updatePlatformAccessories([accessory]);

    // Create new PumpRpmAccessory instance and trigger immediate update
    const rpmAccessory = new PumpRpmAccessory(this, accessory);

    // Show RPM if heater is active, otherwise show minimum value
    if (accessory.context.feature.status === CircuitStatus.On) {
      rpmAccessory.updateRpm(speedValue);
    } else {
      rpmAccessory.updateRpm(0.0001);
    }
  }

  updateHeaterRpmSensorsForStandalonePump(pumpId: string, speed: string, speedType: string) {
    const speedValue = this.validateStandalonePumpSpeed(pumpId, speed);
    if (speedValue === null) {
      return;
    }

    this.log.debug(`Checking heater RPM sensors for standalone pump ${pumpId} at ${speedValue} ${speedType}`);

    // Log comprehensive standalone pump update data for heater RPM sensor processing
    this.log.info(`[HEATER RPM SENSOR UPDATE] Processing standalone pump ${pumpId}:`);
    this.log.info(`  - Speed Value: ${speedValue}`);
    this.log.info(`  - Speed Type: ${speedType}`);
    this.log.info('  - Processing heater RPM sensors in range: 2000-3500 RPM');

    // Find all heater RPM sensors and check if they should be updated based on this standalone pump
    this.accessoryMap.forEach((accessory, _uuid) => {
      if (this.isHeaterRpmSensor(accessory) && this.isSpeedInHeaterRange(speedValue, speedType)) {
        this.updateSingleHeaterRpmSensor(accessory, pumpId, speedValue, speedType);
      }
    });
  }

  /**
   * This is an example method showing how to register discovered accessories.
   * Accessories must only be registered once, previously created accessories
   * must not be registered again to prevent "duplicate UUID" errors.
   */
  discoverDevices() {
    const firstCommand = DISCOVER_COMMANDS[0];
    if (firstCommand) {
      this.discoverDeviceType(firstCommand);
    }
  }

  discoverDeviceType(deviceType: string) {
    this.discoverCommandsSent.push(deviceType);
    const command = {
      command: IntelliCenterRequestCommand.GetQuery,
      queryName: IntelliCenterQueryName.GetHardwareDefinition,
      arguments: deviceType,
      messageID: uuidv4(),
    } as IntelliCenterRequest;

    // Set discovery timeout for this command
    this.discoveryTimeout = setTimeout(() => {
      this.handleDiscoveryTimeout(deviceType);
    }, 30000); // 30 second timeout per discovery command

    this.sendCommandNoWait(command);
  }

  /**
   * Handle discovery command timeout
   */
  private handleDiscoveryTimeout(deviceType: string) {
    this.log.warn(`Discovery command timeout for device type: ${deviceType}`);

    // Add to failed commands list for potential retry
    if (!this.discoverCommandsFailed.includes(deviceType)) {
      this.discoverCommandsFailed.push(deviceType);
    }

    // Clear timeout
    this.discoveryTimeout = null;

    // Continue with next command if available
    const nextCommandIndex = this.discoverCommandsSent.length;
    if (nextCommandIndex < DISCOVER_COMMANDS.length) {
      this.log.debug('Timeout occurred, continuing with next discovery command...');
      setTimeout(() => {
        const nextCommand = DISCOVER_COMMANDS[nextCommandIndex];
        if (nextCommand) {
          this.discoverDeviceType(nextCommand);
        }
      }, 1000);
    } else {
      // All commands sent, check if we have enough data to proceed
      this.completeDiscoveryWithPartialData();
    }
  }

  /**
   * Complete discovery even with partial data from failed commands
   */
  private completeDiscoveryWithPartialData() {
    if (this.discoverCommandsFailed.length > 0) {
      this.log.warn(
        `Discovery completed with partial data. Failed commands: ${this.discoverCommandsFailed.join(', ')}. ` +
          'Proceeding with available device data.',
      );
    }

    this.log.debug(`Discovery commands completed with partial data. Response: ${this.json(this.discoveryBuffer)}`);

    const panels = transformPanels(this.discoveryBuffer as Record<string, unknown>, this.getConfig().includeAllCircuits, this.log);
    this.log.debug(`Transformed panels from IntelliCenter: ${this.json(panels)}`);

    this.registerDiscoveredAccessories(panels);
  }

  handleDiscoveryResponse(response: IntelliCenterResponse) {
    this.clearDiscoveryTimeout();
    this.mergeDiscoveryResponse(response);

    const commandCounts = this.getDiscoveryCommandCounts();

    if (this.shouldContinueDiscovery(commandCounts)) {
      this.sendNextDiscoveryCommand(commandCounts);
      return;
    }

    if (this.shouldRetryFailedCommands(commandCounts)) {
      return;
    }

    this.completeDiscovery();
  }

  private clearDiscoveryTimeout() {
    if (this.discoveryTimeout) {
      clearTimeout(this.discoveryTimeout);
      this.discoveryTimeout = null;
    }
  }

  private mergeDiscoveryResponse(response: IntelliCenterResponse) {
    this.log.debug(
      `Discovery response from IntelliCenter: ${this.json(response)} ` +
        `of type ${this.discoverCommandsSent[this.discoverCommandsSent.length - 1]}`,
    );

    if (this.discoveryBuffer === null) {
      this.discoveryBuffer = response.answer ?? null;
    } else if (this.discoveryBuffer && response.answer) {
      mergeResponse(this.discoveryBuffer as Record<string, unknown>, response.answer as Record<string, unknown>);
    }
  }

  private getDiscoveryCommandCounts() {
    return {
      total: DISCOVER_COMMANDS.length,
      completed: this.discoverCommandsSent.length,
      failed: this.discoverCommandsFailed.length,
    };
  }

  private shouldContinueDiscovery(counts: { total: number; completed: number; failed: number }) {
    return counts.completed < counts.total;
  }

  private sendNextDiscoveryCommand(counts: { total: number; completed: number; failed: number }) {
    this.log.debug(`Merged ${counts.completed} of ${counts.total} so far. Sending next command..`);
    // Add conservative delay between discovery commands to avoid overwhelming IntelliCenter
    setTimeout(() => {
      const nextCommand = DISCOVER_COMMANDS[counts.completed];
      if (nextCommand) {
        this.discoverDeviceType(nextCommand);
      }
    }, 500);
  }

  private shouldRetryFailedCommands(counts: { total: number; completed: number; failed: number }) {
    if (counts.failed === 0 || counts.completed !== counts.total) {
      return false;
    }

    for (const failedCommand of this.discoverCommandsFailed) {
      if (this.shouldRetryCommand(failedCommand)) {
        this.retryFailedCommand(failedCommand);
        return true;
      }
    }

    return false;
  }

  private shouldRetryCommand(failedCommand: string) {
    const retryAttempts = this.discoverCommandsSent.filter(cmd => cmd === failedCommand).length;
    return retryAttempts === 1;
  }

  private retryFailedCommand(failedCommand: string) {
    this.log.warn(`Retrying failed discovery command: ${failedCommand}`);
    setTimeout(() => {
      this.discoverDeviceType(failedCommand);
    }, 1000);
  }

  private completeDiscovery() {
    this.log.debug(`Discovery commands completed. Response: ${this.json(this.discoveryBuffer)}`);

    const panels = transformPanels(this.discoveryBuffer as Record<string, unknown>, this.getConfig().includeAllCircuits, this.log);
    this.log.debug(`Transformed panels from IntelliCenter: ${this.json(panels)}`);

    this.registerDiscoveredAccessories(panels);

    // Start temperature unit validation monitoring after discovery
    this.startTemperatureUnitValidation();
  }

  private initializeDiscoveryState() {
    this.pumpIdToCircuitMap.clear();
    this.pumpToCircuitsMap.clear();
    this.circuitToPumpMap.clear();
    this.pumpCircuitToPumpMap.clear();
    this.activePumpCircuits.clear();
  }

  private processPanelSensors(panel: Panel, discoveredAccessoryIds: Set<string>) {
    for (const sensor of panel.sensors) {
      discoveredAccessoryIds.add(sensor.id);
      this.discoverTemperatureSensor(panel, null, sensor);
    }
  }

  private processPumpCircuits(pump: Pump, circuitIdPumpMap: Map<string, PumpCircuit>) {
    for (const pumpCircuit of pump.circuits as ReadonlyArray<PumpCircuit>) {
      circuitIdPumpMap.set(pumpCircuit.circuitId, pumpCircuit);
      this.activePumpCircuits.set(pumpCircuit.id, pumpCircuit);
      this.subscribeForUpdates(pumpCircuit, [STATUS_KEY, ACT_KEY, SPEED_KEY, SELECT_KEY, 'RPM', 'GPM', 'WATTS']);
      this.buildPumpCircuitAssociations(pump.id, pumpCircuit);
    }
  }

  private createPumpSensors(pump: Pump, panel: Panel, discoveredAccessoryIds: Set<string>) {
    const pumpRpmSensorId = `${pump.id}-rpm`;
    const pumpGpmSensorId = `${pump.id}-gpm`;
    const pumpWattsSensorId = `${pump.id}-watts`;

    discoveredAccessoryIds.add(pumpRpmSensorId);
    discoveredAccessoryIds.add(pumpGpmSensorId);
    discoveredAccessoryIds.add(pumpWattsSensorId);

    this.discoverPumpRpmSensor(panel, pump);
    this.discoverPumpGpmSensor(panel, pump);
    this.discoverPumpWattsSensor(panel, pump);
  }

  private processPanelPumps(panel: Panel, discoveredAccessoryIds: Set<string>, circuitIdPumpMap: Map<string, PumpCircuit>) {
    for (const pump of panel.pumps) {
      this.processPumpCircuits(pump, circuitIdPumpMap);
      this.logPumpDiscoveryMapping(pump, panel);
      this.createPumpSensors(pump, panel, discoveredAccessoryIds);
    }
    this.logPumpCircuitAssociations();
  }

  /**
   * Register discovered accessories with HomeKit
   */
  private registerDiscoveredAccessories(panels: readonly Panel[]) {
    const context = this.createDiscoveryContext();

    this.processAllPanels(panels, context);
    this.finalizeDiscovery(context);
  }

  private createDiscoveryContext() {
    this.initializeDiscoveryState();

    return {
      discoveredAccessoryIds: new Set<string>(),
      circuitIdPumpMap: new Map<string, PumpCircuit>(),
      bodyIdMap: new Map<string, Body>(),
      heaters: [] as ReadonlyArray<Heater>,
    };
  }

  private processAllPanels(panels: readonly Panel[], context: ReturnType<typeof this.createDiscoveryContext>) {
    for (const panel of panels) {
      this.processSinglePanel(panel, context);
    }
  }

  private processSinglePanel(panel: Panel, context: ReturnType<typeof this.createDiscoveryContext>) {
    this.processPanelSensors(panel, context.discoveredAccessoryIds);
    this.processPanelPumps(panel, context.discoveredAccessoryIds, context.circuitIdPumpMap);

    this.processModuleBodies(panel, context.discoveredAccessoryIds, context.circuitIdPumpMap, context.bodyIdMap);
    this.processModuleFeatures(panel, context.discoveredAccessoryIds, context.circuitIdPumpMap);
    this.processPanelFeatures(panel, context.discoveredAccessoryIds, context.circuitIdPumpMap);

    context.heaters = this.collectModuleHeaters(panel, context.heaters);
  }

  private finalizeDiscovery(context: ReturnType<typeof this.createDiscoveryContext>) {
    this.processHeaters(context.heaters, context.discoveredAccessoryIds, context.circuitIdPumpMap, context.bodyIdMap);
    this.cleanupOrphanedAccessories(context.discoveredAccessoryIds);
  }

  private processModuleBodies(
    panel: Panel,
    discoveredAccessoryIds: Set<string>,
    circuitIdPumpMap: Map<string, PumpCircuit>,
    bodyIdMap: Map<string, Body>,
  ) {
    for (const module of panel.modules) {
      for (const body of module.bodies) {
        discoveredAccessoryIds.add(body.id);
        const pumpCircuit = circuitIdPumpMap.get(body.circuit?.id as string);
        this.discoverCircuit(panel, module, body, pumpCircuit);
        this.associateBodyWithPump(body, pumpCircuit);
        this.subscribeForUpdates(body, [
          STATUS_KEY,
          LAST_TEMP_KEY,
          HEAT_SOURCE_KEY,
          HEATER_KEY,
          HTMODE_KEY,
          MODE_KEY,
          HIGH_TEMP_KEY,
          LOW_TEMP_KEY,
        ]);
        bodyIdMap.set(body.id, body);
      }
    }
  }

  private associateBodyWithPump(body: Body, pumpCircuit: PumpCircuit | undefined) {
    if (pumpCircuit && body.circuit?.id) {
      const pumpId = this.getPumpForPumpCircuit(pumpCircuit.id);
      if (pumpId) {
        this.circuitToPumpMap.set(body.circuit.id, pumpId);
        if (!this.pumpToCircuitsMap.has(pumpId)) {
          this.pumpToCircuitsMap.set(pumpId, new Set<string>());
        }
        this.pumpToCircuitsMap.get(pumpId)!.add(body.circuit.id);
      }
    }
  }

  private processModuleFeatures(panel: Panel, discoveredAccessoryIds: Set<string>, circuitIdPumpMap: Map<string, PumpCircuit>) {
    for (const module of panel.modules) {
      for (const feature of module.features) {
        discoveredAccessoryIds.add(feature.id);
        const pumpCircuit = circuitIdPumpMap.get(feature.id);
        this.discoverCircuit(panel, module, feature, pumpCircuit);
        this.subscribeForUpdates(feature, this.getFeatureSubscriptionKeys(feature));
      }
    }
  }

  private processPanelFeatures(panel: Panel, discoveredAccessoryIds: Set<string>, circuitIdPumpMap: Map<string, PumpCircuit>) {
    for (const feature of panel.features) {
      discoveredAccessoryIds.add(feature.id);
      const pumpCircuit = circuitIdPumpMap.get(feature.id);
      this.discoverCircuit(panel, null, feature, pumpCircuit);
      this.subscribeForUpdates(feature, this.getFeatureSubscriptionKeys(feature));
    }
  }

  private getFeatureSubscriptionKeys(feature: Circuit): ReadonlyArray<string> {
    const isIntelliBrite = feature.type === CircuitType.IntelliBrite || feature.type === CircuitType.LightShowGroup;
    if (isIntelliBrite) {
      // IntelliBrite lights need USE (individual) or ACT (groups) for color/show state
      return [STATUS_KEY, ACT_KEY, USE_KEY];
    }
    return [STATUS_KEY, ACT_KEY];
  }

  private collectModuleHeaters(panel: Panel, heaters: ReadonlyArray<Heater>): ReadonlyArray<Heater> {
    for (const module of panel.modules) {
      heaters = heaters.concat(module.heaters);
    }
    return heaters;
  }

  private processHeaters(
    heaters: ReadonlyArray<Heater>,
    discoveredAccessoryIds: Set<string>,
    circuitIdPumpMap: Map<string, PumpCircuit>,
    bodyIdMap: Map<string, Body>,
  ) {
    for (const heater of heaters) {
      heater.bodyIds.forEach(bodyId => {
        discoveredAccessoryIds.add(`${heater.id}.${bodyId}`);
        this.findHeaterPumpCircuit(heater, bodyId, circuitIdPumpMap, bodyIdMap);
      });
      this.discoverHeater(heater, bodyIdMap);
    }
  }

  private calculateHeaterPumpPriority(pumpCircuit: PumpCircuit, body: Body | undefined): number {
    if (pumpCircuit.pump?.name?.toLowerCase().includes('heater') || body?.name?.toLowerCase().includes('heater')) {
      return 100;
    }
    if (pumpCircuit.speed >= 2500 && pumpCircuit.speed <= 3200) {
      return 90;
    }
    if (pumpCircuit.speed >= 2000 && pumpCircuit.speed < 2500) {
      return 85;
    }
    return 0;
  }

  private isValidHeaterPumpCircuit(pumpCircuit: PumpCircuit): boolean {
    return pumpCircuit.speedType === 'RPM' && pumpCircuit.speed >= 1000;
  }

  private findHeaterPumpCircuit(heater: Heater, bodyId: string, circuitIdPumpMap: Map<string, PumpCircuit>, bodyIdMap: Map<string, Body>) {
    const body = bodyIdMap.get(bodyId);
    const heaterRpmCandidates: Array<{ circuit: PumpCircuit; priority: number }> = [];

    for (const [, pumpCircuit] of circuitIdPumpMap.entries()) {
      if (!this.isValidHeaterPumpCircuit(pumpCircuit)) {
        continue;
      }

      const priority = this.calculateHeaterPumpPriority(pumpCircuit, body);
      if (priority > 0) {
        heaterRpmCandidates.push({ circuit: pumpCircuit, priority });
      }
    }

    if (heaterRpmCandidates.length > 0) {
      heaterRpmCandidates.sort((a, b) => b.priority - a.priority);
    }
  }

  private getExpectedAccessoryId(accessory: PlatformAccessory): string | null {
    if (accessory.context.circuit) {
      return accessory.context.circuit.id;
    }
    if (accessory.context.sensor) {
      return accessory.context.sensor.id;
    }
    if (accessory.context.heater && accessory.context.body) {
      return `${accessory.context.heater.id}.${accessory.context.body.id}`;
    }
    if (accessory.context.feature && accessory.context.pumpCircuit) {
      this.log.info(`Removing old feature/circuit RPM sensor (now pump-level): ${accessory.displayName}`);
      return 'REMOVE_OLD_FEATURE_RPM_SENSORS';
    }
    return this.handlePumpAccessoryId(accessory);
  }

  private handlePumpAccessoryId(accessory: PlatformAccessory): string | null {
    if (accessory.context.pump && accessory.displayName?.includes('GPM')) {
      return this.handlePumpGpmSensor(accessory);
    }
    if (accessory.context.pump && accessory.displayName?.includes('RPM')) {
      return `${accessory.context.pump.id}-rpm`;
    }
    if (accessory.context.pump && accessory.displayName?.includes('WATTS')) {
      return `${accessory.context.pump.id}-watts`;
    }
    if (accessory.context.pumpCircuit) {
      this.log.info(`Removing old pump circuit sensor: ${accessory.displayName}`);
      return 'REMOVE_OLD_PUMP_CIRCUIT_SENSORS';
    }
    return null;
  }

  private handlePumpGpmSensor(accessory: PlatformAccessory): string {
    const pumpType = PUMP_TYPE_MAPPING.get(accessory.context.pump.type) || accessory.context.pump.type;
    if (pumpType === 'VF' || pumpType === 'VS') {
      this.log.info(`Removing ${pumpType} pump GPM sensor (no longer supported): ${accessory.displayName}`);
      return 'REMOVE_VS_VF_GPM_SENSORS';
    }
    return `${accessory.context.pump.id}-gpm`;
  }

  private removeOrphanedAccessory(
    accessory: PlatformAccessory,
    accessoryUuid: string,
    accessoriesToRemove: PlatformAccessory[],
    expectedId: string,
  ) {
    this.log.info(`Removing orphaned accessory: ${accessory.displayName} (expected ID: ${expectedId})`);
    accessoriesToRemove.push(accessory);
    this.accessoryMap.delete(accessoryUuid);
    this.heaters.delete(accessoryUuid);
    this.heaterInstances.delete(accessoryUuid);
  }

  cleanupOrphanedAccessories(discoveredAccessoryIds: Set<string>) {
    const accessoriesToRemove: PlatformAccessory[] = [];

    this.accessoryMap.forEach((accessory, accessoryUuid) => {
      const expectedId = this.getExpectedAccessoryId(accessory);
      if (expectedId && !discoveredAccessoryIds.has(expectedId)) {
        this.removeOrphanedAccessory(accessory, accessoryUuid, accessoriesToRemove, expectedId);
      }
    });

    if (accessoriesToRemove.length > 0) {
      this.log.info(`Cleaning up ${accessoriesToRemove.length} orphaned accessories`);
      this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, accessoriesToRemove);
    }
  }

  discoverHeater(heater: Heater, bodyMap: ReadonlyMap<string, Body>) {
    heater.bodyIds.forEach(bodyId => {
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
          const heaterInstance = new HeaterAccessory(this, accessory);
          this.heaterInstances.set(accessory.UUID, heaterInstance);
        } else {
          this.log.debug(`Adding new heater: ${heater.name}`);
          accessory = new this.api.platformAccessory(name, uuid);
          accessory.context.body = body;
          accessory.context.heater = heater;
          const heaterInstance = new HeaterAccessory(this, accessory);
          this.heaterInstances.set(accessory.UUID, heaterInstance);
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

    // Get pump association for this circuit
    const controllingPumpId = this.getPumpForCircuit(circuit.id);

    if (existingAccessory) {
      this.log.debug(`Restoring existing circuit from cache: ${existingAccessory.displayName}`);
      existingAccessory.context.circuit = circuit;
      existingAccessory.context.module = module;
      existingAccessory.context.panel = panel;
      existingAccessory.context.pumpCircuit = pumpCircuit;
      existingAccessory.context.controllingPumpId = controllingPumpId;
      this.api.updatePlatformAccessories([existingAccessory]);
      this.createCircuitAccessory(existingAccessory);
    } else {
      this.log.debug(`Adding new circuit: ${circuit.name}${controllingPumpId ? ` (controlled by pump ${controllingPumpId})` : ''}`);
      const accessory = new this.api.platformAccessory(circuit.name, uuid);
      accessory.context.circuit = circuit;
      accessory.context.module = module;
      accessory.context.panel = panel;
      accessory.context.pumpCircuit = pumpCircuit;
      accessory.context.controllingPumpId = controllingPumpId;
      this.createCircuitAccessory(accessory);
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

  discoverFeatureRpmSensor(panel: Panel, feature: Circuit, pumpCircuit: PumpCircuit) {
    const featureRpmSensorId = `${feature.id}-rpm`;
    const uuid = this.api.hap.uuid.generate(featureRpmSensorId);

    const existingAccessory = this.accessoryMap.get(uuid);

    // Get the pump object from the pumpCircuit
    const pump = pumpCircuit.pump;

    // Use the feature name directly - much cleaner!
    const displayName = `${feature.name} RPM`;

    if (existingAccessory) {
      this.log.debug(`Restoring existing feature RPM sensor from cache: ${existingAccessory.displayName}`);
      existingAccessory.context.feature = feature;
      existingAccessory.context.pumpCircuit = pumpCircuit;
      existingAccessory.context.pump = pump;
      existingAccessory.context.panel = panel;
      this.api.updatePlatformAccessories([existingAccessory]);
      new PumpRpmAccessory(this, existingAccessory);
    } else {
      this.log.debug(`Adding new feature RPM sensor: ${displayName}`);
      const accessory = new this.api.platformAccessory(displayName, uuid);
      accessory.context.feature = feature;
      accessory.context.pumpCircuit = pumpCircuit;
      accessory.context.pump = pump;
      accessory.context.panel = panel;
      new PumpRpmAccessory(this, accessory);
      this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
      this.accessoryMap.set(accessory.UUID, accessory);
    }
  }

  discoverBodyRpmSensor(panel: Panel, body: Body, pumpCircuit: PumpCircuit) {
    const bodyRpmSensorId = `${body.id}-rpm`;
    const uuid = this.api.hap.uuid.generate(bodyRpmSensorId);

    const existingAccessory = this.accessoryMap.get(uuid);

    // Get the pump object from the pumpCircuit
    const pump = pumpCircuit.pump;

    // Use the body name directly (e.g., "Pool RPM", "Spa RPM")
    const displayName = `${body.name} RPM`;

    if (existingAccessory) {
      this.log.debug(`Restoring existing body RPM sensor from cache: ${existingAccessory.displayName}`);
      existingAccessory.context.feature = body; // Bodies act like features for RPM sensors
      existingAccessory.context.pumpCircuit = pumpCircuit;
      existingAccessory.context.pump = pump;
      existingAccessory.context.panel = panel;
      this.api.updatePlatformAccessories([existingAccessory]);
      new PumpRpmAccessory(this, existingAccessory);
    } else {
      this.log.debug(`Adding new body RPM sensor: ${displayName}`);
      const accessory = new this.api.platformAccessory(displayName, uuid);
      accessory.context.feature = body; // Bodies act like features for RPM sensors
      accessory.context.pumpCircuit = pumpCircuit;
      accessory.context.pump = pump;
      accessory.context.panel = panel;
      new PumpRpmAccessory(this, accessory);
      this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
      this.accessoryMap.set(accessory.UUID, accessory);
    }
  }

  discoverHeaterRpmSensor(panel: Panel, heater: Heater, body: Body, pumpCircuit: PumpCircuit) {
    const heaterRpmSensorId = `${heater.id}.${body.id}-rpm`;
    const uuid = this.api.hap.uuid.generate(heaterRpmSensorId);

    const existingAccessory = this.accessoryMap.get(uuid);

    // Get the pump object from the pumpCircuit
    const pump = pumpCircuit.pump;

    // Use the heater name directly (e.g., "Spa Gas Heater RPM")
    const displayName = `${heater.name} RPM`;

    // Determine initial heater status - active if heater is selected for this body and body is on
    const initialStatus = body.heaterId === heater.id && body.status === CircuitStatus.On ? CircuitStatus.On : CircuitStatus.Off;

    if (existingAccessory) {
      this.log.debug(`Restoring existing heater RPM sensor from cache: ${existingAccessory.displayName}`);
      // Create feature-like object with bodyId
      existingAccessory.context.feature = { id: heater.id, name: heater.name, status: initialStatus, bodyId: body.id };
      existingAccessory.context.pumpCircuit = pumpCircuit;
      existingAccessory.context.pump = pump;
      existingAccessory.context.panel = panel;
      this.api.updatePlatformAccessories([existingAccessory]);
      new PumpRpmAccessory(this, existingAccessory);
    } else {
      this.log.debug(`Adding new heater RPM sensor: ${displayName}`);
      const accessory = new this.api.platformAccessory(displayName, uuid);
      // Create feature-like object with bodyId
      accessory.context.feature = { id: heater.id, name: heater.name, status: initialStatus, bodyId: body.id };
      accessory.context.pumpCircuit = pumpCircuit;
      accessory.context.pump = pump;
      accessory.context.panel = panel;
      new PumpRpmAccessory(this, accessory);
      this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
      this.accessoryMap.set(accessory.UUID, accessory);
    }
  }

  discoverPumpGpmSensor(panel: Panel, pump: Pump) {
    // Skip GPM sensors for VS and VF pumps - only create for VSF pumps
    const pumpType = PUMP_TYPE_MAPPING.get(pump.type) || pump.type;
    if (pumpType === 'VF' || pumpType === 'VS') {
      this.log.debug(`Skipping GPM sensor creation for ${pumpType} pump: ${pump.name} (type: ${pump.type})`);
      return;
    }

    const pumpGpmSensorId = `${pump.id}-gpm`;
    const uuid = this.api.hap.uuid.generate(pumpGpmSensorId);
    const existingAccessory = this.accessoryMap.get(uuid);

    if (existingAccessory) {
      this.log.debug('Restoring existing pump GPM sensor from cache:', existingAccessory.displayName);
      existingAccessory.context.pump = pump;
      existingAccessory.context.panel = panel;
      new PumpGpmAccessory(this, existingAccessory);
    } else {
      this.log.info('Adding new pump GPM sensor:', `${pump.name} GPM`);
      const accessory = new this.api.platformAccessory(`${pump.name} GPM`, uuid);
      accessory.context.pump = pump;
      accessory.context.panel = panel;
      new PumpGpmAccessory(this, accessory);
      this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
      this.accessoryMap.set(accessory.UUID, accessory);
    }
  }

  discoverPumpRpmSensor(panel: Panel, pump: Pump) {
    const pumpRpmSensorId = `${pump.id}-rpm`;
    const uuid = this.api.hap.uuid.generate(pumpRpmSensorId);
    const existingAccessory = this.accessoryMap.get(uuid);

    if (existingAccessory) {
      this.log.debug('Restoring existing pump RPM sensor from cache:', existingAccessory.displayName);
      existingAccessory.context.pump = pump;
      existingAccessory.context.panel = panel;
      new PumpRpmAccessory(this, existingAccessory);
    } else {
      this.log.info('Adding new pump RPM sensor:', `${pump.name} RPM`);
      const accessory = new this.api.platformAccessory(`${pump.name} RPM`, uuid);
      accessory.context.pump = pump;
      accessory.context.panel = panel;
      new PumpRpmAccessory(this, accessory);
      this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
      this.accessoryMap.set(accessory.UUID, accessory);
    }
  }

  discoverPumpWattsSensor(panel: Panel, pump: Pump) {
    const pumpWattsSensorId = `${pump.id}-watts`;
    const uuid = this.api.hap.uuid.generate(pumpWattsSensorId);
    const existingAccessory = this.accessoryMap.get(uuid);

    if (existingAccessory) {
      this.log.debug('Restoring existing pump WATTS sensor from cache:', existingAccessory.displayName);
      existingAccessory.context.pump = pump;
      existingAccessory.context.panel = panel;
      new PumpWattsAccessory(this, existingAccessory);
    } else {
      this.log.info('Adding new pump WATTS sensor:', `${pump.name} WATTS`);
      const accessory = new this.api.platformAccessory(`${pump.name} WATTS`, uuid);
      accessory.context.pump = pump;
      accessory.context.panel = panel;
      new PumpWattsAccessory(this, accessory);
      this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
      this.accessoryMap.set(accessory.UUID, accessory);
    }
  }

  updatePumpSensors(pumpCircuit: PumpCircuit) {
    this.log.debug(`[PUMP SENSOR UPDATE] Processing pump circuit ${pumpCircuit.id}:`);
    this.log.debug(`  - Status: ${pumpCircuit.status}`);
    this.log.debug(`  - RPM: ${pumpCircuit.rpm}`);
    this.log.debug(`  - Speed: ${pumpCircuit.speed}`);
    this.log.debug(`  - Speed Type: ${pumpCircuit.speedType}`);
    this.log.debug(`  - WATTS: ${pumpCircuit.watts}`);
    this.log.debug(`  - GPM: ${pumpCircuit.gpm}`);

    // Store/update the pump circuit data
    this.activePumpCircuits.set(pumpCircuit.id, pumpCircuit);
    this.log.debug(`  - Stored in activePumpCircuits map (total: ${this.activePumpCircuits.size})`);

    // Find the pump that contains this pump circuit
    const pumpId = this.getPumpForPumpCircuit(pumpCircuit.id);
    if (!pumpId) {
      this.log.warn(`No pump found for pump circuit ${pumpCircuit.id} - cannot update pump sensors`);
      return;
    }
    this.log.info(`  - Associated with pump: ${pumpId}`);

    // Get the highest RPM among all enabled circuits for this pump
    const highestRpm = this.getHighestRpmForPump(pumpId);
    if (!highestRpm) {
      this.log.info(`No active circuits found for pump ${pumpId}, setting sensors to minimum`);
      // Set sensors to minimum values when no circuits are active
      this.updatePumpSensorsWithRpm(pumpId, 0.0001);
      return;
    }

    this.log.info(`Updating pump ${pumpId} sensors with highest active RPM: ${highestRpm}`);

    // Update all pump sensors with the highest RPM
    this.updatePumpSensorsWithRpm(pumpId, highestRpm);
  }

  /**
   * Update all pump sensors when any circuit changes for that pump
   */
  async updateAllPumpSensorsForChangedCircuit(pumpCircuit: PumpCircuit) {
    // Find the pump that contains this pump circuit
    const pumpId = this.getPumpForPumpCircuit(pumpCircuit.id);
    if (!pumpId) {
      this.log.warn(`No pump found for pump circuit ${pumpCircuit.id} - cannot update pump sensors`);
      return;
    }

    this.log.debug(`[PUMP SENSOR UPDATE] Circuit ${pumpCircuit.id} changed, updating all sensors for pump ${pumpId}`);

    // Find and update RPM sensor
    const rpmSensorId = `${pumpId}-rpm`;
    const rpmUuid = this.api.hap.uuid.generate(rpmSensorId);
    const rpmAccessory = this.accessoryMap.get(rpmUuid);

    if (rpmAccessory) {
      // Get fresh RPM value from the sensor's dynamic calculation
      const rpmSensor = new PumpRpmAccessory(this, rpmAccessory);
      const currentRpm = await rpmSensor.getRpm();
      rpmSensor.updateRpm(currentRpm);
      this.log.debug(`  Updated RPM sensor: ${currentRpm} RPM`);
    }

    // Find and update GPM sensor (only for VSF pumps)
    const gpmSensorId = `${pumpId}-gpm`;
    const gpmUuid = this.api.hap.uuid.generate(gpmSensorId);
    const gpmAccessory = this.accessoryMap.get(gpmUuid);

    if (gpmAccessory) {
      // Get fresh GPM value from the sensor's dynamic calculation
      const gpmSensor = new PumpGpmAccessory(this, gpmAccessory);
      const currentGpm = await gpmSensor.getGpm();
      gpmSensor.updateGpm(currentGpm);
      this.log.debug(`  Updated GPM sensor: ${currentGpm} GPM`);
    }

    // Find and update WATTS sensor
    const wattsSensorId = `${pumpId}-watts`;
    const wattsUuid = this.api.hap.uuid.generate(wattsSensorId);
    const wattsAccessory = this.accessoryMap.get(wattsUuid);

    if (wattsAccessory) {
      // Get fresh WATTS value from the sensor's dynamic calculation
      const wattsSensor = new PumpWattsAccessory(this, wattsAccessory);
      const currentWatts = await wattsSensor.getWatts();
      wattsSensor.updateWatts(currentWatts);
      this.log.debug(`  Updated WATTS sensor: ${currentWatts} WATTS`);
    }
  }

  /**
   * Find pump object by ID in discovered accessories
   */
  private findPumpObjectById(pumpId: string): Pump | null {
    for (const [, accessory] of this.accessoryMap) {
      if (accessory.context.pump && accessory.context.pump.id === pumpId) {
        return accessory.context.pump;
      }
    }
    return null;
  }

  /**
   * Process a single pump circuit for RPM calculation
   */
  private processPumpCircuitForRpm(pumpCircuit: PumpCircuit): { rpm: number; isActive: boolean } {
    const rpm = pumpCircuit.rpm || pumpCircuit.speed || 0;

    this.log.debug(`  Checking pump circuit ${pumpCircuit.id} (circuitId: ${pumpCircuit.circuitId}):`);
    this.log.debug(`    - RPM: ${pumpCircuit.rpm}`);
    this.log.debug(`    - Speed: ${pumpCircuit.speed}`);
    this.log.debug(`    - Final RPM: ${rpm}`);

    if (rpm > 0) {
      const isActive = this.isPumpCircuitActive(pumpCircuit.circuitId);
      this.log.info(`    - Is Active: ${isActive}`);
      return { rpm, isActive };
    } else {
      this.log.info(`    - Circuit has no/zero RPM (${rpm})`);
      return { rpm: 0, isActive: false };
    }
  }

  /**
   * Get the highest RPM among all enabled circuits for a given pump
   */
  getHighestRpmForPump(pumpId: string): number | null {
    let highestRpm = 0;
    let activeCircuitCount = 0;

    this.log.info(`[RPM CALCULATION] Finding highest RPM for pump ${pumpId}`);

    const pumpObject = this.findPumpObjectById(pumpId);
    if (!pumpObject || !pumpObject.circuits || pumpObject.circuits.length === 0) {
      this.log.info(`  No pump object or circuits found for pump ${pumpId}`);
      return null;
    }

    this.log.info(`  Found pump ${pumpObject.name} with ${pumpObject.circuits.length} circuits`);

    for (const pumpCircuit of pumpObject.circuits) {
      const { rpm, isActive } = this.processPumpCircuitForRpm(pumpCircuit);

      if (isActive) {
        activeCircuitCount++;
        if (rpm > highestRpm) {
          highestRpm = rpm;
          this.log.info(`    - NEW HIGHEST RPM: ${highestRpm} from circuit ${pumpCircuit.circuitId}`);
        }
      }
    }

    this.log.info(`[RPM RESULT] Pump ${pumpId}: ${activeCircuitCount} active circuits, highest RPM: ${highestRpm}`);
    return highestRpm > 0 ? highestRpm : null;
  }

  /**
   * Check circuit context for activity status
   */
  private checkCircuitContext(accessory: PlatformAccessory, circuitId: string): boolean | null {
    if (accessory.context.circuit && accessory.context.circuit.id === circuitId) {
      const isOn = accessory.context.circuit.status === CircuitStatus.On;
      this.log.info(`    Found circuit ${circuitId}: status = ${accessory.context.circuit.status}, active = ${isOn}`);
      return isOn;
    }
    return null;
  }

  /**
   * Check feature context for activity status
   */
  private checkFeatureContext(accessory: PlatformAccessory, circuitId: string): boolean | null {
    if (accessory.context.feature && accessory.context.feature.id === circuitId) {
      const isOn = accessory.context.feature.status === CircuitStatus.On;
      this.log.info(`    Found feature ${circuitId}: status = ${accessory.context.feature.status}, active = ${isOn}`);
      return isOn;
    }
    return null;
  }

  /**
   * Check body context for activity status
   */
  private checkBodyContext(accessory: PlatformAccessory, circuitId: string): boolean | null {
    if (accessory.context.body && accessory.context.body.circuit?.id === circuitId) {
      const isOn = accessory.context.body.status === CircuitStatus.On;
      this.log.info(`    Found body circuit ${circuitId}: status = ${accessory.context.body.status}, active = ${isOn}`);
      return isOn;
    }
    return null;
  }

  /**
   * Check if a pump circuit is currently active by looking for corresponding feature/circuit status
   * (Same logic as WATTS sensor)
   */
  private isPumpCircuitActive(circuitId: string): boolean {
    for (const [, accessory] of this.accessoryMap) {
      // Check circuit context
      const circuitResult = this.checkCircuitContext(accessory, circuitId);
      if (circuitResult !== null) {
        return circuitResult;
      }

      // Check feature context
      const featureResult = this.checkFeatureContext(accessory, circuitId);
      if (featureResult !== null) {
        return featureResult;
      }

      // Check body context
      const bodyResult = this.checkBodyContext(accessory, circuitId);
      if (bodyResult !== null) {
        return bodyResult;
      }
    }

    this.log.info(`    Circuit ${circuitId} not found in accessories, assuming inactive`);
    return false;
  }

  /**
   * Update all pump sensors (RPM, GPM, WATTS) with the specified RPM value
   */
  updatePumpSensorsWithRpm(pumpId: string, rpm: number) {
    // Update RPM sensor
    const rpmSensorId = `${pumpId}-rpm`;
    const rpmUuid = this.api.hap.uuid.generate(rpmSensorId);
    const rpmAccessory = this.accessoryMap.get(rpmUuid);

    if (rpmAccessory) {
      this.log.debug(`Found RPM sensor ${rpmSensorId}, updating to ${rpm} RPM`);
      // Update the pump's RPM value
      if (rpmAccessory.context.pump) {
        rpmAccessory.context.pump.rpm = rpm;
      }
      const rpmSensor = new PumpRpmAccessory(this, rpmAccessory);
      rpmSensor.updateRpm(rpm);
    } else {
      this.log.debug(`RPM sensor not found for ${rpmSensorId} (UUID: ${rpmUuid})`);
    }

    // Update GPM sensor
    const gpmSensorId = `${pumpId}-gpm`;
    const gpmUuid = this.api.hap.uuid.generate(gpmSensorId);
    const gpmAccessory = this.accessoryMap.get(gpmUuid);

    if (gpmAccessory) {
      this.log.debug(`Found GPM sensor ${gpmSensorId}, updating to ${rpm} RPM`);
      const gpmSensor = new PumpGpmAccessory(this, gpmAccessory);
      gpmSensor.updateSpeed(rpm);
    } else {
      this.log.debug(`GPM sensor not found for ${gpmSensorId} (UUID: ${gpmUuid})`);
    }

    // Update WATTS sensor
    const wattsSensorId = `${pumpId}-watts`;
    const wattsUuid = this.api.hap.uuid.generate(wattsSensorId);
    const wattsAccessory = this.accessoryMap.get(wattsUuid);

    if (wattsAccessory) {
      this.log.debug(`Found WATTS sensor ${wattsSensorId}, updating to ${rpm} RPM`);
      const wattsSensor = new PumpWattsAccessory(this, wattsAccessory);
      wattsSensor.updateSpeed(rpm);
    } else {
      this.log.debug(`WATTS sensor not found for ${wattsSensorId} (UUID: ${wattsUuid})`);
    }
  }

  updatePumpSensorsForStandalonePump(pumpId: string, speed: string, speedType: string) {
    const speedValue = parseInt(speed);
    if (!speedValue || speedType !== 'RPM') {
      this.log.debug(`Skipping standalone pump ${pumpId} sensors update - invalid speed: ${speed} ${speedType}`);
      return;
    }

    this.log.debug(`Updating standalone pump ${pumpId} sensors with speed: ${speedValue} RPM`);

    // Try to map standalone pump ID to platform pump ID format
    // e.g., "p0102" might need to be mapped to "PMP01" or "PMP02"
    let mappedPumpId = pumpId;
    if (pumpId.startsWith('p0')) {
      const pumpIdMatch = pumpId.match(/^p(\d{2})(\d{2})$/);
      if (pumpIdMatch) {
        const pumpNum = pumpIdMatch[1];
        mappedPumpId = `PMP${pumpNum}`;
        this.log.debug(`Mapped standalone pump ID ${pumpId} to platform pump ID ${mappedPumpId}`);
      }
    }

    // Update RPM sensor using mapped pump ID
    const rpmSensorId = `${mappedPumpId}-rpm`;
    const rpmUuid = this.api.hap.uuid.generate(rpmSensorId);
    const rpmAccessory = this.accessoryMap.get(rpmUuid);

    if (rpmAccessory) {
      this.log.debug(`Found RPM sensor ${rpmSensorId}, updating to ${speedValue} RPM (standalone pump)`);
      // Update the pump's RPM value
      if (rpmAccessory.context.pump) {
        rpmAccessory.context.pump.rpm = speedValue;
      }
      const rpmSensor = new PumpRpmAccessory(this, rpmAccessory);
      rpmSensor.updateRpm(speedValue);
    } else {
      this.log.debug(`RPM sensor not found for ${rpmSensorId} (UUID: ${rpmUuid})`);
    }

    // Update GPM sensor using mapped pump ID
    const gpmSensorId = `${mappedPumpId}-gpm`;
    const gpmUuid = this.api.hap.uuid.generate(gpmSensorId);
    const gpmAccessory = this.accessoryMap.get(gpmUuid);

    if (gpmAccessory) {
      this.log.debug(`Found GPM sensor ${gpmSensorId}, updating to ${speedValue} RPM (standalone pump)`);
      const gpmSensor = new PumpGpmAccessory(this, gpmAccessory);
      gpmSensor.updateSpeed(speedValue);
    } else {
      this.log.debug(
        `GPM sensor not found for ${gpmSensorId} (UUID: ${gpmUuid}). Available accessories: ${Array.from(this.accessoryMap.keys())
          .map(k => this.accessoryMap.get(k)?.displayName)
          .join(', ')}`,
      );
    }

    // Update WATTS sensor using mapped pump ID
    const wattsSensorId = `${mappedPumpId}-watts`;
    const wattsUuid = this.api.hap.uuid.generate(wattsSensorId);
    const wattsAccessory = this.accessoryMap.get(wattsUuid);

    if (wattsAccessory) {
      this.log.debug(`Found WATTS sensor ${wattsSensorId}, updating to ${speedValue} RPM (system-driven)`);
      const wattsSensor = new PumpWattsAccessory(this, wattsAccessory);
      wattsSensor.updateSystemSpeed(speedValue);
    } else {
      this.log.debug(`WATTS sensor not found for ${wattsSensorId} (UUID: ${wattsUuid})`);
    }
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
    if (!this.validatedConfig) {
      throw new Error('Configuration has not been validated. Cannot return config.');
    }
    return this.validatedConfig;
  }

  json(data: unknown) {
    try {
      return JSON.stringify(data, null, 2);
    } catch {
      // Handle circular references and other JSON serialization errors
      return JSON.stringify(
        data,
        (key, value) => {
          if (typeof value === 'object' && value !== null) {
            if (this.jsonSeenObjects && this.jsonSeenObjects.has(value)) {
              return '[Circular]';
            }
            if (!this.jsonSeenObjects) {
              this.jsonSeenObjects = new WeakSet();
            }
            this.jsonSeenObjects.add(value);
          }
          return value;
        },
        2,
      );
    }
  }

  private jsonSeenObjects?: WeakSet<object>;

  /**
   * Get system health and status information
   */
  getSystemHealth() {
    const health = this.healthMonitor.getHealth();
    const circuitBreakerStats = this.circuitBreaker.getStats();
    const rateLimiterStats = this.rateLimiter.getStats();

    return {
      isHealthy: health.isHealthy,
      lastSuccessfulOperation: new Date(health.lastSuccessfulOperation),
      consecutiveFailures: health.consecutiveFailures,
      lastError: health.lastError,
      averageResponseTime: health.responseTime,
      circuitBreaker: {
        state: circuitBreakerStats.state,
        failureCount: circuitBreakerStats.failureCount,
        lastFailureTime: circuitBreakerStats.lastFailureTime ? new Date(circuitBreakerStats.lastFailureTime) : null,
      },
      rateLimiter: rateLimiterStats,
      connection: {
        isSocketAlive: this.isSocketAlive,
        lastMessageReceived: new Date(this.lastMessageReceived),
        reconnecting: this.reconnecting,
        commandQueueLength: this.commandQueue.length,
      },
    };
  }

  /**
   * Reset error handling components (useful for testing or manual recovery)
   */
  resetErrorHandling() {
    if (this.circuitBreaker) {
      this.circuitBreaker.reset();
    }
    if (this.healthMonitor) {
      this.healthMonitor.reset();
    }
    if (this.deadLetterQueue) {
      this.deadLetterQueue.clear();
    }
    this.log.info('Error handling components have been reset');
  }

  sendCommandNoWait(command: IntelliCenterRequest): void {
    // Rate limiting check
    if (!this.rateLimiter.recordRequest()) {
      this.log.debug('Rate limit exceeded. Command dropped to prevent overwhelming IntelliCenter.');
      this.log.debug(`Rate limiter stats: ${JSON.stringify(this.rateLimiter.getStats())}`);
      return;
    }

    if (!this.isSocketAlive) {
      this.log.warn(`Cannot send command, socket is not alive: ${this.json(command)}`);
      this.maybeReconnect();
      return;
    }

    // Sanitize command before sending
    const sanitizedCommand = this.sanitizeCommand(command);

    // Add to queue and process
    this.commandQueue.push(sanitizedCommand);
    this.processCommandQueue();
  }

  private sanitizeCommand(command: IntelliCenterRequest): IntelliCenterRequest {
    const sanitized = { ...command };

    // Sanitize string fields to prevent injection attacks
    if (sanitized.arguments) {
      sanitized.arguments = sanitized.arguments.replace(/[<>"'&;]/g, '');
    }

    // Validate messageID format (should be UUID)
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sanitized.messageID)) {
      this.log.warn(`Invalid messageID format: ${sanitized.messageID}. Regenerating...`);
      sanitized.messageID = uuidv4();
    }

    // Validate object list parameters
    if (sanitized.objectList) {
      sanitized.objectList = sanitized.objectList.map(obj => {
        const sanitizedObj = { ...obj };

        if (sanitizedObj.objnam) {
          // Object names should be alphanumeric with some allowed characters
          sanitizedObj.objnam = sanitizedObj.objnam.replace(/[^a-zA-Z0-9_-]/g, '');
        }

        return sanitizedObj;
      });
    }

    return sanitized;
  }

  private async processCommandQueue(): Promise<void> {
    if (this.processingQueue || this.commandQueue.length === 0) {
      return;
    }

    this.processingQueue = true;

    while (this.commandQueue.length > 0 && this.isSocketAlive) {
      const command = this.commandQueue.shift()!;

      try {
        // Ensure clean JSON serialization
        const commandString = JSON.stringify(command);

        // Validate the JSON before sending
        JSON.parse(commandString); // This will throw if invalid

        this.log.debug(`Sending command to IntelliCenter: ${commandString}`);

        // Send with proper line termination
        await this.connection.send(commandString + '\n');

        // Conservative delay between commands to prevent overwhelming the device
        await this.delay(200);
      } catch (error) {
        this.log.error(`Failed to send command to IntelliCenter: ${error}. Command: ${this.json(command)}`);

        // Add failed command to Dead Letter Queue
        this.deadLetterQueue.add(
          command,
          1, // First attempt (could be enhanced to track retries)
          String(error),
          command.messageID || 'unknown',
        );

        const errorString = String(error);
        if (errorString.includes('connection') || errorString.includes('socket')) {
          this.maybeReconnect();
          break;
        }
      }
    }

    this.processingQueue = false;
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

  /**
   * Build pump-circuit associations for proper device management
   * Maps pumps to their controlled circuits and vice versa
   */
  private buildPumpCircuitAssociations(pumpId: string, pumpCircuit: PumpCircuit): void {
    this.log.debug(`Building associations for pump ${pumpId} -> circuit ${pumpCircuit.circuitId} (pump circuit: ${pumpCircuit.id})`);

    // Map pump circuit ID to pump ID (e.g., "p0101" -> "PMP01")
    this.pumpCircuitToPumpMap.set(pumpCircuit.id, pumpId);

    // Map circuit ID to pump ID (e.g., "C0006" -> "PMP01")
    this.circuitToPumpMap.set(pumpCircuit.circuitId, pumpId);

    // Map pump ID to set of circuit IDs (e.g., "PMP01" -> {"C0006", "C0001", ...})
    if (!this.pumpToCircuitsMap.has(pumpId)) {
      this.pumpToCircuitsMap.set(pumpId, new Set<string>());
    }
    this.pumpToCircuitsMap.get(pumpId)!.add(pumpCircuit.circuitId);

    this.log.debug(`  Associations built: pump ${pumpId} now controls ${this.pumpToCircuitsMap.get(pumpId)?.size || 0} circuits`);
  }

  /**
   * Get the pump ID that controls a specific circuit
   */
  getPumpForCircuit(circuitId: string): string | undefined {
    return this.circuitToPumpMap.get(circuitId);
  }

  /**
   * Get all circuit IDs controlled by a specific pump
   */
  getCircuitsForPump(pumpId: string): Set<string> | undefined {
    return this.pumpToCircuitsMap.get(pumpId);
  }

  /**
   * Get the pump ID for a specific pump circuit
   */
  getPumpForPumpCircuit(pumpCircuitId: string): string | undefined {
    return this.pumpCircuitToPumpMap.get(pumpCircuitId);
  }

  /**
   * Find the pump circuit ID that controls a specific circuit
   */
  findPumpCircuitForCircuit(circuitId: string): string | undefined {
    // Search through all pump circuits to find one that controls this circuit
    for (const [pumpCircuitId] of this.pumpCircuitToPumpMap) {
      // Check if this pump circuit is associated with our circuit
      for (const [, accessory] of this.accessoryMap) {
        if (accessory.context.pumpCircuit?.circuitId === circuitId && accessory.context.pumpCircuit?.id === pumpCircuitId) {
          return pumpCircuitId;
        }
      }
    }
    return undefined;
  }

  /**
   * Log detailed pump discovery mapping in requested format
   */
  logPumpDiscoveryMapping(pump: Pump, panel: Panel): void {
    // Get circuit names by looking up in all features and bodies
    const getCircuitName = (circuitId: string): string => {
      // Search in panel features first
      for (const feature of panel.features) {
        if (feature.id === circuitId) {
          return feature.name;
        }
      }

      // Search in module features and bodies
      for (const module of panel.modules) {
        for (const feature of module.features) {
          if (feature.id === circuitId) {
            return feature.name;
          }
        }
        for (const body of module.bodies) {
          if (body.id === circuitId) {
            return body.name;
          }
        }
      }

      return circuitId; // fallback to ID if name not found
    };

    // Build circuit descriptions with names and speeds
    const circuitDescriptions: string[] = [];
    (pump.circuits || []).forEach((pumpCircuit, index) => {
      const circuitName = getCircuitName(pumpCircuit.circuitId);
      const speedType = pumpCircuit.speedType || 'RPM';
      const speed = pumpCircuit.speed || 0;
      const speedDesc = speedType === 'RPM' ? `${speed}rpm` : `${speed}${speedType.toLowerCase()}`;

      circuitDescriptions.push(`circuit${index + 1}: ${circuitName} (${speedDesc})`);
    });

    // Format final discovery message
    const circuitList = circuitDescriptions.join('. ');
    const pumpTypeDisplay = (pump.type || 'unknown').toLowerCase();

    this.log.debug(`Found pump. name: ${pump.name || 'unknown'}. type: ${pumpTypeDisplay}. ${circuitList}.`);
  }

  /**
   * Log current pump-circuit associations for debugging
   */
  logPumpCircuitAssociations(): void {
    this.log.debug('=== Pump-Circuit Associations ===');
    this.pumpToCircuitsMap.forEach((circuits, pumpId) => {
      this.log.debug(`Pump ${pumpId} controls circuits: ${Array.from(circuits).join(', ')}`);
    });
    this.log.debug('=== Circuit-to-Pump Mappings ===');
    this.circuitToPumpMap.forEach((pumpId, circuitId) => {
      this.log.debug(`Circuit ${circuitId} is controlled by pump ${pumpId}`);
    });
  }

  /**
   * Update all pump sensors when heater status changes
   */
  private updateAllPumpSensorsForHeaterChange() {
    this.log.info('[HEATER CHANGE] Updating all pump sensors due to heater status change');

    // Find all pump sensors and trigger their updates directly
    for (const [, accessory] of this.accessoryMap) {
      if (accessory.context.pump) {
        const pumpId = accessory.context.pump.id;
        this.log.debug(`Updating sensors for pump ${pumpId} due to heater change`);

        // Directly update pump sensors by finding them in the accessory map
        this.updatePumpSensorsDirectly(pumpId);
      }
    }
  }

  /**
   * Directly update pump sensors by pump ID (used for heater changes)
   */
  private updatePumpSensorsDirectly(pumpId: string) {
    this.log.debug(`[DIRECT PUMP UPDATE] Updating sensors for pump ${pumpId}`);

    // Update RPM sensor
    const rpmSensorId = `${pumpId}-rpm`;
    const rpmUuid = this.api.hap.uuid.generate(rpmSensorId);
    const rpmAccessory = this.accessoryMap.get(rpmUuid);

    if (rpmAccessory) {
      this.log.debug(`Found RPM sensor ${rpmSensorId}, triggering update`);
      const rpmSensor = new PumpRpmAccessory(this, rpmAccessory);
      rpmSensor.getRpm().then(currentRpm => {
        rpmSensor.updateRpm(currentRpm);
        this.log.debug(`  Updated RPM sensor: ${currentRpm} RPM`);
      });
    }

    // Update GPM sensor
    const gpmSensorId = `${pumpId}-gpm`;
    const gpmUuid = this.api.hap.uuid.generate(gpmSensorId);
    const gpmAccessory = this.accessoryMap.get(gpmUuid);

    if (gpmAccessory) {
      this.log.debug(`Found GPM sensor ${gpmSensorId}, triggering update`);
      const gpmSensor = new PumpGpmAccessory(this, gpmAccessory);
      gpmSensor.getGpm().then(currentGpm => {
        gpmSensor.updateGpm(currentGpm);
        this.log.debug(`  Updated GPM sensor: ${currentGpm} GPM`);
      });
    }

    // Update WATTS sensor
    const wattsSensorId = `${pumpId}-watts`;
    const wattsUuid = this.api.hap.uuid.generate(wattsSensorId);
    const wattsAccessory = this.accessoryMap.get(wattsUuid);

    if (wattsAccessory) {
      this.log.debug(`Found WATTS sensor ${wattsSensorId}, triggering update`);
      const wattsSensor = new PumpWattsAccessory(this, wattsAccessory);
      wattsSensor.getWatts().then(currentWatts => {
        wattsSensor.updateWatts(currentWatts);
        this.log.debug(`  Updated WATTS sensor: ${currentWatts} WATTS`);
      });
    }
  }

  /**
   * Update pump object circuits array when standalone pump circuit changes
   */
  private updatePumpObjectCircuits(pumpId: string, pumpCircuitId: string, newSpeed: number) {
    this.log.debug(`Updating pump ${pumpId} circuits array - circuit ${pumpCircuitId} speed to ${newSpeed}`);

    // Find the pump accessory and update its circuits array
    for (const [, accessory] of this.accessoryMap) {
      if (accessory.context.pump && accessory.context.pump.id === pumpId) {
        const pump = accessory.context.pump as Pump;

        // Find the specific circuit in the pump's circuits array and update its speed
        if (pump.circuits) {
          for (const circuit of pump.circuits) {
            if (circuit.id === pumpCircuitId) {
              this.log.debug(`Found circuit ${pumpCircuitId} in pump ${pumpId}, updating speed from ${circuit.speed} to ${newSpeed}`);
              circuit.speed = newSpeed;

              // Update the accessory context
              this.api.updatePlatformAccessories([accessory]);
              return;
            }
          }
        }

        this.log.debug(`Circuit ${pumpCircuitId} not found in pump ${pumpId} circuits array`);
        return;
      }
    }

    this.log.debug(`Pump ${pumpId} not found in accessory map`);
  }

  /**
   * Start temperature unit validation monitoring
   */
  private startTemperatureUnitValidation() {
    // Skip validation in test environments
    /* eslint-disable-next-line no-undef */
    const isTestEnvironment = process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID !== undefined;

    if (isTestEnvironment || this.temperatureUnitValidated) {
      return;
    }

    // Monitor temperature readings every 30 seconds for first 5 minutes
    this.temperatureValidationInterval = setInterval(() => {
      this.validateTemperatureUnits();
    }, 30000);

    // Stop monitoring after 5 minutes
    setTimeout(() => {
      if (this.temperatureValidationInterval) {
        clearInterval(this.temperatureValidationInterval);
        this.temperatureValidationInterval = null;
      }
    }, 300000); // 5 minutes
  }

  /**
   * Collect temperature reading for validation
   */
  private collectTemperatureReading(temperature: number) {
    if (this.temperatureUnitValidated || this.temperatureReadings.length >= 50) {
      return;
    }

    if (!isNaN(temperature) && temperature !== null && temperature !== undefined) {
      this.temperatureReadings.push(temperature);
    }
  }

  /**
   * Validate temperature unit consistency with IntelliCenter readings
   */
  private validateTemperatureUnits() {
    if (this.temperatureUnitValidated || this.temperatureReadings.length < 3) {
      return;
    }

    const validation = ConfigValidator.validateTemperatureUnitConsistency(this.temperatureReadings, this.getConfig().temperatureUnits);

    if (!validation.isConsistent && validation.warning) {
      this.log.warn(validation.warning);
      this.temperatureUnitValidated = true; // Only warn once

      // Stop monitoring after validation
      if (this.temperatureValidationInterval) {
        clearInterval(this.temperatureValidationInterval);
        this.temperatureValidationInterval = null;
      }
    } else if (validation.analysisCount >= 10 && validation.isConsistent) {
      // Stop monitoring after successful validation with sufficient data
      this.log.debug(
        `Temperature unit validation successful. Analyzed ${validation.analysisCount} readings. ` +
          `Detected unit: ${validation.detectedUnit || 'unknown'}, Configured: ${validation.configuredUnit}`,
      );
      this.temperatureUnitValidated = true;

      if (this.temperatureValidationInterval) {
        clearInterval(this.temperatureValidationInterval);
        this.temperatureValidationInterval = null;
      }
    }
  }

  /**
   * Setup graceful shutdown handlers for SIGTERM and SIGINT signals
   */
  private setupGracefulShutdown() {
    // Prevent duplicate listeners being added
    if (PentairPlatform.shutdownHandlersSetup) {
      return;
    }
    PentairPlatform.shutdownHandlersSetup = true;

    /* eslint-disable no-undef */
    const shutdownHandler = (signal: string) => {
      this.log.info(`Received ${signal}, performing graceful shutdown...`);
      this.cleanup()
        .then(() => {
          this.log.info('Graceful shutdown completed');
          process.exit(0);
        })
        .catch(error => {
          this.log.error(`Error during graceful shutdown: ${error instanceof Error ? error.message : String(error)}`);
          process.exit(1);
        });
    };

    // Handle graceful shutdown signals
    process.on('SIGTERM', () => shutdownHandler('SIGTERM'));
    process.on('SIGINT', () => shutdownHandler('SIGINT'));

    // Handle uncaught exceptions and unhandled rejections
    process.on('uncaughtException', error => {
      this.log.error(`Uncaught Exception: ${error.message}`);
      this.log.debug(`Stack trace: ${error.stack}`);
      this.cleanup()
        .then(() => process.exit(1))
        .catch(() => process.exit(1));
    });

    process.on('unhandledRejection', (reason, promise) => {
      this.log.error(`Unhandled Promise Rejection at: ${promise}, reason: ${reason}`);
      this.cleanup()
        .then(() => process.exit(1))
        .catch(() => process.exit(1));
    });
    /* eslint-enable no-undef */
  }

  private clearTimersAndIntervals() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
      this.log.debug('Heartbeat interval cleared');
    }

    if (this.discoveryTimeout) {
      clearTimeout(this.discoveryTimeout);
      this.discoveryTimeout = null;
      this.log.debug('Discovery timeout cleared');
    }

    if (this.temperatureValidationInterval) {
      clearInterval(this.temperatureValidationInterval);
      this.temperatureValidationInterval = null;
      this.log.debug('Temperature validation interval cleared');
    }
  }

  private cleanupConnection() {
    if (this.connection) {
      try {
        this.log.debug('Removing connection event listeners...');
        this.connection.removeAllListeners();
        this.log.debug('Connection event listeners removed');
      } catch (error) {
        this.log.warn(`Error removing connection event listeners: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    if (this.connection && this.isSocketAlive) {
      try {
        this.log.debug('Closing Telnet connection...');
        this.connection.destroy();
        this.isSocketAlive = false;
        this.log.debug('Telnet connection closed');
      } catch (error) {
        this.log.warn(`Error closing Telnet connection: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  private clearDataStructures() {
    this.commandQueue = [];
    this.processingQueue = false;

    this.accessoryMap?.clear();
    this.heaters?.clear();
    this.heaterInstances?.clear();
    this.pumpIdToCircuitMap?.clear();
    this.pumpToCircuitsMap?.clear();
    this.circuitToPumpMap?.clear();
    this.pumpCircuitToPumpMap?.clear();
    this.activePumpCircuits?.clear();
  }

  private resetState() {
    this.buffer = '';
    this.discoveryBuffer = null;

    if (this.discoverCommandsSent) {
      this.discoverCommandsSent.length = 0;
    }
    if (this.discoverCommandsFailed) {
      this.discoverCommandsFailed.length = 0;
    }

    this.reconnecting = false;
    this.parseErrorCount = 0;
    this.temperatureReadings = [];
    this.temperatureUnitValidated = false;
  }

  /**
   * Cleanup method for tests and graceful shutdown
   * Clears intervals, closes connections, and removes event listeners
   */
  async cleanup() {
    this.log.debug('Starting cleanup process...');
    this.clearTimersAndIntervals();
    this.cleanupConnection();
    this.clearDataStructures();
    this.resetState();
    this.resetErrorHandling();
    this.log.debug('Cleanup process completed');
  }
}
