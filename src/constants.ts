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
export const LAST_TEMP_KEY = 'LSTTMP';
export const HEAT_SOURCE_KEY = 'HTSRC';
export const HEATER_KEY = 'HEATER';
export const MODE_KEY = 'MODE';
export const LOW_TEMP_KEY = 'LOTMP';
export const SPEED_KEY = 'SPEED';
export const SELECT_KEY = 'SELECT';
export const PARENT_KEY = 'PARENT';
export const PROBE_KEY = 'PROBE';
export const GPM_KEY = 'GPM';
export const WATTS_KEY = 'WATTS';
export const RPM_KEY = 'RPM';

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
      // Calibrated to actual IntelliCenter readings: 1800 RPM = 217W, 2300 RPM = 453W
      // Formula derived from two real data points: exponent 3.0, multiplier 1530
      const rpmRatio = rpm / 3450;
      return Math.round(Math.pow(rpmRatio, 3.0) * 1530);
    },
  },
  VSF: {
    // Variable Speed/Flow pump (IntelliFlo VSF series)
    maxRPM: 3450,
    minRPM: 450,
    // GPM calculation: VSF pumps have enhanced flow characteristics
    calculateGPM: (rpm: number): number => {
      if (rpm < 450) {
        return 0;
      }
      if (rpm > 3450) {
        rpm = 3450;
      }
      // VSF pumps typically have better flow rates than VS
      // ~25 GPM at 1000 RPM, ~130 GPM at 3450 RPM
      return Math.max(0, rpm * 0.038 - 17.1);
    },
    // WATTS calculation: VSF pumps are more efficient than standard VS
    calculateWATTS: (rpm: number): number => {
      if (rpm < 450) {
        return 0;
      }
      if (rpm > 3450) {
        rpm = 3450;
      }
      // VSF pumps are ~12% more efficient than standard VS pumps (1530W * 0.88 = 1346W max)
      // Calibrated based on actual VS pump data with efficiency adjustment
      const rpmRatio = rpm / 3450;
      return Math.round(Math.pow(rpmRatio, 3.0) * 1346);
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
      // VF pumps similar efficiency to VSF (1360W max, slightly higher than VSF)
      const rpmRatio = rpm / 3450;
      return Math.round(Math.pow(rpmRatio, 3.0) * 1360);
    },
  },
} as const;
