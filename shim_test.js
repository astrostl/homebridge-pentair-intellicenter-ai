'use strict';
// Mock-HAP harness for the shim's accessory identity logic (no Homebridge needed).
const assert = require('assert');
const crypto = require('crypto');

// --- minimal HAP fakes ---
class FakeChar {
  constructor(name) { this.name = name; this.value = null; }
  removeAllListeners() { return this; }
  onGet(fn) { this.getFn = fn; return this; }
  onSet(fn) { this.setFn = fn; return this; }
  updateValue(v) { this.value = v; return this; }
  setProps() { return this; }
  getCharacteristic() { return this; }
}
class FakeService {
  constructor(type, name) { this.type = type; this.name = name; this.chars = new Map(); }
  getCharacteristic(c) {
    const key = c && c.key ? c.key : String(c);
    if (!this.chars.has(key)) this.chars.set(key, new FakeChar(key));
    return this.chars.get(key);
  }
}
class FakeAccessory {
  constructor(name, uuid) { this.displayName = name; this.UUID = uuid; this.context = {}; this.services = []; }
  getService(type) { return this.services.find((s) => s.type === type); }
  addService(type, name) { const s = new FakeService(type, name); this.services.push(s); return s; }
  removeService(s) { this.services = this.services.filter((x) => x !== s); }
}
const S = { Switch: 'Switch', Lightbulb: 'Lightbulb', Thermostat: 'Thermostat',
  LightSensor: 'LightSensor', OccupancySensor: 'OccupancySensor', TemperatureSensor: 'TemperatureSensor' };
const C = new Proxy({}, { get: (t, p) => ({ key: String(p), OCCUPANCY_DETECTED: 1, OCCUPANCY_NOT_DETECTED: 0,
  OFF: 0, HEAT: 1, COOL: 2, AUTO: 3, CELSIUS: 0, FAHRENHEIT: 1,
  TargetHeatingCoolingState: { OFF: 0, HEAT: 1, COOL: 2, AUTO: 3 } }) });

function makeApi(events) {
  return {
    hap: {
      Service: S,
      Characteristic: {
        On: { key: 'On' },
        OccupancyDetected: { key: 'OccupancyDetected', OCCUPANCY_DETECTED: 1, OCCUPANCY_NOT_DETECTED: 0 },
        CurrentAmbientLightLevel: { key: 'CurrentAmbientLightLevel' },
        CurrentTemperature: { key: 'CurrentTemperature' },
        TargetTemperature: { key: 'TargetTemperature' },
        CurrentHeatingCoolingState: { key: 'CurrentHeatingCoolingState', HEAT: 1, COOL: 2, OFF: 0 },
        TargetHeatingCoolingState: { key: 'TargetHeatingCoolingState', OFF: 0, HEAT: 1, COOL: 2, AUTO: 3 },
        HeatingThresholdTemperature: { key: 'HeatingThresholdTemperature' },
        CoolingThresholdTemperature: { key: 'CoolingThresholdTemperature' },
        TemperatureDisplayUnits: { key: 'TemperatureDisplayUnits', CELSIUS: 0, FAHRENHEIT: 1 },
      },
      uuid: { generate: (seed) => crypto.createHash('sha1').update(seed).digest('hex').slice(0, 32) },
    },
    platformAccessory: FakeAccessory,
    registerPlatformAccessories: (p, pl, accs) => accs.forEach((a) => events.push(['register', a.displayName, a.UUID])),
    unregisterPlatformAccessories: (p, pl, accs) => accs.forEach((a) => events.push(['unregister', a.displayName, a.UUID])),
    on: () => {},
  };
}

// Load the platform class without registering: call the module export with a
// capture api, grab the class from registerPlatform.
let Platform;
const captureApi = { registerPlatform: (n, cls) => { Platform = cls; } };
require(require('path').join(__dirname, 'index.js'))(captureApi);
assert(Platform, 'platform class captured');

const log = { info: () => {}, warn: () => {}, error: () => {} };
function makePlatform(events, cachedAccessories = []) {
  const api = makeApi(events);
  const p = new Platform(log, {}, api);
  for (const a of cachedAccessories) p.configureAccessory(a);
  return { p, api };
}

const gen = (seed) => crypto.createHash('sha1').update(seed).digest('hex').slice(0, 32);
const LEGACY = gen('PentairIntelliCenter:C0003');
const KIND_LB = gen('PentairIntelliCenter:C0003:lightbulb');
const KIND_SW = gen('PentairIntelliCenter:C0003:switch');

// 1. Fresh install: new lightbulb registers under the kind-scoped UUID.
{
  const events = [];
  const { p } = makePlatform(events);
  p.syncAccessories([{ id: 'C0003', name: 'Pool Light', kind: 'lightbulb', on: false }]);
  assert.deepStrictEqual(events, [['register', 'Pool Light', KIND_LB]]);
  console.log('ok 1: fresh install registers at kind-scoped UUID');
}

// 2. Upgrade, kind unchanged: legacy-UUID accessory with matching service is kept (no churn).
{
  const events = [];
  const legacy = new FakeAccessory('Pool Light', LEGACY);
  legacy.context.id = 'C0003';
  legacy.addService(S.Lightbulb, 'Pool Light');
  const { p } = makePlatform(events, [legacy]);
  p.syncAccessories([{ id: 'C0003', name: 'Pool Light', kind: 'lightbulb', on: true }]);
  assert.deepStrictEqual(events, [], 'no register/unregister expected');
  assert(p.lights.get('C0003').accessory === legacy);
  console.log('ok 2: legacy accessory with matching type kept, zero churn');
}

// 3. Reclassification: legacy accessory carrying a Switch service, sidecar now says lightbulb
//    -> old accessory unregistered, brand-new accessory registered under NEW UUID.
{
  const events = [];
  const legacy = new FakeAccessory('Pool Light', LEGACY);
  legacy.context.id = 'C0003';
  legacy.addService(S.Switch, 'Pool Light');
  const { p } = makePlatform(events, [legacy]);
  p.syncAccessories([{ id: 'C0003', name: 'Pool Light', kind: 'lightbulb', on: false }]);
  assert.deepStrictEqual(events, [
    ['unregister', 'Pool Light', LEGACY],
    ['register', 'Pool Light', KIND_LB],
  ]);
  assert(p.lights.get('C0003').accessory.UUID === KIND_LB);
  console.log('ok 3: reclassified accessory re-registered under a new UUID');
}

// 4. Double flip lightbulb -> switch -> lightbulb: no duplicates, record maps stay clean,
//    applyState reaches the live accessory.
{
  const events = [];
  const { p } = makePlatform(events);
  p.syncAccessories([{ id: 'C0003', name: 'Pool Light', kind: 'lightbulb', on: false }]);
  p.syncAccessories([{ id: 'C0003', name: 'Pool Light', kind: 'switch', on: false }]);
  p.syncAccessories([{ id: 'C0003', name: 'Pool Light', kind: 'lightbulb', on: false }]);
  // after all flips there must be exactly one cached accessory for C0003
  const forId = [...p.cached.values()].filter((a) => a.context.id === 'C0003');
  assert.strictEqual(forId.length, 1);
  assert.strictEqual(forId[0].UUID, KIND_LB);
  assert(!p.switches.has('C0003'), 'stale switch record must be cleared');
  // applyState routes to the lightbulb
  p.applyState('C0003', true);
  assert.strictEqual(p.lights.get('C0003').on, true);
  const svc = p.lights.get('C0003').accessory.getService(S.Lightbulb);
  assert.strictEqual(svc.getCharacteristic({ key: 'On' }).value, true);
  console.log('ok 4: double reclassification leaves one accessory, state routes correctly');
}

// 5. Prune still works: cached accessory whose id disappears is removed.
{
  const events = [];
  const legacy = new FakeAccessory('Old Thing', gen('PentairIntelliCenter:GONE'));
  legacy.context.id = 'GONE';
  legacy.addService(S.Switch, 'Old Thing');
  const { p } = makePlatform(events, [legacy]);
  p.syncAccessories([{ id: 'C0003', name: 'Pool Light', kind: 'lightbulb', on: false }]);
  assert(events.some((e) => e[0] === 'unregister' && e[1] === 'Old Thing'));
  console.log('ok 5: not-seen prune unchanged');
}

// 6. Other kinds still ensure fine (thermostat/lightsensor/occupancy/tempsensor smoke).
{
  const events = [];
  const { p } = makePlatform(events);
  p.syncAccessories([
    { id: 'B1101', name: 'Pool', kind: 'thermostat', curC: 28, heatC: 30, state: 'heat', canCool: false },
    { id: 'PMP01_rpm', name: 'VS RPM', kind: 'lightsensor', lux: 1800 },
    { id: '_conn', name: 'Controller', kind: 'occupancy', on: true },
    { id: '_A135', name: 'Air', kind: 'tempsensor', curC: 35 },
  ]);
  assert.strictEqual(events.filter((e) => e[0] === 'register').length, 4);
  console.log('ok 6: all kinds register (smoke)');
}

console.log('ALL PASS');
