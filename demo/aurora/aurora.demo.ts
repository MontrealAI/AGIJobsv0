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

const DEFAULT_KEYS = [
  '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
  '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
  '0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a',
  '0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6',
  '0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a',
];

const AGIALPHA_CONFIG = JSON.parse(
  fs.readFileSync(path.join('config', 'agialpha.json'), 'utf8')
);

const SPEC_PATH = path.join('demo', 'aurora', 'config', 'aurora.spec@v2.json');
const THERMOSTAT_CONFIG_PATH = path.join(
  'demo',
  'aurora',
  'config',
  'aurora.thermostat@v2.json'
);

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

function writeReceipt(net: string, name: string, data: unknown) {
  const dir = path.join('reports', net, 'aurora', 'receipts');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, name), JSON.stringify(data, null, 2));
}

function resolveDeploySummaryPath(net: string): string {
  if (process.env.AURORA_DEPLOY_OUTPUT) {
    return path.resolve(process.env.AURORA_DEPLOY_OUTPUT);
  }
  return path.resolve('reports', net, 'aurora', 'receipts', 'deploy.json');
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

async function ensureAgialpha(
  provider: ethers.JsonRpcProvider,
  owner: ethers.Wallet
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
  const validatorKeys = [
    process.env.AURORA_VALIDATOR1_KEY || DEFAULT_KEYS[2],
    process.env.AURORA_VALIDATOR2_KEY || DEFAULT_KEYS[3],
    process.env.AURORA_VALIDATOR3_KEY || DEFAULT_KEYS[4],
  ];

  const employer = new ethers.Wallet(employerKey, provider);
  const worker = new ethers.Wallet(workerKey, provider);
  const spec = readJsonFile<Spec>(SPEC_PATH);
  if (!spec.validation || !spec.validation.k || !spec.validation.n) {
    throw new Error('Validation quorum (k-of-n) must be defined in the spec.');
  }
  const thermostatConfig = fs.existsSync(THERMOSTAT_CONFIG_PATH)
    ? readJsonFile<ThermostatConfig>(THERMOSTAT_CONFIG_PATH)
    : null;
  const validatorCount = spec.validation.n;
  const quorum = spec.validation.k;
  const selectedValidatorKeys = validatorKeys.slice(0, validatorCount);
  if (selectedValidatorKeys.length < validatorCount) {
    throw new Error(
      'Insufficient validator keys configured for the selected quorum.'
    );
  }
  const validators = selectedValidatorKeys.map(
    (key) => new ethers.Wallet(key, provider)
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
    throw new Error('Thermostat address missing from deployment summary.');
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
  const thermostatArtifact = thermostatAddress
    ? loadArtifact('Thermostat')
    : null;

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
  const thermostat =
    thermostatAddress && thermostatArtifact
      ? new ethers.Contract(
          thermostatAddress,
          thermostatArtifact.abi,
          employer
        )
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

  const token = await ensureAgialpha(provider, employer);

  const mintAmount = ethers.parseUnits('1000', decimals);
  const rewardAmount =
    specAmountToWei(spec.escrow?.amountPerItem, decimals) ||
    ethers.parseUnits('5', decimals);
  const workerStakeAmount =
    specAmountToWei(spec.stake?.worker, decimals) ||
    ethers.parseUnits('20', decimals);
  const validatorStakeAmount =
    specAmountToWei(spec.stake?.validator, decimals) ||
    ethers.parseUnits('50', decimals);

  const participants = [employer, worker, ...validators];
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
      wallet.address.toLowerCase() === employer.address.toLowerCase()
        ? mintAmount + rewardAmount + validatorStakeAmount
        : mintAmount;
    if (allowance < requiredAllowance) {
      const approveTx = await token
        .connect(wallet)
        .approve(addresses.StakeManager, ethers.MaxUint256);
      await approveTx.wait();
    }
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
    workerStakeAmount / 2n > 0n ? workerStakeAmount / 2n : 1n;
  const adjustedValidatorMinimum =
    validatorStakeAmount / 2n > 0n ? validatorStakeAmount / 2n : 1n;
  const adjustedPlatformMinimum =
    validatorStakeAmount / 4n > 0n ? validatorStakeAmount / 4n : 1n;
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
  const fallbackJobStake = rewardAmount / 10n > 0n ? rewardAmount / 10n : 1n;
  const adjustedJobStake =
    originalJobStake === 0n
      ? fallbackJobStake
      : originalJobStake + (fallbackJobStake > 0n ? fallbackJobStake : 1n);

  await recordForwardGovernanceCall(
    'JobRegistry',
    addresses.JobRegistry,
    jobRegistry.interface,
    'setJobStake',
    [adjustedJobStake],
    {
      notes: 'Tune employer escrow requirements for the flagship mission',
      before: { stake: formatUnits(originalJobStake, decimals) },
      after: { stake: formatUnits(adjustedJobStake, decimals) },
    }
  );
  await recordDirectGovernanceCall(
    'IdentityRegistry',
    'addAdditionalAgent',
    () => identityRegistry.addAdditionalAgent(worker.address),
    'Whitelist flagship worker identity'
  );
  for (const validator of validators) {
    await recordDirectGovernanceCall(
      'IdentityRegistry',
      'addAdditionalValidator',
      () => identityRegistry.addAdditionalValidator(validator.address),
      'Whitelist validator for demo quorum'
    );
  }

  const validationInterface = new ethers.Interface(
    validationModuleArtifact.abi
  );
  const thermostatInterface = thermostatArtifact
    ? new ethers.Interface(thermostatArtifact.abi)
    : null;

  await recordForwardGovernanceCall(
    'ValidationModule',
    addresses.ValidationModule,
    validationInterface,
    'setValidatorPool',
    [validators.map((v) => v.address)],
    { notes: 'Populate validator committee pool for demo mission' }
  );
  await recordForwardGovernanceCall(
    'ValidationModule',
    addresses.ValidationModule,
    validationInterface,
    'setValidatorBounds',
    [quorum, validatorCount],
    { notes: `Require ${quorum} approvals from a pool of ${validatorCount}` }
  );
  await recordForwardGovernanceCall(
    'ValidationModule',
    addresses.ValidationModule,
    validationInterface,
    'setValidatorsPerJob',
    [validatorCount],
    { notes: 'All validators in pool review the flagship job' }
  );
  await recordForwardGovernanceCall(
    'ValidationModule',
    addresses.ValidationModule,
    validationInterface,
    'setRequiredValidatorApprovals',
    [quorum],
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

  const stakeEntries: Array<{
    role: string;
    address: string;
    amount: string;
    txHash: string;
  }> = [];

  const workerStakeTx = await stakeManager
    .connect(worker)
    .acknowledgeAndDeposit(agentRole, workerStakeAmount);
  const workerStakeReceipt = await workerStakeTx.wait();
  stakeEntries.push({
    role: 'agent',
    address: worker.address,
    amount: formatUnits(workerStakeAmount, decimals),
    txHash: workerStakeReceipt?.hash || workerStakeTx.hash,
  });

  for (const validator of validators) {
    const stakeTx = await stakeManager
      .connect(validator)
      .acknowledgeAndDeposit(validatorRole, validatorStakeAmount);
    const receipt = await stakeTx.wait();
    stakeEntries.push({
      role: 'validator',
      address: validator.address,
      amount: formatUnits(validatorStakeAmount, decimals),
      txHash: receipt?.hash || stakeTx.hash,
    });
  }

  writeReceipt(networkName, 'stake.json', { entries: stakeEntries });

  const specHash = ethers.keccak256(
    ethers.toUtf8Bytes(JSON.stringify(spec, Object.keys(spec).sort()))
  );
  const specUri = spec.acceptanceCriteriaURI || 'ipfs://aurora-demo-spec';
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);

  const postTx = await jobRegistry
    .connect(employer)
    .acknowledgeAndCreateJob(rewardAmount, Number(deadline), specHash, specUri);
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

  writeReceipt(networkName, 'postJob.json', {
    jobId: jobId.toString(),
    txHash: postReceipt?.hash || postTx.hash,
    reward: formatUnits(rewardAmount, decimals),
    deadline: deadline.toString(),
    specHash,
    specUri,
  });

  const subdomain = 'aurora-agent';
  const applyTx = await jobRegistry
    .connect(worker)
    .acknowledgeAndApply(jobId, subdomain, []);
  await applyTx.wait();

  const resultUri = 'ipfs://aurora-demo-result';
  const resultHash = ethers.keccak256(ethers.toUtf8Bytes(resultUri));
  const submitTx = await jobRegistry
    .connect(worker)
    .submit(jobId, resultHash, resultUri, subdomain, []);
  const submitReceipt = await submitTx.wait();

  writeReceipt(networkName, 'submit.json', {
    worker: worker.address,
    txHash: submitReceipt?.hash || submitTx.hash,
    resultURI: resultUri,
    resultHash,
  });

  const nonce = (await validationModule.jobNonce(jobId)) as bigint;
  const specHashOnChain = await jobRegistry.getSpecHash(jobId);
  const domainSeparator = await validationModule.DOMAIN_SEPARATOR();
  const commitRecords: Array<{
    address: string;
    commitTx: string;
    revealTx: string;
    commitHash: string;
    salt: string;
  }> = [];

  for (const validator of validators) {
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
      .commitValidation(jobId, plan.commitHash, 'aurora-validator', []);
    const commitReceipt = await commitTx.wait();
    commitRecords.push({
      address: validator.address,
      commitTx: commitReceipt?.hash || commitTx.hash,
      revealTx: '',
      commitHash: plan.commitHash,
      salt: plan.salt,
    });
  }

  const commitWindowSeconds = Number(await validationModule.commitWindow());
  await advanceTime(provider, commitWindowSeconds + 1);

  for (let i = 0; i < validators.length; i++) {
    const validator = validators[i];
    const plan = deriveCommitPlan(
      jobId,
      true,
      validator.address,
      nonce,
      specHashOnChain,
      chain.chainId,
      domainSeparator
    );
    const revealTx = await validationModule
      .connect(validator)
      .revealValidation(
        jobId,
        true,
        plan.burnTxHash,
        plan.salt,
        'aurora-validator',
        []
      );
    const revealReceipt = await revealTx.wait();
    commitRecords[i].revealTx = revealReceipt?.hash || revealTx.hash;
  }

  const balancesBefore = new Map<string, bigint>();
  const trackAddresses = [
    employer.address,
    worker.address,
    ...validators.map((v) => v.address),
  ];
  for (const addr of trackAddresses) {
    balancesBefore.set(addr, await token.balanceOf(addr));
  }

  const finalizeTx = await validationModule
    .connect(validators[0])
    .finalize(jobId);
  const finalizeReceipt = await finalizeTx.wait();

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

  writeReceipt(networkName, 'validate.json', {
    jobId: jobId.toString(),
    validators: commitRecords,
    finalizeTx: finalizeReceipt?.hash || finalizeTx.hash,
    commits: commitRecords.length,
    reveals: commitRecords.length,
  });

  writeReceipt(networkName, 'finalize.json', {
    txHash: finalizeReceipt?.hash || finalizeTx.hash,
    payouts,
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

  console.log('✅ AURORA demo completed.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
