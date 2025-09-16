import { Dirent, promises as fs } from 'fs';
import path from 'path';
import { ethers } from 'ethers';

interface TaskMetrics {
  jobId: string;
  stageName: string;
  agent: string;
  timestamp: string;
  cpuTimeMs: number;
  gpuTimeMs: number;
  wallTimeMs: number;
  energyScore: number;
  efficiencyScore: number;
  algorithmicComplexity: string;
  estimatedOperations: number;
  inputSize: number;
  outputSize: number;
  success: boolean;
  metadata?: Record<string, unknown>;
  errorMessage?: string;
}

interface JobEnergySummary {
  totalCpuTimeMs: number;
  totalGpuTimeMs: number;
  totalWallTimeMs: number;
  energyScore: number;
  efficiencyScore: number;
  averageEfficiency: number;
  complexity: string;
  successRate: number;
  runs: number;
  lastUpdated: string;
}

interface JobEnergyLog {
  jobId: string;
  agent: string;
  stages: TaskMetrics[];
  summary: JobEnergySummary;
}

function parseFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function sanitizeTaskMetrics(raw: unknown): TaskMetrics | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const stage = raw as Partial<TaskMetrics> & Record<string, unknown>;
  const stageName = typeof stage.stageName === 'string' ? stage.stageName : '';
  const agent = typeof stage.agent === 'string' ? stage.agent : '';
  const timestamp = typeof stage.timestamp === 'string' ? stage.timestamp : '';
  if (!stageName || !agent || !timestamp) {
    return null;
  }

  const numericFields: Array<
    keyof Pick<
      TaskMetrics,
      | 'cpuTimeMs'
      | 'gpuTimeMs'
      | 'wallTimeMs'
      | 'energyScore'
      | 'efficiencyScore'
      | 'estimatedOperations'
      | 'inputSize'
      | 'outputSize'
    >
  > = [
    'cpuTimeMs',
    'gpuTimeMs',
    'wallTimeMs',
    'energyScore',
    'efficiencyScore',
    'estimatedOperations',
    'inputSize',
    'outputSize',
  ];

  const sanitized: TaskMetrics = {
    jobId:
      typeof stage.jobId === 'string' ? stage.jobId : String(stage.jobId ?? ''),
    stageName,
    agent,
    timestamp,
    cpuTimeMs: 0,
    gpuTimeMs: 0,
    wallTimeMs: 0,
    energyScore: 0,
    efficiencyScore: 0,
    algorithmicComplexity:
      typeof stage.algorithmicComplexity === 'string'
        ? stage.algorithmicComplexity
        : 'O(1)',
    estimatedOperations: 0,
    inputSize: 0,
    outputSize: 0,
    success: Boolean(stage.success),
    metadata:
      stage.metadata && typeof stage.metadata === 'object'
        ? (stage.metadata as Record<string, unknown>)
        : undefined,
    errorMessage:
      typeof stage.errorMessage === 'string' ? stage.errorMessage : undefined,
  };

  for (const field of numericFields) {
    const parsed = parseFiniteNumber(stage[field]);
    if (parsed === null) {
      return null;
    }
    sanitized[field] = parsed;
  }

  return sanitized;
}

const COMPLEXITY_ORDER = [
  'O(1)',
  'O(log n)',
  'O(n)',
  'O(n log n)',
  'O(n^2)',
  'O(n^3)',
  'O(2^n)',
];

function computeSummaryFromStages(stages: TaskMetrics[]): JobEnergySummary {
  const totalCpuTimeMs = stages.reduce(
    (acc, stage) => acc + stage.cpuTimeMs,
    0
  );
  const totalGpuTimeMs = stages.reduce(
    (acc, stage) => acc + stage.gpuTimeMs,
    0
  );
  const totalWallTimeMs = stages.reduce(
    (acc, stage) => acc + stage.wallTimeMs,
    0
  );
  const totalEfficiency = stages.reduce(
    (acc, stage) => acc + stage.efficiencyScore,
    0
  );
  const runs = stages.length;
  const successRate = runs
    ? stages.filter((stage) => stage.success).length / runs
    : 0;
  const complexityIndex = stages.reduce((maxIndex, stage) => {
    const idx = COMPLEXITY_ORDER.indexOf(stage.algorithmicComplexity);
    return idx > maxIndex ? idx : maxIndex;
  }, 0);
  const lastUpdated = runs
    ? stages[stages.length - 1].timestamp
    : new Date().toISOString();
  const averageEfficiency = runs ? totalEfficiency / runs : 0;

  return {
    totalCpuTimeMs,
    totalGpuTimeMs,
    totalWallTimeMs,
    energyScore: totalCpuTimeMs + totalGpuTimeMs,
    efficiencyScore: averageEfficiency,
    averageEfficiency,
    complexity: COMPLEXITY_ORDER[complexityIndex] || 'O(1)',
    successRate,
    runs,
    lastUpdated,
  };
}

function sanitizeSummary(raw: unknown): JobEnergySummary | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const summary = raw as Partial<JobEnergySummary> & Record<string, unknown>;
  const numberFields: Array<
    keyof Pick<
      JobEnergySummary,
      | 'totalCpuTimeMs'
      | 'totalGpuTimeMs'
      | 'totalWallTimeMs'
      | 'energyScore'
      | 'efficiencyScore'
      | 'averageEfficiency'
      | 'successRate'
    >
  > = [
    'totalCpuTimeMs',
    'totalGpuTimeMs',
    'totalWallTimeMs',
    'energyScore',
    'efficiencyScore',
    'averageEfficiency',
    'successRate',
  ];

  const runsParsed = parseFiniteNumber(summary.runs);
  const sanitized: JobEnergySummary = {
    totalCpuTimeMs: 0,
    totalGpuTimeMs: 0,
    totalWallTimeMs: 0,
    energyScore: 0,
    efficiencyScore: 0,
    averageEfficiency: 0,
    complexity:
      typeof summary.complexity === 'string' && summary.complexity
        ? summary.complexity
        : 'O(1)',
    successRate: 0,
    runs: runsParsed ?? 0,
    lastUpdated:
      typeof summary.lastUpdated === 'string'
        ? summary.lastUpdated
        : new Date().toISOString(),
  };

  for (const field of numberFields) {
    const parsed = parseFiniteNumber(summary[field]);
    if (parsed === null) {
      return null;
    }
    sanitized[field] = parsed;
  }

  sanitized.runs = Math.max(0, Math.round(sanitized.runs));
  return sanitized;
}

function normaliseEnergyLog(raw: unknown): JobEnergyLog | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const record = raw as Record<string, unknown>;
  const jobIdValue = record['jobId'];
  const jobId =
    typeof jobIdValue === 'string'
      ? jobIdValue
      : typeof jobIdValue === 'number'
      ? jobIdValue.toString()
      : '';
  const agentValue = record['agent'];
  const agent = typeof agentValue === 'string' ? agentValue : '';
  if (!jobId || !agent) {
    return null;
  }

  const rawStages = Array.isArray(record['stages']) ? record['stages'] : [];
  const stages: TaskMetrics[] = rawStages
    .map((stage) => sanitizeTaskMetrics(stage))
    .filter((stage): stage is TaskMetrics => stage !== null);

  let summary = sanitizeSummary(record['summary']);
  if (!summary) {
    if (!stages.length) {
      return null;
    }
    summary = sanitizeSummary(computeSummaryFromStages(stages));
  }

  if (!summary) {
    return null;
  }

  return {
    jobId,
    agent,
    stages,
    summary,
  };
}

interface TelemetryConfig {
  energyLogDir: string;
  pollIntervalMs: number;
  maxRetries: number;
  retryDelayMs: number;
  deadlineBufferSec: number;
  epochDurationSec: number;
  energyScaling: number;
  valueScaling: number;
  energyOracleAddress: string;
  rpcUrl?: string;
  apiUrl?: string;
  apiToken?: string;
  signerKey: string;
  chainId?: number;
  mode: 'contract' | 'api';
  role: number;
  stateFile: string;
  maxBatchSize: number;
}

interface SubmissionReceipt {
  type: 'contract' | 'api';
  reference: string;
}

interface EnergyOracleAttestation {
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

interface PersistedState {
  processed: Record<string, string>;
  apiNonces: Record<string, string>;
}

function defaultStateFile(): string {
  return path.resolve(
    process.cwd(),
    'storage',
    'operator-telemetry-state.json'
  );
}

function ensureNumber(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function ensurePositiveInt(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeAddress(value: string | undefined): string | null {
  if (!value) return null;
  try {
    return ethers.getAddress(value);
  } catch (err) {
    console.warn('Skipping log with invalid address', value, err);
    return null;
  }
}

function parseBigInt(value: string | number | bigint): bigint | null {
  try {
    if (typeof value === 'bigint') return value;
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) return null;
      return BigInt(Math.round(value));
    }
    if (value.startsWith('0x') || value.startsWith('0X')) {
      return BigInt(value);
    }
    const asNumber = Number(value);
    if (Number.isFinite(asNumber)) {
      return BigInt(Math.round(asNumber));
    }
    return BigInt(value);
  } catch (err) {
    console.warn('Unable to parse bigint from value', value, err);
    return null;
  }
}

async function loadConfig(): Promise<TelemetryConfig> {
  const modeEnv = (process.env.TELEMETRY_MODE || '').toLowerCase();
  const rpcUrl = process.env.ENERGY_ORACLE_RPC_URL || undefined;
  const apiUrl = process.env.ENERGY_ORACLE_API_URL || undefined;
  let mode: 'contract' | 'api';
  if (modeEnv === 'contract') {
    mode = 'contract';
  } else if (modeEnv === 'api') {
    mode = 'api';
  } else if (rpcUrl) {
    mode = 'contract';
  } else if (apiUrl) {
    mode = 'api';
  } else {
    throw new Error(
      'Set TELEMETRY_MODE, ENERGY_ORACLE_RPC_URL, or ENERGY_ORACLE_API_URL to choose a submission target.'
    );
  }

  const signerKey = process.env.ENERGY_ORACLE_SIGNER_KEY;
  if (!signerKey) {
    throw new Error('ENERGY_ORACLE_SIGNER_KEY is required');
  }

  const energyOracleAddress = process.env.ENERGY_ORACLE_ADDRESS;
  if (!energyOracleAddress) {
    throw new Error('ENERGY_ORACLE_ADDRESS is required');
  }

  if (mode === 'contract' && !rpcUrl) {
    throw new Error('ENERGY_ORACLE_RPC_URL must be provided in contract mode');
  }

  if (mode === 'api' && !apiUrl) {
    throw new Error('ENERGY_ORACLE_API_URL must be provided in API mode');
  }

  const pollIntervalMs = ensurePositiveInt(
    ensureNumber(process.env.TELEMETRY_POLL_INTERVAL_MS, 10000),
    10000
  );
  const maxRetries = ensurePositiveInt(
    ensureNumber(process.env.TELEMETRY_MAX_RETRIES, 5),
    5
  );
  const retryDelayMs = ensurePositiveInt(
    ensureNumber(process.env.TELEMETRY_RETRY_DELAY_MS, 2000),
    2000
  );
  const deadlineBufferSec = ensurePositiveInt(
    ensureNumber(process.env.TELEMETRY_DEADLINE_BUFFER_SEC, 3600),
    3600
  );
  const epochDurationSec = ensurePositiveInt(
    ensureNumber(process.env.TELEMETRY_EPOCH_DURATION_SEC, 86400),
    86400
  );
  const energyScaling = ensureNumber(process.env.TELEMETRY_ENERGY_SCALING, 1);
  const valueScaling = ensureNumber(
    process.env.TELEMETRY_VALUE_SCALING,
    1_000_000
  );
  const role = ensurePositiveInt(
    ensureNumber(process.env.TELEMETRY_ROLE, 2),
    2
  );
  const stateFile = process.env.TELEMETRY_STATE_FILE || defaultStateFile();
  const chainIdEnv = process.env.ENERGY_ORACLE_CHAIN_ID;
  const chainId = chainIdEnv
    ? ensurePositiveInt(Number(chainIdEnv), NaN)
    : undefined;
  const energyLogDir =
    process.env.ENERGY_LOG_DIR || path.resolve(__dirname, '../../logs/energy');
  const maxBatchSize = ensurePositiveInt(
    ensureNumber(process.env.TELEMETRY_MAX_BATCH, 20),
    20
  );

  return {
    energyLogDir,
    pollIntervalMs,
    maxRetries,
    retryDelayMs,
    deadlineBufferSec,
    epochDurationSec,
    energyScaling,
    valueScaling,
    energyOracleAddress,
    rpcUrl,
    apiUrl,
    apiToken: process.env.ENERGY_ORACLE_API_TOKEN,
    signerKey,
    chainId,
    mode,
    role,
    stateFile,
    maxBatchSize,
  };
}

class TelemetryState {
  private processed = new Map<string, string>();
  private apiNonces = new Map<string, bigint>();
  private loaded = false;

  constructor(private readonly filePath: string) {}

  async load(): Promise<void> {
    if (this.loaded) return;
    try {
      const raw = await fs.readFile(this.filePath, 'utf8');
      const parsed = JSON.parse(raw) as PersistedState;
      if (parsed.processed) {
        for (const [key, timestamp] of Object.entries(parsed.processed)) {
          this.processed.set(key, timestamp);
        }
      }
      if (parsed.apiNonces) {
        for (const [key, value] of Object.entries(parsed.apiNonces)) {
          try {
            this.apiNonces.set(key, BigInt(value));
          } catch {
            // ignore malformed nonce entries
          }
        }
      }
    } catch (err: unknown) {
      const error = err as NodeJS.ErrnoException;
      if (error.code !== 'ENOENT') {
        console.warn('Failed to load telemetry state', error);
      }
    } finally {
      this.loaded = true;
    }
  }

  getLastProcessed(key: string): string | undefined {
    return this.processed.get(key);
  }

  isProcessed(key: string, timestamp: string): boolean {
    const existing = this.processed.get(key);
    if (!existing) return false;
    const existingTime = Date.parse(existing);
    const newTime = Date.parse(timestamp);
    if (Number.isNaN(existingTime) || Number.isNaN(newTime)) {
      return existing === timestamp;
    }
    return existingTime >= newTime;
  }

  markProcessed(key: string, timestamp: string): void {
    this.processed.set(key, timestamp);
  }

  getNonce(address: string): bigint | undefined {
    return this.apiNonces.get(address.toLowerCase());
  }

  setNonce(address: string, nonce: bigint): void {
    this.apiNonces.set(address.toLowerCase(), nonce);
  }

  deleteNonce(address: string): void {
    this.apiNonces.delete(address.toLowerCase());
  }

  private async ensureDirectory(): Promise<void> {
    const dir = path.dirname(this.filePath);
    try {
      await fs.mkdir(dir, { recursive: true });
    } catch (err) {
      const error = err as NodeJS.ErrnoException;
      if (error.code !== 'EEXIST') {
        throw err;
      }
    }
  }

  async save(): Promise<void> {
    await this.ensureDirectory();
    const processed: Record<string, string> = {};
    for (const [key, timestamp] of this.processed.entries()) {
      processed[key] = timestamp;
    }
    const apiNonces: Record<string, string> = {};
    for (const [key, value] of this.apiNonces.entries()) {
      apiNonces[key] = value.toString();
    }
    const payload: PersistedState = { processed, apiNonces };
    await fs.writeFile(this.filePath, JSON.stringify(payload, null, 2));
  }
}

interface NonceReservation {
  address: string;
  nonce: bigint;
}

interface NonceProvider {
  reserve(address: string): Promise<NonceReservation | null>;
  confirm(reservation: NonceReservation): void;
  release(reservation: NonceReservation): void;
}

class ApiNonceProvider implements NonceProvider {
  private pending = new Map<string, bigint>();

  constructor(private readonly state: TelemetryState) {}

  async reserve(address: string): Promise<NonceReservation | null> {
    await this.state.load();
    const key = address.toLowerCase();
    const current = this.pending.get(key) ?? this.state.getNonce(address) ?? 0n;
    const next = current + 1n;
    this.pending.set(key, next);
    return { address, nonce: next };
  }

  confirm(reservation: NonceReservation): void {
    const key = reservation.address.toLowerCase();
    this.pending.delete(key);
    this.state.setNonce(reservation.address, reservation.nonce);
  }

  release(reservation: NonceReservation): void {
    const key = reservation.address.toLowerCase();
    const pending = this.pending.get(key);
    if (pending === reservation.nonce) {
      this.pending.delete(key);
    }
  }
}

class ContractNonceProvider implements NonceProvider {
  private cache = new Map<string, bigint>();
  private pending = new Map<string, bigint>();

  constructor(private readonly connection: OracleConnectionManager) {}

  async reserve(address: string): Promise<NonceReservation | null> {
    const key = address.toLowerCase();
    let current = this.pending.get(key) ?? this.cache.get(key);
    if (current === undefined) {
      try {
        const contract = this.connection.getContract();
        const onchain = await contract.nonces(address);
        current = BigInt(onchain);
      } catch (err) {
        if (isNetworkError(err)) {
          console.warn('Nonce read failed due to RPC error, reconnecting');
          this.connection.refresh();
        }
        console.error('Failed to read nonce from EnergyOracle', err);
        return null;
      }
    }
    const next = current + 1n;
    this.pending.set(key, next);
    return { address, nonce: next };
  }

  confirm(reservation: NonceReservation): void {
    const key = reservation.address.toLowerCase();
    this.pending.delete(key);
    const cached = this.cache.get(key);
    if (!cached || reservation.nonce > cached) {
      this.cache.set(key, reservation.nonce);
    }
  }

  release(reservation: NonceReservation): void {
    const key = reservation.address.toLowerCase();
    const pending = this.pending.get(key);
    if (pending === reservation.nonce) {
      this.pending.delete(key);
      this.cache.delete(key);
    }
  }
}

interface OracleSender {
  readonly type: 'contract' | 'api';
  send(
    attestation: EnergyOracleAttestation,
    signature: string
  ): Promise<SubmissionReceipt>;
}

const ENERGY_ORACLE_ABI = [
  'function verify((uint256,address,int256,uint256,uint256,uint8,uint256,uint256,uint256,uint256,uint256),bytes) returns (address)',
  'function nonces(address) view returns (uint256)',
];

function isNetworkError(err: unknown): boolean {
  if (!err || typeof err !== 'object') {
    return false;
  }
  const error = err as { code?: unknown; message?: unknown };
  const code = typeof error.code === 'string' ? error.code.toUpperCase() : '';
  if (
    code === 'NETWORK_ERROR' ||
    code === 'SERVER_ERROR' ||
    code === 'TIMEOUT' ||
    code === 'OFFCHAIN_FAULT'
  ) {
    return true;
  }
  const message =
    typeof error.message === 'string'
      ? error.message
      : String(error.message ?? '');
  return /network|timeout|ECONN|socket|disconnected/i.test(message);
}

class OracleConnectionManager {
  private provider: ethers.JsonRpcProvider;
  private wallet: ethers.Wallet;
  private contract: ethers.Contract;

  constructor(
    private readonly rpcUrl: string,
    private readonly oracleAddress: string,
    private readonly signer: ethers.Wallet
  ) {
    const { provider, wallet, contract } = this.createConnection();
    this.provider = provider;
    this.wallet = wallet;
    this.contract = contract;
  }

  private createConnection(): {
    provider: ethers.JsonRpcProvider;
    wallet: ethers.Wallet;
    contract: ethers.Contract;
  } {
    const provider = new ethers.JsonRpcProvider(this.rpcUrl);
    const wallet = this.signer.connect(provider);
    const contract = new ethers.Contract(
      this.oracleAddress,
      ENERGY_ORACLE_ABI,
      wallet
    );
    return { provider, wallet, contract };
  }

  getContract(): ethers.Contract {
    return this.contract;
  }

  getWallet(): ethers.Wallet {
    return this.wallet;
  }

  getProvider(): ethers.JsonRpcProvider {
    return this.provider;
  }

  refresh(): void {
    console.warn('Refreshing EnergyOracle connection');
    const { provider, wallet, contract } = this.createConnection();
    this.provider = provider;
    this.wallet = wallet;
    this.contract = contract;
  }
}

class ContractOracleSender implements OracleSender {
  readonly type = 'contract' as const;
  constructor(private readonly connection: OracleConnectionManager) {}

  async send(
    attestation: EnergyOracleAttestation,
    signature: string
  ): Promise<SubmissionReceipt> {
    const contract = this.connection.getContract();
    try {
      const tx = await contract.verify(attestation, signature);
      const receipt = await tx.wait();
      const reference = receipt?.hash || tx.hash;
      return { type: this.type, reference };
    } catch (err) {
      if (isNetworkError(err)) {
        console.warn('EnergyOracle RPC failure, attempting reconnect');
        this.connection.refresh();
      }
      throw err;
    }
  }
}

function serializeAttestation(
  attestation: EnergyOracleAttestation
): Record<string, string> {
  return {
    jobId: attestation.jobId.toString(),
    user: attestation.user,
    energy: attestation.energy.toString(),
    degeneracy: attestation.degeneracy.toString(),
    epochId: attestation.epochId.toString(),
    role: attestation.role.toString(),
    nonce: attestation.nonce.toString(),
    deadline: attestation.deadline.toString(),
    uPre: attestation.uPre.toString(),
    uPost: attestation.uPost.toString(),
    value: attestation.value.toString(),
  };
}

class ApiOracleSender implements OracleSender {
  readonly type = 'api' as const;

  constructor(
    private readonly endpoint: string,
    private readonly token?: string
  ) {}

  async send(
    attestation: EnergyOracleAttestation,
    signature: string
  ): Promise<SubmissionReceipt> {
    const payload = {
      attestation: serializeAttestation(attestation),
      signature,
    };
    const headers: Record<string, string> = {
      'content-type': 'application/json',
    };
    if (this.token) {
      headers.authorization = `Bearer ${this.token}`;
    }

    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(
        `EnergyOracle API returned ${response.status} ${response.statusText}: ${body}`
      );
    }

    let reference = '';
    try {
      const parsed = (await response.json()) as {
        id?: string;
        reference?: string;
      };
      reference = parsed.id || parsed.reference || '';
    } catch {
      reference = '';
    }

    return { type: this.type, reference: reference || `${response.status}` };
  }
}

async function retry<T>(
  operation: (attempt: number) => Promise<T>,
  maxAttempts: number,
  baseDelayMs: number
): Promise<T> {
  let attempt = 0;
  let lastError: unknown;
  while (attempt < maxAttempts) {
    attempt += 1;
    try {
      return await operation(attempt);
    } catch (err) {
      lastError = err;
      if (attempt >= maxAttempts) break;
      const delayMs = baseDelayMs * Math.pow(2, attempt - 1);
      console.warn(
        `Operation failed on attempt ${attempt}/${maxAttempts}, retrying in ${delayMs}ms`,
        err
      );
      await delay(delayMs);
    }
  }
  throw lastError;
}

interface LocalJobLog {
  filePath: string;
  log: JobEnergyLog;
}

class TelemetryService {
  private running = false;
  private immediateRunRequested = false;

  constructor(
    private readonly config: TelemetryConfig,
    private readonly state: TelemetryState,
    private readonly signer: ethers.Wallet,
    private readonly domain: ethers.TypedDataDomain,
    private readonly nonceProvider: NonceProvider,
    private readonly sender: OracleSender
  ) {}

  async start(): Promise<void> {
    await this.state.load();
    if (this.running) return;
    this.running = true;
    console.info('Operator telemetry service started');
    while (this.running) {
      try {
        await this.executeCycle();
      } catch (err) {
        console.error('Telemetry cycle failed', err);
      }
      if (!this.running) {
        break;
      }
      const waitMs = this.immediateRunRequested
        ? 0
        : this.config.pollIntervalMs;
      this.immediateRunRequested = false;
      if (waitMs > 0) {
        await delay(waitMs);
      }
    }
  }

  stop(): void {
    this.running = false;
  }

  requestImmediateCycle(): void {
    this.immediateRunRequested = true;
  }

  private async executeCycle(): Promise<void> {
    const entries = await this.collectLogs();
    if (!entries.length) {
      return;
    }

    let processed = 0;
    for (const entry of entries) {
      if (processed >= this.config.maxBatchSize) {
        break;
      }
      const { log } = entry;
      if (!log.summary) continue;
      const key = `${log.agent}:${log.jobId}`.toLowerCase();
      const lastTimestamp = log.summary.lastUpdated || new Date().toISOString();
      if (this.state.isProcessed(key, lastTimestamp)) {
        continue;
      }
      const attestation = this.createAttestation(log);
      if (!attestation) {
        continue;
      }

      const reservation = await this.nonceProvider.reserve(attestation.user);
      if (!reservation) {
        console.warn('Failed to reserve nonce for attestation, skipping job', {
          jobId: log.jobId,
          user: attestation.user,
        });
        continue;
      }

      const attWithNonce: EnergyOracleAttestation = {
        ...attestation,
        nonce: reservation.nonce,
      };

      try {
        const signature = await this.signer.signTypedData(
          this.domain,
          ENERGY_ATTESTATION_TYPES,
          attWithNonce
        );
        const receipt = await retry(
          async () => await this.sender.send(attWithNonce, signature),
          this.config.maxRetries,
          this.config.retryDelayMs
        );
        processed += 1;
        console.info(
          'Submitted energy attestation',
          JSON.stringify({
            ...serializeAttestation(attWithNonce),
            target: receipt.reference,
          })
        );
        this.nonceProvider.confirm(reservation);
        this.state.markProcessed(key, lastTimestamp);
        if (this.sender.type === 'api') {
          await this.state.save();
        }
      } catch (err) {
        console.error(
          'Failed to submit energy attestation',
          {
            jobId: log.jobId,
            user: attestation.user,
            nonce: attWithNonce.nonce.toString(),
          },
          err
        );
        this.nonceProvider.release(reservation);
        if (this.sender.type === 'api') {
          await this.state.save();
        }
      }
    }

    if (processed > 0 && this.sender.type === 'contract') {
      await this.state.save();
    }
  }

  private async collectLogs(): Promise<LocalJobLog[]> {
    const logs: LocalJobLog[] = [];
    let entries: Dirent[];
    try {
      entries = await fs.readdir(this.config.energyLogDir, {
        withFileTypes: true,
      });
    } catch (err) {
      const error = err as NodeJS.ErrnoException;
      if (error.code === 'ENOENT') {
        return [];
      }
      throw err;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const agentDir = path.join(this.config.energyLogDir, entry.name);
      let files: string[];
      try {
        files = await fs.readdir(agentDir);
      } catch (err) {
        console.warn('Unable to read agent directory', agentDir, err);
        continue;
      }
      for (const file of files) {
        if (!file.endsWith('.json')) continue;
        const filePath = path.join(agentDir, file);
        try {
          const raw = await fs.readFile(filePath, 'utf8');
          if (!raw.trim()) continue;
          const parsed = JSON.parse(raw) as JobEnergyLog;
          const normalised = normaliseEnergyLog(parsed);
          if (!normalised) {
            console.warn('Skipping malformed energy log', filePath);
            continue;
          }
          logs.push({ filePath, log: normalised });
        } catch (err) {
          console.warn('Failed to parse energy log', filePath, err);
        }
      }
    }

    logs.sort((a, b) => {
      const aTime = Date.parse(a.log.summary?.lastUpdated ?? '');
      const bTime = Date.parse(b.log.summary?.lastUpdated ?? '');
      if (Number.isNaN(aTime) && Number.isNaN(bTime)) return 0;
      if (Number.isNaN(aTime)) return 1;
      if (Number.isNaN(bTime)) return -1;
      return aTime - bTime;
    });

    return logs;
  }

  private createAttestation(
    log: JobEnergyLog
  ): Omit<EnergyOracleAttestation, 'nonce'> | null {
    const user = normalizeAddress(log.agent);
    if (!user) return null;

    const jobId = parseBigInt(log.jobId);
    if (jobId === null) {
      console.warn('Skipping log with non-numeric jobId', log.jobId);
      return null;
    }

    const summary = log.summary;
    const energyScore = BigInt(
      Math.max(0, Math.round(summary.energyScore * this.config.energyScaling))
    );
    const degeneracy = BigInt(Math.max(1, summary.runs));
    const parsedUpdatedAt = Date.parse(summary.lastUpdated ?? '');
    const updatedAtMs = Number.isNaN(parsedUpdatedAt)
      ? Date.now()
      : parsedUpdatedAt;
    const nowSeconds = Math.floor(Date.now() / 1000);
    const epochSeconds = Math.floor(updatedAtMs / 1000);
    const epochBase = Math.floor(
      epochSeconds / Math.max(1, this.config.epochDurationSec)
    );
    const epochId = BigInt(Math.max(0, epochBase));
    const deadline = BigInt(nowSeconds + this.config.deadlineBufferSec);
    const cpuEnergy = Math.max(0, Math.round(summary.totalCpuTimeMs));
    const gpuEnergy = Math.max(0, Math.round(summary.totalGpuTimeMs));
    const uPre = BigInt(cpuEnergy);
    const uPost = BigInt(cpuEnergy + gpuEnergy);
    const value = BigInt(
      Math.max(
        0,
        Math.round(summary.averageEfficiency * this.config.valueScaling)
      )
    );

    return {
      jobId,
      user,
      energy: energyScore,
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

async function instantiateTelemetryService(
  config: TelemetryConfig
): Promise<TelemetryService> {
  const baseSigner = new ethers.Wallet(config.signerKey);
  let chainId = config.chainId;
  const state = new TelemetryState(config.stateFile);
  let sender: OracleSender;
  let nonceProvider: NonceProvider;

  if (config.mode === 'contract') {
    if (!config.rpcUrl) {
      throw new Error(
        'ENERGY_ORACLE_RPC_URL must be provided in contract mode'
      );
    }
    const connection = new OracleConnectionManager(
      config.rpcUrl,
      config.energyOracleAddress,
      baseSigner
    );
    if (!chainId) {
      const network = await connection.getProvider().getNetwork();
      chainId = Number(network.chainId);
    }
    sender = new ContractOracleSender(connection);
    nonceProvider = new ContractNonceProvider(connection);
  } else {
    if (!config.apiUrl) {
      throw new Error('ENERGY_ORACLE_API_URL must be provided in API mode');
    }
    if (!chainId) {
      throw new Error('ENERGY_ORACLE_CHAIN_ID is required when using API mode');
    }
    sender = new ApiOracleSender(config.apiUrl, config.apiToken);
    nonceProvider = new ApiNonceProvider(state);
  }

  if (!chainId) {
    throw new Error('Unable to determine chain ID for typed data domain');
  }

  const domain: ethers.TypedDataDomain = {
    name: 'EnergyOracle',
    version: '1',
    chainId,
    verifyingContract: config.energyOracleAddress,
  };

  const runtimeConfig: TelemetryConfig = { ...config, chainId };
  return new TelemetryService(
    runtimeConfig,
    state,
    baseSigner,
    domain,
    nonceProvider,
    sender
  );
}

export async function createTelemetryService(
  override?: Partial<TelemetryConfig>
): Promise<TelemetryService> {
  const base = await loadConfig();
  const merged = override ? { ...base, ...override } : base;
  return instantiateTelemetryService(merged);
}

async function main(): Promise<void> {
  try {
    const service = await instantiateTelemetryService(await loadConfig());

    process.on('SIGINT', () => {
      console.info('Received SIGINT, shutting down telemetry service');
      service.stop();
    });
    process.on('SIGTERM', () => {
      console.info('Received SIGTERM, shutting down telemetry service');
      service.stop();
    });

    await service.start();
  } catch (err) {
    console.error('Telemetry service failed to start', err);
    process.exitCode = 1;
  }
}

if (require.main === module) {
  void main();
}

export { TelemetryService, loadConfig as loadTelemetryConfig };
export type { TelemetryConfig, EnergyOracleAttestation };
