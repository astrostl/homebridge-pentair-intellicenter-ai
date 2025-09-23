import {
  BaseCircuit,
  Body,
  Circuit,
  CircuitType,
  Color,
  Heater,
  IntelliCenterParams,
  Module,
  ObjectType,
  Panel,
  Pump,
  PumpCircuit,
  Sensor,
  TemperatureSensorType,
} from './types';
import { Logger } from 'homebridge';

// Type guards and helper types for transformation functions
type IntelliCenterObject = {
  [OBJ_ID_KEY]: string;
  [PARAMS_KEY]: Record<string, unknown>;
  [key: string]: unknown;
};

function isIntelliCenterObject(obj: unknown): obj is IntelliCenterObject {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    typeof (obj as Record<string, unknown>)[OBJ_ID_KEY] === 'string' &&
    typeof (obj as Record<string, unknown>)[PARAMS_KEY] === 'object'
  );
}

/**
 * Safe property access helpers to prevent unsafe dynamic property access
 */
const safeGetStringProperty = (obj: Record<string, unknown>, key: string, defaultValue = ''): string => {
  const value = obj[key];
  return typeof value === 'string' ? value : defaultValue;
};

const safeGetStringPropertyOptional = (obj: Record<string, unknown>, key: string): string | undefined => {
  const value = obj[key];
  return typeof value === 'string' && value !== '' ? value : undefined;
};

const safeGetNumberProperty = (obj: Record<string, unknown>, key: string, defaultValue = 0): number => {
  const value = obj[key];
  if (typeof value === 'number') {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number(value);
    return isNaN(parsed) ? defaultValue : parsed;
  }
  return defaultValue;
};

const safeGetObjectProperty = (obj: Record<string, unknown>, key: string): Record<string, unknown> | null => {
  const value = obj[key];
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
};

const safeGetArrayProperty = (obj: Record<string, unknown>, key: string): unknown[] => {
  const value = obj[key];
  return Array.isArray(value) ? value : [];
};

const safeGetParams = (obj: IntelliCenterObject): Record<string, unknown> => {
  return safeGetObjectProperty(obj, PARAMS_KEY) || {};
};

import {
  CIRCUIT_KEY,
  CIRCUITS_KEY,
  COOL_KEY,
  GPM_KEY,
  HTMODE_KEY,
  LAST_TEMP_KEY,
  OBJ_ID_KEY,
  OBJ_LIST_KEY,
  OBJ_MAX_FLOW_KEY,
  OBJ_MAX_KEY,
  OBJ_MIN_FLOW_KEY,
  OBJ_MIN_KEY,
  OBJ_NAME_KEY,
  OBJ_SUBTYPE_KEY,
  OBJ_TYPE_KEY,
  PARAMS_KEY,
  RPM_KEY,
  SELECT_KEY,
  SPEED_KEY,
  VARIABLE_SPEED_PUMP_SUBTYPES,
  WATTS_KEY,
} from './constants';

const transformHeaters = (heaters: unknown[]): ReadonlyArray<Heater> => {
  if (!heaters) {
    return [];
  }
  return heaters
    .filter(obj => {
      if (!isIntelliCenterObject(obj)) {
        return false;
      }
      const params = safeGetParams(obj);
      return safeGetStringProperty(params, OBJ_TYPE_KEY) === ObjectType.Heater;
    })
    .map(heaterObj => {
      const obj = heaterObj as IntelliCenterObject;
      const params = safeGetParams(obj);
      const bodyIdsString = safeGetStringProperty(params, ObjectType.Body);
      const subtype = safeGetStringPropertyOptional(params, OBJ_SUBTYPE_KEY);
      const coolValue = safeGetStringPropertyOptional(params, COOL_KEY);

      return {
        id: safeGetStringProperty(obj, OBJ_ID_KEY),
        name: safeGetStringProperty(params, OBJ_NAME_KEY),
        objectType: ObjectType.Heater,
        type: subtype ? subtype.toUpperCase() : undefined,
        bodyIds: bodyIdsString ? bodyIdsString.split(' ') : [],
        coolingEnabled: coolValue !== undefined && coolValue !== 'OFF',
      } as Heater;
    });
};

const circuitParams = new Map([['status', 'STATUS']]) as ReadonlyMap<string, string>;

const bodyParams = new Map([
  ['temperature', LAST_TEMP_KEY],
  ['highTemperature', 'HITMP'],
  ['lowTemperature', 'LOTMP'],
  ['heaterId', 'HTSRC'],
  ['heatMode', HTMODE_KEY],
]) as ReadonlyMap<string, string>;

const pumpParams = new Map([
  ['speedType', SELECT_KEY],
  ['speed', SPEED_KEY],
  ['rpm', RPM_KEY],
  ['gpm', GPM_KEY],
  ['watts', WATTS_KEY],
]) as ReadonlyMap<string, string>;

export const updateCircuit = (circuit: Circuit | Body, params: IntelliCenterParams): void => {
  circuitParams.forEach((value, key) => {
    if (params[value]) {
      (circuit as any)[key] = params[value];
    }
  });
};

export const updateBody = (body: Body, params: IntelliCenterParams): void => {
  bodyParams.forEach((value, key) => {
    if (params[value]) {
      // Convert numeric parameters to actual numbers
      if (key === 'heatMode') {
        const paramValue = params[value];
        if (typeof paramValue === 'string') {
          const numValue = Number(paramValue);
          body[key] = isNaN(numValue) ? undefined : numValue;
        } else if (typeof paramValue === 'number') {
          body[key] = paramValue;
        } else {
          body[key] = undefined;
        }
      } else {
        body[key] = params[value];
      }
    }
  });
};

export const updatePump = (pump: Pump, params: IntelliCenterParams): void => {
  pumpParams.forEach((value, key) => {
    if (params[value]) {
      pump[key] = params[value];
    }
  });
};

const transformBodies = (circuits: unknown[]): ReadonlyArray<Body> => {
  if (!circuits) {
    return [];
  }
  return circuits
    .filter(obj => {
      if (!isIntelliCenterObject(obj)) {
        return false;
      }
      const params = safeGetParams(obj);
      return safeGetStringProperty(params, OBJ_TYPE_KEY) === ObjectType.Body;
    })
    .map(bodyObj => {
      const obj = bodyObj as IntelliCenterObject;
      const params = safeGetParams(obj);
      const subtype = safeGetStringPropertyOptional(params, OBJ_SUBTYPE_KEY);
      const body = {
        id: safeGetStringProperty(obj, OBJ_ID_KEY),
        name: safeGetStringProperty(params, OBJ_NAME_KEY),
        objectType: ObjectType.Body,
        type: subtype ? subtype.toUpperCase() : undefined,
      } as Body;
      updateBody(body, params as IntelliCenterParams);
      return {
        ...body,
        circuit: findBodyCircuit(body, circuits),
      };
    });
};

export const findBodyCircuit = (body: Body, circuits: unknown[]): BaseCircuit | undefined => {
  for (const circuit of circuits) {
    if (!isIntelliCenterObject(circuit)) {
      continue;
    }
    const params = safeGetParams(circuit);
    const circuitType = safeGetStringProperty(params, OBJ_TYPE_KEY);
    const circuitSubType = safeGetStringProperty(params, OBJ_SUBTYPE_KEY);
    const circuitName = safeGetStringProperty(params, OBJ_NAME_KEY);

    if (circuitType === ObjectType.Circuit && body.type === circuitSubType && body.name === circuitName) {
      return {
        id: safeGetStringProperty(circuit, OBJ_ID_KEY),
        name: circuitName,
        objectType: ObjectType.Circuit,
      } as BaseCircuit;
    }
  }
  return undefined;
};

const isValidFeatureObject = (featureObj: unknown): boolean => {
  if (!isIntelliCenterObject(featureObj)) {
    return false;
  }
  const params = safeGetParams(featureObj);
  return !!params;
};

const getFeatureProperties = (featureObj: IntelliCenterObject) => {
  const params = safeGetParams(featureObj)!;
  return {
    subtype: safeGetStringProperty(params, OBJ_SUBTYPE_KEY).toUpperCase(),
    objId: safeGetStringProperty(featureObj, OBJ_ID_KEY),
    name: safeGetStringProperty(params, OBJ_NAME_KEY),
    isCircuit: safeGetStringProperty(params, OBJ_TYPE_KEY) === ObjectType.Circuit,
    featrValue: safeGetStringProperty(params, 'FEATR'),
  };
};

const shouldIncludeFeature = (props: ReturnType<typeof getFeatureProperties>, includeAllCircuits: boolean): boolean => {
  const { subtype, isCircuit, featrValue } = props;

  if (!isCircuit || subtype === 'LEGACY') {
    return false;
  }

  return includeAllCircuits || isFeatureEnabled(featrValue, includeAllCircuits) || isIntelliBriteCircuit(subtype);
};

const isFeatureEnabled = (featrValue: string, includeAllCircuits: boolean): boolean => {
  return featrValue === 'ON' || (includeAllCircuits && featrValue === 'FEATR');
};

const isIntelliBriteCircuit = (subtype: string): boolean => {
  return subtype === CircuitType.IntelliBrite;
};

const logFilteredFeature = (
  props: ReturnType<typeof getFeatureProperties>,
  includeAllCircuits: boolean,
  shouldInclude: boolean,
  logger?: Logger,
) => {
  if (!logger || !props.isCircuit || props.subtype === 'LEGACY') {
    return;
  }

  const { subtype, objId, name, featrValue } = props;

  if (!shouldInclude) {
    logFilteredOutCircuit(objId, name, subtype, featrValue, logger);
  } else if (shouldLogIncludedCircuit(includeAllCircuits, featrValue, subtype)) {
    logIncludedNonFeatureCircuit(objId, name, logger);
  }
};

const logFilteredOutCircuit = (objId: string, name: string, subtype: string, featrValue: string, logger: Logger) => {
  logger.debug(
    `Circuit filtered out - ID: ${objId}, Name: ${name}, ` +
      `SubType: ${subtype}, Feature: ${featrValue}, Will send updates but not be accessible in HomeKit`,
  );
};

const logIncludedNonFeatureCircuit = (objId: string, name: string, logger: Logger) => {
  logger.info(`Non-feature circuit included due to includeAllCircuits - ID: ${objId}, Name: ${name}`);
};

const shouldLogIncludedCircuit = (includeAllCircuits: boolean, featrValue: string, subtype: string): boolean => {
  const isFeature = featrValue === 'ON' || featrValue === 'FEATR';
  const isIntelliBrite = subtype === CircuitType.IntelliBrite;
  return includeAllCircuits && !isFeature && !isIntelliBrite;
};

const transformFeatures = (circuits: unknown[], includeAllCircuits = false, logger?: Logger): ReadonlyArray<Circuit> => {
  if (!circuits) {
    return [];
  }

  return circuits
    .filter(featureObj => processFeatureFilter(featureObj, includeAllCircuits, logger))
    .map(featureObj => transformFeatureToCircuit(featureObj as IntelliCenterObject));
};

const processFeatureFilter = (featureObj: unknown, includeAllCircuits: boolean, logger?: Logger): boolean => {
  if (!isValidFeatureObject(featureObj)) {
    return false;
  }

  const props = getFeatureProperties(featureObj as IntelliCenterObject);
  const shouldInclude = shouldIncludeFeature(props, includeAllCircuits);

  logFilteredFeature(props, includeAllCircuits, shouldInclude, logger);

  return shouldInclude;
};

const transformFeatureToCircuit = (obj: IntelliCenterObject): Circuit => {
  const params = safeGetParams(obj);
  const subtype = safeGetStringPropertyOptional(params, OBJ_SUBTYPE_KEY);
  const circuit = {
    id: safeGetStringProperty(obj, OBJ_ID_KEY),
    name: safeGetStringProperty(params, OBJ_NAME_KEY),
    objectType: ObjectType.Circuit,
    type: subtype ? subtype.toUpperCase() : undefined,
  } as Circuit;
  updateCircuit(circuit, params as IntelliCenterParams);
  return circuit;
};

const transformPumps = (pumps: unknown[], logger?: Logger): ReadonlyArray<Pump> => {
  if (!pumps) {
    return [];
  }
  return pumps.filter(pumpObj => isValidPumpObject(pumpObj, logger)).map(pumpObj => transformPumpObject(pumpObj as IntelliCenterObject));
};

const isValidPumpObject = (pumpObj: unknown, logger?: Logger): boolean => {
  if (!isIntelliCenterObject(pumpObj)) {
    return false;
  }

  const params = safeGetParams(pumpObj);
  if (!params) {
    return false;
  }

  const pumpValidation = validatePumpObjectType(pumpObj, params as IntelliCenterParams);

  if (pumpValidation.isPump && logger) {
    logPumpDiscovery(pumpObj, pumpValidation, logger);
  }

  return pumpValidation.isPump && pumpValidation.isVariableSpeed;
};

const validatePumpObjectType = (pumpObj: IntelliCenterObject, params: IntelliCenterParams) => {
  const objType = safeGetStringProperty(params, OBJ_TYPE_KEY);
  const subType = safeGetStringProperty(params, OBJ_SUBTYPE_KEY).toUpperCase();
  const isPump = objType === ObjectType.Pump;
  const isVariableSpeed = VARIABLE_SPEED_PUMP_SUBTYPES.has(subType);

  return { isPump, isVariableSpeed, objType, subType };
};

const logPumpDiscovery = (pumpObj: IntelliCenterObject, validation: any, logger: Logger): void => {
  const objId = safeGetStringProperty(pumpObj, OBJ_ID_KEY);
  const params = safeGetParams(pumpObj);
  const pumpName = safeGetStringProperty(params, OBJ_NAME_KEY);

  if (validation.isVariableSpeed) {
    logger.debug(`Variable speed pump discovered - ID: ${objId}, SubType: ${validation.subType}, Name: ${pumpName}`);
  } else {
    logger.debug(
      `Pump filtered out - ID: ${objId}, SubType: ${validation.subType}, Name: ${pumpName} ` +
        `(not in VARIABLE_SPEED_PUMP_SUBTYPES: ${Array.from(VARIABLE_SPEED_PUMP_SUBTYPES).join(', ')})`,
    );
  }
};

const transformPumpObject = (obj: IntelliCenterObject): Pump => {
  const params = safeGetParams(obj);
  const subtype = safeGetStringPropertyOptional(params, OBJ_SUBTYPE_KEY);
  const pump = createPumpFromParams(obj, params, subtype);
  const objList = safeGetArrayProperty(params, OBJ_LIST_KEY);
  const circuits = objList.length > 0 ? transformPumpCircuits(pump, objList) : [];

  return {
    ...pump,
    circuits: circuits,
  };
};

const createPumpFromParams = (obj: IntelliCenterObject, params: Record<string, unknown>, subtype?: string): Pump => {
  return {
    id: safeGetStringProperty(obj, OBJ_ID_KEY),
    name: safeGetStringProperty(params, OBJ_NAME_KEY),
    objectType: ObjectType.Pump,
    type: subtype ? subtype.toUpperCase() : undefined,
    minRpm: safeGetNumberProperty(params, OBJ_MIN_KEY),
    maxRpm: safeGetNumberProperty(params, OBJ_MAX_KEY),
    minFlow: safeGetNumberProperty(params, OBJ_MIN_FLOW_KEY),
    maxFlow: safeGetNumberProperty(params, OBJ_MAX_FLOW_KEY),
  } as Pump;
};

const transformTempSensors = (sensors: unknown[]): ReadonlyArray<Sensor> => {
  if (!sensors) {
    return [];
  }
  return sensors
    .filter(sensorObj => {
      if (!isIntelliCenterObject(sensorObj)) {
        return false;
      }
      const params = safeGetParams(sensorObj);
      return (
        params &&
        safeGetStringProperty(params, OBJ_TYPE_KEY) === ObjectType.Sensor &&
        Object.values(TemperatureSensorType).includes(safeGetStringProperty(params, OBJ_SUBTYPE_KEY) as TemperatureSensorType)
      );
    })
    .map(sensorObj => {
      const obj = sensorObj as IntelliCenterObject;
      const params = safeGetParams(obj);
      const probeValue = safeGetNumberProperty(params, 'PROBE');
      const subtype = safeGetStringPropertyOptional(params, OBJ_SUBTYPE_KEY);
      return {
        id: safeGetStringProperty(obj, OBJ_ID_KEY),
        name: safeGetStringProperty(params, OBJ_NAME_KEY),
        objectType: ObjectType.Sensor,
        type: subtype ? subtype.toUpperCase() : undefined,
        probe: probeValue,
      } as Sensor;
    });
};

const transformPumpCircuits = (pump: Pump, pumpObjList: unknown[]): ReadonlyArray<PumpCircuit> => {
  if (!pumpObjList) {
    return [];
  }
  return pumpObjList.filter(isIntelliCenterObject).map(pumpObj => {
    const params = safeGetParams(pumpObj);
    const speedType = safeGetStringPropertyOptional(params, SELECT_KEY);
    return {
      id: safeGetStringProperty(pumpObj, OBJ_ID_KEY),
      pump: pump,
      circuitId: safeGetStringProperty(params, CIRCUIT_KEY),
      speed: safeGetNumberProperty(params, SPEED_KEY),
      speedType: speedType ? speedType.toUpperCase() : undefined,
    } as PumpCircuit;
  });
};

const transformModules = (modules: unknown[], includeAllCircuits = false, logger?: Logger): ReadonlyArray<Module> => {
  if (!modules) {
    return [];
  }
  return modules
    .filter(obj => {
      if (!isIntelliCenterObject(obj)) {
        return false;
      }
      const params = safeGetParams(obj);
      return safeGetStringProperty(params, OBJ_TYPE_KEY) === ObjectType.Module;
    })
    .map(moduleObj => {
      const obj = moduleObj as IntelliCenterObject;
      const params = safeGetParams(obj);
      const circuits = safeGetArrayProperty(params, CIRCUITS_KEY);
      const subtype = safeGetStringPropertyOptional(params, OBJ_SUBTYPE_KEY);
      return {
        id: safeGetStringProperty(obj, OBJ_ID_KEY),
        features: transformFeatures(circuits, includeAllCircuits, logger),
        bodies: transformBodies(circuits),
        heaters: transformHeaters(circuits),
        type: subtype ? subtype.toUpperCase() : undefined,
      } as Module;
    });
};

export const transformPanels = (
  response: Record<string, unknown> | null,
  includeAllCircuits = false,
  logger?: Logger,
): ReadonlyArray<Panel> => {
  if (!response) {
    return [];
  }

  // Handle response format - could be array or object with array property
  const responseArray = Array.isArray(response) ? response : safeGetArrayProperty(response, 'panels');
  if (!responseArray || !Array.isArray(responseArray)) {
    return [];
  }
  return responseArray
    .filter(obj => {
      if (!isIntelliCenterObject(obj)) {
        return false;
      }
      const params = safeGetParams(obj);
      return safeGetStringProperty(params, OBJ_TYPE_KEY) === ObjectType.Panel;
    })
    .map(panelObj => {
      const obj = panelObj as IntelliCenterObject;
      const params = safeGetParams(obj);
      const objList = safeGetArrayProperty(params, OBJ_LIST_KEY);
      return {
        id: safeGetStringProperty(obj, OBJ_ID_KEY),
        modules: transformModules(objList, includeAllCircuits, logger),
        features: transformFeatures(objList, includeAllCircuits, logger), // Some features are directly on panel.
        pumps: transformPumps(objList, logger),
        sensors: transformTempSensors(objList),
      } as Panel;
    });
};

export const fahrenheitToCelsius = (fValue: number): number => {
  return (fValue - 32) / 1.8;
};

export const celsiusToFahrenheit = (cValue: number): number => {
  return cValue * 1.8 + 32;
};

export const getIntelliBriteColor = (hue: number, saturation: number): Color => {
  let color = Color.White;
  // All other IntelliBrite colors have a saturation of 100.
  if (saturation > (Color.Red.saturation - Color.White.saturation) / 2) {
    if (hue < (Color.Green.hue - Color.Red.hue) / 2 + Color.Red.hue) {
      color = Color.Red;
    } else if (hue < (Color.Blue.hue - Color.Green.hue) / 2 + Color.Green.hue) {
      color = Color.Green;
    } else if (hue < (Color.Magenta.hue - Color.Blue.hue) / 2 + Color.Blue.hue) {
      color = Color.Blue;
    } else {
      color = Color.Magenta;
    }
  }
  return color;
};

export const isObject = (object: Record<string, unknown>) => {
  if (typeof object === 'object') {
    for (const key in object) {
      if (Object.prototype.hasOwnProperty.call(object, key)) {
        return true;
      }
    }
  }
  return false;
};

/**
 * Utility functions for merging dynamic JSON responses from IntelliCenter hardware.
 * Uses Record<string, unknown> to handle the unpredictable nested JSON structures
 * from the IntelliCenter API while maintaining type safety.
 */

type MergeableObject = Record<string, unknown>;
type MergeableArray = MergeableObject[];

export const mergeResponseArray = (target: MergeableArray, responseToAdd: MergeableArray): void => {
  responseToAdd.forEach(itemToAdd => {
    const targetObject = target.find(targetItem => targetItem[OBJ_ID_KEY] === itemToAdd[OBJ_ID_KEY]);
    if (targetObject) {
      mergeResponse(targetObject, itemToAdd);
    } else {
      target.push(itemToAdd);
    }
  });
};

export const mergeResponse = (target: MergeableObject, responseToAdd: MergeableObject): void => {
  for (const key in responseToAdd) {
    if (isSafePropertyKey(responseToAdd, key)) {
      mergePropertyValue(target, responseToAdd, key);
    }
  }
};

const isSafePropertyKey = (obj: MergeableObject, key: string): boolean => {
  return Object.prototype.hasOwnProperty.call(obj, key) && key !== '__proto__' && key !== 'constructor' && key !== 'prototype';
};

const mergePropertyValue = (target: MergeableObject, source: MergeableObject, key: string): void => {
  const targetValue = target[key];
  const sourceValue = source[key];

  if (shouldMergeNestedObject(targetValue, sourceValue)) {
    mergeNestedValue(targetValue, sourceValue);
  } else {
    target[key] = sourceValue;
  }
};

const shouldMergeNestedObject = (targetValue: unknown, sourceValue: unknown): boolean => {
  return !!targetValue && isObject(targetValue as Record<string, unknown>) && isObject(sourceValue as Record<string, unknown>);
};

const mergeNestedValue = (targetValue: unknown, sourceValue: unknown): void => {
  if (Array.isArray(targetValue) && Array.isArray(sourceValue)) {
    mergeResponseArray(targetValue as MergeableArray, sourceValue as MergeableArray);
  } else {
    mergeResponse(targetValue as MergeableObject, sourceValue as MergeableObject);
  }
};

// Test-only exports for achieving 100% coverage
/* istanbul ignore else */
// eslint-disable-next-line no-undef
if (typeof process !== 'undefined' && process.env.NODE_ENV === 'test') {
  /* eslint-disable no-undef */
  module.exports = {
    ...module.exports,
    transformHeaters,
    transformBodies,
    transformFeatures,
    transformPumps,
    transformTempSensors,
    transformPumpCircuits,
    transformModules,
  };
  /* eslint-enable no-undef */
}
