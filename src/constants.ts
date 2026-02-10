export const PARAMS_KEY = 'params';
export const OBJ_TYPE_KEY = 'OBJTYP';
export const OBJ_ID_KEY = 'objnam';
export const OBJ_NAME_KEY = 'SNAME';
export const OBJ_SUBTYPE_KEY = 'SUBTYP';
export const OBJ_LIST_KEY = 'OBJLIST';
export const OBJ_MIN_KEY = 'MIN';
export const OBJ_MAX_KEY = 'MAX';
export const OBJ_MIN_FLOW_KEY = 'MINF';
export const OBJ_MAX_FLOW_KEY = 'MAXF';
export const CIRCUITS_KEY = 'CIRCUITS';
export const CIRCUIT_KEY = 'CIRCUIT';
export const STATUS_KEY = 'STATUS';
export const ACT_KEY = 'ACT';
export const USE_KEY = 'USE';
export const LAST_TEMP_KEY = 'LSTTMP';
export const HEAT_SOURCE_KEY = 'HTSRC';
export const HEATER_KEY = 'HEATER';
export const MODE_KEY = 'MODE';
export const HTMODE_KEY = 'HTMODE';
export const LOW_TEMP_KEY = 'LOTMP';
export const HIGH_TEMP_KEY = 'HITMP';
export const COOL_KEY = 'COOL';
export const SPEED_KEY = 'SPEED';
export const SELECT_KEY = 'SELECT';
export const PARENT_KEY = 'PARENT';
export const PROBE_KEY = 'PROBE';
export const GPM_KEY = 'GPM';
export const WATTS_KEY = 'WATTS';
export const RPM_KEY = 'RPM';

// Heat mode values for multi-mode heaters (e.g., Pentair UltraTemp ETi Hybrid)
export const HEAT_MODE_OFF = 1;
export const HEAT_MODE_GAS_ONLY = 7;
export const HEAT_MODE_HEAT_PUMP_ONLY = 8;
export const HEAT_MODE_HYBRID = 9;
export const HEAT_MODE_DUAL = 10;
export const HEAT_MODE_DEFAULT_ON = HEAT_MODE_DUAL;

export const THERMOSTAT_STEP_VALUE = 0.5;
export const NO_HEATER_ID = '00000';
export const DEFAULT_COLOR_TEMPERATURE = 140;
export const DEFAULT_BRIGHTNESS = 100;

export const CURRENT_TEMP_MIN_C = -100;
export const CURRENT_TEMP_MAX_C = 100;

export const DISCOVER_COMMANDS: ReadonlyArray<string> = ['CIRCUITS', 'PUMPS', 'CHEMS', 'VALVES', 'HEATERS', 'SENSORS', 'GROUPS'];
export const VARIABLE_SPEED_PUMP_SUBTYPES = new Set(['SPEED', 'VSF']) as ReadonlySet<string>;

// Pump type mapping from telnet SubType to actual pump type
export const PUMP_TYPE_MAPPING = new Map([
  ['SPEED', 'VS'], // Variable Speed
  ['VSF', 'VSF'], // Variable Speed/Flow
  ['FLOW', 'VF'], // Variable Flow
  ['SINGLE', 'SS'], // Single Speed
  ['DUAL', 'DS'], // Dual Speed
]) as ReadonlyMap<string, string>;

// Pump performance curves based on Pentair specifications
export const PUMP_PERFORMANCE_CURVES = {
  VS: {
    // Variable Speed pump (IntelliFlo VS series)
    maxRPM: 3450,
    minRPM: 450,
    // GPM calculation: Based on typical IntelliFlo VS pump curves
    calculateGPM: (rpm: number): number => {
      if (rpm < 450) {
        return 0;
      }
      if (rpm > 3450) {
        rpm = 3450;
      }
      // Typical VS pump: ~20 GPM at 1000 RPM, ~110 GPM at 3450 RPM
      // Using polynomial approximation of pump curve
      return Math.max(0, rpm * 0.032 - 14.4);
    },
    // WATTS calculation: Calibrated to match IntelliCenter actual readings
    calculateWATTS: (rpm: number): number => {
      if (rpm < 450) {
        return 0;
      }
      if (rpm > 3450) {
        rpm = 3450;
      }
      // Calibrated to actual VS pump data: 1800=225W, 3400=1483W
      // Using linear interpolation between the two known points
      if (rpm <= 1800) {
        // Linear from 450 RPM (assumed ~30W) to 1800 RPM (225W)
        return Math.round(30 + ((rpm - 450) * (225 - 30)) / (1800 - 450));
      } else {
        // Linear from 1800 RPM (225W) to 3400 RPM (1483W)
        return Math.round(225 + ((rpm - 1800) * (1483 - 225)) / (3400 - 1800));
      }
    },
  },
  VSF: {
    // Variable Speed/Flow pump (IntelliFlo VSF series)
    maxRPM: 3450,
    minRPM: 450,
    // GPM calculation: Calibrated from real IntelliCenter data
    calculateGPM: (rpm: number): number => {
      if (rpm < 450) {
        return 0;
      }
      if (rpm > 3450) {
        rpm = 3450;
      }
      // Calibrated to actual VSF pump data: 2450=55 GPM, 3450=80 GPM
      // Using linear interpolation between the two known points
      if (rpm <= 2450) {
        // Linear from 450 RPM (assumed ~5 GPM) to 2450 RPM (55 GPM)
        return Math.round(5 + ((rpm - 450) * (55 - 5)) / (2450 - 450));
      } else {
        // Linear from 2450 RPM (55 GPM) to 3450 RPM (80 GPM)
        return Math.round(55 + ((rpm - 2450) * (80 - 55)) / (3450 - 2450));
      }
    },
    // WATTS calculation: Calibrated from real IntelliCenter data
    calculateWATTS: (rpm: number): number => {
      if (rpm < 450) {
        return 0;
      }
      if (rpm > 3450) {
        rpm = 3450;
      }
      // Calibrated to actual VSF pump data: 2450=820W, 3450=1982W
      // Using linear interpolation between the two known points
      if (rpm <= 2450) {
        // Linear from 450 RPM (assumed ~50W) to 2450 RPM (820W)
        return Math.round(50 + ((rpm - 450) * (820 - 50)) / (2450 - 450));
      } else {
        // Linear from 2450 RPM (820W) to 3450 RPM (1982W)
        return Math.round(820 + ((rpm - 2450) * (1982 - 820)) / (3450 - 2450));
      }
    },
  },
  VF: {
    // Variable Flow pump
    maxRPM: 3450,
    minRPM: 450,
    calculateGPM: (rpm: number): number => {
      if (rpm < 450) {
        return 0;
      }
      if (rpm > 3450) {
        rpm = 3450;
      }
      return Math.max(0, rpm * 0.035 - 15.75);
    },
    calculateWATTS: (rpm: number): number => {
      if (rpm < 450) {
        return 0;
      }
      if (rpm > 3450) {
        rpm = 3450;
      }
      // Fourth-degree polynomial derived from VS pump with 11% efficiency improvement
      // VF pumps are similar to VSF but slightly less efficient (1325W max vs 1489W)
      const r = rpm / 3450;
      const a = -489.86724322;
      const b = 2206.76415578;
      const c = -482.4110795;
      const d = 90.72416694;
      return Math.round(a * Math.pow(r, 4) + b * Math.pow(r, 3) + c * Math.pow(r, 2) + d * r);
    },
  },
} as const;

// IntelliBrite color-changing light options
export type IntelliBriteOption = {
  readonly code: string;
  readonly name: string;
};

// Fixed colors (5)
export const INTELLIBRITE_COLORS: readonly IntelliBriteOption[] = [
  { code: 'WHITER', name: 'White' },
  { code: 'REDR', name: 'Red' },
  { code: 'GREENR', name: 'Green' },
  { code: 'BLUER', name: 'Blue' },
  { code: 'MAGNTAR', name: 'Magenta' },
] as const;

// Light shows (7)
export const INTELLIBRITE_SHOWS: readonly IntelliBriteOption[] = [
  { code: 'SAMMOD', name: 'Sam' },
  { code: 'PARTY', name: 'Party' },
  { code: 'ROMAN', name: 'Romance' },
  { code: 'CARIB', name: 'Caribbean' },
  { code: 'AMERCA', name: 'American' },
  { code: 'SSET', name: 'Sunset' },
  { code: 'ROYAL', name: 'Royal' },
] as const;

// All IntelliBrite options combined
export const INTELLIBRITE_OPTIONS: readonly IntelliBriteOption[] = [...INTELLIBRITE_COLORS, ...INTELLIBRITE_SHOWS] as const;
