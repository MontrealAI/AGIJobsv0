import { createRequire } from "node:module";
import { ethers } from "ethers";

const requireJson = createRequire(import.meta.url);

type RawContractEntry = {
  address?: string;
  abi?: readonly unknown[];
};

type RawContracts = {
  agialphaToken: RawContractEntry;
  jobRegistry: RawContractEntry;
  stakeManager: RawContractEntry;
  validationModule: RawContractEntry;
  disputeModule: RawContractEntry;
  feePool: RawContractEntry;
};

const rawContracts = requireJson("../../../config/contracts.orchestrator.json") as RawContracts;

export type ContractKey = keyof typeof rawContracts;

export interface ContractMetadata {
  address: string;
  abi: readonly string[];
}

const ENV_OVERRIDES: Record<ContractKey, readonly string[]> = {
  agialphaToken: ["AGIALPHA_TOKEN", "AGIALPHA_TOKEN_ADDRESS", "TOKEN_ADDRESS"],
  jobRegistry: ["JOB_REGISTRY", "JOB_REGISTRY_ADDRESS"],
  stakeManager: ["STAKE_MANAGER", "STAKE_MANAGER_ADDRESS"],
  validationModule: ["VALIDATION_MODULE", "VALIDATION_MODULE_ADDRESS"],
  disputeModule: ["DISPUTE_MODULE", "DISPUTE_MODULE_ADDRESS"],
  feePool: ["FEE_POOL", "FEE_POOL_ADDRESS"],
};

function normalizeAddress(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  try {
    return ethers.getAddress(trimmed);
  } catch (error) {
    console.warn(`Invalid address override '${value}':`, error);
    return undefined;
  }
}

function resolveAddress(key: ContractKey): string {
  const envCandidates = ENV_OVERRIDES[key] ?? [];
  for (const name of envCandidates) {
    const override = normalizeAddress(process.env[name]);
    if (override) {
      return override;
    }
  }
  const configured = normalizeAddress(rawContracts[key]?.address);
  return configured ?? ethers.ZeroAddress;
}

function resolveAbi(key: ContractKey): readonly string[] {
  const abi = rawContracts[key]?.abi;
  if (!Array.isArray(abi)) {
    return [];
  }
  return abi.map((entry) => String(entry));
}

export function getContractMetadata(key: ContractKey): ContractMetadata {
  return {
    address: resolveAddress(key),
    abi: resolveAbi(key),
  };
}

export function getAllContractMetadata(): Record<ContractKey, ContractMetadata> {
  return {
    agialphaToken: getContractMetadata("agialphaToken"),
    jobRegistry: getContractMetadata("jobRegistry"),
    stakeManager: getContractMetadata("stakeManager"),
    validationModule: getContractMetadata("validationModule"),
    disputeModule: getContractMetadata("disputeModule"),
    feePool: getContractMetadata("feePool"),
  };
}
