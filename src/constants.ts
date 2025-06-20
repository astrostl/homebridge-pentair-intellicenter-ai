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
      // Fourth-degree polynomial calibrated to actual IntelliCenter readings: 1800=217W, 2300=453W, 3100=1094W, 3450=1489W
      // Polynomial: W = a*r^4 + b*r^3 + c*r^2 + d*r where r = RPM/3450
      // Coefficients solved for zero deviation at all calibration points
      const r = rpm / 3450;
      const a = -550.41263283;
      const b = 2479.51028739;
      const c = -542.03492079;
      const d = 101.93726623;
      return Math.round(a * Math.pow(r, 4) + b * Math.pow(r, 3) + c * Math.pow(r, 2) + d * r);
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
      // Fourth-degree polynomial derived from VS pump with 12% efficiency improvement
      // VSF pumps are ~12% more efficient than standard VS pumps (1310W max vs 1489W)
      const r = rpm / 3450;
      const a = -484.36311689;
      const b = 2181.9690529;
      const c = -476.9907303;
      const d = 89.70479428;
      return Math.round(a * Math.pow(r, 4) + b * Math.pow(r, 3) + c * Math.pow(r, 2) + d * r);
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
