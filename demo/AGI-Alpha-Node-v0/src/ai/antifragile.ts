import { randomInt } from 'node:crypto';

export interface StressScenario {
  readonly id: string;
  readonly description: string;
  readonly severity: number; // 1-5
}

export interface StressTestResult {
  readonly id: string;
  readonly passed: boolean;
  readonly severity: number;
  readonly notes: string;
}

export class AntifragileShell {
  private readonly scenarios: StressScenario[] = [
    { id: 'adversarial-inputs', description: 'Adversarial prompt injection attempt', severity: 3 },
    { id: 'downtime-shock', description: 'Extended RPC downtime', severity: 4 },
    { id: 'slashing-event', description: 'Coordinated validator dispute', severity: 5 },
    { id: 'economic-stress', description: 'Negative fee epoch', severity: 2 }
  ];
  private minSeverity = 2;

  run(): StressTestResult[] {
    return this.scenarios
      .filter((scenario) => scenario.severity >= this.minSeverity)
      .map((scenario) => this.evaluateScenario(scenario));
  }

  escalate(success: boolean): void {
    if (success) {
      this.minSeverity = Math.min(5, this.minSeverity + 1);
    } else {
      this.minSeverity = Math.max(1, this.minSeverity - 1);
    }
  }

  private evaluateScenario(scenario: StressScenario): StressTestResult {
    const roll = randomInt(0, 100);
    const threshold = 50 + scenario.severity * 10;
    const passed = roll < threshold;
    return {
      id: scenario.id,
      passed,
      severity: scenario.severity,
      notes: passed
        ? `${scenario.description} mitigated (roll ${roll}/${threshold}).`
        : `${scenario.description} requires operator review (roll ${roll}/${threshold}).`
    };
  }
}
