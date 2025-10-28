import { EventEmitter } from 'node:events';

import { createLogger } from '../utils/telemetry.js';

export type ControlCommand =
  | { type: 'PAUSE' }
  | { type: 'RESUME' }
  | { type: 'UPDATE_PARAM'; key: string; value: unknown }
  | { type: 'EMERGENCY_STOP' };

export interface ControlPlaneState {
  paused: boolean;
  parameters: Record<string, unknown>;
}

export class ControlPlane extends EventEmitter {
  readonly state: ControlPlaneState;

  constructor(initialParameters: Record<string, unknown>) {
    super();
    this.state = {
      paused: false,
      parameters: { ...initialParameters }
    };
  }

  execute(command: ControlCommand): void {
    const logger = createLogger('control-plane');
    logger.info({ command }, 'Processing control command');
    switch (command.type) {
      case 'PAUSE':
        this.state.paused = true;
        this.emit('paused');
        break;
      case 'RESUME':
        this.state.paused = false;
        this.emit('resumed');
        break;
      case 'UPDATE_PARAM':
        this.state.parameters[command.key] = command.value;
        this.emit('parameterUpdated', command.key, command.value);
        break;
      case 'EMERGENCY_STOP':
        this.state.paused = true;
        this.emit('emergencyStop');
        break;
      default:
        throw new Error('Unknown control command');
    }
  }
}
