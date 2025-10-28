import type { Domain } from "../config/entities";

export interface AgentAction {
  readonly agent: string;
  readonly ensName: string;
  readonly domain: Domain;
  readonly cost: bigint;
  readonly call: string;
  readonly timestamp: number;
}

export interface SentinelAlert {
  readonly domain: Domain;
  readonly agent: string;
  readonly ensName: string;
  readonly severity: "critical" | "warning";
  readonly reason: string;
  readonly timestamp: number;
}

export interface SentinelMonitor {
  readonly name: string;
  evaluate(action: AgentAction): SentinelAlert | null;
}
