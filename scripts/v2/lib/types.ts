export interface PlannedAction {
  label: string;
  method: string;
  args: any[];
  current?: string;
  desired?: string;
  notes?: string[];
}

import type { Contract, Interface } from 'ethers';

export interface ModulePlan {
  module: string;
  address: string;
  actions: PlannedAction[];
  configPath?: string;
  warnings?: string[];
  metadata?: Record<string, unknown>;
  iface?: Interface;
  contract?: Contract;
}

export interface ExecutionResult {
  action: PlannedAction;
  txHash: string;
}
