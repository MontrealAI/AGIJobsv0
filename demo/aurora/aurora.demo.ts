#!/usr/bin/env ts-node
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { randomBytes } from 'crypto';
import { ethers } from 'ethers';

type DeploySummary = {
  contracts: Record<string, string>;
  network?: string;
  governance?: string;
};

type Spec = {
  validation: { k: number; n: number };
  escrow?: { amountPerItem?: string };
  stake?: { worker?: string; validator?: string };
  acceptanceCriteriaURI?: string;
  notes?: string;
};

type GovernanceAction = {
  target: string;
  method: string;
  txHash: string;
  type: 'forwarded' | 'direct';
  params?: unknown;
  notes?: string;
  before?: Record<string, string>;
  after?: Record<string, string>;
};

type ThermostatConfig = {
  systemTemperature?: string | number;
  temperatureBounds?: { min: string | number; max: string | number };
  integralBounds?: { min: string | number; max: string | number };
  pid?: { kp: string | number; ki: string | number; kd: string | number };
  kpiWeights?: {
    emission: string | number;
    backlog: string | number;
    sla: string | number;
  };
  roleTemperatures?: Record<string, string | number>;
  unsetRoleTemperatures?: string[];
};

type ThermostatUpdate = {
  action: string;
  before: string;
  after: string;
  txHash: string;
};

const DEFAULT_MNEMONIC = ethers.Mnemonic.fromPhrase(
  'test test test test test test test test test test test junk'
);
const deriveDefaultKey = (index: number): string =>
  ethers.HDNodeWallet.fromMnemonic(
    DEFAULT_MNEMONIC,
    `m/44'/60'/0'/0/${index}`
  ).privateKey;
const DEFAULT_KEYS = Array.from({ length: 10 }, (_, index) =>
  deriveDefaultKey(index)
);

const AGIALPHA_CONFIG = JSON.parse(
  fs.readFileSync(path.join('config', 'agialpha.json'), 'utf8')
);

const DEFAULT_SPEC_PATH = path.join(
  'demo',
  'aurora',
  'config',
  'aurora.spec@v2.json'
);
const SPEC_PATH = process.env.AURORA_SPEC_PATH
  ? path.resolve(process.env.AURORA_SPEC_PATH)
  : DEFAULT_SPEC_PATH;
const DEFAULT_THERMOSTAT_CONFIG_PATH = path.join(
  'demo',
  'aurora',
  'config',
  'aurora.thermostat@v2.json'
);
const THERMOSTAT_CONFIG_PATH = process.env.AURORA_THERMOSTAT_CONFIG
  ? path.resolve(process.env.AURORA_THERMOSTAT_CONFIG)
  : DEFAULT_THERMOSTAT_CONFIG_PATH;
const MISSION_CONFIG_PATH = process.env.AURORA_MISSION_CONFIG
  ? path.resolve(process.env.AURORA_MISSION_CONFIG)
  : '';
let REPORT_SCOPE = process.env.AURORA_REPORT_SCOPE || 'aurora';

type MissionJob = {
  name: string;
  specPath?: string;
  resultURI?: string;
  agentSubdomain?: string;
  reward?: string;
  workerStake?: string;
  validatorStake?: string;
  deadlineOffsetSec?: number;
  metadata?: Record<string, unknown>;
  notes?: string;
};

function resolveReportNamespace(): string {
  const raw = process.env.AURORA_REPORT_NAMESPACE?.trim();
  if (!raw) return 'aurora';
  if (!/^[A-Za-z0-9_.-]+$/.test(raw)) {
    throw new Error(
      `Invalid AURORA_REPORT_NAMESPACE value: ${raw}. Allowed: alphanumeric, '-', '_', '.'`
    );
  }
  if (raw === '.' || raw === '..') {
    throw new Error('AURORA_REPORT_NAMESPACE cannot be a relative path token.');
  }
  return raw;
}

function resolveMissionSegments(): string[] {
  const raw = process.env.AURORA_MISSION_LABEL?.trim();
  if (!raw) return [];
  const segments = raw.split(/[\\/]+/).filter((segment) => segment.length > 0);
  if (segments.length === 0) return [];
  for (const segment of segments) {
    if (!/^[A-Za-z0-9_.-]+$/.test(segment)) {
      throw new Error(
        `Invalid mission label segment "${segment}". Allowed characters: alphanumeric, '-', '_', '.'`
      );
    }
    if (segment === '.' || segment === '..') {
      throw new Error('Mission label segments cannot be relative path tokens.');
    }
  }
  return segments;
}

function resolveSpecPath(): string {
  if (process.env.AURORA_SPEC_PATH) {
    return path.resolve(process.env.AURORA_SPEC_PATH);
  }
  return path.resolve(DEFAULT_SPEC_PATH);
}

function resolveThermostatConfigPath(): string | null {
  if (process.env.AURORA_THERMOSTAT_CONFIG_PATH) {
    return path.resolve(process.env.AURORA_THERMOSTAT_CONFIG_PATH);
  }
  const fallback = path.resolve(DEFAULT_THERMOSTAT_CONFIG_PATH);
  return fs.existsSync(fallback) ? fallback : null;
}

type ThermostatConfig = {
  systemTemperature?: string | number;
  temperatureBounds?: { min: string | number; max: string | number };
  integralBounds?: { min: string | number; max: string | number };
  pid?: { kp: string | number; ki: string | number; kd: string | number };
  kpiWeights?: {
    emission: string | number;
    backlog: string | number;
    sla: string | number;
  };
  roleTemperatures?: Record<string, string | number>;
  unsetRoleTemperatures?: string[];
};

type MissionConfig = {
  version?: string;
  scope?: string;
  jobs: MissionJob[];
  description?: string;
};

const THERMOSTAT_ROLE_ALIAS: Record<string, number> = {
  agent: 0,
  validator: 1,
  operator: 2,
  employer: 3,
};

function parseNetworkArg(): string {
  const idx = process.argv.indexOf('--network');
  if (idx !== -1 && process.argv[idx + 1]) {
    return process.argv[idx + 1];
  }
  if (process.env.NETWORK) {
    return process.env.NETWORK;
  }
  return 'localhost';
}

function readJsonFile<T>(filePath: string): T {
  const absolute = path.resolve(filePath);
  if (!fs.existsSync(absolute)) {
    throw new Error(`Required file not found: ${absolute}`);
  }
  try {
    return JSON.parse(fs.readFileSync(absolute, 'utf8')) as T;
  } catch (err) {
    throw new Error(
      `Unable to parse JSON at ${absolute}: ${(err as Error).message}`
    );
  }
}

function slugify(value: string, fallback: string): string {
  const base = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '');
  return base || fallback;
}

function resolveReportBaseDir(net: string): string {
  const namespace = resolveReportNamespace();
  const missionSegments = resolveMissionSegments();
  const parts = ['reports', net, namespace, ...missionSegments];
  return path.join(...parts);
}

function writeReceipt(net: string, name: string, data: unknown) {
  const baseDir = resolveReportBaseDir(net);
  const dir = path.join(baseDir, 'receipts');
  fs.mkdirSync(dir, { recursive: true });
  const receiptPath = path.join(dir, name);
  fs.mkdirSync(path.dirname(receiptPath), { recursive: true });
  fs.writeFileSync(receiptPath, JSON.stringify(data, null, 2));
  const primaryPath = path.join(dir, name);
  fs.mkdirSync(path.dirname(primaryPath), { recursive: true });
  fs.writeFileSync(primaryPath, JSON.stringify(data, null, 2));
  const legacyDir = path.join('reports', net, REPORT_SCOPE, 'receipts');
  const outputPath = path.join(legacyDir, name);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(data, null, 2));
}

function resolveDeploySummaryPath(net: string): string {
  const envPath = process.env.AURORA_DEPLOY_OUTPUT
    ? path.resolve(process.env.AURORA_DEPLOY_OUTPUT)
    : null;
  if (envPath && fs.existsSync(envPath)) {
    return envPath;
  }

  const namespace = resolveReportNamespace();
  const reportPath = path.resolve('reports', net, namespace, 'receipts', 'deploy.json');
  if (fs.existsSync(reportPath)) {
    return reportPath;
  }

  const latestDeploymentPath = path.resolve(
    'deployment-config',
    'latest-deployment.json'
  );
  if (fs.existsSync(latestDeploymentPath)) {
    return latestDeploymentPath;
  }

  return envPath ?? reportPath;
  const candidateFromEnv = process.env.AURORA_DEPLOY_OUTPUT
    ? path.resolve(process.env.AURORA_DEPLOY_OUTPUT)
    : null;
  const namespace = resolveReportNamespace();
  const defaultReportPath = path.resolve(
    'reports',
    net,
    namespace,
    'receipts',
    'deploy.json'
  );
  const fallbackDeploymentPath = path.resolve(
    'deployment-config',
    'latest-deployment.json'
  );

  const preferredPaths = [candidateFromEnv, defaultReportPath].filter(
    (p): p is string => Boolean(p)
  );

  for (const candidate of preferredPaths) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  if (fs.existsSync(fallbackDeploymentPath)) {
    console.warn(
      `⚠️  Deploy summary not found at preferred locations. Falling back to ${fallbackDeploymentPath}.`
    );
    return fallbackDeploymentPath;
  }

  throw new Error(
    `Required file not found: ${candidateFromEnv || defaultReportPath}`
  );
}

function specAmountToWei(
  amount: string | undefined,
  decimals: number
): bigint {
  if (!amount) return 0n;
  const cleaned = amount.trim();
  if (!cleaned) return 0n;
  const base = BigInt(cleaned);
  if (decimals <= 6) {
    const scale = BigInt(10) ** BigInt(decimals);
    return base * scale;
  }
  const scale = BigInt(10) ** BigInt(decimals - 6);
  return base * scale;
}

function formatUnits(value: bigint, decimals: number): string {
  return ethers.formatUnits(value, decimals);
}

function parseSigned(
  value: string | number | bigint,
  label: string
): bigint {
  if (typeof value === 'bigint') {
    return value;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error(`Invalid number for ${label}: ${value}`);
    }
    return BigInt(Math.trunc(value));
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new Error(`Missing value for ${label}`);
  }
  const negative = trimmed.startsWith('-');
  const digits = negative ? trimmed.slice(1) : trimmed;
  if (!/^\d+$/.test(digits)) {
    throw new Error(`Invalid integer for ${label}: ${value}`);
  }
  const parsed = BigInt(digits);
  return negative ? -parsed : parsed;
}

function normaliseArg(value: unknown): unknown {
  if (typeof value === 'bigint') {
    return value.toString();
  }
  if (Array.isArray(value)) {
    return value.map((item) => normaliseArg(item));
  }
  if (typeof value === 'object' && value !== null) {
    const entries = Object.entries(value as Record<string, unknown>).map(
      ([k, v]) => [k, normaliseArg(v)]
    );
    return Object.fromEntries(entries);
  }
  return value;
}

type AddressedSigner = ethers.Signer & { address: string };

function createNonceManagedSigner(
  provider: ethers.JsonRpcProvider,
  privateKey: string
): AddressedSigner {
  const wallet = new ethers.Wallet(privateKey, provider);
  const manager = new ethers.NonceManager(wallet);
  return Object.assign(manager, { address: wallet.address }) as AddressedSigner;
}

async function impersonateSigner(
  provider: ethers.JsonRpcProvider,
  address: string
): Promise<AddressedSigner> {
  const normalised = ethers.getAddress(address);
  const methods = ['hardhat_impersonateAccount', 'anvil_impersonateAccount'];
  let impersonated = false;
  for (const method of methods) {
    try {
      await provider.send(method, [normalised]);
      impersonated = true;
      break;
    } catch (err) {
      // Continue trying other RPC namespaces.
    }
  }
  if (!impersonated) {
    throw new Error(
      `Unable to impersonate required account ${normalised}. Provide a PRIVATE_KEY with control or enable impersonation.`
    );
  }
  let signer: ethers.Signer;
  try {
    signer = new ethers.JsonRpcSigner(provider, normalised);
  } catch (err) {
    throw new Error(
      `Provider cannot supply signer for ${normalised}: ${(err as Error).message}`
    );
  }
  const manager = new ethers.NonceManager(signer);
  return Object.assign(manager, { address: normalised }) as AddressedSigner;
}

async function stopImpersonating(
  provider: ethers.JsonRpcProvider,
  address: string
) {
  const normalised = ethers.getAddress(address);
  const methods = ['hardhat_stopImpersonatingAccount', 'anvil_stopImpersonatingAccount'];
  for (const method of methods) {
    try {
      await provider.send(method, [normalised]);
    } catch (err) {
      // Ignore errors so cleanup is best-effort.
    }
  }
}

async function ensureAgialpha(
  provider: ethers.JsonRpcProvider,
  owner: AddressedSigner
) {
  const tokenAddress = ethers.getAddress(AGIALPHA_CONFIG.address);
  const code = await provider.getCode(tokenAddress);
  const artifactPath = path.join(
    'artifacts',
    'contracts',
    'test',
    'AGIALPHAToken.sol',
    'AGIALPHAToken.json'
  );
  if (!fs.existsSync(artifactPath)) {
    throw new Error(
      'Missing AGIALPHAToken artifact. Run `npx hardhat compile` first.'
    );
  }
  const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8')) as {
    abi: any;
    deployedBytecode: string;
  };

  if (code === '0x') {
    const network = await provider.getNetwork();
    if (network.chainId !== 31337n) {
      throw new Error(
        `AGIALPHA token not deployed at ${tokenAddress} on chain ${network.chainId}`
      );
    }
    await provider.send('hardhat_setCode', [
      tokenAddress,
      artifact.deployedBytecode,
    ]);
    const ownerSlot = ethers.toBeHex(5, 32);
    const ownerValue = ethers.zeroPadValue(await owner.getAddress(), 32);
    await provider.send('hardhat_setStorageAt', [
      tokenAddress,
      ownerSlot,
      ownerValue,
    ]);
  }

  return new ethers.Contract(tokenAddress, artifact.abi, owner);
}

async function executeGovernanceCall(
  pause: ethers.Contract,
  target: string,
  iface: ethers.Interface,
  method: string,
  args: unknown[]
) {
  const data = iface.encodeFunctionData(method, args);
  const tx = await pause.executeGovernanceCall(target, data);
  const receipt = await tx.wait();
  return receipt?.hash || tx.hash;
}

function deriveCommitPlan(
  jobId: bigint,
  approve: boolean,
  validator: string,
  nonce: bigint,
  specHash: string,
  chainId: bigint,
  domainSeparator: string
) {
  const abi = ethers.AbiCoder.defaultAbiCoder();
  const burnTxHash = ethers.ZeroHash;
  const salt = ethers.hexlify(randomBytes(32));
  const outcomeHash = ethers.keccak256(
    abi.encode(
      ['uint256', 'bytes32', 'bool', 'bytes32'],
      [nonce, specHash, approve, burnTxHash]
    )
  );
  const commitHash = ethers.keccak256(
    abi.encode(
      ['uint256', 'bytes32', 'bytes32', 'address', 'uint256', 'bytes32'],
      [jobId, outcomeHash, salt, validator, chainId, domainSeparator]
    )
  );
  return { commitHash, salt, burnTxHash };
}

async function advanceTime(
  provider: ethers.JsonRpcProvider,
  seconds: number
): Promise<'none' | 'warp' | 'wait'> {
  const clamped = Math.max(0, Math.trunc(seconds));
  if (clamped <= 0) {
    return 'none';
  }
  try {
    await provider.send('evm_increaseTime', [clamped]);
    await provider.send('evm_mine', []);
    return 'warp';
  } catch (err) {
    await new Promise((resolve) => setTimeout(resolve, clamped * 1000));
    return 'wait';
  }
}

async function applyThermostatConfig(
  thermostat: ethers.Contract,
  thermostatInterface: ethers.Interface,
  recordCall: (
    targetName: string,
    targetAddress: string,
    iface: ethers.Interface,
    method: string,
    args: unknown[],
    options?: {
      notes?: string;
      before?: Record<string, string>;
      after?: Record<string, string>;
    }
  ) => Promise<string>,
  config: ThermostatConfig
): Promise<ThermostatUpdate[]> {
  const updates: ThermostatUpdate[] = [];
  const targetAddress = await thermostat.getAddress();

  const pushUpdate = (
    action: string,
    before: bigint,
    after: bigint,
    txHash: string,
    note?: string
  ) => {
    updates.push({
      action: note ? `${action} (${note})` : action,
      before: before.toString(),
      after: after.toString(),
      txHash,
    });
  };

  if (config.temperatureBounds) {
    const beforeMin = await thermostat.minTemp();
    const beforeMax = await thermostat.maxTemp();
    const min = parseSigned(
      config.temperatureBounds.min,
      'temperatureBounds.min'
    );
    const max = parseSigned(
      config.temperatureBounds.max,
      'temperatureBounds.max'
    );
    const txHash = await recordCall(
      'Thermostat',
      targetAddress,
      thermostatInterface,
      'setTemperatureBounds',
      [min, max],
      {
        notes: 'Adjust system temperature bounds',
        before: {
          min: beforeMin.toString(),
          max: beforeMax.toString(),
        },
        after: { min: min.toString(), max: max.toString() },
      }
    );
    const afterMin = await thermostat.minTemp();
    const afterMax = await thermostat.maxTemp();
    pushUpdate('setTemperatureBounds:min', beforeMin, afterMin, txHash);
    pushUpdate('setTemperatureBounds:max', beforeMax, afterMax, txHash);
  }

  if (config.integralBounds) {
    const beforeMin = await thermostat.integralMin();
    const beforeMax = await thermostat.integralMax();
    const min = parseSigned(config.integralBounds.min, 'integralBounds.min');
    const max = parseSigned(config.integralBounds.max, 'integralBounds.max');
    const txHash = await recordCall(
      'Thermostat',
      targetAddress,
      thermostatInterface,
      'setIntegralBounds',
      [min, max],
      {
        notes: 'Tune integral bounds for controller stability',
        before: {
          min: beforeMin.toString(),
          max: beforeMax.toString(),
        },
        after: { min: min.toString(), max: max.toString() },
      }
    );
    const afterMin = await thermostat.integralMin();
    const afterMax = await thermostat.integralMax();
    pushUpdate('setIntegralBounds:min', beforeMin, afterMin, txHash);
    pushUpdate('setIntegralBounds:max', beforeMax, afterMax, txHash);
  }
  if (config.pid) {
    const beforeKp = await thermostat.kp();
    const beforeKi = await thermostat.ki();
    const beforeKd = await thermostat.kd();
    const kp = parseSigned(config.pid.kp, 'pid.kp');
    const ki = parseSigned(config.pid.ki, 'pid.ki');
    const kd = parseSigned(config.pid.kd, 'pid.kd');
    const txHash = await recordCall(
      'Thermostat',
      targetAddress,
      thermostatInterface,
      'setPID',
      [kp, ki, kd],
      {
        notes: 'Update PID controller coefficients',
        before: {
          kp: beforeKp.toString(),
          ki: beforeKi.toString(),
          kd: beforeKd.toString(),
        },
        after: { kp: kp.toString(), ki: ki.toString(), kd: kd.toString() },
      }
    );
    const afterKp = await thermostat.kp();
    const afterKi = await thermostat.ki();
    const afterKd = await thermostat.kd();
    pushUpdate('setPID:kp', beforeKp, afterKp, txHash);
    pushUpdate('setPID:ki', beforeKi, afterKi, txHash);
    pushUpdate('setPID:kd', beforeKd, afterKd, txHash);
  }

  if (config.kpiWeights) {
    const beforeEmission = await thermostat.wEmission();
    const beforeBacklog = await thermostat.wBacklog();
    const beforeSla = await thermostat.wSla();
    const emission = parseSigned(
      config.kpiWeights.emission,
      'kpiWeights.emission'
    );
    const backlog = parseSigned(
      config.kpiWeights.backlog,
      'kpiWeights.backlog'
    );
    const sla = parseSigned(config.kpiWeights.sla, 'kpiWeights.sla');
    const txHash = await recordCall(
      'Thermostat',
      targetAddress,
      thermostatInterface,
      'setKPIWeights',
      [emission, backlog, sla],
      {
        notes: 'Rebalance KPI weights for economic planning',
        before: {
          emission: beforeEmission.toString(),
          backlog: beforeBacklog.toString(),
          sla: beforeSla.toString(),
        },
        after: {
          emission: emission.toString(),
          backlog: backlog.toString(),
          sla: sla.toString(),
        },
      }
    );
    const afterEmission = await thermostat.wEmission();
    const afterBacklog = await thermostat.wBacklog();
    const afterSla = await thermostat.wSla();
    pushUpdate('setKPIWeights:emission', beforeEmission, afterEmission, txHash);
    pushUpdate('setKPIWeights:backlog', beforeBacklog, afterBacklog, txHash);
    pushUpdate('setKPIWeights:sla', beforeSla, afterSla, txHash);
  }

  if (config.systemTemperature !== undefined) {
    const before = await thermostat.systemTemperature();
    const value = parseSigned(
      config.systemTemperature,
      'systemTemperature'
    );
    const txHash = await recordCall(
      'Thermostat',
      targetAddress,
      thermostatInterface,
      'setSystemTemperature',
      [value],
      {
        notes: 'Dial global temperature for agent incentives',
        before: { temperature: before.toString() },
        after: { temperature: value.toString() },
      }
    );
    const after = await thermostat.systemTemperature();
    pushUpdate('setSystemTemperature', before, after, txHash);
  }

  if (config.roleTemperatures) {
    for (const [roleLabel, temp] of Object.entries(config.roleTemperatures)) {
      const key = roleLabel.trim().toLowerCase();
      const roleId = THERMOSTAT_ROLE_ALIAS[key];
      if (roleId === undefined) {
        throw new Error(`Unknown thermostat role: ${roleLabel}`);
      }
      const before = await thermostat.getRoleTemperature(roleId);
      const value = parseSigned(temp, `roleTemperatures.${roleLabel}`);
      const txHash = await recordCall(
        'Thermostat',
        targetAddress,
        thermostatInterface,
        'setRoleTemperature',
        [roleId, value],
        {
          notes: `Set role temperature for ${roleLabel}`,
          before: { temperature: before.toString() },
          after: { temperature: value.toString() },
        }
      );
      const after = await thermostat.getRoleTemperature(roleId);
      pushUpdate(`setRoleTemperature:${roleLabel}`, before, after, txHash);
    }
  }

  if (config.unsetRoleTemperatures) {
    for (const roleLabel of config.unsetRoleTemperatures) {
      const key = roleLabel.trim().toLowerCase();
      if (!key) continue;
      const roleId = THERMOSTAT_ROLE_ALIAS[key];
      if (roleId === undefined) {
        throw new Error(`Unknown thermostat role: ${roleLabel}`);
      }
      const before = await thermostat.getRoleTemperature(roleId);
      const txHash = await recordCall(
        'Thermostat',
        targetAddress,
        thermostatInterface,
        'unsetRoleTemperature',
        [roleId],
        {
          notes: `Unset role temperature for ${roleLabel}`,
          before: { temperature: before.toString() },
          after: { temperature: '0' },
        }
      );
      const after = await thermostat.getRoleTemperature(roleId);
      pushUpdate(`unsetRoleTemperature:${roleLabel}`, before, after, txHash);
    }
  }

  return updates;
}

async function main() {
  const networkName = parseNetworkArg();
  const rpcUrl = process.env.RPC_URL || 'http://127.0.0.1:8545';
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const chain = await provider.getNetwork();
  const decimals = Number(AGIALPHA_CONFIG.decimals || 18);

  const governanceActions: GovernanceAction[] = [];

  const employerKey = process.env.PRIVATE_KEY || DEFAULT_KEYS[0];
  const workerKey = process.env.AURORA_WORKER_KEY || DEFAULT_KEYS[1];
  const envValidatorKeys = [
    process.env.AURORA_VALIDATOR1_KEY,
    process.env.AURORA_VALIDATOR2_KEY,
    process.env.AURORA_VALIDATOR3_KEY,
    process.env.AURORA_VALIDATOR4_KEY,
    process.env.AURORA_VALIDATOR5_KEY,
  ].filter((key): key is string => typeof key === 'string' && key.length > 0);

  const employer = createNonceManagedSigner(provider, employerKey);
  const worker = createNonceManagedSigner(provider, workerKey);

  const specPath = resolveSpecPath();
  const spec = readJsonFile<Spec>(specPath);
  if (!spec.validation || !spec.validation.k || !spec.validation.n) {
    throw new Error('Validation quorum (k-of-n) must be defined in the spec.');
  }
  const thermostatConfigPath = resolveThermostatConfigPath();
  const thermostatConfig =
    thermostatConfigPath !== null
      ? readJsonFile<ThermostatConfig>(thermostatConfigPath)
      : null;
  const validatorCount = spec.validation?.n ?? 0;
  const quorum = spec.validation?.k ?? 0;
    const thermostatConfigPath = resolveThermostatConfigPath();
    const thermostatConfig =
      thermostatConfigPath !== null
        ? readJsonFile<ThermostatConfig>(thermostatConfigPath)
        : null;
  const baseSpec = readJsonFile<Spec>(SPEC_PATH);
  const missionConfig =
    MISSION_CONFIG_PATH && fs.existsSync(MISSION_CONFIG_PATH)
      ? readJsonFile<MissionConfig>(MISSION_CONFIG_PATH)
      : null;
  if (missionConfig?.scope && !process.env.AURORA_REPORT_SCOPE) {
    REPORT_SCOPE = missionConfig.scope;
  }

  const missionJobs =
    missionConfig &&
    Array.isArray(missionConfig.jobs) &&
    missionConfig.jobs.length > 0
      ? missionConfig.jobs
      : [
          {
            name: baseSpec.name || 'AURORA-Flagship-Job',
            specPath: SPEC_PATH,
            resultURI: 'ipfs://aurora-demo-result',
            agentSubdomain: 'aurora-agent',
            reward: baseSpec.escrow?.amountPerItem,
            workerStake: baseSpec.stake?.worker,
            validatorStake: baseSpec.stake?.validator,
            deadlineOffsetSec: 3600,
          },
        ];

  const resolvedJobs = missionJobs.map((job, idx) => {
    const specPath = job.specPath ? path.resolve(job.specPath) : SPEC_PATH;
    const jobSpec = readJsonFile<Spec>(specPath);
    if (!jobSpec.validation || !jobSpec.validation.k || !jobSpec.validation.n) {
      throw new Error(
        `Validation quorum (k-of-n) must be defined in spec for mission job ${job.name}.`
      );
    }
    const rewardAmount =
      specAmountToWei(job.reward, decimals) ||
      specAmountToWei(jobSpec.escrow?.amountPerItem, decimals) ||
      ethers.parseUnits('5', decimals);
    const workerStakeAmount =
      specAmountToWei(job.workerStake, decimals) ||
      specAmountToWei(jobSpec.stake?.worker, decimals) ||
      ethers.parseUnits('20', decimals);
    const validatorStakeAmount =
      specAmountToWei(job.validatorStake, decimals) ||
      specAmountToWei(jobSpec.stake?.validator, decimals) ||
      ethers.parseUnits('50', decimals);
    const deadlineOffset = job.deadlineOffsetSec || 3600;
    const slug = slugify(job.name, `job-${idx + 1}`);
    return {
      name: job.name,
      slug,
      spec: jobSpec,
      specPath,
      rewardAmount,
      workerStakeAmount,
      validatorStakeAmount,
      resultUri: job.resultURI || `ipfs://aurora-demo-result-${slug}`,
      agentSubdomain: job.agentSubdomain || slug.replace(/[^a-z0-9]/g, ''),
      deadlineOffset,
      metadata: job.metadata || {},
      notes: job.notes,
    };
  });

  if (resolvedJobs.length === 0) {
    throw new Error('Mission must include at least one job.');
  }

  const maxValidatorsRequired = resolvedJobs.reduce(
    (acc, job) => Math.max(acc, job.spec.validation.n),
    validatorCount
  );
  const maxQuorumRequired = resolvedJobs.reduce(
    (acc, job) => Math.max(acc, job.spec.validation.k),
    quorum
  );

  const validatorKeys: string[] = [];
  const seenValidatorKeys = new Set<string>();
  const employerLower = employerKey.toLowerCase();
  const workerLower = workerKey.toLowerCase();
  const pushValidatorKey = (key: string) => {
    const lower = key.toLowerCase();
    if (
      lower === employerLower ||
      lower === workerLower ||
      seenValidatorKeys.has(lower)
    ) {
      return;
    }
    validatorKeys.push(key);
    seenValidatorKeys.add(lower);
  };

  for (const key of envValidatorKeys) {
    pushValidatorKey(key);
  }

  let defaultValidatorIndex = 2;
  while (validatorKeys.length < maxValidatorsRequired) {
    const candidate = deriveDefaultKey(defaultValidatorIndex);
    defaultValidatorIndex += 1;
    pushValidatorKey(candidate);
  }

  const validatorPoolKeys = validatorKeys.slice(0, maxValidatorsRequired);
  if (validatorPoolKeys.length < maxValidatorsRequired) {
    throw new Error(
      `Insufficient validator keys configured for the selected quorum. Require ${maxValidatorsRequired}, have ${
        validatorPoolKeys.length
      }.`
    );
  }
  const validatorPool = validatorPoolKeys.map((key) =>
    createNonceManagedSigner(provider, key)
  );
  const agentRole = 0;
  const validatorRole = 1;
  const platformRole = 2;

  const summaryPath = resolveDeploySummaryPath(networkName);
  const deploySummary = readJsonFile<DeploySummary>(summaryPath);
  if (!deploySummary.contracts) {
    throw new Error(`Deployment summary missing contracts map: ${summaryPath}`);
  }

  const addresses = deploySummary.contracts;
  const thermostatAddress = addresses.Thermostat;
  if (thermostatConfig && !thermostatAddress) {
    console.warn(
      '⚠️  Thermostat config provided but deployment summary lacks Thermostat address. Skipping thermostat adjustments.'
    );
  }

  const loadArtifact = (name: string) =>
    JSON.parse(
      fs.readFileSync(
        path.join(
          'artifacts',
          'contracts',
          'v2',
          `${name}.sol`,
          `${name}.json`
        ),
        'utf8'
      )
    );

  const jobRegistryArtifact = loadArtifact('JobRegistry');
  const stakeManagerArtifact = loadArtifact('StakeManager');
  const validationModuleArtifact = loadArtifact('ValidationModule');
  const identityRegistryArtifact = loadArtifact('IdentityRegistry');
  const systemPauseArtifact = loadArtifact('SystemPause');
  const taxPolicyArtifact = loadArtifact('TaxPolicy');
  const thermostatArtifact = thermostatAddress
    ? loadArtifact('Thermostat')
    : null;
  const taxPolicyArtifact = loadArtifact('TaxPolicy');

  const jobRegistry = new ethers.Contract(
    addresses.JobRegistry,
    jobRegistryArtifact.abi,
    employer
  );
  const stakeManager = new ethers.Contract(
    addresses.StakeManager,
    stakeManagerArtifact.abi,
    employer
  );
  const validationModule = new ethers.Contract(
    addresses.ValidationModule,
    validationModuleArtifact.abi,
    employer
  );
  const identityRegistry = new ethers.Contract(
    addresses.IdentityRegistry,
    identityRegistryArtifact.abi,
    employer
  );
  const systemPause = new ethers.Contract(
    addresses.SystemPause,
    systemPauseArtifact.abi,
    employer
  );
  const taxPolicy =
    addresses.TaxPolicy && addresses.TaxPolicy !== 'disabled'
      ? new ethers.Contract(addresses.TaxPolicy, taxPolicyArtifact.abi, employer)
      : null;
  const taxPolicy = new ethers.Contract(
    addresses.TaxPolicy,
    taxPolicyArtifact.abi,
    employer
  );
  const thermostat =
    thermostatArtifact && thermostatAddress
      ? new ethers.Contract(thermostatAddress, thermostatArtifact.abi, employer)
      : null;

  const recordForwardGovernanceCall = async (
    targetName: string,
    targetAddress: string,
    iface: ethers.Interface,
    method: string,
    args: unknown[],
    options?: {
      notes?: string;
      before?: Record<string, string>;
      after?: Record<string, string>;
    }
  ) => {
    const txHash = await executeGovernanceCall(
      systemPause,
      targetAddress,
      iface,
      method,
      args
    );
    governanceActions.push({
      target: targetName,
      method,
      txHash,
      type: 'forwarded',
      params: normaliseArg(args),
      notes: options?.notes,
      before: options?.before,
      after: options?.after,
    });
    return txHash;
  };

  const recordDirectGovernanceCall = async (
    targetName: string,
    method: string,
    action: () => Promise<ethers.ContractTransactionResponse>,
    notes?: string
  ) => {
    const tx = await action();
    const receipt = await tx.wait();
    const txHash = receipt?.hash || tx.hash;
    governanceActions.push({
      target: targetName,
      method,
      txHash,
      type: 'direct',
      notes,
    });
    return txHash;
  };

  if (taxPolicy) {
    const employerAddress = await employer.getAddress();
    const systemPauseAddress = addresses.SystemPause;
    const taxPolicyOwner = await taxPolicy.owner();

    if (taxPolicyOwner === employerAddress) {
      const employerDelegated = await taxPolicy.acknowledgerAllowed(
        employerAddress
      );
      if (!employerDelegated) {
        await recordDirectGovernanceCall(
          'TaxPolicy',
          'setAcknowledger',
          () => taxPolicy.setAcknowledger(employerAddress, true),
          'Permit employer key to acknowledge tax policy on behalf of governance executors'
        );
      }

      const systemPauseAcknowledged = await taxPolicy.hasAcknowledged(
        systemPauseAddress
      );
      if (!systemPauseAcknowledged) {
        await recordDirectGovernanceCall(
          'TaxPolicy',
          'acknowledgeFor',
          () => taxPolicy.acknowledgeFor(systemPauseAddress),
          'Record SystemPause acknowledgement so forwarded governance calls satisfy tax policy requirements'
        );
      }
    } else {
      console.warn(
        `⚠️  Tax policy owner ${taxPolicyOwner} differs from employer ${employerAddress}. Skipping acknowledgement delegation.`
      );
    }
  }

  const ensureAcknowledged = async (participant: ethers.Signer) => {
    if (!taxPolicy) {
      return;
    }
    const addr = await participant.getAddress();
    const alreadyAcknowledged = await taxPolicy.hasAcknowledged(addr);
    if (!alreadyAcknowledged) {
      await taxPolicy.connect(participant).acknowledge();
    }
  };

  const token = await ensureAgialpha(provider, employer);

  const ensureAcknowledged = async (participant: AddressedSigner) => {
    const acknowledged = await taxPolicy.hasAcknowledged(participant.address);
    if (!acknowledged) {
      const tx = await taxPolicy.connect(participant).acknowledge();
      await tx.wait();
    }
  };


  const baselineMint = ethers.parseUnits('1000', decimals);
  const totalReward = resolvedJobs.reduce(
    (acc, job) => acc + job.rewardAmount,
    0n
  );
  const maxReward = resolvedJobs.reduce(
    (acc, job) => (job.rewardAmount > acc ? job.rewardAmount : acc),
    0n
  );
  const maxWorkerStake = resolvedJobs.reduce(
    (acc, job) => (job.workerStakeAmount > acc ? job.workerStakeAmount : acc),
    0n
  );
  const maxValidatorStake = resolvedJobs.reduce(
    (acc, job) =>
      job.validatorStakeAmount > acc ? job.validatorStakeAmount : acc,
    0n
  );
  const workerStakeBudget = resolvedJobs.reduce(
    (acc, job) => acc + job.workerStakeAmount,
    0n
  );
  const validatorStakeBudget = resolvedJobs.reduce(
    (acc, job) => acc + job.validatorStakeAmount,
    0n
  );
  const computedMint = [
    baselineMint,
    totalReward + workerStakeBudget,
    workerStakeBudget + validatorStakeBudget,
    maxWorkerStake + maxValidatorStake,
  ].reduce((acc, value) => (value > acc ? value : acc));
  const mintAmount = computedMint;

  const participants = [employer, worker, ...validatorPool];
  for (const wallet of participants) {
    const bal = await token.balanceOf(wallet.address);
    if (bal < mintAmount) {
      const tx = await token.mint(wallet.address, mintAmount - bal);
      await tx.wait();
    }
    const allowance = await token.allowance(
      wallet.address,
      addresses.StakeManager
    );
    const requiredAllowance =
      wallet === employer ? mintAmount + totalReward : mintAmount;
    if (allowance < requiredAllowance) {
      const approveTx = await token
        .connect(wallet)
        .approve(addresses.StakeManager, ethers.MaxUint256);
      await approveTx.wait();
    }
  }

  await ensureAcknowledged(employer);
  await ensureAcknowledged(worker);
  for (const validator of validators) {
    await ensureAcknowledged(validator as AddressedSigner);
  }

  await recordDirectGovernanceCall(
    'SystemPause',
    'pauseAll',
    () => systemPause.pauseAll(),
    'Emergency drill: pause every core module'
  );
  await recordDirectGovernanceCall(
    'SystemPause',
    'unpauseAll',
    () => systemPause.unpauseAll(),
    'Resume operations after pause drill'
  );

  const originalAgentMinimum = await stakeManager.roleMinimumStake(agentRole);
  const originalValidatorMinimum = await stakeManager.roleMinimumStake(
    validatorRole
  );
  const originalPlatformMinimum = await stakeManager.roleMinimumStake(
    platformRole
  );
  const stakeMinimumBaseline = {
    agent: originalAgentMinimum,
    validator: originalValidatorMinimum,
    platform: originalPlatformMinimum,
  };

  const adjustedAgentMinimum =
    maxWorkerStake / 2n > 0n ? maxWorkerStake / 2n : 1n;
  const adjustedValidatorMinimum =
    maxValidatorStake / 2n > 0n ? maxValidatorStake / 2n : 1n;
  const adjustedPlatformMinimum =
    maxValidatorStake / 4n > 0n ? maxValidatorStake / 4n : 1n;
  const stakeMinimumAdjusted = {
    agent: adjustedAgentMinimum,
    validator: adjustedValidatorMinimum,
    platform: adjustedPlatformMinimum,
  };

  await recordForwardGovernanceCall(
    'StakeManager',
    addresses.StakeManager,
    stakeManager.interface,
    'setRoleMinimums',
    [adjustedAgentMinimum, adjustedValidatorMinimum, adjustedPlatformMinimum],
    {
      notes: 'Lower minimum stakes so demo identities can onboard quickly',
      before: {
        agent: formatUnits(stakeMinimumBaseline.agent, decimals),
        validator: formatUnits(stakeMinimumBaseline.validator, decimals),
        platform: formatUnits(stakeMinimumBaseline.platform, decimals),
      },
      after: {
        agent: formatUnits(stakeMinimumAdjusted.agent, decimals),
        validator: formatUnits(stakeMinimumAdjusted.validator, decimals),
        platform: formatUnits(stakeMinimumAdjusted.platform, decimals),
      },
    }
  );

  const originalJobStake = await jobRegistry.jobStake();
  const fallbackJobStake = maxReward / 10n > 0n ? maxReward / 10n : 1n;
  const missionJobStake =
    maxWorkerStake > 0n
      ? maxWorkerStake
      : originalJobStake === 0n
        ? fallbackJobStake
        : originalJobStake;

  if (originalJobStake !== missionJobStake) {
    await recordForwardGovernanceCall(
      'JobRegistry',
      addresses.JobRegistry,
      jobRegistry.interface,
      'setJobStake',
      [missionJobStake],
      {
        notes: 'Align agent job stake requirements with the mission parameters',
        before: { stake: formatUnits(originalJobStake, decimals) },
        after: { stake: formatUnits(missionJobStake, decimals) },
      }
    );
  }

  let currentJobStakeSetting = missionJobStake;

  const originalMinAgentStake = await jobRegistry.minAgentStake();
  if (originalMinAgentStake !== maxWorkerStake) {
    await recordForwardGovernanceCall(
      'JobRegistry',
      addresses.JobRegistry,
      jobRegistry.interface,
      'setMinAgentStake',
      [maxWorkerStake],
      {
        notes: 'Align minimum agent stake with the mission requirements',
        before: { stake: formatUnits(originalMinAgentStake, decimals) },
        after: { stake: formatUnits(maxWorkerStake, decimals) },
      }
    );
  }
  await recordForwardGovernanceCall(
    'JobRegistry',
    addresses.JobRegistry,
    jobRegistry.interface,
    'setAcknowledger',
    [addresses.StakeManager, true],
    {
      notes: 'Allow StakeManager to acknowledge tax policy on behalf of participants',
    }
  );
  const stakeManagerAcknowledger = await jobRegistry.acknowledgers(
    addresses.StakeManager
  );
  if (!stakeManagerAcknowledger) {
    throw new Error('StakeManager is not registered as a tax acknowledger.');
  }

  let identityCleanup: (() => Promise<void>) | null = null;
  try {
    const identityOwnerAddress = await identityRegistry.owner();
    const normalisedIdentityOwner = identityOwnerAddress
      ? identityOwnerAddress.toLowerCase()
      : ethers.ZeroAddress;
    let identityOwnerSigner: AddressedSigner = employer;
      if (normalisedIdentityOwner !== employer.address.toLowerCase()) {
        const ownerCode = await provider.getCode(identityOwnerAddress);
        if (ownerCode !== '0x') {
          console.warn(
            `⚠️  Identity owner ${identityOwnerAddress} is a contract. Impersonating for demo overrides.`
          );
        }
        identityOwnerSigner = await impersonateSigner(provider, identityOwnerAddress);
    if (normalisedIdentityOwner !== employer.address.toLowerCase()) {
      const ownerCode = await provider.getCode(identityOwnerAddress);
      if (ownerCode !== '0x') {
        console.warn(
          `⚠️  Identity owner ${identityOwnerAddress} is a contract. Impersonating for manual allowlist updates.`
        );
      }
      identityOwnerSigner = await impersonateSigner(provider, identityOwnerAddress);
      const balance = await provider.getBalance(identityOwnerAddress);
      const minimumBalance = ethers.parseEther('0.1');
        if (balance < minimumBalance) {
          await provider.send('hardhat_setBalance', [
            identityOwnerAddress,
            ethers.toBeHex(minimumBalance),
          ]);
        }
      identityCleanup = () => stopImpersonating(provider, identityOwnerAddress);
    }

    const identityWithOwner = identityRegistry.connect(identityOwnerSigner);
    await recordDirectGovernanceCall(
      'IdentityRegistry',
      'addAdditionalAgent',
      () => identityWithOwner.addAdditionalAgent(worker.address),
      'Allow flagship worker to onboard without ENS proof'
    );
    for (const validator of validatorPool) {
      await recordDirectGovernanceCall(
        'IdentityRegistry',
        'addAdditionalValidator',
        () => identityWithOwner.addAdditionalValidator(validator.address),
        'Whitelist validator for flagship mission quorum'
      );
    }
    } catch (err) {
      console.warn(
        '⚠️  Unable to apply identity overrides automatically:',
        (err as Error).message
      );
      if (addresses.IdentityRegistry) {
        await recordForwardGovernanceCall(
          'JobRegistry',
          addresses.JobRegistry,
          jobRegistry.interface,
          'setIdentityRegistry',
          [ethers.ZeroAddress],
          {
            notes:
              'Temporarily disable identity verification when impersonating identity owner is not possible',
          }
        );
        identityCleanup = async () => {
          await recordForwardGovernanceCall(
            'JobRegistry',
            addresses.JobRegistry,
            jobRegistry.interface,
            'setIdentityRegistry',
            [addresses.IdentityRegistry],
            {
              notes: 'Restore identity registry after completing the demo mission',
            }
          );
        };
      }
    } finally {
      if (identityCleanup) {
        await identityCleanup();
      }
    }

  const validationInterface = new ethers.Interface(
    validationModuleArtifact.abi
  );
  const thermostatInterface = thermostatArtifact
    ? new ethers.Interface(thermostatArtifact.abi)
    : null;
  const currentValidationModule = await stakeManager.validationModule();
  if (currentValidationModule.toLowerCase() !== addresses.ValidationModule.toLowerCase()) {
    await recordForwardGovernanceCall(
      'StakeManager',
      addresses.StakeManager,
      stakeManager.interface,
      'setValidationModule',
      [addresses.ValidationModule],
      { notes: 'Wire the validator stake locker to the active validation module' }
    );
  }
  const validatorsPerJobCount = Math.max(3, maxValidatorsRequired);
  const minValidatorsBound = Math.max(3, maxQuorumRequired);
  const maxValidatorsBound = Math.max(minValidatorsBound, validatorsPerJobCount);

  await recordForwardGovernanceCall(
    'ValidationModule',
    addresses.ValidationModule,
    validationInterface,
    'setValidatorPool',
    [validatorPool.map((v) => v.address)],
    { notes: 'Populate validator committee pool for demo mission' }
  );
  await recordForwardGovernanceCall(
    'ValidationModule',
    addresses.ValidationModule,
    validationInterface,
    'setValidatorBounds',
    [minValidatorsBound, maxValidatorsBound],
    {
      notes: `Require at least ${minValidatorsBound} validators from a pool cap of ${maxValidatorsBound}`,
      before: { quorum: quorum.toString(), pool: validatorCount.toString() },
      after: { min: minValidatorsBound.toString(), max: maxValidatorsBound.toString() },
    }
  );
  await recordForwardGovernanceCall(
    'ValidationModule',
    addresses.ValidationModule,
    validationInterface,
    'setValidatorsPerJob',
    [validatorsPerJobCount],
    {
      notes: `Assign ${validatorsPerJobCount} validators to each flagship job`,
      before: { requested: validatorCount.toString() },
    }
  );
  await recordForwardGovernanceCall(
    'ValidationModule',
    addresses.ValidationModule,
    validationInterface,
    'setRequiredValidatorApprovals',
    [maxQuorumRequired],
    { notes: 'Set quorum for validation success' }
  );

  const previousCommitWindow = await validationModule.commitWindow();
  const newCommitWindow = 30n;
  await recordForwardGovernanceCall(
    'ValidationModule',
    addresses.ValidationModule,
    validationInterface,
    'setCommitWindow',
    [newCommitWindow],
    {
      notes: 'Tighten commit window to 30 seconds for rapid demo cadence',
      before: { commitWindow: previousCommitWindow.toString() },
      after: { commitWindow: newCommitWindow.toString() },
    }
  );
  const previousRevealWindow = await validationModule.revealWindow();
  const newRevealWindow = 300n;
  await recordForwardGovernanceCall(
    'ValidationModule',
    addresses.ValidationModule,
    validationInterface,
    'setRevealWindow',
    [newRevealWindow],
    {
      notes: 'Match reveal horizon to five minutes',
      before: { revealWindow: previousRevealWindow.toString() },
      after: { revealWindow: newRevealWindow.toString() },
    }
  );

    await ensureAcknowledged(employer);

    const stakeEntries: Array<{
      role: string;
      address: string;
      amount: string;
      txHash: string;
    }> = [];

    await ensureAcknowledged(worker);
    const workerStakeTx = await stakeManager
      .connect(worker)
      .depositStake(agentRole, workerStakeBudget);
    const workerStakeReceipt = await workerStakeTx.wait();
    const workerStakeTx = await stakeManager
      .connect(worker)
      .depositStake(agentRole, maxWorkerStake);
  const workerStakeReceipt = await workerStakeTx.wait();
  stakeEntries.push({
    role: 'agent',
    address: worker.address,
    amount: formatUnits(maxWorkerStake, decimals),
    txHash: workerStakeReceipt?.hash || workerStakeTx.hash,
  });

  for (const validator of validators) {
      const stakeTx = await stakeManager
        .connect(validator)
        .depositStake(validatorRole, maxValidatorStake);
    const receipt = await stakeTx.wait();
    stakeEntries.push({
      role: 'agent',
      address: worker.address,
      amount: formatUnits(workerStakeBudget, decimals),
      txHash: workerStakeReceipt?.hash || workerStakeTx.hash,
    });

    for (const validator of validatorPool) {
      await ensureAcknowledged(validator);
      const stakeTx = await stakeManager
        .connect(validator)
        .depositStake(validatorRole, validatorStakeBudget);
      const receipt = await stakeTx.wait();
      stakeEntries.push({
        role: 'validator',
        address: validator.address,
        amount: formatUnits(validatorStakeBudget, decimals),
        txHash: receipt?.hash || stakeTx.hash,
      });
    }

  writeReceipt(networkName, 'stake.json', { entries: stakeEntries });

  const trackAddresses = Array.from(
    new Set([
      employer.address,
      worker.address,
      ...validatorPool.map((v) => v.address),
    ])
  );

  const missionRecords: Array<{
    name: string;
    slug: string;
    jobId: string;
    reward: string;
    deadline: string;
    resultURI: string;
    txHash: string;
    receipts: Record<string, string>;
    metadata?: Record<string, unknown>;
    notes?: string;
  }> = [];

  const legacySingleJob = resolvedJobs.length === 1;

  for (const job of resolvedJobs) {
    const jobDir = path.join('jobs', job.slug);
    const sortedKeys = Object.keys(job.spec).sort();
    const specHash = ethers.keccak256(
      ethers.toUtf8Bytes(JSON.stringify(job.spec, sortedKeys))
    );
    const specUri =
      job.spec.acceptanceCriteriaURI ||
      job.spec.acceptanceCriteriaUri ||
      process.env.AURORA_SPEC_URI ||
      'ipfs://aurora-demo-spec';
    const deadline = BigInt(Math.floor(Date.now() / 1000) + job.deadlineOffset);
    const jobValidatorCount = job.spec.validation.n;
    const jobQuorum = job.spec.validation.k;
    const jobValidators = validatorPool.slice(0, jobValidatorCount);
    if (jobValidators.length < jobValidatorCount) {
      throw new Error(
        `Mission job ${job.slug} requires ${jobValidatorCount} validators but only ${jobValidators.length} are configured.`
      );
    }
    if (currentJobStakeSetting !== job.workerStakeAmount) {
      await recordForwardGovernanceCall(
        'JobRegistry',
        addresses.JobRegistry,
        jobRegistry.interface,
        'setJobStake',
        [job.workerStakeAmount],
        {
          notes: `Set job stake to match worker requirement for ${job.slug}`,
          before: { stake: formatUnits(currentJobStakeSetting, decimals) },
          after: { stake: formatUnits(job.workerStakeAmount, decimals) },
        }
      );
      currentJobStakeSetting = job.workerStakeAmount;
    }

    const postTx = await jobRegistry
      .connect(employer)
      .createJob(job.rewardAmount, Number(deadline), specHash, specUri);
    const postReceipt = await postTx.wait();
    let jobId = 0n;
    if (postReceipt && postReceipt.logs) {
      for (const log of postReceipt.logs) {
        try {
          const parsed = jobRegistry.interface.parseLog(log);
          if (parsed.name === 'JobCreated') {
            jobId = parsed.args.jobId as bigint;
            break;
          }
        } catch {
          continue;
        }
      }
    }
    if (jobId === 0n) {
      jobId = 1n;
    }

    const postRecord = {
      jobId: jobId.toString(),
      txHash: postReceipt?.hash || postTx.hash,
      reward: formatUnits(job.rewardAmount, decimals),
      deadline: deadline.toString(),
      specHash,
      specPath: job.specPath,
      metadata: job.metadata,
    };
    writeReceipt(networkName, path.join(jobDir, 'post.json'), postRecord);
    if (legacySingleJob) {
      writeReceipt(networkName, 'postJob.json', postRecord);
    }

      await ensureAcknowledged(worker);
      const applyTx = await jobRegistry
        .connect(worker)
        .applyForJob(jobId, job.agentSubdomain, []);
    const applyTx = await jobRegistry
      .connect(worker)
      .applyForJob(jobId, job.agentSubdomain, []);
    await applyTx.wait();

    const resultHash = ethers.keccak256(ethers.toUtf8Bytes(job.resultUri));
    const submitTx = await jobRegistry
      .connect(worker)
      .submit(jobId, resultHash, job.resultUri, job.agentSubdomain, []);
    const submitReceipt = await submitTx.wait();

    const submitRecord = {
      worker: worker.address,
      txHash: submitReceipt?.hash || submitTx.hash,
      resultURI: job.resultUri,
      resultHash,
      metadata: job.metadata,
    };
    writeReceipt(networkName, path.join(jobDir, 'submit.json'), submitRecord);
    if (legacySingleJob) {
      writeReceipt(networkName, 'submit.json', submitRecord);
    }

    const currentValidatorsPerJob = await validationModule.validatorsPerJob();
    if (currentValidatorsPerJob !== BigInt(jobValidatorCount)) {
      await recordForwardGovernanceCall(
        'ValidationModule',
        addresses.ValidationModule,
        validationInterface,
        'setValidatorsPerJob',
        [jobValidatorCount],
        {
          notes: `Set validators per job to ${jobValidatorCount} for ${job.slug}`,
        }
      );
    }

    const currentRequiredApprovals =
      await validationModule.requiredValidatorApprovals();
    if (currentRequiredApprovals !== BigInt(jobQuorum)) {
      await recordForwardGovernanceCall(
        'ValidationModule',
        addresses.ValidationModule,
        validationInterface,
        'setRequiredValidatorApprovals',
        [jobQuorum],
        {
          notes: `Set validator quorum to ${jobQuorum} for ${job.slug}`,
        }
      );
    }

    const selectionEntropy = BigInt(ethers.hexlify(randomBytes(32)));
    const selectionContributors: AddressedSigner[] = [
      employer,
      ...jobValidators,
    ];
    const selectionTx = await validationModule
      .connect(selectionContributors[0])
      .selectValidators(jobId, selectionEntropy);
    const selectionReceipt = await selectionTx.wait();

    let roundInfo = await validationModule.rounds(jobId);
    for (let i = 1; i < selectionContributors.length; i += 1) {
      if (roundInfo.commitDeadline !== 0n) {
        break;
      }
      const contributor = selectionContributors[i];
      const entropyContribution = selectionEntropy + BigInt(i);
      const contributionTx = await validationModule
        .connect(contributor)
        .selectValidators(jobId, entropyContribution);
      await contributionTx.wait();
      roundInfo = await validationModule.rounds(jobId);
    }

    let selectionFinalizeHash: string | null = null;
    if (roundInfo.commitDeadline === 0n) {
      let targetBlock = await validationModule.selectionBlock(jobId);
      let currentBlock = BigInt(await provider.getBlockNumber());
      while (currentBlock <= targetBlock) {
        await provider.send('evm_mine', []);
        currentBlock = BigInt(await provider.getBlockNumber());
      }

      const finalizeSelectionTx = await validationModule
        .connect(selectionContributors[0])
        .selectValidators(jobId, selectionEntropy);
      const finalizeSelectionReceipt = await finalizeSelectionTx.wait();
      selectionFinalizeHash =
        finalizeSelectionReceipt?.hash || finalizeSelectionTx.hash;
      roundInfo = await validationModule.rounds(jobId);
    }
    if (roundInfo.commitDeadline === 0n) {
      throw new Error('Validator selection did not finalize commit window.');
    }

    const committeeAddresses = await validationModule.validators(jobId);
    if (committeeAddresses.length !== jobValidatorCount) {
      console.warn(
        `⚠️  Validator committee size ${committeeAddresses.length} differs from expected ${jobValidatorCount} for ${job.slug}.`
      );
    }
    const selectedValidators = committeeAddresses.map((addr) => {
      const lower = addr.toLowerCase();
      const signer = validatorPool.find(
        (candidate) => candidate.address.toLowerCase() === lower
      );
      if (!signer) {
        throw new Error(
          `Validator ${addr} selected on-chain is not available in the local keyring.`
        );
      }
      return signer;
    });

    const nonce = (await validationModule.jobNonce(jobId)).valueOf() as bigint;
    const specHashOnChain = await jobRegistry.getSpecHash(jobId);
    const domainSeparator = await validationModule.DOMAIN_SEPARATOR();
    const validatorSubdomain =
      process.env.AURORA_VALIDATOR_SUBDOMAIN || 'aurora-validator';

    const commitPlans: Array<{
      address: string;
      commitHash: string;
      burnTxHash: string;
      salt: string;
      commitTx: string;
      revealTx?: string;
    }> = [];

    for (const validator of selectedValidators) {
      const plan = deriveCommitPlan(
        jobId,
        true,
        validator.address,
        nonce,
        specHashOnChain,
        chain.chainId,
        domainSeparator
      );
      const commitTx = await validationModule
        .connect(validator)
        .commitValidation(jobId, plan.commitHash, validatorSubdomain, []);
      const commitReceipt = await commitTx.wait();
      commitPlans.push({
        address: validator.address,
        commitHash: plan.commitHash,
        burnTxHash: plan.burnTxHash,
        salt: plan.salt,
        commitTx: commitReceipt?.hash || commitTx.hash,
      });
    }

    const commitWindowSeconds = Number(await validationModule.commitWindow());
    await advanceTime(provider, commitWindowSeconds + 1);

    for (let i = 0; i < selectedValidators.length; i++) {
      const validator = selectedValidators[i];
      const plan = commitPlans[i];
      const revealTx = await validationModule
        .connect(validator)
        .revealValidation(
          jobId,
          true,
          plan.burnTxHash,
          plan.salt,
          validatorSubdomain,
          []
        );
      const revealReceipt = await revealTx.wait();
      commitPlans[i].revealTx = revealReceipt?.hash || revealTx.hash;
    }

    const balancesBefore = new Map<string, bigint>();
    for (const addr of trackAddresses) {
      balancesBefore.set(addr, await token.balanceOf(addr));
    }

    const finalizeTx = await validationModule
      .connect(selectedValidators[0])
      .finalize(jobId);
    const finalizeReceipt = await finalizeTx.wait();

    const commitRecords = commitPlans.map((plan) => ({
      address: plan.address,
      commitTx: plan.commitTx,
      revealTx: plan.revealTx || '',
      commitHash: plan.commitHash,
      salt: plan.salt,
    }));

    const validateRecord = {
      jobId: jobId.toString(),
      selection: {
        initialTx: selectionReceipt?.hash || selectionTx.hash,
        finalizeTx: selectionFinalizeHash,
        commitDeadline: roundInfo.commitDeadline.toString(),
        revealDeadline: roundInfo.revealDeadline.toString(),
      },
      validators: commitRecords,
      commits: commitRecords.length,
      reveals: commitRecords.filter((record) => record.revealTx).length,
    };
    writeReceipt(networkName, path.join(jobDir, 'validate.json'), validateRecord);
    if (legacySingleJob) {
      writeReceipt(networkName, 'validate.json', validateRecord);
    }

    const payouts: Record<string, { before: string; after: string; delta: string }> = {};
    for (const addr of trackAddresses) {
      const before = balancesBefore.get(addr) || 0n;
      const after = await token.balanceOf(addr);
      payouts[addr] = {
        before: formatUnits(before, decimals),
        after: formatUnits(after, decimals),
        delta: formatUnits(after - before, decimals),
      };
    }

    const finalizeRecord = {
      txHash: finalizeReceipt?.hash || finalizeTx.hash,
      payouts,
    };
    writeReceipt(networkName, path.join(jobDir, 'finalize.json'), finalizeRecord);
    if (legacySingleJob) {
      writeReceipt(networkName, 'finalize.json', finalizeRecord);
    }

    missionRecords.push({
      name: job.name,
      slug: job.slug,
      jobId: jobId.toString(),
      reward: formatUnits(job.rewardAmount, decimals),
      deadline: deadline.toString(),
      resultURI: job.resultUri,
      txHash: postReceipt?.hash || postTx.hash,
      receipts: {
        post: path.join(jobDir, 'post.json'),
        submit: path.join(jobDir, 'submit.json'),
        validate: path.join(jobDir, 'validate.json'),
        finalize: path.join(jobDir, 'finalize.json'),
      },
      metadata: job.metadata,
      notes: job.notes,
    });

    console.log(
      `🛰️  Finalized mission job ${job.slug} (jobId ${jobId.toString()})`
    );
  }

  writeReceipt(networkName, 'mission.json', {
    scope: REPORT_SCOPE,
    version: missionConfig?.version || '1.0',
    description: missionConfig?.description,
    jobs: missionRecords,
  });

  let thermostatUpdates: ThermostatUpdate[] = [];
  if (thermostatConfig && thermostat && thermostatInterface) {
      thermostatUpdates = await applyThermostatConfig(
        thermostat,
        thermostatInterface,
        recordForwardGovernanceCall,
        thermostatConfig
      );
    }
    writeReceipt(networkName, 'mission.json', {
      scope: REPORT_SCOPE,
      version: missionConfig?.version || '1.0',
      description: missionConfig?.description,
      jobs: missionRecords,
    });

    let thermostatUpdates: ThermostatUpdate[] = [];
    if (thermostatConfig && thermostat && thermostatInterface) {
      thermostatUpdates = await applyThermostatConfig(
        thermostat,
        thermostatInterface,
        recordForwardGovernanceCall,
        thermostatConfig
      );
    }

  await recordForwardGovernanceCall(
    'JobRegistry',
    addresses.JobRegistry,
    jobRegistry.interface,
    'setJobStake',
    [originalJobStake],
    {
      notes: 'Return job stake policy to its baseline value',
      before: { stake: formatUnits(currentJobStakeSetting, decimals) },
      after: { stake: formatUnits(originalJobStake, decimals) },
    }
  );
    await recordForwardGovernanceCall(
      'StakeManager',
      addresses.StakeManager,
      stakeManager.interface,
      'setRoleMinimums',
      [
        stakeMinimumBaseline.agent,
        stakeMinimumBaseline.validator,
        stakeMinimumBaseline.platform,
      ],
      {
        notes: 'Restore production minimum stake thresholds',
        before: {
          agent: formatUnits(stakeMinimumAdjusted.agent, decimals),
          validator: formatUnits(stakeMinimumAdjusted.validator, decimals),
          platform: formatUnits(stakeMinimumAdjusted.platform, decimals),
        },
        after: {
          agent: formatUnits(stakeMinimumBaseline.agent, decimals),
          validator: formatUnits(stakeMinimumBaseline.validator, decimals),
          platform: formatUnits(stakeMinimumBaseline.platform, decimals),
        },
      }
    );

    await recordForwardGovernanceCall(
      'JobRegistry',
      addresses.JobRegistry,
      jobRegistry.interface,
      'setJobStake',
      [originalJobStake],
      {
        notes: 'Return job stake policy to its baseline value',
        before: { stake: formatUnits(adjustedJobStake, decimals) },
        after: { stake: formatUnits(originalJobStake, decimals) },
      }
    );

    writeReceipt(networkName, 'governance.json', {
      actions: governanceActions,
      thermostat: thermostatUpdates,
    });

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
    console.log(
      `✅ AURORA demo completed. Jobs finalized: ${missionRecords.length}.`
    );
  }

  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
