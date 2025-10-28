import { setTimeout as delay } from 'node:timers/promises';

import { createLogger } from '../utils/telemetry.js';

const logger = createLogger('antifragile-shell');

export interface StressScenario {
  id: string;
  description: string;
  impact: 'low' | 'medium' | 'high';
  run: () => Promise<boolean>;
}

export interface AntifragileOptions {
  shockFrequencyMinutes: number;
  recoveryBackoffMinutes: number;
}

export class AntifragileShell {
  private readonly scenarios: StressScenario[] = [];
  private active = false;

  constructor(private readonly options: AntifragileOptions) {}

  registerScenario(scenario: StressScenario): void {
    this.scenarios.push(scenario);
    logger.info({ scenario: scenario.id }, 'Registered stress scenario');
  }

  async start(): Promise<void> {
    if (this.active) {
      return;
    }
    this.active = true;
    while (this.active) {
      await delay(this.options.shockFrequencyMinutes * 60 * 1000);
      const scenario = this.scenarios[Math.floor(Math.random() * this.scenarios.length)];
      if (!scenario) {
        logger.warn('No scenarios registered, skipping shock cycle');
        continue;
      }
      logger.info({ scenario: scenario.id }, 'Running stress scenario');
      const success = await scenario.run();
      if (!success) {
        logger.warn({ scenario: scenario.id }, 'Scenario failed. Triggering recovery and hardening');
        await delay(this.options.recoveryBackoffMinutes * 60 * 1000);
      }
    }
  }

  stop(): void {
    this.active = false;
  }
}
