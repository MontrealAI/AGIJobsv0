import { EventEmitter } from 'events';
import { GovernanceController, GovernanceParameters, GovernanceUpdatable } from './types';

export class GovernanceModule extends EventEmitter implements GovernanceController {
  private params: GovernanceParameters;

  constructor(initial: GovernanceParameters) {
    super();
    this.params = { ...initial };
  }

  updateParameter(key: GovernanceUpdatable, value: number): void {
    if (!Number.isFinite(value) || value <= 0) {
      throw new Error(`invalid governance value for ${key}`);
    }
    const oldValue = this.params[key];
    if (oldValue === value) {
      return;
    }
    this.params = { ...this.params, [key]: value };
    this.emit('GovernanceParameterUpdated', { key, value, previous: oldValue });
  }

  getParameters(): GovernanceParameters {
    return { ...this.params };
  }
}
