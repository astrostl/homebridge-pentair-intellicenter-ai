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

import {
  CIRCUIT_KEY,
  CIRCUITS_KEY,
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
  SELECT_KEY,
  SPEED_KEY,
  VARIABLE_SPEED_PUMP_SUBTYPES,
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
      return obj[PARAMS_KEY][OBJ_TYPE_KEY] === ObjectType.Heater;
    })
    .map(heaterObj => {
      const obj = heaterObj as IntelliCenterObject;
      const params = obj[PARAMS_KEY];
      return {
        id: obj[OBJ_ID_KEY],
        name: params[OBJ_NAME_KEY],
        objectType: ObjectType.Heater,
        type: (params[OBJ_SUBTYPE_KEY] as string)?.toUpperCase(),
        bodyIds: (params[ObjectType.Body] as string)?.split(' ') || [],
      } as Heater;
    });
};

const circuitParams = new Map([['status', 'STATUS']]) as ReadonlyMap<string, string>;

const bodyParams = new Map([
  ['temperature', LAST_TEMP_KEY],
  ['highTemperature', 'HITMP'],
  ['lowTemperature', 'LOTMP'],
  ['heaterId', 'HTSRC'],
  ['heatMode', 'HTMOD'],
  ['heatMode', 'MODE'],
]) as ReadonlyMap<string, string>;

const pumpParams = new Map([
  ['speedType', SELECT_KEY],
  ['speed', SPEED_KEY],
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
      body[key] = params[value];
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
      return obj[PARAMS_KEY][OBJ_TYPE_KEY] === ObjectType.Body;
    })
    .map(bodyObj => {
      const obj = bodyObj as IntelliCenterObject;
      const params = obj[PARAMS_KEY];
      const body = {
        id: obj[OBJ_ID_KEY],
        name: params[OBJ_NAME_KEY],
        objectType: ObjectType.Body,
        type: (params[OBJ_SUBTYPE_KEY] as string)?.toUpperCase(),
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
    const params = circuit[PARAMS_KEY];
    if (params[OBJ_TYPE_KEY] === ObjectType.Circuit && body.type === params[OBJ_SUBTYPE_KEY] && body.name === params[OBJ_NAME_KEY]) {
      return {
        id: circuit[OBJ_ID_KEY],
      };
    }
  }
  return undefined;
};

const transformFeatures = (circuits: unknown[], includeAllCircuits = false, logger?: Logger): ReadonlyArray<Circuit> => {
  if (!circuits) {
    return [];
  }

  return circuits
    .filter(featureObj => {
      if (!isIntelliCenterObject(featureObj)) {
        return false;
      }
      const params = featureObj[PARAMS_KEY];
      if (!params) {
        return false;
      }
      const subtype = (params[OBJ_SUBTYPE_KEY] as string)?.toUpperCase();
      const objId = featureObj[OBJ_ID_KEY];
      const name = params[OBJ_NAME_KEY];

      const isCircuit = params[OBJ_TYPE_KEY] === ObjectType.Circuit;
      const isFeature = params['FEATR'] === 'ON' || (includeAllCircuits && params['FEATR'] === 'FEATR');
      // IntelliBrite is not required to be a feature.
      const isIntelliBrite = subtype === CircuitType.IntelliBrite;
      const isLegacy = subtype === 'LEGACY';

      const shouldInclude = isCircuit && !isLegacy && (includeAllCircuits || isFeature || isIntelliBrite);

      // Log circuits that are filtered out for debugging
      if (isCircuit && !isLegacy && !shouldInclude && logger) {
        logger.debug(
          `Circuit filtered out - ID: ${objId}, Name: ${name}, ` +
            `SubType: ${subtype}, Feature: ${params['FEATR']}, Will send updates but not be accessible in HomeKit`,
        );
      } else if (isCircuit && !isLegacy && includeAllCircuits && !isFeature && !isIntelliBrite && logger) {
        logger.info(`Non-feature circuit included due to includeAllCircuits - ID: ${objId}, Name: ${name}`);
      }

      return shouldInclude;
    })
    .map(featureObj => {
      const obj = featureObj as IntelliCenterObject;
      const params = obj[PARAMS_KEY];
      const circuit = {
        id: obj[OBJ_ID_KEY],
        name: params[OBJ_NAME_KEY],
        objectType: ObjectType.Circuit,
        type: (params[OBJ_SUBTYPE_KEY] as string)?.toUpperCase(),
      } as Circuit;
      updateCircuit(circuit, params as IntelliCenterParams);
      return circuit;
    });
};

const transformPumps = (pumps: unknown[], logger?: Logger): ReadonlyArray<Pump> => {
  if (!pumps) {
    return [];
  }
  return pumps
    .filter(pumpObj => {
      if (!isIntelliCenterObject(pumpObj)) {
        return false;
      }
      const params = pumpObj[PARAMS_KEY];
      if (!params) {
        return false;
      }
      const objId = pumpObj[OBJ_ID_KEY];
      const objType = params[OBJ_TYPE_KEY];
      const subType = (params[OBJ_SUBTYPE_KEY] as string)?.toUpperCase();
      const isPump = objType === ObjectType.Pump;
      const isVariableSpeed = VARIABLE_SPEED_PUMP_SUBTYPES.has(subType);

      // Debug pump discovery
      if (isPump && logger) {
        if (isVariableSpeed) {
          logger.debug(`Variable speed pump discovered - ID: ${objId}, SubType: ${subType}, Name: ${params[OBJ_NAME_KEY]}`);
        } else {
          logger.debug(
            `Pump filtered out - ID: ${objId}, SubType: ${subType}, Name: ${params[OBJ_NAME_KEY]} ` +
              `(not in VARIABLE_SPEED_PUMP_SUBTYPES: ${Array.from(VARIABLE_SPEED_PUMP_SUBTYPES).join(', ')})`,
          );
        }
      }

      return isPump && isVariableSpeed;
    })
    .map(pumpObj => {
      const obj = pumpObj as IntelliCenterObject;
      const params = obj[PARAMS_KEY];
      const pump = {
        id: obj[OBJ_ID_KEY],
        name: params[OBJ_NAME_KEY],
        objectType: ObjectType.Pump,
        type: (params[OBJ_SUBTYPE_KEY] as string)?.toUpperCase(),
        minRpm: +((params[OBJ_MIN_KEY] as string) || '0'),
        maxRpm: +((params[OBJ_MAX_KEY] as string) || '0'),
        minFlow: +((params[OBJ_MIN_FLOW_KEY] as string) || '0'),
        maxFlow: +((params[OBJ_MAX_FLOW_KEY] as string) || '0'),
      } as Pump;
      const circuits = Array.isArray(params[OBJ_LIST_KEY]) ? transformPumpCircuits(pump, params[OBJ_LIST_KEY] as unknown[]) : [];

      return {
        ...pump,
        circuits: circuits,
      };
    });
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
      const params = sensorObj[PARAMS_KEY];
      return (
        params &&
        params[OBJ_TYPE_KEY] === ObjectType.Sensor &&
        Object.values(TemperatureSensorType).includes(params[OBJ_SUBTYPE_KEY] as TemperatureSensorType)
      );
    })
    .map(sensorObj => {
      const obj = sensorObj as IntelliCenterObject;
      const params = obj[PARAMS_KEY];
      const probeValue = +((params['PROBE'] as string) || '0');
      return {
        id: obj[OBJ_ID_KEY],
        name: params[OBJ_NAME_KEY],
        objectType: ObjectType.Sensor,
        type: (params[OBJ_SUBTYPE_KEY] as string).toUpperCase(),
        probe: isNaN(probeValue) ? 0 : probeValue,
      } as Sensor;
    });
};

const transformPumpCircuits = (pump: Pump, pumpObjList: unknown[]): ReadonlyArray<PumpCircuit> => {
  if (!pumpObjList) {
    return [];
  }
  return pumpObjList.filter(isIntelliCenterObject).map(pumpObj => {
    return {
      id: pumpObj[OBJ_ID_KEY],
      pump: pump,
      circuitId: pumpObj[PARAMS_KEY][CIRCUIT_KEY] as string,
      speed: +((pumpObj[PARAMS_KEY][SPEED_KEY] as string) || '0'),
      speedType: (pumpObj[PARAMS_KEY][SELECT_KEY] as string)?.toUpperCase(),
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
      return obj[PARAMS_KEY][OBJ_TYPE_KEY] === ObjectType.Module;
    })
    .map(moduleObj => {
      const obj = moduleObj as IntelliCenterObject;
      const params = obj[PARAMS_KEY];
      const circuits = Array.isArray(params[CIRCUITS_KEY]) ? (params[CIRCUITS_KEY] as unknown[]) : [];
      return {
        id: obj[OBJ_ID_KEY],
        features: transformFeatures(circuits, includeAllCircuits, logger),
        bodies: transformBodies(circuits),
        heaters: transformHeaters(circuits),
        type: (params[OBJ_SUBTYPE_KEY] as string)?.toUpperCase(),
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
  const responseArray = Array.isArray(response) ? response : (response.panels as unknown[] | undefined);
  if (!responseArray || !Array.isArray(responseArray)) {
    return [];
  }
  return responseArray
    .filter(obj => {
      if (!isIntelliCenterObject(obj)) {
        return false;
      }
      return obj[PARAMS_KEY][OBJ_TYPE_KEY] === ObjectType.Panel;
    })
    .map(panelObj => {
      const obj = panelObj as IntelliCenterObject;
      const objList = Array.isArray(obj[PARAMS_KEY][OBJ_LIST_KEY]) ? (obj[PARAMS_KEY][OBJ_LIST_KEY] as unknown[]) : [];
      return {
        id: obj[OBJ_ID_KEY],
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
    if (Object.prototype.hasOwnProperty.call(responseToAdd, key) && key !== '__proto__' && key !== 'constructor' && key !== 'prototype') {
      if (target[key] && isObject(target[key] as Record<string, unknown>) && isObject(responseToAdd[key] as Record<string, unknown>)) {
        if (Array.isArray(target[key]) && Array.isArray(responseToAdd[key])) {
          mergeResponseArray(target[key] as MergeableArray, responseToAdd[key] as MergeableArray);
        } else {
          mergeResponse(target[key] as MergeableObject, responseToAdd[key] as MergeableObject);
        }
      } else {
        target[key] = responseToAdd[key];
      }
    }
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
