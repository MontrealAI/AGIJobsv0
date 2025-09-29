import { ethers } from "ethers";
import fs from "node:fs/promises";
import path from "node:path";
import type { AdminSetIntent } from "../router.js";
import { loadContracts } from "../chain/contracts.js";
import { getSignerForUser, rpc } from "../chain/provider.js";
import {
  buildDryRunResult,
  buildPolicyOverrides,
  formatError,
  hexlify,
  simulateContractCall,
  toWei,
  type DryRunResult,
  type ExecutionStepResult,
  type PreparedCallStep,
} from "./common.js";

const GOVERNANCE_STORAGE = path.resolve(process.cwd(), "storage", "governance");
const OWNER_CONTROL_CONFIG = path.resolve(process.cwd(), "config", "owner-control.json");
const THERMODYNAMICS_CONFIG = path.resolve(process.cwd(), "config", "thermodynamics.json");

interface GovernanceSnapshot {
  timestamp: string;
  chainId: string;
  onChain: Record<string, Record<string, string>>;
  configs: Record<string, unknown>;
}

export interface GovernancePreview {
  key: string;
  method: string;
  module: string;
  args: unknown[];
  call: PreparedCallStep;
  diff?: Record<string, unknown>;
  bundle: SafeBundle;
  snapshot: GovernanceSnapshot;
  auditFile: string;
}

interface SafeBundleTransaction {
  to: string;
  value: string;
  data: string;
  operation: number;
  contractMethod: {
    name: string;
    payable: boolean;
    inputs: { name: string; type: string }[];
  };
  contractInputsValues: Record<string, string>;
}

interface SafeBundleMeta {
  intentKey: string;
  module: string;
  method: string;
  userId?: string;
  safe?: string | null;
}

interface SafeBundle {
  version: string;
  chainId: string;
  createdAt: string;
  meta: SafeBundleMeta;
  transactions: SafeBundleTransaction[];
  digest: string;
}

interface PreviewOptions {
  key: string;
  value: unknown;
  meta?: { traceId?: string; userId?: string; txMode?: string; safe?: string | null };
  persist?: boolean;
}

interface PreparedActionResult {
  args: unknown[];
  diff?: Record<string, unknown>;
  metadata: Record<string, unknown>;
}

type ActionContext = {
  contract: ethers.Contract;
  snapshot: GovernanceSnapshot;
};

type ActionDefinition = {
  key: string;
  module: string;
  method: string;
  prepare: (value: unknown, ctx: ActionContext) => Promise<PreparedActionResult>;
};

function requireUserId(meta?: { userId?: string | null }): string {
  const candidate = meta?.userId?.trim();
  if (!candidate) {
    throw new Error("Missing meta.userId for signing.");
  }
  return candidate;
}

async function ensureDirectory(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

async function readJsonFile(filePath: string): Promise<unknown> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw);
  } catch (error) {
    console.warn(`Failed to read governance config ${filePath}`, error);
    return null;
  }
}

function serializeValue(value: unknown): string {
  if (typeof value === "bigint") {
    return value.toString();
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === "string") {
    return value;
  }
  return JSON.stringify(value);
}

async function safeReadBigInt(contract: ethers.Contract, fn: string): Promise<bigint | undefined> {
  try {
    const callable = contract.getFunction(fn);
    const value = await callable.staticCall();
    if (typeof value === "bigint") {
      return value;
    }
    if (typeof value === "number") {
      return BigInt(value);
    }
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (!trimmed) {
        return undefined;
      }
      if (trimmed.startsWith("0x")) {
        return BigInt(trimmed);
      }
      return BigInt(trimmed);
    }
    return undefined;
  } catch (error) {
    console.warn(`Failed to read ${fn} from contract`, error);
    return undefined;
  }
}

async function safeReadAddress(contract: ethers.Contract, fn: string): Promise<string | undefined> {
  try {
    const callable = contract.getFunction(fn);
    const value = await callable.staticCall();
    if (typeof value === "string" && value.trim()) {
      return ethers.getAddress(value);
    }
    return undefined;
  } catch (error) {
    console.warn(`Failed to read ${fn} from contract`, error);
    return undefined;
  }
}

async function loadGovernanceConfigs(): Promise<Record<string, unknown>> {
  const [ownerControl, thermodynamics] = await Promise.all([
    readJsonFile(OWNER_CONTROL_CONFIG),
    readJsonFile(THERMODYNAMICS_CONFIG),
  ]);
  return {
    ownerControl,
    thermodynamics,
  };
}

function formatPercent(value: bigint | number | string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const numeric = typeof value === "bigint" ? Number(value) : Number(value);
  if (!Number.isFinite(numeric)) return undefined;
  return `${numeric}%`;
}

function formatAGIA(value: bigint | undefined): string | undefined {
  if (value === undefined) return undefined;
  try {
    return `${ethers.formatEther(value)} AGIA`;
  } catch (error) {
    console.warn("Failed to format AGIA value", error);
    return value.toString();
  }
}

function formatDuration(value: bigint | undefined): string | undefined {
  if (value === undefined) return undefined;
  const seconds = Number(value);
  if (!Number.isFinite(seconds)) return `${value.toString()} seconds`;
  const days = seconds / 86400;
  if (days >= 1) {
    return `${days.toFixed(2)} days`;
  }
  const hours = seconds / 3600;
  return `${hours.toFixed(2)} hours`;
}

async function buildGovernanceSnapshot(): Promise<GovernanceSnapshot> {
  const provider = rpc();
  const network = await provider.getNetwork();
  const { stakeManager, jobRegistry, feePool } = loadContracts(provider);

  const [
    minStake,
    stakeFee,
    stakeBurn,
    stakeValidator,
    stakeTreasury,
    registryStake,
    registryMaxReward,
    registryMaxDuration,
    registryFee,
    registryValidator,
    feePoolBurn,
    feePoolTreasury,
  ] = await Promise.all([
    safeReadBigInt(stakeManager, "minStake"),
    safeReadBigInt(stakeManager, "feePct"),
    safeReadBigInt(stakeManager, "burnPct"),
    safeReadBigInt(stakeManager, "validatorRewardPct"),
    safeReadAddress(stakeManager, "treasury"),
    safeReadBigInt(jobRegistry, "jobStake"),
    safeReadBigInt(jobRegistry, "maxJobReward"),
    safeReadBigInt(jobRegistry, "maxJobDuration"),
    safeReadBigInt(jobRegistry, "feePct"),
    safeReadBigInt(jobRegistry, "validatorRewardPct"),
    safeReadBigInt(feePool, "burnPct"),
    safeReadAddress(feePool, "treasury"),
  ]);

  const configs = await loadGovernanceConfigs();

  const snapshot: GovernanceSnapshot = {
    timestamp: new Date().toISOString(),
    chainId: network.chainId.toString(),
    onChain: {
      stakeManager: {
        address: (stakeManager.target as string) ?? ethers.ZeroAddress,
        minStake: minStake?.toString() ?? "0",
        minStakeLabel: formatAGIA(minStake) ?? "0",
        feePct: stakeFee?.toString() ?? "0",
        feePctLabel: formatPercent(stakeFee) ?? "0%",
        burnPct: stakeBurn?.toString() ?? "0",
        burnPctLabel: formatPercent(stakeBurn) ?? "0%",
        validatorRewardPct: stakeValidator?.toString() ?? "0",
        validatorRewardPctLabel: formatPercent(stakeValidator) ?? "0%",
        treasury: stakeTreasury ?? ethers.ZeroAddress,
      },
      jobRegistry: {
        address: (jobRegistry.target as string) ?? ethers.ZeroAddress,
        jobStake: registryStake?.toString() ?? "0",
        jobStakeLabel: formatAGIA(registryStake) ?? "0",
        maxJobReward: registryMaxReward?.toString() ?? "0",
        maxJobRewardLabel: formatAGIA(registryMaxReward) ?? "0",
        maxJobDuration: registryMaxDuration?.toString() ?? "0",
        maxJobDurationLabel: formatDuration(registryMaxDuration) ?? "0 seconds",
        feePct: registryFee?.toString() ?? "0",
        feePctLabel: formatPercent(registryFee) ?? "0%",
        validatorRewardPct: registryValidator?.toString() ?? "0",
        validatorRewardPctLabel: formatPercent(registryValidator) ?? "0%",
      },
      feePool: {
        address: (feePool.target as string) ?? ethers.ZeroAddress,
        burnPct: feePoolBurn?.toString() ?? "0",
        burnPctLabel: formatPercent(feePoolBurn) ?? "0%",
        treasury: feePoolTreasury ?? ethers.ZeroAddress,
      },
    },
    configs,
  };

  return snapshot;
}

function deltaPercent(before?: string, after?: string): string | undefined {
  if (!before || !after) return undefined;
  const beforeNum = Number(before);
  const afterNum = Number(after);
  if (!Number.isFinite(beforeNum) || !Number.isFinite(afterNum)) return undefined;
  const diff = afterNum - beforeNum;
  if (diff === 0) return "0";
  return diff > 0 ? `+${diff}` : `${diff}`;
}

function buildDiffRecord(options: {
  before?: string;
  beforeLabel?: string;
  after?: string;
  afterLabel?: string;
  units?: string;
}): Record<string, unknown> {
  const { before, beforeLabel, after, afterLabel, units } = options;
  const result: Record<string, unknown> = {};
  if (before !== undefined) result.before = before;
  if (beforeLabel !== undefined) result.beforeLabel = beforeLabel;
  if (after !== undefined) result.after = after;
  if (afterLabel !== undefined) result.afterLabel = afterLabel;
  if (units) result.units = units;
  if (before !== undefined && after !== undefined) {
    const delta = deltaPercent(before, after);
    if (delta !== undefined) {
      result.delta = delta;
    }
  }
  return result;
}

function normalizePercent(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const trimmed = value.trim().replace(/%$/, "");
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed)) {
      throw new Error(`Invalid percentage: ${value}`);
    }
    return parsed;
  }
  if (typeof value === "bigint") {
    return Number(value);
  }
  throw new Error("Unsupported percentage value");
}

function normalizeAddress(value: unknown): string {
  if (typeof value !== "string") {
    throw new Error("Address value must be a string");
  }
  return ethers.getAddress(value);
}

function normalizeDuration(value: unknown): bigint {
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value < 0) {
      throw new Error("Invalid duration");
    }
    return BigInt(Math.trunc(value));
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) throw new Error("Duration cannot be empty");
    if (trimmed.endsWith("d")) {
      const days = Number(trimmed.slice(0, -1));
      if (!Number.isFinite(days)) throw new Error(`Invalid duration: ${value}`);
      return BigInt(Math.trunc(days * 86400));
    }
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed)) throw new Error(`Invalid duration: ${value}`);
    return BigInt(Math.trunc(parsed));
  }
  if (typeof value === "object" && value !== null) {
    const maybeSeconds = (value as Record<string, unknown>).seconds;
    if (typeof maybeSeconds === "number") {
      return normalizeDuration(maybeSeconds);
    }
    const maybeDays = (value as Record<string, unknown>).days;
    if (typeof maybeDays === "number") {
      return BigInt(Math.trunc(maybeDays * 86400));
    }
  }
  throw new Error("Unsupported duration value");
}

const ACTION_DEFINITIONS: ActionDefinition[] = [
  {
    key: "stakeManager.setMinStake",
    module: "stakeManager",
    method: "setMinStake",
    async prepare(value, ctx) {
      const amount = toWei(value as string | number | bigint);
      const before = ctx.snapshot.onChain.stakeManager?.minStake;
      const beforeLabel = ctx.snapshot.onChain.stakeManager?.minStakeLabel;
      const afterLabel = formatAGIA(amount) ?? amount.toString();
      return {
        args: [amount],
        diff: buildDiffRecord({
          before,
          beforeLabel,
          after: amount.toString(),
          afterLabel,
          units: "wei",
        }),
        metadata: {
          amountWei: amount.toString(),
          amountAGIA: ethers.formatEther(amount),
        },
      };
    },
  },
  {
    key: "stakeManager.setFeePct",
    module: "stakeManager",
    method: "setFeePct",
    async prepare(value, ctx) {
      const pct = normalizePercent(value);
      const before = ctx.snapshot.onChain.stakeManager?.feePct;
      const beforeLabel = ctx.snapshot.onChain.stakeManager?.feePctLabel;
      return {
        args: [pct],
        diff: buildDiffRecord({
          before,
          beforeLabel,
          after: pct.toString(),
          afterLabel: `${pct}%`,
          units: "%",
        }),
        metadata: { pct },
      };
    },
  },
  {
    key: "stakeManager.setBurnPct",
    module: "stakeManager",
    method: "setBurnPct",
    async prepare(value, ctx) {
      const pct = normalizePercent(value);
      const before = ctx.snapshot.onChain.stakeManager?.burnPct;
      const beforeLabel = ctx.snapshot.onChain.stakeManager?.burnPctLabel;
      return {
        args: [pct],
        diff: buildDiffRecord({
          before,
          beforeLabel,
          after: pct.toString(),
          afterLabel: `${pct}%`,
          units: "%",
        }),
        metadata: { pct },
      };
    },
  },
  {
    key: "stakeManager.setValidatorRewardPct",
    module: "stakeManager",
    method: "setValidatorRewardPct",
    async prepare(value, ctx) {
      const pct = normalizePercent(value);
      const before = ctx.snapshot.onChain.stakeManager?.validatorRewardPct;
      const beforeLabel = ctx.snapshot.onChain.stakeManager?.validatorRewardPctLabel;
      return {
        args: [pct],
        diff: buildDiffRecord({
          before,
          beforeLabel,
          after: pct.toString(),
          afterLabel: `${pct}%`,
          units: "%",
        }),
        metadata: { pct },
      };
    },
  },
  {
    key: "stakeManager.setTreasury",
    module: "stakeManager",
    method: "setTreasury",
    async prepare(value, ctx) {
      const address = normalizeAddress(value);
      const before = ctx.snapshot.onChain.stakeManager?.treasury;
      return {
        args: [address],
        diff: buildDiffRecord({ before, after: address }),
        metadata: { address },
      };
    },
  },
  {
    key: "jobRegistry.setJobStake",
    module: "jobRegistry",
    method: "setJobStake",
    async prepare(value, ctx) {
      const amount = toWei(value as string | number | bigint);
      const before = ctx.snapshot.onChain.jobRegistry?.jobStake;
      const beforeLabel = ctx.snapshot.onChain.jobRegistry?.jobStakeLabel;
      const afterLabel = formatAGIA(amount) ?? amount.toString();
      return {
        args: [amount],
        diff: buildDiffRecord({
          before,
          beforeLabel,
          after: amount.toString(),
          afterLabel,
          units: "wei",
        }),
        metadata: {
          amountWei: amount.toString(),
          amountAGIA: ethers.formatEther(amount),
        },
      };
    },
  },
  {
    key: "jobRegistry.setMaxJobReward",
    module: "jobRegistry",
    method: "setMaxJobReward",
    async prepare(value, ctx) {
      const amount = toWei(value as string | number | bigint);
      const before = ctx.snapshot.onChain.jobRegistry?.maxJobReward;
      const beforeLabel = ctx.snapshot.onChain.jobRegistry?.maxJobRewardLabel;
      const afterLabel = formatAGIA(amount) ?? amount.toString();
      return {
        args: [amount],
        diff: buildDiffRecord({
          before,
          beforeLabel,
          after: amount.toString(),
          afterLabel,
          units: "wei",
        }),
        metadata: {
          amountWei: amount.toString(),
          amountAGIA: ethers.formatEther(amount),
        },
      };
    },
  },
  {
    key: "jobRegistry.setJobDurationLimit",
    module: "jobRegistry",
    method: "setJobDurationLimit",
    async prepare(value, ctx) {
      const duration = normalizeDuration(value);
      const before = ctx.snapshot.onChain.jobRegistry?.maxJobDuration;
      const beforeLabel = ctx.snapshot.onChain.jobRegistry?.maxJobDurationLabel;
      const afterLabel = formatDuration(duration) ?? duration.toString();
      return {
        args: [duration],
        diff: buildDiffRecord({
          before,
          beforeLabel,
          after: duration.toString(),
          afterLabel,
          units: "seconds",
        }),
        metadata: {
          durationSeconds: duration.toString(),
        },
      };
    },
  },
  {
    key: "jobRegistry.setJobParameters",
    module: "jobRegistry",
    method: "setJobParameters",
    async prepare(value, ctx) {
      if (typeof value !== "object" || value === null) {
        throw new Error("setJobParameters requires an object value");
      }
      const record = value as Record<string, unknown>;
      const maxReward = toWei(record.maxReward ?? record.maxJobReward ?? 0);
      const stake = toWei(record.jobStake ?? record.stake ?? 0);
      const beforeReward = ctx.snapshot.onChain.jobRegistry?.maxJobReward;
      const beforeRewardLabel = ctx.snapshot.onChain.jobRegistry?.maxJobRewardLabel;
      const beforeStake = ctx.snapshot.onChain.jobRegistry?.jobStake;
      const beforeStakeLabel = ctx.snapshot.onChain.jobRegistry?.jobStakeLabel;
      return {
        args: [maxReward, stake],
        diff: {
          reward: buildDiffRecord({
            before: beforeReward,
            beforeLabel: beforeRewardLabel,
            after: maxReward.toString(),
            afterLabel: formatAGIA(maxReward) ?? maxReward.toString(),
            units: "wei",
          }),
          stake: buildDiffRecord({
            before: beforeStake,
            beforeLabel: beforeStakeLabel,
            after: stake.toString(),
            afterLabel: formatAGIA(stake) ?? stake.toString(),
            units: "wei",
          }),
        },
        metadata: {
          maxRewardWei: maxReward.toString(),
          jobStakeWei: stake.toString(),
        },
      };
    },
  },
  {
    key: "feePool.setBurnPct",
    module: "feePool",
    method: "setBurnPct",
    async prepare(value, ctx) {
      const pct = normalizePercent(value);
      const before = ctx.snapshot.onChain.feePool?.burnPct;
      const beforeLabel = ctx.snapshot.onChain.feePool?.burnPctLabel;
      return {
        args: [pct],
        diff: buildDiffRecord({
          before,
          beforeLabel,
          after: pct.toString(),
          afterLabel: `${pct}%`,
          units: "%",
        }),
        metadata: { pct },
      };
    },
  },
  {
    key: "feePool.setTreasury",
    module: "feePool",
    method: "setTreasury",
    async prepare(value, ctx) {
      const address = normalizeAddress(value);
      const before = ctx.snapshot.onChain.feePool?.treasury;
      return {
        args: [address],
        diff: buildDiffRecord({ before, after: address }),
        metadata: { address },
      };
    },
  },
];

const ACTION_INDEX = new Map<string, ActionDefinition>();
for (const definition of ACTION_DEFINITIONS) {
  ACTION_INDEX.set(definition.key.toLowerCase(), definition);
}

function resolveAction(key: string): ActionDefinition {
  const normalized = key.trim().toLowerCase();
  const definition = ACTION_INDEX.get(normalized);
  if (!definition) {
    throw new Error(`Unsupported governance key: ${key}`);
  }
  return definition;
}

function buildCall(
  label: string,
  contract: ethers.Contract,
  tx: ethers.TransactionRequest,
  gasEstimate?: bigint,
  result?: unknown
): PreparedCallStep {
  return {
    label,
    to: (tx.to ?? (contract.target as string)) as string,
    data: tx.data ?? "0x",
    value: hexlify(tx.value ?? 0),
    gasEstimate: gasEstimate ? hexlify(gasEstimate) : undefined,
    result,
  };
}

function encodeSafeBundle(
  contract: ethers.Contract,
  definition: ActionDefinition,
  call: PreparedCallStep,
  args: unknown[],
  snapshot: GovernanceSnapshot,
  meta: SafeBundleMeta
): SafeBundle {
  const fragment = contract.getFunction(definition.method);
  const inputs = fragment.inputs ?? [];
  const contractInputsValues: Record<string, string> = {};
  inputs.forEach((input, index) => {
    const value = args[index];
    contractInputsValues[input.name || `arg${index}`] = serializeValue(value);
  });

  const tx: SafeBundleTransaction = {
    to: call.to,
    value: call.value,
    data: call.data,
    operation: 0,
    contractMethod: {
      name: fragment.name,
      payable: fragment.payable,
      inputs: inputs.map((input) => ({ name: input.name, type: input.type })),
    },
    contractInputsValues,
  };

  const bundle: SafeBundle = {
    version: "1.0",
    chainId: snapshot.chainId,
    createdAt: new Date().toISOString(),
    meta,
    transactions: [tx],
    digest: "",
  };

  const digestSource = JSON.stringify(bundle, (_key, value) =>
    typeof value === "bigint" ? value.toString() : value
  );
  bundle.digest = ethers.keccak256(ethers.toUtf8Bytes(digestSource));
  return bundle;
}

async function persistAudit(preview: GovernancePreview, meta?: { traceId?: string }): Promise<string> {
  await ensureDirectory(GOVERNANCE_STORAGE);
  const slug = preview.key.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  const fileName = `${new Date().toISOString().replace(/[:.]/g, "-")}-${slug}.json`;
  const payload = {
    key: preview.key,
    module: preview.module,
    method: preview.method,
    args: preview.args,
    diff: preview.diff,
    bundle: preview.bundle,
    snapshot: preview.snapshot,
    metadata: {
      traceId: meta?.traceId,
    },
  };
  const serialized = JSON.stringify(payload, (_key, value) =>
    typeof value === "bigint" ? value.toString() : value
  );
  const filePath = path.join(GOVERNANCE_STORAGE, fileName);
  await fs.writeFile(filePath, serialized);
  return filePath;
}

export async function previewGovernanceAction(options: PreviewOptions): Promise<GovernancePreview> {
  const { key, value, meta, persist = false } = options;
  const snapshot = await buildGovernanceSnapshot();
  const definition = resolveAction(key);
  const contracts = loadContracts(rpc());
  const contract = contracts[definition.module as keyof typeof contracts];
  if (!contract) {
    throw new Error(`Missing contract instance for module ${definition.module}`);
  }

  const prepared = await definition.prepare(value, { contract, snapshot });
  const data = contract.interface.encodeFunctionData(definition.method, prepared.args);
  const call: PreparedCallStep = {
    label: `${definition.module}.${definition.method}`,
    to: contract.target as string,
    data,
    value: "0x0",
    result: {
      metadata: prepared.metadata,
    },
  };

  const bundle = encodeSafeBundle(
    contract,
    definition,
    call,
    prepared.args,
    snapshot,
    {
      intentKey: key,
      module: definition.module,
      method: definition.method,
      userId: meta?.userId,
      safe: meta?.safe ?? null,
    }
  );

  const preview: GovernancePreview = {
    key,
    module: definition.module,
    method: definition.method,
    args: prepared.args,
    call,
    diff: prepared.diff,
    bundle,
    snapshot,
    auditFile: "",
  };

  if (persist) {
    preview.auditFile = await persistAudit(preview, { traceId: meta?.traceId });
  }

  return preview;
}

export async function loadGovernanceSnapshot(): Promise<GovernanceSnapshot> {
  return buildGovernanceSnapshot();
}

export async function adminSetDryRun(ics: AdminSetIntent): Promise<DryRunResult> {
  const userId = requireUserId(ics.meta);
  const signer = await getSignerForUser(userId, ics.meta?.txMode);
  const definition = resolveAction(ics.params.key);
  const contracts = loadContracts(signer);
  const contract = contracts[definition.module as keyof typeof contracts];
  if (!contract) {
    throw new Error(`Missing contract for module ${definition.module}`);
  }
  const snapshot = await buildGovernanceSnapshot();
  const prepared = await definition.prepare(ics.params.value, { contract, snapshot });
  const overrides = buildPolicyOverrides(ics.meta);
  const tx = await contract[definition.method].populateTransaction(...prepared.args, overrides);
  tx.from = await signer.getAddress();
  const simulation = await simulateContractCall(signer, tx);
  const call = buildCall(
    `${definition.module}.${definition.method}`,
    contract,
    tx,
    simulation.gasEstimate,
    {
      metadata: prepared.metadata,
      diff: prepared.diff,
    }
  );

  const bundle = encodeSafeBundle(
    contract,
    definition,
    call,
    prepared.args,
    snapshot,
    {
      intentKey: ics.params.key,
      module: definition.module,
      method: definition.method,
      userId,
      safe: null,
    }
  );

  const preview: GovernancePreview = {
    key: ics.params.key,
    module: definition.module,
    method: definition.method,
    args: prepared.args,
    call,
    diff: prepared.diff,
    bundle,
    snapshot,
    auditFile: "",
  };

  preview.auditFile = await persistAudit(preview, {
    traceId: ics.meta?.traceId,
  });

  return buildDryRunResult(await signer.getAddress(), ics.meta?.txMode, [call], {
    module: definition.module,
    method: definition.method,
    args: prepared.args.map((arg) => serializeValue(arg)),
    diff: prepared.diff,
    safeBundle: bundle,
    auditFile: preview.auditFile,
  });
}

export async function adminSetExecute(ics: AdminSetIntent): Promise<ExecutionStepResult[]> {
  const userId = requireUserId(ics.meta);
  const signer = await getSignerForUser(userId, ics.meta?.txMode);
  const definition = resolveAction(ics.params.key);
  const contracts = loadContracts(signer);
  const contract = contracts[definition.module as keyof typeof contracts];
  if (!contract) {
    throw new Error(`Missing contract for module ${definition.module}`);
  }
  const snapshot = await buildGovernanceSnapshot();
  const prepared = await definition.prepare(ics.params.value, { contract, snapshot });
  const overrides = buildPolicyOverrides(ics.meta);
  const tx = await contract[definition.method](...prepared.args, overrides);
  const receipt = await tx.wait();

  const bundle = encodeSafeBundle(
    contract,
    definition,
    {
      label: `${definition.module}.${definition.method}`,
      to: contract.target as string,
      data: tx.data ?? "0x",
      value: "0x0",
      result: { metadata: prepared.metadata },
    },
    prepared.args,
    snapshot,
    {
      intentKey: ics.params.key,
      module: definition.module,
      method: definition.method,
      userId,
      safe: null,
    }
  );

  await persistAudit(
    {
      key: ics.params.key,
      module: definition.module,
      method: definition.method,
      args: prepared.args,
      call: {
        label: `${definition.module}.${definition.method}`,
        to: contract.target as string,
        data: tx.data ?? "0x",
        value: "0x0",
      } as PreparedCallStep,
      diff: prepared.diff,
      bundle,
      snapshot,
      auditFile: "",
    },
    { traceId: ics.meta?.traceId }
  );

  return [
    {
      label: `${definition.module}.${definition.method}`,
      txHash: tx.hash,
      receipt,
      metadata: {
        args: prepared.args.map((arg) => serializeValue(arg)),
        diff: prepared.diff,
        module: definition.module,
        method: definition.method,
      },
    },
  ];
}

function summarizeDiff(diff: unknown, prefix = "diff"): string[] {
  if (!diff || typeof diff !== "object") {
    return [];
  }
  const entries = diff as Record<string, unknown>;
  const lines: string[] = [];
  for (const [key, value] of Object.entries(entries)) {
    if (!value || typeof value !== "object") continue;
    const record = value as Record<string, unknown>;
    if ("before" in record || "after" in record || "beforeLabel" in record || "afterLabel" in record) {
      const before = (record.beforeLabel ?? record.before) as string | undefined;
      const after = (record.afterLabel ?? record.after) as string | undefined;
      const label = `${prefix}.${key}`;
      lines.push(`• ${label}: ${before ?? "n/a"} → ${after ?? "n/a"}`);
    } else {
      lines.push(...summarizeDiff(record, `${prefix}.${key}`));
    }
  }
  return lines;
}

function renderGovernanceDryRun(result: DryRunResult): string {
  const lines: string[] = [];
  lines.push(`🔍 Governance dry-run (${result.txMode})\n`);
  const metadata = (result.metadata ?? {}) as Record<string, unknown>;
  if (metadata.module && metadata.method) {
    lines.push(`• Action: ${metadata.module}.${metadata.method}\n`);
  }
  if (metadata.args) {
    lines.push(`• Arguments: ${JSON.stringify(metadata.args)}\n`);
  }
  if (metadata.diff) {
    const diffLines = summarizeDiff(metadata.diff, "diff");
    if (diffLines.length) {
      for (const line of diffLines) {
        lines.push(`${line}\n`);
      }
    }
  }
  if (metadata.auditFile) {
    lines.push(`• Audit trail: ${metadata.auditFile}\n`);
  }
  return lines.join("");
}

export async function* adminSet(ics: AdminSetIntent) {
  try {
    const dryRun = await adminSetDryRun(ics);
    yield renderGovernanceDryRun(dryRun);
    if (ics.confirm === false) {
      yield "🧪 Dry-run completed. Set confirm=true to execute.\n";
      return;
    }
    const executions = await adminSetExecute(ics);
    for (const step of executions) {
      yield `⛓️ Tx submitted: ${step.txHash}\n`;
    }
    const [finalStep] = executions.slice(-1);
    const metadata = finalStep?.metadata as Record<string, unknown> | undefined;
    const moduleName = metadata?.module ?? ics.params.key.split(".")[0];
    const methodName = metadata?.method ?? ics.params.key.split(".").slice(1).join(".");
    yield `✅ Updated ${moduleName}.${methodName}.\n`;
  } catch (error) {
    yield formatError(error);
  }
}

