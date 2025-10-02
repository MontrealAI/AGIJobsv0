export interface PlannedAction {
  label: string;
  method: string;
  args: any[];
  current?: string;
  desired?: string;
  notes?: string[];
  /**
   * Optional call metadata injected by planning helpers so downstream tooling
   * (Safe bundle writers, JSON exporters, etc.) can operate without re-querying
   * the ABI. Existing plan builders are not required to populate these fields –
   * the orchestrators mutate the action objects in-place after ABI resolution.
   */
  calldata?: string;
  value?: string;
  signature?: string;
  functionName?: string;
  stateMutability?: string;
  inputs?: { name: string; type: string }[];
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
