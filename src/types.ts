export enum IntelliCenterResponseStatus {
  Ok = '200',
}

export enum IntelliCenterRequestCommand {
  GetQuery = 'GetQuery',
  RequestParamList = 'RequestParamList',
  SetParamList = 'SetParamList',
}

export enum IntelliCenterResponseCommand {
  SendQuery = 'SendQuery',
  NotifyList = 'NotifyList',
  WriteParamList = 'WriteParamList',
  Error = 'Error',
}

export enum IntelliCenterQueryName {
  GetHardwareDefinition = 'GetHardwareDefinition',
}

type CircuitStatusSubscribeRequest = {
  objnam: string;
  keys: ReadonlyArray<string>;
};

// Define specific parameter types for different objects
export type CircuitParams = {
  STATUS?: string;
  SPEED?: number;
  [key: string]: string | number | boolean | undefined;
};

export type BodyParams = {
  HEAT_MODE?: number;
  HEAT_SETPOINT?: number;
  HEAT_SOURCE?: string;
  LAST_TEMP?: number;
  [key: string]: string | number | boolean | undefined;
};

export type SensorParams = {
  LAST_TEMP?: number;
  PROBE?: number;
  [key: string]: string | number | boolean | undefined;
};

export type PumpParams = {
  STATUS?: string;
  SPEED?: number;
  RPM?: number;
  GPM?: number;
  WATTS?: number;
  SELECT?: string;
  [key: string]: string | number | boolean | undefined;
};

export type GenericParams = {
  [key: string]: string | number | boolean | undefined;
};

export type IntelliCenterParams = CircuitParams | BodyParams | SensorParams | PumpParams | GenericParams;

export type CircuitStatusMessage = {
  objnam?: string;
  params?: IntelliCenterParams;
  changes?: ReadonlyArray<CircuitStatusMessage>;
};

type IntelliCenterMessage = {
  queryName?: IntelliCenterQueryName;
  messageID: string;
};

export type IntelliCenterRequest = {
  command: IntelliCenterRequestCommand;
  arguments?: string;
  objectList?: ReadonlyArray<CircuitStatusSubscribeRequest | CircuitStatusMessage>;
} & IntelliCenterMessage;

// Define specific answer types for discovery responses
export type HardwareDefinitionAnswer = {
  [panelId: string]: {
    [moduleId: string]: {
      [objectId: string]: {
        OBJNAM: string;
        OBJTYP: string;
        SUBTYP?: string;
        HNAME?: string;
        [key: string]: string | number | boolean | undefined;
      };
    };
  };
};

export type DiscoveryAnswer = HardwareDefinitionAnswer | Record<string, unknown>;

export type IntelliCenterResponse = {
  command: IntelliCenterResponseCommand;
  description: string;
  response: IntelliCenterResponseStatus;
  answer?: DiscoveryAnswer;
  objectList?: ReadonlyArray<CircuitStatusMessage>;
} & IntelliCenterMessage;

export enum CircuitType {
  IntelliBrite = 'INTELLI',
  LightShowGroup = 'LITSHO',
  Generic = 'GENERIC',
  HCombo = 'HCOMBO',
}

export enum TemperatureSensorType {
  Air = 'AIR',
  Pool = 'POOL',
}

export enum BodyType {
  Pool = 'POOL',
  Spa = 'SPA',
}

export type BaseCircuit = {
  id: string;
};

export type Circuit = {
  id: string;
  name: string;
  objectType: ObjectType;
  type: CircuitType | BodyType;
  status?: CircuitStatus;
} & BaseCircuit;

export type Pump = {
  minRpm: number;
  maxRpm: number;
  minFlow: number;
  maxFlow: number;
  circuits?: ReadonlyArray<PumpCircuit>;
  rpm?: number;
  gpm?: number;
  watts?: number;
  [key: string]: unknown;
} & Circuit;

export type PumpCircuit = {
  id: string;
  pump: Pump;
  circuitId: string;
  speed: number;
  speedType: string;
  status?: CircuitStatus;
  rpm?: number;
  gpm?: number;
  watts?: number;
} & BaseCircuit;

export type Sensor = {
  id: string;
  name: string;
  objectType: ObjectType;
  type: TemperatureSensorType;
  probe: number;
} & BaseCircuit;

export enum CircuitStatus {
  On = 'ON',
  Off = 'OFF',
}

export enum PumpSpeedType {
  RPM = 'RPM',
  GPM = 'GPM',
}

export enum HeatMode {
  On = 2,
  Off = 1,
}

export type Body = {
  temperature?: number;
  highTemperature?: number;
  lowTemperature?: number;
  heaterId?: string;
  heatSource?: string; // HTSRC - raw heat source value (00000=off, non-00000=heater ID)
  heatMode?: number; // HTMODE values: 0=off, 1=heating, 4=heat pump, 9=cooling
  circuit?: BaseCircuit;
  [key: string]: unknown;
} & Circuit;

export type Heater = {
  bodyIds: ReadonlyArray<string>;
  coolingEnabled?: boolean;
} & Circuit;

export type Module = {
  id: string;
  features: ReadonlyArray<Circuit>;
  bodies: ReadonlyArray<Body>;
  heaters: ReadonlyArray<Heater>;
};

export type Panel = {
  id: string;
  modules: ReadonlyArray<Module>;
  features: ReadonlyArray<Circuit>;
  pumps: ReadonlyArray<Pump>;
  sensors: ReadonlyArray<Sensor>;
};

export enum ObjectType {
  Circuit = 'CIRCUIT',
  Module = 'MODULE',
  Panel = 'PANEL',
  Body = 'BODY',
  Heater = 'HEATER',
  CircuitGroup = 'CIRCGRP',
  Pump = 'PUMP',
  Sensor = 'SENSE',
}

export const CircuitTypes = new Set([ObjectType.Circuit, ObjectType.Body]) as ReadonlySet<ObjectType>;
export const SensorTypes = new Set([ObjectType.Sensor]) as ReadonlySet<ObjectType>;

export enum TemperatureUnits {
  C = 'C',
  F = 'F',
}

export class Color {
  public static readonly White = new Color('WHITER', 0, 0);
  public static readonly Red = new Color('REDR', 0, 100);
  public static readonly Green = new Color('GREENR', 120, 100);
  public static readonly Blue = new Color('BLUER', 240, 100);
  public static readonly Magenta = new Color('MAGNTAR', 300, 100);

  private constructor(
    public readonly intellicenterCode: string,
    public readonly hue: number,
    public readonly saturation: number,
  ) {}
}
