import { Contract, JsonRpcProvider, Wallet, ethers } from 'ethers';
import { EnergySample } from '../shared/energyMonitor';
import { orchestratorWallet } from './utils';

type BaseAttestation = Omit<EnergyOracleAttestation, 'nonce'>;

export interface EnergyOracleAttestation {
  jobId: bigint;
  user: string;
  energy: bigint;
  degeneracy: bigint;
  epochId: bigint;
  role: number;
  nonce: bigint;
  deadline: bigint;
  uPre: bigint;
  uPost: bigint;
  value: bigint;
}

export interface OperatorSubmissionResult {
  processed: number;
  success: boolean;
  error?: Error;
}

const ENERGY_ORACLE_ADDRESS = process.env.ENERGY_ORACLE_ADDRESS || '';
const ENERGY_ORACLE_RPC_URL = process.env.ENERGY_ORACLE_RPC_URL || '';
const MAX_RETRIES = ensurePositiveInt(
  Number(process.env.TELEMETRY_MAX_RETRIES ?? '5'),
  5
);
const RETRY_DELAY_MS = ensurePositiveInt(
  Number(process.env.TELEMETRY_RETRY_DELAY_MS ?? '2000'),
  2000
);
const DEADLINE_BUFFER_SEC = ensurePositiveInt(
  Number(process.env.TELEMETRY_DEADLINE_BUFFER_SEC ?? '3600'),
  3600
);
const EPOCH_DURATION_SEC = ensurePositiveInt(
  Number(process.env.TELEMETRY_EPOCH_DURATION_SEC ?? '86400'),
  86400
);
const ENERGY_SCALING = Number.isFinite(
  Number(process.env.TELEMETRY_ENERGY_SCALING)
)
  ? Number(process.env.TELEMETRY_ENERGY_SCALING)
  : 1;
const VALUE_SCALING = Number.isFinite(Number(process.env.TELEMETRY_VALUE_SCALING))
  ? Number(process.env.TELEMETRY_VALUE_SCALING)
  : 1_000_000;
const ROLE_ID = clampUint8(Number(process.env.TELEMETRY_ROLE ?? '2'));

const ENERGY_ORACLE_ABI = [
  'function verify((uint256,address,int256,uint256,uint256,uint8,uint256,uint256,uint256,uint256,uint256) att, bytes sig) returns (address)',
  'function nonces(address user) view returns (uint256)',
];

const ENERGY_ATTESTATION_TYPES: Record<string, Array<ethers.TypedDataField>> = {
  EnergyAttestation: [
    { name: 'jobId', type: 'uint256' },
    { name: 'user', type: 'address' },
    { name: 'energy', type: 'int256' },
    { name: 'degeneracy', type: 'uint256' },
    { name: 'epochId', type: 'uint256' },
    { name: 'role', type: 'uint8' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
    { name: 'uPre', type: 'uint256' },
    { name: 'uPost', type: 'uint256' },
    { name: 'value', type: 'uint256' },
  ],
};

class SignatureValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SignatureValidationError';
  }
}

interface OperatorConfig {
  address: string;
  maxRetries: number;
  retryDelayMs: number;
  deadlineBufferSec: number;
  epochDurationSec: number;
  energyScaling: number;
  valueScaling: number;
  role: number;
}

class EnergyOracleOperator {
  private contract: Contract;
  private wallet: Wallet;
  private provider: JsonRpcProvider;
  private domain: ethers.TypedDataDomain | null = null;
  private readonly nonceCache = new Map<string, bigint>();
  private readonly pendingNonces = new Map<string, bigint>();

  constructor(
    private readonly config: OperatorConfig,
    private readonly walletFactory: () => Wallet
  ) {
    const { wallet, contract, provider } = this.createConnection();
    this.wallet = wallet;
    this.contract = contract;
    this.provider = provider;
  }

  private createConnection(): {
    wallet: Wallet;
    contract: Contract;
    provider: JsonRpcProvider;
  } {
    const baseWallet = this.walletFactory();
    if (!baseWallet.provider) {
      throw new Error('Oracle signer wallet is missing a provider');
    }
    const provider = baseWallet.provider as JsonRpcProvider;
    const contract = new Contract(
      this.config.address,
      ENERGY_ORACLE_ABI,
      baseWallet
    );
    return { wallet: baseWallet, contract, provider };
  }

  refresh(): void {
    console.warn('Refreshing EnergyOracle connection');
    const { wallet, contract, provider } = this.createConnection();
    this.wallet = wallet;
    this.contract = contract;
    this.provider = provider;
    this.domain = null;
    this.pendingNonces.clear();
  }

  async submit(samples: EnergySample[]): Promise<OperatorSubmissionResult> {
    if (!samples.length) {
      return { processed: 0, success: true };
    }
    let processed = 0;
    for (const sample of samples) {
      const base = this.buildBaseAttestation(sample);
      if (!base) {
        processed += 1;
        continue;
      }
      try {
        await this.submitWithRetry(base);
        processed += 1;
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        return { processed, success: false, error };
      }
    }
    return { processed, success: true };
  }

  private async submitWithRetry(base: BaseAttestation): Promise<void> {
    await retry(async () => {
      try {
        await this.submitAttestation(base);
      } catch (err) {
        if (err instanceof SignatureValidationError) {
          this.invalidateNonce(base.user);
        } else if (isNetworkError(err)) {
          this.refresh();
        }
        throw err;
      }
    }, this.config.maxRetries, this.config.retryDelayMs);
  }

  private async submitAttestation(base: BaseAttestation): Promise<void> {
    const attestation = await this.withNonce(base);
    const domain = await this.resolveDomain();
    const signature = await this.wallet.signTypedData(
      domain,
      ENERGY_ATTESTATION_TYPES,
      attestation
    );
    const verify = this.contract.getFunction('verify');
    let signer: string;
    try {
      signer = await verify.staticCall(attestation, signature);
    } catch (err) {
      if (isNetworkError(err)) {
        throw err;
      }
      throw err;
    }
    if (!signer || signer === ethers.ZeroAddress) {
      throw new SignatureValidationError('EnergyOracle signature validation failed');
    }
    let tx: ethers.ContractTransactionResponse | undefined;
    try {
      tx = await verify(attestation, signature);
      if (!tx) {
        throw new Error('EnergyOracle.verify returned no transaction response');
      }
      const receipt = await tx.wait();
      const reference = receipt?.hash || tx.hash;
      console.info('Submitted energy attestation', {
        jobId: attestation.jobId.toString(),
        user: attestation.user,
        nonce: attestation.nonce.toString(),
        txHash: reference,
      });
      this.commitNonce(attestation.user, attestation.nonce);
    } catch (err) {
      if (tx) {
        try {
          const receipt = await this.provider.getTransactionReceipt(tx.hash);
          if (receipt) {
            console.info('Energy attestation confirmed after retry', {
              jobId: attestation.jobId.toString(),
              user: attestation.user,
              nonce: attestation.nonce.toString(),
              txHash: receipt.hash,
            });
            this.commitNonce(attestation.user, attestation.nonce);
            return;
          }
        } catch (lookupError) {
          if (isNetworkError(lookupError)) {
            throw err;
          }
        }
      }
      throw err;
    }
  }

  private async resolveDomain(): Promise<ethers.TypedDataDomain> {
    if (this.domain) {
      return this.domain;
    }
    const network = await this.provider.getNetwork();
    this.domain = {
      name: 'EnergyOracle',
      version: '1',
      chainId: Number(network.chainId),
      verifyingContract: this.config.address,
    };
    return this.domain;
  }

  private async withNonce(
    base: BaseAttestation
  ): Promise<EnergyOracleAttestation> {
    const nonce = await this.reserveNonce(base.user);
    return { ...base, nonce };
  }

  private async reserveNonce(address: string): Promise<bigint> {
    const key = address.toLowerCase();
    const pending = this.pendingNonces.get(key);
    if (pending) {
      return pending;
    }
    let current = this.nonceCache.get(key);
    if (current === undefined) {
      const onChain = await this.contract.nonces(address);
      current = BigInt(onChain);
      this.nonceCache.set(key, current);
    }
    const next = current + 1n;
    this.pendingNonces.set(key, next);
    return next;
  }

  private commitNonce(address: string, nonce: bigint): void {
    const key = address.toLowerCase();
    this.nonceCache.set(key, nonce);
    this.pendingNonces.delete(key);
  }

  private invalidateNonce(address: string): void {
    const key = address.toLowerCase();
    this.pendingNonces.delete(key);
    this.nonceCache.delete(key);
  }

  private buildBaseAttestation(sample: EnergySample): BaseAttestation | null {
    const user = normalizeAddress(sample.agent);
    if (!user) {
      console.warn('Skipping energy sample with invalid agent address', sample);
      return null;
    }
    const jobId = parseBigInt(sample.jobId);
    if (jobId === null) {
      console.warn('Skipping energy sample with non-numeric jobId', sample.jobId);
      return null;
    }
    const energy = toScaledBigInt(sample.energyEstimate, this.config.energyScaling);
    const degeneracy = resolveDegeneracy(sample);
    const epochId = resolveEpochId(sample, this.config.epochDurationSec);
    const deadline = BigInt(
      Math.floor(Date.now() / 1000) + this.config.deadlineBufferSec
    );
    const cpuEnergy = Math.max(0, Math.round(sample.cpuTimeMs || 0));
    const gpuEnergy = Math.max(0, Math.round(sample.gpuTimeMs || 0));
    const uPre = BigInt(cpuEnergy);
    const uPost = BigInt(cpuEnergy + gpuEnergy);
    const efficiency = resolveEfficiency(sample);
    const value = toScaledBigInt(efficiency, this.config.valueScaling);

    return {
      jobId,
      user,
      energy,
      degeneracy,
      epochId,
      role: this.config.role,
      deadline,
      uPre,
      uPost,
      value,
    };
  }
}

function ensurePositiveInt(value: number, fallback: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return fallback;
  }
  return Math.floor(value);
}

function clampUint8(value: number): number {
  if (!Number.isFinite(value) || value < 0) {
    return 0;
  }
  if (value > 255) {
    return 255;
  }
  return Math.floor(value);
}

function normalizeAddress(value: string | undefined): string | null {
  if (!value) return null;
  try {
    return ethers.getAddress(value);
  } catch {
    return null;
  }
}

function parseBigInt(value: unknown): bigint | null {
  if (typeof value === 'bigint') {
    return value;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null;
    return BigInt(Math.round(value));
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    try {
      if (trimmed.startsWith('0x') || trimmed.startsWith('-0x')) {
        return BigInt(trimmed);
      }
      const asNumber = Number(trimmed);
      if (Number.isFinite(asNumber)) {
        return BigInt(Math.round(asNumber));
      }
      return BigInt(trimmed);
    } catch {
      return null;
    }
  }
  return null;
}

function toScaledBigInt(value: unknown, scale: number): bigint {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) {
    return 0n;
  }
  const scaled = numeric * (Number.isFinite(scale) && scale !== 0 ? scale : 1);
  if (!Number.isFinite(scaled)) {
    return 0n;
  }
  const rounded = Math.round(scaled);
  return BigInt(rounded >= 0 ? rounded : 0);
}

function resolveDegeneracy(sample: EnergySample): bigint {
  const metadata = sample.metadata || {};
  const candidates: unknown[] = [
    (metadata as Record<string, unknown>).degeneracy,
    (metadata as Record<string, unknown>).runs,
    (metadata as Record<string, unknown>).attempts,
  ];
  for (const candidate of candidates) {
    const parsed = parseBigInt(candidate);
    if (parsed && parsed > 0n) {
      return parsed;
    }
  }
  return 1n;
}

function resolveEpochId(sample: EnergySample, epochDuration: number): bigint {
  const timestamp = Date.parse(sample.finishedAt || sample.startedAt || '');
  const epochSeconds = Number.isNaN(timestamp)
    ? Math.floor(Date.now() / 1000)
    : Math.floor(timestamp / 1000);
  const base = Math.floor(epochSeconds / Math.max(1, epochDuration));
  return base >= 0 ? BigInt(base) : 0n;
}

function resolveEfficiency(sample: EnergySample): number {
  if (typeof sample.efficiencyScore === 'number' && isFinite(sample.efficiencyScore)) {
    return sample.efficiencyScore;
  }
  if (typeof sample.rewardValue === 'number' && isFinite(sample.rewardValue)) {
    const energy = typeof sample.energyEstimate === 'number' ? sample.energyEstimate : 0;
    if (energy > 0) {
      return sample.rewardValue / energy;
    }
  }
  return 0;
}

function isNetworkError(err: unknown): boolean {
  if (!err || typeof err !== 'object') {
    return false;
  }
  const error = err as { code?: unknown; message?: unknown; error?: { code?: unknown } };
  const code =
    (typeof error.code === 'string' && error.code) ||
    (error.error && typeof error.error.code === 'string' && error.error.code) ||
    undefined;
  if (code) {
    const normalised = code.toUpperCase();
    if (
      normalised.includes('NETWORK') ||
      normalised.includes('TIMEOUT') ||
      normalised.includes('SERVER')
    ) {
      return true;
    }
    if (['ECONNRESET', 'ETIMEDOUT'].includes(normalised)) {
      return true;
    }
  }
  const message =
    (typeof error.message === 'string' && error.message.toLowerCase()) || '';
  return (
    message.includes('network') ||
    message.includes('timeout') ||
    message.includes('socket') ||
    message.includes('connection')
  );
}

async function retry<T>(
  fn: () => Promise<T>,
  maxAttempts: number,
  baseDelayMs: number
): Promise<T> {
  let attempt = 0;
  let lastError: unknown;
  while (attempt < maxAttempts) {
    attempt += 1;
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt >= maxAttempts) {
        break;
      }
      const delayMs = baseDelayMs * Math.pow(2, attempt - 1);
      console.warn(
        `Telemetry submission attempt ${attempt}/${maxAttempts} failed, retrying in ${delayMs}ms`,
        err
      );
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw lastError;
}

function createWallet(): Wallet {
  if (!orchestratorWallet) {
    throw new Error('Orchestrator wallet is not initialised; cannot submit telemetry');
  }
  if (ENERGY_ORACLE_RPC_URL) {
    const provider = new JsonRpcProvider(ENERGY_ORACLE_RPC_URL);
    return orchestratorWallet.connect(provider);
  }
  if (!orchestratorWallet.provider) {
    throw new Error(
      'No provider available for orchestrator wallet. Set ENERGY_ORACLE_RPC_URL to specify an RPC endpoint.'
    );
  }
  return orchestratorWallet;
}

let instance: EnergyOracleOperator | null = null;

function getOperator(): EnergyOracleOperator {
  if (!ENERGY_ORACLE_ADDRESS) {
    throw new Error('ENERGY_ORACLE_ADDRESS is not configured');
  }
  if (!instance) {
    const config: OperatorConfig = {
      address: ENERGY_ORACLE_ADDRESS,
      maxRetries: MAX_RETRIES,
      retryDelayMs: RETRY_DELAY_MS,
      deadlineBufferSec: DEADLINE_BUFFER_SEC,
      epochDurationSec: EPOCH_DURATION_SEC,
      energyScaling: ENERGY_SCALING,
      valueScaling: VALUE_SCALING,
      role: ROLE_ID,
    };
    instance = new EnergyOracleOperator(config, createWallet);
  }
  return instance;
}

export function isOracleContractConfigured(): boolean {
  return Boolean(ENERGY_ORACLE_ADDRESS);
}

export async function submitEnergyAttestations(
  samples: EnergySample[]
): Promise<OperatorSubmissionResult> {
  if (!ENERGY_ORACLE_ADDRESS) {
    return { processed: 0, success: false, error: new Error('ENERGY_ORACLE_ADDRESS is not set') };
  }
  const operator = getOperator();
  return operator.submit(samples);
}

export async function startOperatorTelemetry(
  samples: EnergySample[]
): Promise<OperatorSubmissionResult> {
  return submitEnergyAttestations(samples);
}
