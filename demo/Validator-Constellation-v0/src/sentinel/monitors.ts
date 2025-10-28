import type { Domain } from "../config/entities";
import type { AgentAction, SentinelAlert, SentinelMonitor } from "./types";

interface BudgetState {
  readonly budget: bigint;
  spent: bigint;
}

export class BudgetOverrunMonitor implements SentinelMonitor {
  readonly name = "BudgetOverrunMonitor";
  private readonly domainBudgets = new Map<Domain, BudgetState>();

  constructor(budgets: Record<Domain, bigint>) {
    for (const [domain, budget] of Object.entries(budgets) as [
      Domain,
      bigint
    ][]) {
      this.domainBudgets.set(domain, { budget, spent: 0n });
    }
  }

  evaluate(action: AgentAction): SentinelAlert | null {
    const state = this.domainBudgets.get(action.domain);
    if (!state) {
      return null;
    }
    state.spent += action.cost;
    if (state.spent > state.budget) {
      return {
        domain: action.domain,
        agent: action.agent,
        ensName: action.ensName,
        severity: "critical",
        reason: `Budget exceeded by ${(state.spent - state.budget) / 10n ** 18n} ETH-equivalent`,
        timestamp: action.timestamp,
      };
    }
    return null;
  }
}

const UNSAFE_CALL_PATTERNS = ["selfdestruct", "delegatecall", "raw_assembly"];

export class UnsafeCallMonitor implements SentinelMonitor {
  readonly name = "UnsafeCallMonitor";

  evaluate(action: AgentAction): SentinelAlert | null {
    const callSignature = action.call.toLowerCase();
    const unsafe = UNSAFE_CALL_PATTERNS.find((pattern) =>
      callSignature.includes(pattern)
    );
    if (!unsafe) {
      return null;
    }
    return {
      domain: action.domain,
      agent: action.agent,
      ensName: action.ensName,
      severity: "critical",
      reason: `Unsafe call detected: ${unsafe}`,
      timestamp: action.timestamp,
    };
  }
}
