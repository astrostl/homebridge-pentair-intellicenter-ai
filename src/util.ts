import {
  BaseCircuit,
  Body,
  Circuit,
  CircuitType,
  Color,
  Heater,
  Module,
  ObjectType,
  Panel,
  Pump,
  PumpCircuit,
  Sensor,
  TemperatureSensorType,
} from './types';
import { Logger } from 'homebridge';
import {
  CIRCUIT_KEY,
  CIRCUITS_KEY,
  LAST_TEMP_KEY,
  OBJ_ID_KEY,
  OBJ_LIST_KEY, OBJ_MAX_FLOW_KEY,
  OBJ_MAX_KEY, OBJ_MIN_FLOW_KEY,
  OBJ_MIN_KEY,
  OBJ_NAME_KEY,
  OBJ_SUBTYPE_KEY,
  OBJ_TYPE_KEY,
  PARAMS_KEY,
  SELECT_KEY,
  SPEED_KEY,
  VARIABLE_SPEED_PUMP_SUBTYPES,
} from './constants';

const transformHeaters = (heaters: never[]): ReadonlyArray<Heater> => {
  if (!heaters) {
    return [];
  }
  return heaters.filter(featureObj => featureObj[PARAMS_KEY][OBJ_TYPE_KEY] === ObjectType.Heater).map(heaterObj => {
    const params = heaterObj[PARAMS_KEY];
    return {
      id: heaterObj[OBJ_ID_KEY],
      name: params[OBJ_NAME_KEY],
      objectType: ObjectType.Heater,
      type: (params[OBJ_SUBTYPE_KEY] as string)?.toUpperCase(),
      bodyIds: (params[ObjectType.Body] as string)?.split(' ') || [],
    } as Heater;
  });
};

const circuitParams = new Map([
  ['status', 'STATUS'],
]) as ReadonlyMap<string, string>;

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

export const updateCircuit = (circuit: Body, params: never): void => {
  circuitParams.forEach((value, key) => {
    if (params[value]) {
      circuit[key] = params[value];
    }
  });
};

export const updateBody = (body: Body, params: never): void => {
  bodyParams.forEach((value, key) => {
    if (params[value]) {
      body[key] = params[value];
    }
  });
};

export const updatePump = (pump: Pump, params: never): void => {
  pumpParams.forEach((value, key) => {
    if (params[value]) {
      pump[key] = params[value];
    }
  });
};


const transformBodies = (circuits: never[]): ReadonlyArray<Body> => {
  if (!circuits) {
    return [];
  }
  return circuits.filter(circuitObj => circuitObj[PARAMS_KEY][OBJ_TYPE_KEY] === ObjectType.Body).map(bodyObj => {
    const params = bodyObj[PARAMS_KEY];
    const body = {
      id: bodyObj[OBJ_ID_KEY],
      name: params[OBJ_NAME_KEY],
      objectType: ObjectType.Body,
      type: (params[OBJ_SUBTYPE_KEY] as string)?.toUpperCase(),
    } as Body;
    updateBody(body, params);
    return {
      ...body,
      circuit: findBodyCircuit(body, circuits),
    };
  });
};

export const findBodyCircuit = (body: Body, circuits: never[]): BaseCircuit | undefined => {
  for (const circuit of circuits) {
    const params = circuit[PARAMS_KEY];
    if (params[OBJ_TYPE_KEY] === ObjectType.Circuit && body.type === params[OBJ_SUBTYPE_KEY]
      && body.name === params[OBJ_NAME_KEY]) {
      return {
        id: circuit[OBJ_ID_KEY],
      };
    }
  }
  return undefined;
};

const transformFeatures = (circuits: never[], includeAllCircuits = false, logger?: Logger): ReadonlyArray<Circuit> => {
  if (!circuits) {
    return [];
  }

  return circuits.filter(featureObj => {
    const params = featureObj[PARAMS_KEY];
    const subtype = (params[OBJ_SUBTYPE_KEY] as string)?.toUpperCase();
    const objId = featureObj[OBJ_ID_KEY];
    const name = params[OBJ_NAME_KEY];

    const isCircuit = params[OBJ_TYPE_KEY] === ObjectType.Circuit;
    const isFeature = params['FEATR'] === 'ON' || (includeAllCircuits && params['FEATR'] === 'FEATR');
    // IntelliBrite is not required to be a feature.
    const isIntelliBrite = subtype === CircuitType.IntelliBrite;
    const isLegacy = subtype === 'LEGACY';

    const shouldInclude = isCircuit && !isLegacy && (
      includeAllCircuits || isFeature || isIntelliBrite
    );

    // Log circuits that are filtered out for debugging
    if (isCircuit && !isLegacy && !shouldInclude && logger) {
      logger.debug(`Circuit filtered out - ID: ${objId}, Name: ${name}, ` +
        `SubType: ${subtype}, Feature: ${params['FEATR']}, Will send updates but not be accessible in HomeKit`);
    } else if (isCircuit && !isLegacy && includeAllCircuits && !isFeature && !isIntelliBrite && logger) {
      logger.info(`Non-feature circuit included due to includeAllCircuits - ID: ${objId}, Name: ${name}`);
    }

    return shouldInclude;
  }).map(featureObj => {
    const params = featureObj[PARAMS_KEY];
    return {
      id: featureObj[OBJ_ID_KEY],
      name: params[OBJ_NAME_KEY],
      objectType: ObjectType.Circuit,
      type: (params[OBJ_SUBTYPE_KEY] as string)?.toUpperCase(),
    } as Circuit;
  });
};

const transformPumps = (pumps: never[], logger?: Logger): ReadonlyArray<Pump> => {
  if (!pumps) {
    return [];
  }
  return pumps.filter(pumpObj => {
    const params = pumpObj[PARAMS_KEY];
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
        logger.debug(`Pump filtered out - ID: ${objId}, SubType: ${subType}, Name: ${params[OBJ_NAME_KEY]} ` +
          `(not in VARIABLE_SPEED_PUMP_SUBTYPES: ${Array.from(VARIABLE_SPEED_PUMP_SUBTYPES).join(', ')})`);
      }
    }

    return isPump && isVariableSpeed;
  }).map(pumpObj => {
    const params = pumpObj[PARAMS_KEY];
    const pump = {
      id: pumpObj[OBJ_ID_KEY],
      name: params[OBJ_NAME_KEY],
      objectType: ObjectType.Pump,
      type: (params[OBJ_SUBTYPE_KEY] as string)?.toUpperCase(),
      minRpm: +params[OBJ_MIN_KEY],
      maxRpm: +params[OBJ_MAX_KEY],
      minFlow: +params[OBJ_MIN_FLOW_KEY],
      maxFlow: +params[OBJ_MAX_FLOW_KEY],
    } as Pump;
    const circuits = transformPumpCircuits(pump, params[OBJ_LIST_KEY]);

    return {
      ...pump,
      circuits: circuits,
    };
  });
};

const transformTempSensors = (sensors: never[]): ReadonlyArray<Sensor> => {
  if (!sensors) {
    return [];
  }
  return sensors
    .filter(sensorObj => {
      const params = sensorObj[PARAMS_KEY];
      return (
        sensorObj[PARAMS_KEY][OBJ_TYPE_KEY] === ObjectType.Sensor &&
      Object.values(TemperatureSensorType).includes(params[OBJ_SUBTYPE_KEY])
      );
    })
    .map(sensorObj => {
      const params = sensorObj[PARAMS_KEY];
      const probeValue = +params['PROBE'];
      return {
        id: sensorObj[OBJ_ID_KEY],
        name: params[OBJ_NAME_KEY],
        objectType: ObjectType.Sensor,
        type: (params[OBJ_SUBTYPE_KEY] as string).toUpperCase(),
        probe: isNaN(probeValue) ? 0 : probeValue,
      } as Sensor;
    });
};

const transformPumpCircuits = (pump: Pump, pumpObjList: never[]): ReadonlyArray<PumpCircuit> => {
  if (!pumpObjList) {
    return [];
  }
  return pumpObjList.map(pumpObj => {
    return {
      id: pumpObj[OBJ_ID_KEY],
      pump: pump,
      circuitId: pumpObj[PARAMS_KEY][CIRCUIT_KEY],
      speed: +pumpObj[PARAMS_KEY][SPEED_KEY],
      speedType: (pumpObj[PARAMS_KEY][SELECT_KEY] as string)?.toUpperCase(),
    } as PumpCircuit;
  });
};

const transformModules = (modules: never[], includeAllCircuits = false, logger?: Logger): ReadonlyArray<Module> => {
  if (!modules) {
    return [];
  }
  return modules.filter(moduleObj => moduleObj[PARAMS_KEY][OBJ_TYPE_KEY] === ObjectType.Module).map(moduleObj => {
    const params = moduleObj[PARAMS_KEY];
    const circuits = params[CIRCUITS_KEY];
    return {
      id: moduleObj[OBJ_ID_KEY],
      features: transformFeatures(circuits, includeAllCircuits, logger),
      bodies: transformBodies(circuits),
      heaters: transformHeaters(circuits),
      type: (params[OBJ_SUBTYPE_KEY] as string)?.toUpperCase(),
    } as Module;
  });
};

export const transformPanels = (response: never | never[], includeAllCircuits = false, logger?: Logger): ReadonlyArray<Panel> => {
  return response.filter(moduleObj => moduleObj[PARAMS_KEY][OBJ_TYPE_KEY] === ObjectType.Panel).map(panelObj => {
    const objList = panelObj[PARAMS_KEY][OBJ_LIST_KEY];
    return {
      id: panelObj[OBJ_ID_KEY],
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
  if (saturation > ((Color.Red.saturation - Color.White.saturation) / 2)) {
    if (hue < ((Color.Green.hue - Color.Red.hue) / 2 + Color.Red.hue)) {
      color = Color.Red;
    } else if (hue < ((Color.Blue.hue - Color.Green.hue) / 2 + Color.Green.hue)) {
      color = Color.Green;
    } else if (hue < ((Color.Magenta.hue - Color.Blue.hue) / 2 + Color.Blue.hue)) {
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

export const mergeResponseArray = (target: never[], responseToAdd: never[]): void => {
  responseToAdd.forEach((itemToAdd) => {
    const targetObject = target.find(targetItem => targetItem[OBJ_ID_KEY] === itemToAdd[OBJ_ID_KEY]);
    if (targetObject) {
      mergeResponse(targetObject, itemToAdd);
    } else {
      target.push(itemToAdd);
    }
  });
};

export const mergeResponse = (target: never | never[], responseToAdd: never): void => {
  for (const key in responseToAdd as Record<string, unknown>) {
    if (Object.prototype.hasOwnProperty.call(responseToAdd, key)) {
      if (target[key] && isObject(target[key]) && isObject(responseToAdd[key])) {
        if (Array.isArray(target[key]) && Array.isArray(responseToAdd[key])) {
          mergeResponseArray(target[key], responseToAdd[key]);
        } else {
          mergeResponse(target[key], responseToAdd[key]);
        }
      } else {
        target[key] = responseToAdd[key];
      }
    }
  }
};