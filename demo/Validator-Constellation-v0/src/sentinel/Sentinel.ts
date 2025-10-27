import { DomainPauseController } from "../pause/DomainPauseController";
import { EventBus } from "../subgraph/EventBus";

export interface AgentAction {
  domain: string;
  agent: string;
  node: string;
  cost: number;
  call: string;
  metadata?: Record<string, unknown>;
  timestamp: number;
}

export interface SentinelFinding {
  monitor: string;
  reason: string;
  severity: "critical" | "high" | "medium";
}

export type SentinelMonitor = (action: AgentAction) => SentinelFinding | undefined;

export class Sentinel {
  private readonly monitors = new Map<string, SentinelMonitor>();

  constructor(
    private readonly bus: EventBus,
    private readonly pauseController: DomainPauseController,
    private readonly slaMilliseconds: number,
  ) {}

  registerMonitor(name: string, monitor: SentinelMonitor): void {
    this.monitors.set(name, monitor);
  }

  evaluate(action: AgentAction): SentinelFinding | undefined {
    if (this.pauseController.isPaused(action.domain)) {
      return undefined;
    }
    for (const [name, monitor] of this.monitors) {
      const finding = monitor(action);
      if (finding) {
        const elapsed = Date.now() - action.timestamp;
        if (elapsed > this.slaMilliseconds) {
          throw new Error(`Sentinel SLA breached for monitor ${name}`);
        }
        this.pauseController.pause(action.domain, finding.reason);
        this.bus.emit("SentinelAlert", { ...finding, domain: action.domain, agent: action.agent, elapsed });
        return finding;
      }
    }
    return undefined;
  }
}

export function budgetMonitor(maxBudget: number): SentinelMonitor {
  return (action) => {
    if (action.cost > maxBudget) {
      return {
        monitor: "budget-overrun",
        reason: `Action exceeded budget: ${action.cost} > ${maxBudget}`,
        severity: "critical",
      } satisfies SentinelFinding;
    }
    return undefined;
  };
}

const FORBIDDEN_CALLS = new Set(["fs.writeFile", "process.exec", "selfDestruct"]);

export function forbiddenCallMonitor(): SentinelMonitor {
  return (action) => {
    if (FORBIDDEN_CALLS.has(action.call)) {
      return {
        monitor: "forbidden-call",
        reason: `Action attempted forbidden call ${action.call}`,
        severity: "high",
      } satisfies SentinelFinding;
    }
    return undefined;
  };
}
