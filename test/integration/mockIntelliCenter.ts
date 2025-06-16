import { Server, Socket } from 'net';
import { EventEmitter } from 'events';
import {
  IntelliCenterRequest,
  IntelliCenterResponse,
  IntelliCenterResponseStatus,
  IntelliCenterResponseCommand,
  IntelliCenterQueryName,
} from '../../src/types';

export interface MockIntelliCenterConfig {
  port?: number;
  username?: string;
  password?: string;
  responseDelay?: number;
  shouldFailLogin?: boolean;
  shouldDropConnections?: boolean;
  parseErrorRate?: number;
}

export class MockIntelliCenter extends EventEmitter {
  private server: Server;
  private connections: Set<Socket> = new Set();
  private isRunning = false;
  private config: Required<MockIntelliCenterConfig>;
  private commandCount = 0;
  private connectedClients = 0;

  // Mock device state
  private deviceState = {
    circuits: new Map([
      ['C01', { status: 'OFF', name: 'Pool Light' }],
      ['C02', { status: 'OFF', name: 'Spa Light' }],
      ['C03', { status: 'OFF', name: 'Pool Pump' }],
    ]),
    bodies: new Map([
      ['B01', { temperature: 78, setpoint: 80, heater: 'OFF' }],
      ['B02', { temperature: 102, setpoint: 104, heater: 'ON' }],
    ]),
    sensors: new Map([
      ['S01', { probe: 78.5, type: 'POOL' }],
      ['S02', { probe: 72.3, type: 'AIR' }],
    ]),
    pumps: new Map([['P01', { speed: 1500, select: 'RPM', status: 'ON' }]]),
  };

  constructor(config: MockIntelliCenterConfig = {}) {
    super();
    this.config = {
      port: config.port || 6681,
      username: config.username || 'admin',
      password: config.password || 'admin',
      responseDelay: config.responseDelay || 50,
      shouldFailLogin: config.shouldFailLogin || false,
      shouldDropConnections: config.shouldDropConnections || false,
      parseErrorRate: config.parseErrorRate || 0,
    };

    this.server = new Server();
    this.setupServerHandlers();
  }

  private setupServerHandlers(): void {
    this.server.on('connection', (socket: Socket) => {
      this.connections.add(socket);
      this.connectedClients++;
      this.emit('clientConnected', this.connectedClients);

      socket.on('data', data => this.handleClientData(socket, data));

      socket.on('close', () => {
        this.connections.delete(socket);
        this.connectedClients--;
        this.emit('clientDisconnected', this.connectedClients);
      });

      socket.on('error', error => {
        this.emit('socketError', error);
        this.connections.delete(socket);
        this.connectedClients--;
      });

      // Simulate login prompt
      if (!this.config.shouldFailLogin) {
        socket.write('Username: ');
      }
    });

    this.server.on('error', error => {
      this.emit('serverError', error);
    });
  }

  private async handleClientData(socket: Socket, data: Buffer): Promise<void> {
    const message = data.toString().trim();
    this.commandCount++;
    this.emit('commandReceived', message, this.commandCount);

    // Handle login sequence
    if (message === this.config.username) {
      socket.write('Password: ');
      return;
    }

    if (message === this.config.password) {
      if (this.config.shouldFailLogin) {
        socket.write('failedlogin\n');
        socket.end();
        return;
      }
      socket.write('Login successful\n');
      return;
    }

    // Handle JSON commands
    try {
      const request: IntelliCenterRequest = JSON.parse(message);
      const response = await this.processCommand(request);

      // Simulate network delay
      setTimeout(() => {
        if (!socket.destroyed) {
          socket.write(JSON.stringify(response) + '\n');
        }
      }, this.config.responseDelay);
    } catch (error) {
      // Handle malformed JSON
      if (Math.random() < this.config.parseErrorRate) {
        const errorResponse: IntelliCenterResponse = {
          response: '400' as any,
          command: IntelliCenterResponseCommand.Error,
          messageID: 'unknown',
          description: 'ParseError: Invalid JSON',
          answer: undefined as never,
        };
        socket.write(JSON.stringify(errorResponse) + '\n');
      }
    }

    // Simulate connection drops
    if (this.config.shouldDropConnections && Math.random() < 0.1) {
      socket.destroy();
    }
  }

  private async processCommand(request: IntelliCenterRequest): Promise<IntelliCenterResponse> {
    const baseResponse: IntelliCenterResponse = {
      response: IntelliCenterResponseStatus.Ok,
      command: request.command as any,
      messageID: request.messageID,
      description: 'Success',
      answer: undefined as never,
    };

    switch (request.command) {
      case 'GetQuery':
        if (request.queryName === IntelliCenterQueryName.GetHardwareDefinition) {
          return {
            ...baseResponse,
            command: IntelliCenterResponseCommand.SendQuery,
            queryName: request.queryName,
            answer: this.generateHardwareDefinition(request.arguments),
          };
        }
        break;

      case 'SetParamList':
        return this.handleSetParamList(request, baseResponse);

      case 'RequestParamList':
        return this.handleRequestParamList(request, baseResponse);

      default:
        return {
          ...baseResponse,
          response: '400' as any,
          command: IntelliCenterResponseCommand.Error,
          description: `Unknown command: ${request.command}`,
        };
    }

    return baseResponse;
  }

  private generateHardwareDefinition(deviceType?: string): Record<string, unknown> {
    const mockHardware = {
      CIRCUITS: {
        panels: [
          {
            objnam: 'P1',
            params: {
              OBJTYP: 'Panel',
              OBJLIST: [
                {
                  objnam: 'M1',
                  params: {
                    OBJTYP: 'Module',
                    CIRCUITS: [
                      {
                        objnam: 'C01',
                        params: {
                          OBJTYP: 'Circuit',
                          SUBTYP: 'LIGHT',
                          SNAME: 'Pool Light',
                          FEATR: 'ON',
                          STATUS: 'OFF',
                        },
                      },
                      {
                        objnam: 'B01',
                        params: {
                          OBJTYP: 'Body',
                          SUBTYP: 'POOL',
                          SNAME: 'Pool',
                          LSTTMP: '78',
                          LOTMP: '80',
                        },
                      },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
      PUMPS: {
        panels: [
          {
            objnam: 'P1',
            params: {
              OBJLIST: [
                {
                  objnam: 'P01',
                  params: {
                    OBJTYP: 'Pump',
                    SUBTYP: 'VSF',
                    SNAME: 'Pool Pump',
                    MIN: '400',
                    MAX: '3450',
                    OBJLIST: [
                      {
                        objnam: 'PC01',
                        params: {
                          CIRCUIT: 'C03',
                          SPEED: '1500',
                          SELECT: 'RPM',
                        },
                      },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
      SENSORS: {
        panels: [
          {
            objnam: 'P1',
            params: {
              OBJLIST: [
                {
                  objnam: 'S01',
                  params: {
                    OBJTYP: 'Sensor',
                    SUBTYP: 'POOL',
                    SNAME: 'Pool Temp',
                    PROBE: '78.5',
                  },
                },
              ],
            },
          },
        ],
      },
      HEATERS: {
        panels: [
          {
            objnam: 'P1',
            params: {
              OBJLIST: [
                {
                  objnam: 'H01',
                  params: {
                    OBJTYP: 'Heater',
                    SUBTYP: 'GAS',
                    SNAME: 'Pool Heater',
                    Body: 'B01',
                  },
                },
              ],
            },
          },
        ],
      },
    };

    return deviceType ? mockHardware[deviceType] || {} : mockHardware.CIRCUITS;
  }

  private handleSetParamList(request: IntelliCenterRequest, baseResponse: IntelliCenterResponse): IntelliCenterResponse {
    if (!request.objectList) {
      return {
        ...baseResponse,
        response: '400' as any,
        command: IntelliCenterResponseCommand.Error,
        description: 'Missing objectList',
      };
    }

    // Update device state and send notification
    for (const obj of request.objectList) {
      if (obj.params) {
        this.updateDeviceState(obj.objnam, obj.params);
      }
    }

    // Send back confirmation and then notification
    setTimeout(() => {
      this.sendNotification(request.objectList![0]);
    }, 100);

    return baseResponse;
  }

  private handleRequestParamList(request: IntelliCenterRequest, baseResponse: IntelliCenterResponse): IntelliCenterResponse {
    // This sets up subscription for updates
    return baseResponse;
  }

  private updateDeviceState(objId: string, params: Record<string, unknown>): void {
    if (this.deviceState.circuits.has(objId)) {
      const circuit = this.deviceState.circuits.get(objId)!;
      if (params.STATUS) circuit.status = params.STATUS;
      this.deviceState.circuits.set(objId, circuit);
    }

    if (this.deviceState.bodies.has(objId)) {
      const body = this.deviceState.bodies.get(objId)!;
      if (params.LOTMP) body.setpoint = parseInt(params.LOTMP);
      if (params.LSTTMP) body.temperature = parseInt(params.LSTTMP);
      this.deviceState.bodies.set(objId, body);
    }

    if (this.deviceState.pumps.has(objId)) {
      const pump = this.deviceState.pumps.get(objId)!;
      if (params.SPEED) pump.speed = parseInt(params.SPEED);
      if (params.SELECT) pump.select = params.SELECT;
      this.deviceState.pumps.set(objId, pump);
    }
  }

  private sendNotification(obj: Record<string, unknown>): void {
    const notification: IntelliCenterResponse = {
      response: IntelliCenterResponseStatus.Ok,
      command: IntelliCenterResponseCommand.NotifyList,
      messageID: 'notification',
      description: 'Parameter update notification',
      answer: undefined as never,
      objectList: [
        {
          objnam: obj.objnam,
          params: obj.params,
        },
      ],
    };

    this.broadcast(JSON.stringify(notification) + '\n');
  }

  private broadcast(message: string): void {
    for (const socket of this.connections) {
      if (!socket.destroyed) {
        socket.write(message);
      }
    }
  }

  public async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server.listen(this.config.port, () => {
        this.isRunning = true;
        this.emit('started', this.config.port);
        resolve();
      });

      this.server.on('error', reject);
    });
  }

  public async stop(): Promise<void> {
    return new Promise(resolve => {
      if (!this.isRunning) {
        resolve();
        return;
      }

      // Close all connections
      for (const socket of this.connections) {
        socket.destroy();
      }
      this.connections.clear();

      this.server.close(() => {
        this.isRunning = false;
        this.emit('stopped');
        resolve();
      });
    });
  }

  public getStats() {
    return {
      isRunning: this.isRunning,
      connectedClients: this.connectedClients,
      commandCount: this.commandCount,
      deviceState: this.deviceState,
    };
  }

  public simulateDeviceUpdate(objId: string, params: Record<string, unknown>): void {
    this.updateDeviceState(objId, params);
    this.sendNotification({ objnam: objId, params });
  }

  public setConfig(newConfig: Partial<MockIntelliCenterConfig>): void {
    Object.assign(this.config, newConfig);
  }
}
