'use strict';

// Thin Homebridge shim for homebridge-pentair-intellicenter-ai.
//
// This file intentionally has ZERO npm dependencies. All real work
// (IntelliCenter protocol, state, polling, resilience) lives in the Go sidecar
// binary (pentameter) under pentameter/. The shim only:
//   1. spawns the right sidecar binary for this platform/arch,
//   2. reads newline-delimited JSON from its stdout,
//   3. maps each IntelliCenter circuit to a HomeKit Switch accessory,
//   4. forwards On set requests to the sidecar's stdin.
//
// Sidecar stdio protocol (see go/main.go):
//   sidecar -> shim (stdout):
//     {"t":"ready"}
//     {"t":"accessories","items":[{"id","name","kind","on"}]}
//     {"t":"state","id","on"}
//   shim -> sidecar (stdin):
//     {"t":"set","id","on"}

const path = require('path');
const fs = require('fs');
const readline = require('readline');
const { spawn } = require('child_process');

const PLUGIN_NAME = 'homebridge-pentair-intellicenter-ai';
const PLATFORM_NAME = 'PentairIntelliCenterAI';
const RESPAWN_DELAY_MS = 3000;
// Shared with the sidecar (homebridge.go hbConnID): the connection-health sensor.
// When the sidecar process dies, Go can't report, so the shim marks it offline.
const CONNECTION_ID = '_conn';

module.exports = (api) => {
  api.registerPlatform(PLATFORM_NAME, PentairIntelliCenterAI);
};

class PentairIntelliCenterAI {
  constructor(log, config, api) {
    this.log = log;
    this.config = config || {};
    this.api = api;
    this.Service = api.hap.Service;
    this.Characteristic = api.hap.Characteristic;

    // Restored-from-cache accessories, keyed by UUID.
    this.cached = new Map();
    // Live switch records, keyed by circuit id: { accessory, on }.
    this.switches = new Map();
    // Live thermostat records, keyed by body id: { accessory, canCool, ... }.
    this.thermostats = new Map();
    // Live light-sensor records (pump metrics as lux), keyed by sensor id: { accessory, lux }.
    this.lightSensors = new Map();
    // Live occupancy-sensor records (e.g. freeze), keyed by id: { accessory, on }.
    this.occupancy = new Map();
    // Live temperature-sensor records (e.g. air), keyed by id: { accessory, c }.
    this.tempSensors = new Map();

    this.child = null;
    this.shuttingDown = false;

    api.on('didFinishLaunching', () => this.start());
    api.on('shutdown', () => this.stop());
  }

  // Called by Homebridge for each accessory restored from disk cache at boot.
  configureAccessory(accessory) {
    this.cached.set(accessory.UUID, accessory);
  }

  start() {
    const bin = this.resolveSidecarPath();
    if (!bin) {
      this.log.error(
        'No sidecar binary found for this platform/arch. Expected one of the ' +
          `pentameter/<os>-<arch> files. Run "make build" (dev) or reinstall the plugin.`,
      );
      return;
    }
    this.spawnSidecar(bin);
  }

  stop() {
    this.shuttingDown = true;
    if (this.child) {
      this.child.kill('SIGTERM');
      this.child = null;
    }
  }

  resolveSidecarPath() {
    // Map Node's platform/arch to the Go GOOS/GOARCH used in the binary names
    // (see Makefile build matrix). Node reports x64/arm64/arm and darwin/linux/win32.
    const osMap = { darwin: 'darwin', win32: 'windows' };
    const archMap = { x64: 'amd64', arm64: 'arm64', arm: 'arm' };
    const goOS = osMap[process.platform] || 'linux';
    const goArch = archMap[process.arch] || 'amd64';
    const ext = goOS === 'windows' ? '.exe' : '';
    const candidate = path.join(__dirname, 'pentameter', `${goOS}-${goArch}${ext}`);
    return fs.existsSync(candidate) ? candidate : null;
  }

  spawnSidecar(bin) {
    // The sidecar is pentameter in homebridge mode. Config is passed via
    // PENTAMETER_* env vars; a blank IP makes pentameter auto-discover via mDNS.
    const env = Object.assign({}, process.env, {
      PENTAMETER_IC_IP: this.config.ipAddress || '',
      PENTAMETER_IC_PORT: String(this.config.port || 6680),
      PENTAMETER_INTERVAL: String(this.config.pollIntervalSeconds || 30),
      // The sidecar always serves Prometheus /metrics for Grafana on this port.
      PENTAMETER_HTTP_PORT: String(this.config.metricsPort || 8080),
    });

    this.log.info(`Starting sidecar (pentameter homebridge): ${bin}`);
    const child = spawn(bin, ['-homebridge'], { env, stdio: ['pipe', 'pipe', 'pipe'] });
    this.child = child;

    readline.createInterface({ input: child.stdout }).on('line', (line) => {
      this.handleMessage(line);
    });
    readline.createInterface({ input: child.stderr }).on('line', (line) => {
      this.log.info(line); // sidecar logs already carry a [sidecar] prefix
    });

    child.on('exit', (code, signal) => {
      this.child = null;
      // The sidecar is dead, so it can't report connection loss itself — mark the
      // connection sensor offline here. Re-connect is reported by the sidecar once
      // it respawns and reaches the controller.
      this.applyState(CONNECTION_ID, false);
      if (this.shuttingDown) return;
      this.log.warn(`Sidecar exited (code=${code} signal=${signal}); restarting in ${RESPAWN_DELAY_MS}ms`);
      setTimeout(() => {
        if (!this.shuttingDown) this.spawnSidecar(bin);
      }, RESPAWN_DELAY_MS);
    });
    child.on('error', (err) => {
      this.log.error(`Sidecar spawn error: ${err.message}`);
    });
  }

  handleMessage(line) {
    if (!line) return;
    let msg;
    try {
      msg = JSON.parse(line);
    } catch (e) {
      this.log.warn(`Unparseable sidecar message: ${line}`);
      return;
    }
    switch (msg.t) {
      case 'ready':
        this.log.info('Sidecar ready');
        break;
      case 'accessories':
        this.syncAccessories(msg.items || []);
        break;
      case 'state':
        this.applyState(msg.id, msg.on);
        break;
      case 'tstate':
        this.applyThermostatState(msg);
        break;
      case 'lstate':
        this.applyLightSensor(msg);
        break;
      case 'sstate':
        this.applyTempSensor(msg);
        break;
      default:
        // ignore unknown message types for forward-compatibility
        break;
    }
  }

  // Reconcile the set of HomeKit accessories with what the sidecar discovered.
  syncAccessories(items) {
    const seen = new Set();

    for (const item of items) {
      if (item.kind === 'switch') {
        seen.add(item.id);
        this.ensureSwitch(item);
      } else if (item.kind === 'thermostat') {
        seen.add(item.id);
        this.ensureThermostat(item);
      } else if (item.kind === 'lightsensor') {
        seen.add(item.id);
        this.ensureLightSensor(item);
      } else if (item.kind === 'occupancy') {
        seen.add(item.id);
        this.ensureOccupancy(item);
      } else if (item.kind === 'tempsensor') {
        seen.add(item.id);
        this.ensureTempSensor(item);
      }
    }

    // Remove accessories that are cached/live but no longer discovered.
    for (const [uuid, accessory] of this.cached) {
      const id = accessory.context && accessory.context.id;
      if (id && !seen.has(id)) {
        this.log.info(`Removing stale accessory: ${accessory.displayName}`);
        this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
        this.cached.delete(uuid);
        this.switches.delete(id);
        this.thermostats.delete(id);
        this.lightSensors.delete(id);
        this.occupancy.delete(id);
        this.tempSensors.delete(id);
      }
    }
  }

  ensureSwitch(item) {
    const uuid = this.api.hap.uuid.generate(`${PLATFORM_NAME}:${item.id}`);
    let accessory = this.cached.get(uuid);
    let isNew = false;

    if (!accessory) {
      accessory = new this.api.platformAccessory(item.name, uuid);
      isNew = true;
    }
    accessory.context.id = item.id;
    accessory.displayName = item.name;

    const service =
      accessory.getService(this.Service.Switch) ||
      accessory.addService(this.Service.Switch, item.name);

    const record = { accessory, on: !!item.on };
    this.switches.set(item.id, record);

    const onChar = service.getCharacteristic(this.Characteristic.On);
    onChar.removeAllListeners('get');
    onChar.removeAllListeners('set');
    onChar
      .onGet(() => {
        const r = this.switches.get(item.id);
        return r ? r.on : false;
      })
      .onSet((value) => {
        const on = !!value;
        const r = this.switches.get(item.id);
        if (r) r.on = on; // optimistic; sidecar re-poll confirms
        this.sendSet(item.id, on);
      });

    // Reflect current state immediately.
    onChar.updateValue(record.on);

    if (isNew) {
      this.log.info(`Registering switch: ${item.name} (${item.id})`);
      this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
      this.cached.set(uuid, accessory);
    }
  }

  applyState(id, on) {
    // A 'state' message may target a Switch (circuit/feature) or an Occupancy
    // sensor (e.g. freeze, whose id is the freeze circuit's objnam). Route by id.
    const sw = this.switches.get(id);
    if (sw) {
      sw.on = !!on;
      const service = sw.accessory.getService(this.Service.Switch);
      if (service) service.getCharacteristic(this.Characteristic.On).updateValue(sw.on);
      return;
    }
    const occ = this.occupancy.get(id);
    if (occ) {
      occ.on = !!on;
      const service = occ.accessory.getService(this.Service.OccupancySensor);
      if (service) service.getCharacteristic(this.Characteristic.OccupancyDetected).updateValue(this.occVal(occ.on));
    }
  }

  // Map a boolean active-state to the OccupancyDetected enum.
  occVal(on) {
    const O = this.Characteristic.OccupancyDetected;
    return on ? O.OCCUPANCY_DETECTED : O.OCCUPANCY_NOT_DETECTED;
  }

  // A pump metric (RPM/Watts/GPM) becomes a read-only LightSensor whose lux value
  // IS the metric — HomeKit's only read-only raw-number channel. Buried in the
  // "Light" status group, but it shows the true number with no control surface.
  ensureLightSensor(item) {
    const C = this.Characteristic;
    const uuid = this.api.hap.uuid.generate(`${PLATFORM_NAME}:${item.id}`);
    let accessory = this.cached.get(uuid);
    let isNew = false;
    if (!accessory) {
      accessory = new this.api.platformAccessory(item.name, uuid);
      isNew = true;
    }
    accessory.context.id = item.id;
    accessory.displayName = item.name;

    const service =
      accessory.getService(this.Service.LightSensor) ||
      accessory.addService(this.Service.LightSensor, item.name);

    const rec = { accessory, lux: typeof item.lux === 'number' ? item.lux : 0 };
    this.lightSensors.set(item.id, rec);

    const ch = service.getCharacteristic(C.CurrentAmbientLightLevel);
    ch.removeAllListeners('get');
    ch.onGet(() => luxClamp(this.lightSensors.get(item.id)?.lux));
    ch.updateValue(luxClamp(rec.lux));

    if (isNew) {
      this.log.info(`Registering metric (read-only light sensor): ${item.name} (${item.id})`);
      this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
      this.cached.set(uuid, accessory);
    }
  }

  applyLightSensor(msg) {
    const rec = this.lightSensors.get(msg.id);
    if (!rec || typeof msg.lux !== 'number') return;
    rec.lux = msg.lux;
    const service = rec.accessory.getService(this.Service.LightSensor);
    if (service) service.getCharacteristic(this.Characteristic.CurrentAmbientLightLevel).updateValue(luxClamp(rec.lux));
  }

  // A boolean system state (e.g. freeze protection) becomes a read-only
  // OccupancySensor — chosen because a sensor can drive HomeKit notifications/
  // automations, which is the point ("alert me when freeze is active").
  ensureOccupancy(item) {
    const uuid = this.api.hap.uuid.generate(`${PLATFORM_NAME}:${item.id}`);
    let accessory = this.cached.get(uuid);
    let isNew = false;
    if (!accessory) {
      accessory = new this.api.platformAccessory(item.name, uuid);
      isNew = true;
    }
    accessory.context.id = item.id;
    accessory.displayName = item.name;

    const service =
      accessory.getService(this.Service.OccupancySensor) ||
      accessory.addService(this.Service.OccupancySensor, item.name);

    const rec = { accessory, on: !!item.on };
    this.occupancy.set(item.id, rec);

    const ch = service.getCharacteristic(this.Characteristic.OccupancyDetected);
    ch.removeAllListeners('get');
    ch.onGet(() => this.occVal(this.occupancy.get(item.id)?.on));
    ch.updateValue(this.occVal(rec.on));

    if (isNew) {
      this.log.info(`Registering state (read-only occupancy sensor): ${item.name} (${item.id})`);
      this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
      this.cached.set(uuid, accessory);
    }
  }

  // A temperature sensor (e.g. air) becomes a read-only TemperatureSensor.
  // CurrentTemperature is always Celsius on the wire; the Home app renders it in
  // the user's locale unit.
  ensureTempSensor(item) {
    const uuid = this.api.hap.uuid.generate(`${PLATFORM_NAME}:${item.id}`);
    let accessory = this.cached.get(uuid);
    let isNew = false;
    if (!accessory) {
      accessory = new this.api.platformAccessory(item.name, uuid);
      isNew = true;
    }
    accessory.context.id = item.id;
    accessory.displayName = item.name;

    const service =
      accessory.getService(this.Service.TemperatureSensor) ||
      accessory.addService(this.Service.TemperatureSensor, item.name);

    const rec = { accessory, c: typeof item.curC === 'number' ? item.curC : 20 };
    this.tempSensors.set(item.id, rec);

    const ch = service.getCharacteristic(this.Characteristic.CurrentTemperature);
    ch.removeAllListeners('get');
    ch.onGet(() => this.tempSensors.get(item.id)?.c ?? 20);
    ch.updateValue(rec.c);

    if (isNew) {
      this.log.info(`Registering temperature sensor: ${item.name} (${item.id})`);
      this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
      this.cached.set(uuid, accessory);
    }
  }

  applyTempSensor(msg) {
    const rec = this.tempSensors.get(msg.id);
    if (!rec || typeof msg.c !== 'number') return;
    rec.c = msg.c;
    const service = rec.accessory.getService(this.Service.TemperatureSensor);
    if (service) service.getCharacteristic(this.Characteristic.CurrentTemperature).updateValue(rec.c);
  }

  // A body+heater becomes a HomeKit Thermostat: current temp, setpoint, and
  // heating/cooling state. Temperatures arrive in Celsius (HomeKit's unit); we
  // display °F. Setpoint and on/off control write back to IntelliCenter via the
  // sidecar (LOTMP/HITMP setpoints, HTSRC heat source); the next push confirms.
  ensureThermostat(item) {
    const C = this.Characteristic;
    const uuid = this.api.hap.uuid.generate(`${PLATFORM_NAME}:${item.id}`);
    let accessory = this.cached.get(uuid);
    let isNew = false;
    if (!accessory) {
      accessory = new this.api.platformAccessory(item.name, uuid);
      isNew = true;
    }
    accessory.context.id = item.id;
    accessory.displayName = item.name;

    const service =
      accessory.getService(this.Service.Thermostat) ||
      accessory.addService(this.Service.Thermostat, item.name);

    const rec = {
      accessory,
      canCool: !!item.canCool,
      curC: typeof item.curC === 'number' ? item.curC : 20,
      heatC: typeof item.heatC === 'number' ? item.heatC : 26,
      coolC: typeof item.coolC === 'number' ? item.coolC : 30,
      state: item.state || 'off',
    };
    this.thermostats.set(item.id, rec);

    // Allowed modes: heat-only → Off/Heat; heat pump → Off/Heat/Cool/Auto.
    const T = C.TargetHeatingCoolingState;
    service.getCharacteristic(T).setProps({
      validValues: rec.canCool ? [T.OFF, T.HEAT, T.COOL, T.AUTO] : [T.OFF, T.HEAT],
    });
    // Pool/spa setpoints reach ~104°F (40°C) — widen past HomeKit's 38°C default.
    const tempProps = { minValue: 7, maxValue: 41, minStep: 0.5 };
    service.getCharacteristic(C.TargetTemperature).setProps(tempProps);
    // A cool-capable body shows a heat+cool band (Auto) via the two thresholds.
    if (rec.canCool) {
      service.getCharacteristic(C.HeatingThresholdTemperature).setProps(tempProps);
      service.getCharacteristic(C.CoolingThresholdTemperature).setProps(tempProps);
    }
    // Display unit per config (storage stays Celsius); default Fahrenheit.
    const useC = String(this.config.temperatureUnits || 'F').toUpperCase() === 'C';
    service
      .getCharacteristic(C.TemperatureDisplayUnits)
      .updateValue(useC ? C.TemperatureDisplayUnits.CELSIUS : C.TemperatureDisplayUnits.FAHRENHEIT);

    this.wireThermostat(service, item.id);
    this.pushThermostat(service, rec);

    if (isNew) {
      this.log.info(`Registering thermostat: ${item.name} (${item.id})`);
      this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
      this.cached.set(uuid, accessory);
    }
  }

  wireThermostat(service, id) {
    const C = this.Characteristic;
    const recOf = () => this.thermostats.get(id);

    const cur = service.getCharacteristic(C.CurrentTemperature);
    cur.removeAllListeners('get');
    cur.onGet(() => { const r = recOf(); return r ? r.curC : 20; });

    const tt = service.getCharacteristic(C.TargetTemperature);
    tt.removeAllListeners('get');
    tt.removeAllListeners('set');
    tt.onGet(() => { const r = recOf(); return r ? r.heatC : 26; })
      .onSet((value) => {
        const r = recOf();
        if (r) r.heatC = value; // optimistic; next push confirms
        this.sendTSet(id, { heatC: value });
      });

    const ccs = service.getCharacteristic(C.CurrentHeatingCoolingState);
    ccs.removeAllListeners('get');
    ccs.onGet(() => curHCState(C, (recOf() || {}).state));

    const tcs = service.getCharacteristic(C.TargetHeatingCoolingState);
    tcs.removeAllListeners('get');
    tcs.removeAllListeners('set');
    tcs.onGet(() => { const r = recOf() || {}; return tgtHCState(C, r.state, r.canCool); })
      .onSet((value) => {
        // Pentair's only knob is the heat source (on/off); a heat pump picks
        // heat vs cool itself from the setpoint band. So any non-Off target ==
        // "assign the heater"; the displayed mode snaps to Auto/Heat on next push.
        const off = value === C.TargetHeatingCoolingState.OFF;
        const r = recOf();
        if (r) r.state = off ? 'off' : (r.canCool ? 'cool' : 'heat'); // optimistic
        this.sendTSet(id, { mode: off ? 'off' : 'on' });
      });

    // Heat pump: Auto-mode band (heat below LOTMP, cool above HITMP).
    const r0 = recOf();
    if (r0 && r0.canCool) {
      const ht = service.getCharacteristic(C.HeatingThresholdTemperature);
      ht.removeAllListeners('get');
      ht.removeAllListeners('set');
      ht.onGet(() => (recOf() || {}).heatC ?? 26)
        .onSet((value) => {
          const r = recOf();
          if (r) r.heatC = value;
          this.sendTSet(id, { heatC: value });
        });
      const ct = service.getCharacteristic(C.CoolingThresholdTemperature);
      ct.removeAllListeners('get');
      ct.removeAllListeners('set');
      ct.onGet(() => (recOf() || {}).coolC ?? 33)
        .onSet((value) => {
          const r = recOf();
          if (r) r.coolC = value;
          this.sendTSet(id, { coolC: value });
        });
    }
  }

  pushThermostat(service, rec) {
    const C = this.Characteristic;
    service.getCharacteristic(C.CurrentTemperature).updateValue(rec.curC);
    service.getCharacteristic(C.TargetTemperature).updateValue(rec.heatC);
    service.getCharacteristic(C.CurrentHeatingCoolingState).updateValue(curHCState(C, rec.state));
    service.getCharacteristic(C.TargetHeatingCoolingState).updateValue(tgtHCState(C, rec.state, rec.canCool));
    if (rec.canCool) {
      service.getCharacteristic(C.HeatingThresholdTemperature).updateValue(rec.heatC);
      service.getCharacteristic(C.CoolingThresholdTemperature).updateValue(rec.coolC);
    }
  }

  applyThermostatState(msg) {
    const rec = this.thermostats.get(msg.id);
    if (!rec) return;
    if (typeof msg.curC === 'number') rec.curC = msg.curC;
    if (typeof msg.heatC === 'number') rec.heatC = msg.heatC;
    if (typeof msg.coolC === 'number') rec.coolC = msg.coolC;
    if (msg.state) rec.state = msg.state;
    const service = rec.accessory.getService(this.Service.Thermostat);
    if (service) this.pushThermostat(service, rec);
  }

  sendSet(id, on) {
    if (!this.child || !this.child.stdin.writable) {
      this.log.warn(`Cannot send set for ${id}: sidecar not running`);
      return;
    }
    this.child.stdin.write(JSON.stringify({ t: 'set', id, on }) + '\n');
  }

  // sendTSet forwards a thermostat command (any subset of heatC/coolC Celsius
  // setpoints and on/off mode) to the sidecar.
  sendTSet(id, fields) {
    if (!this.child || !this.child.stdin.writable) {
      this.log.warn(`Cannot send tset for ${id}: sidecar not running`);
      return;
    }
    this.child.stdin.write(JSON.stringify({ t: 'tset', id, ...fields }) + '\n');
  }
}

// HAP's CurrentAmbientLightLevel has a minimum of 0.0001 lux; a real 0 (pump
// off) would be rejected, so clamp up to the floor.
function luxClamp(v) {
  const n = typeof v === 'number' ? v : 0;
  return n < 0.0001 ? 0.0001 : n;
}

// Map the sidecar's heat-state string to HomeKit characteristic values.
// state: 'off' | 'idle' | 'heat' | 'cool'
function curHCState(C, state) {
  if (state === 'heat') return C.CurrentHeatingCoolingState.HEAT;
  if (state === 'cool') return C.CurrentHeatingCoolingState.COOL;
  return C.CurrentHeatingCoolingState.OFF; // off or idle (not actively running)
}

// The *selected* mode (vs curHCState's current activity): a cool-capable body
// maintains a heat+cool band → Auto; a heat-only body → Heat; no heater → Off.
function tgtHCState(C, state, canCool) {
  if (state === 'off') return C.TargetHeatingCoolingState.OFF;
  return canCool ? C.TargetHeatingCoolingState.AUTO : C.TargetHeatingCoolingState.HEAT;
}
