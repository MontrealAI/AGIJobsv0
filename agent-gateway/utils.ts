import { ethers, Contract, Wallet, JsonRpcProvider } from 'ethers';
import { WebSocketServer, WebSocket } from 'ws';
import { loadTokenConfig } from '../scripts/config';
import WalletManager from './wallet';
import { Job, AgentInfo, CommitData } from './types';
import { loadCommitRecord, updateCommitRecord } from './validationStore';

const DEFAULT_RPC_URL = 'http://localhost:8545';
const ALLOWED_RPC_PROTOCOLS = new Set(['http:', 'https:', 'ws:', 'wss:']);
const ALLOWED_KEYSTORE_PROTOCOLS = new Set(['http:', 'https:']);

function readEnv(name: string): string | undefined {
  const value = process.env[name];
  if (value === undefined) {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function resolveRpcUrl(raw?: string): string {
  const candidate = raw && raw.length > 0 ? raw : DEFAULT_RPC_URL;
  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch (err) {
    throw new Error(`RPC_URL must be a valid URL: ${(err as Error).message}`);
  }
  if (!ALLOWED_RPC_PROTOCOLS.has(parsed.protocol)) {
    throw new Error(
      `RPC_URL must use HTTP(S) or WS(S); received protocol ${parsed.protocol}`
    );
  }
  return candidate;
}

function parseIntegerEnv(
  name: string,
  defaultValue: number,
  { min, max }: { min?: number; max?: number } = {}
): number {
  const raw = readEnv(name);
  const value = raw === undefined ? defaultValue : Number(raw);
  if (!Number.isFinite(value) || !Number.isInteger(value)) {
    throw new Error(`${name} must be an integer value`);
  }
  if (min !== undefined && value < min) {
    throw new Error(`${name} must be greater than or equal to ${min}`);
  }
  if (max !== undefined && value > max) {
    throw new Error(`${name} must be less than or equal to ${max}`);
  }
  return value;
}

// Environment configuration
export const RPC_URL = resolveRpcUrl(readEnv('RPC_URL'));
export const JOB_REGISTRY_ADDRESS = readEnv('JOB_REGISTRY_ADDRESS') || '';
export const STAKE_MANAGER_ADDRESS = readEnv('STAKE_MANAGER_ADDRESS') || '';
export const VALIDATION_MODULE_ADDRESS =
  readEnv('VALIDATION_MODULE_ADDRESS') || '';
export const DISPUTE_MODULE_ADDRESS = readEnv('DISPUTE_MODULE_ADDRESS') || '';
export const KEYSTORE_URL = readEnv('KEYSTORE_URL') || '';
export const KEYSTORE_TOKEN = readEnv('KEYSTORE_TOKEN') || '';
export const BOT_WALLET = readEnv('BOT_WALLET') || '';
export const ORCHESTRATOR_WALLET = readEnv('ORCHESTRATOR_WALLET') || '';
export const FETCH_TIMEOUT_MS = parseIntegerEnv('FETCH_TIMEOUT_MS', 5000, {
  min: 1,
});
export const PORT = parseIntegerEnv('PORT', 3000, { min: 1, max: 65535 });
export const GRPC_PORT = parseIntegerEnv('GRPC_PORT', 50051, {
  min: 0,
  max: 65535,
});

const STALE_JOB_FLOOR_MS = 60 * 1000;
const SWEEP_INTERVAL_FLOOR_MS = 1000;

export interface SaveWalletKeyOptions {
  address?: string;
  label?: string;
  metadata?: Record<string, unknown>;
  retry?: boolean;
}

type KeystoreMethod = 'POST' | 'PUT';

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function sanitisePayload(
  privateKey: string,
  options: SaveWalletKeyOptions
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    privateKey,
    address: options.address,
    label: options.label,
  };

  if (isObject(options.metadata)) {
    const metadataEntries = Object.entries(options.metadata).filter(
      ([, value]) => value !== undefined && value !== null
    );
    if (metadataEntries.length) {
      payload.metadata = Object.fromEntries(metadataEntries);
    }
  }

  return Object.fromEntries(
    Object.entries(payload).filter(([, value]) => value !== undefined)
  );
}

async function parseJsonBody(res: Response): Promise<Record<string, unknown>> {
  const text = await res.text();
  if (!text) {
    return {};
  }
  try {
    const data = JSON.parse(text);
    return isObject(data) ? data : {};
  } catch (err) {
    throw new Error('Keystore returned a non-JSON response');
  }
}

async function issueKeystoreRequest(
  method: KeystoreMethod,
  body: Record<string, unknown>,
  allowRetry: boolean
): Promise<Record<string, unknown>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    accept: 'application/json',
  };
  if (KEYSTORE_TOKEN) {
    headers.Authorization = `Bearer ${KEYSTORE_TOKEN}`;
  }

  try {
    const res = await fetch(KEYSTORE_URL, {
      method,
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (res.status === 405 || res.status === 501) {
      const error = new Error(
        `Keystore does not accept ${method} requests (HTTP ${res.status})`
      );
      (error as any).code = 'METHOD_NOT_ALLOWED';
      (error as any).status = res.status;
      throw error;
    }

    if (!res.ok) {
      let detail = '';
      try {
        const payload = await parseJsonBody(res);
        const message =
          (typeof payload.error === 'string' && payload.error) ||
          (typeof payload.message === 'string' && payload.message);
        if (message) {
          detail = `: ${message}`;
        }
      } catch (parseErr) {
        const fallback =
          parseErr instanceof Error ? parseErr.message : String(parseErr);
        detail = detail || `: ${fallback}`;
      }
      const error = new Error(
        `Keystore responded with HTTP ${res.status} ${res.statusText}${detail}`
      );
      (error as any).status = res.status;
      throw error;
    }

    if (res.status === 204) {
      return {};
    }

    return await parseJsonBody(res);
  } catch (err: any) {
    clearTimeout(timer);
    const isAbort = err?.name === 'AbortError';
    const isNetwork = err instanceof TypeError;
    if ((isAbort || isNetwork) && allowRetry) {
      console.warn(
        `Keystore ${method} request ${
          isAbort ? 'timed out' : 'failed'
        }, retrying once...`
      );
      return issueKeystoreRequest(method, body, false);
    }
    if (isAbort) {
      throw new Error('Keystore save request timed out');
    }
    throw err;
  }
}

export async function saveWalletKey(
  privateKey: string,
  options: SaveWalletKeyOptions = {}
): Promise<Record<string, unknown>> {
  if (!privateKey) {
    throw new Error('A private key is required to persist to the keystore');
  }
  if (!KEYSTORE_URL) {
    throw new Error('KEYSTORE_URL is required to save wallet keys.');
  }

  const payload = sanitisePayload(privateKey, options);
  const methods: KeystoreMethod[] = ['POST', 'PUT'];
  const retry = options.retry ?? true;
  let lastError: unknown;

  for (const method of methods) {
    try {
      return await issueKeystoreRequest(method, payload, retry);
    } catch (err: any) {
      if (err?.code === 'METHOD_NOT_ALLOWED' && method === 'POST') {
        console.warn('Keystore POST unsupported, retrying with PUT...');
        lastError = err;
        continue;
      }
      lastError = err;
      break;
    }
  }

  const message =
    lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(`Failed to persist wallet key to keystore: ${message}`);
}

function validateEnvConfig(): void {
  const checkAddress = (value: string, name: string): void => {
    if (!value) {
      throw new Error(`${name} is required`);
    }
    if (!ethers.isAddress(value)) {
      throw new Error(`${name} is not a valid address: ${value}`);
    }
  };
  checkAddress(JOB_REGISTRY_ADDRESS, 'JOB_REGISTRY_ADDRESS');
  if (STAKE_MANAGER_ADDRESS) {
    checkAddress(STAKE_MANAGER_ADDRESS, 'STAKE_MANAGER_ADDRESS');
  } else {
    console.warn(
      'STAKE_MANAGER_ADDRESS is not set; reward logging will be disabled.'
    );
  }
  checkAddress(VALIDATION_MODULE_ADDRESS, 'VALIDATION_MODULE_ADDRESS');
  if (DISPUTE_MODULE_ADDRESS) {
    checkAddress(DISPUTE_MODULE_ADDRESS, 'DISPUTE_MODULE_ADDRESS');
  }
  if (BOT_WALLET && !ethers.isAddress(BOT_WALLET)) {
    throw new Error(`BOT_WALLET is not a valid address: ${BOT_WALLET}`);
  }
  if (ORCHESTRATOR_WALLET && !ethers.isAddress(ORCHESTRATOR_WALLET)) {
    throw new Error(
      `ORCHESTRATOR_WALLET is not a valid address: ${ORCHESTRATOR_WALLET}`
    );
  }
  if (!KEYSTORE_URL) {
    throw new Error('KEYSTORE_URL is required');
  }
  try {
    const parsed = new URL(KEYSTORE_URL);
    if (!ALLOWED_KEYSTORE_PROTOCOLS.has(parsed.protocol)) {
      throw new Error(
        `KEYSTORE_URL must use HTTP(S); received protocol ${parsed.protocol}`
      );
    }
  } catch (err) {
    throw new Error(
      `KEYSTORE_URL is malformed: ${(err as Error).message || KEYSTORE_URL}`
    );
  }
}

validateEnvConfig();

// $AGIALPHA token parameters
const { config: agialpha } = loadTokenConfig({
  network: process.env.AGIALPHA_NETWORK || process.env.NETWORK,
});

const {
  address: AGIALPHA_ADDRESS_INTERNAL,
  decimals: AGIALPHA_DECIMALS,
  symbol: AGIALPHA_SYMBOL,
  name: AGIALPHA_NAME,
} = agialpha;
export const AGIALPHA_ADDRESS = AGIALPHA_ADDRESS_INTERNAL;
if (AGIALPHA_SYMBOL.trim().length === 0) {
  throw new Error('config/agialpha.json is missing token symbol');
}
if (AGIALPHA_NAME.trim().length === 0) {
  throw new Error('config/agialpha.json is missing token name');
}
export const TOKEN_DECIMALS = AGIALPHA_DECIMALS;
export const GATEWAY_API_KEY = process.env.GATEWAY_API_KEY || '';
export const AUTH_MESSAGE = 'Agent Gateway Auth';

// Provider and contracts
export const provider: JsonRpcProvider = new ethers.JsonRpcProvider(RPC_URL);

// Minimal ABI for JobRegistry interactions
const JOB_REGISTRY_ABI = [
  'event JobCreated(uint256 indexed jobId, address indexed employer, address indexed agent, uint256 reward, uint256 stake, uint256 fee, bytes32 specHash, string uri)',
  'event ApplicationSubmitted(uint256 indexed jobId, address indexed applicant, string subdomain)',
  'event AgentAssigned(uint256 indexed jobId, address indexed agent, string subdomain)',
  'event ResultSubmitted(uint256 indexed jobId, address indexed worker, bytes32 resultHash, string resultURI, string subdomain)',
  'function applyForJob(uint256 jobId, string subdomain, bytes proof) external',
  'function createJob(uint256 reward, uint64 deadline, bytes32 specHash, string uri) external returns (uint256)',
  'function submit(uint256 jobId, bytes32 resultHash, string resultURI, string subdomain, bytes proof) external',
  'function finalizeJob(uint256 jobId, string resultRef) external',
  'function acknowledgeTaxPolicy() external returns (string)',
  'function cancelExpiredJob(uint256 jobId) external',
  'function taxPolicy() view returns (address)',
  'function jobs(uint256 jobId) view returns (address employer,address agent,uint128 reward,uint96 stake,uint32 feePct,uint8 state,bool success,uint8 agentTypes,uint64 deadline,uint64 assignedAt,bytes32 uriHash,bytes32 resultHash)',
  'function expirationGracePeriod() view returns (uint256)',
  'function nextJobId() view returns (uint256)',
];

const STAKE_MANAGER_ABI = [
  'event RewardPaid(bytes32 indexed jobId,address indexed to,uint256 amount)',
  'function stake(uint8 role, uint256 amount)',
  'function depositStake(uint8 role, uint256 amount)',
  'function stakeOf(address user, uint8 role) view returns (uint256)',
  'function minStake() view returns (uint256)',
  'function requestWithdraw(uint8 role, uint256 amount)',
  'function finalizeWithdraw(uint8 role)',
  'function withdrawStake(uint8 role, uint256 amount)',
  'function acknowledgeAndWithdraw(uint8 role, uint256 amount)',
];

// Minimal ABI for ValidationModule interactions
const VALIDATION_MODULE_ABI = [
  'function jobNonce(uint256 jobId) view returns (uint256)',
  'function commitValidation(uint256 jobId, bytes32 commitHash, string subdomain, bytes32[] proof)',
  'function revealValidation(uint256 jobId, bool approve, bytes32 salt, string subdomain, bytes32[] proof)',
  'function finalize(uint256 jobId) external returns (bool)',
  'function rounds(uint256 jobId) view returns (address[] validators,address[] participants,uint256 commitDeadline,uint256 revealDeadline,uint256 approvals,uint256 rejections,bool tallied,uint256 committeeSize)',
  'event ValidatorsSelected(uint256 indexed jobId, address[] validators)',
];

const DISPUTE_MODULE_ABI = [
  'event DisputeRaised(uint256 indexed jobId, address indexed claimant, bytes32 indexed evidenceHash)',
  'event DisputeResolved(uint256 indexed jobId, address indexed resolver, bool employerWins)',
  'function disputes(uint256 jobId) view returns (tuple(address claimant,uint256 raisedAt,bool resolved,uint256 fee,bytes32 evidenceHash))',
];

export const registry = new Contract(
  JOB_REGISTRY_ADDRESS,
  JOB_REGISTRY_ABI,
  provider
);
export const validation = VALIDATION_MODULE_ADDRESS
  ? new Contract(VALIDATION_MODULE_ADDRESS, VALIDATION_MODULE_ABI, provider)
  : null;
export const stakeManager = STAKE_MANAGER_ADDRESS
  ? new Contract(STAKE_MANAGER_ADDRESS, STAKE_MANAGER_ABI, provider)
  : null;
export const dispute = DISPUTE_MODULE_ADDRESS
  ? new Contract(DISPUTE_MODULE_ADDRESS, DISPUTE_MODULE_ABI, provider)
  : null;

// In-memory stores
export const jobs = new Map<string, Job>();
export const agents = new Map<string, AgentInfo>();
export const commits = new Map<string, Record<string, CommitData>>();
export const pendingJobs = new Map<string, Job[]>();
export const jobTimestamps = new Map<string, number>();
export const STALE_JOB_MS = parseIntegerEnv('STALE_JOB_MS', 60 * 60 * 1000, {
  min: STALE_JOB_FLOOR_MS,
}); // 1 hour default, floor at 1 minute
const SWEEP_INTERVAL_MS = parseIntegerEnv('SWEEP_INTERVAL_MS', 60 * 1000, {
  min: SWEEP_INTERVAL_FLOOR_MS,
}); // 1 minute default
export function cleanupJob(jobId: string): void {
  if (expiryTimers.has(jobId)) {
    clearTimeout(expiryTimers.get(jobId)!);
    expiryTimers.delete(jobId);
  }
  if (finalizeTimers.has(jobId)) {
    clearTimeout(finalizeTimers.get(jobId)!);
    finalizeTimers.delete(jobId);
  }
  commits.delete(jobId);
  pendingJobs.forEach((queue, id) => {
    pendingJobs.set(
      id,
      queue.filter((j) => j.jobId !== jobId)
    );
  });
  jobs.delete(jobId);
}
export function sweepStaleJobs(now = Date.now()): void {
  for (const [jobId, ts] of jobTimestamps.entries()) {
    if (now - ts > STALE_JOB_MS) {
      cleanupJob(jobId);
      jobTimestamps.delete(jobId);
    }
  }
}
let sweeperInterval: NodeJS.Timeout;

export function startSweeper(): NodeJS.Timeout {
  sweeperInterval = setInterval(() => sweepStaleJobs(), SWEEP_INTERVAL_MS);
  return sweeperInterval;
}

export function stopSweeper(): void {
  if (sweeperInterval) clearInterval(sweeperInterval);
}
export const finalizeTimers = new Map<string, NodeJS.Timeout>();
export const expiryTimers = new Map<string, NodeJS.Timeout>();

export let walletManager: WalletManager;
export let automationWallet: Wallet | undefined;
export let orchestratorWallet: Wallet | undefined;

export async function loadWalletKeys(retry = true): Promise<string[]> {
  if (!KEYSTORE_URL) {
    throw new Error('KEYSTORE_URL is required to load wallet keys.');
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(KEYSTORE_URL, {
      headers: KEYSTORE_TOKEN
        ? { Authorization: `Bearer ${KEYSTORE_TOKEN}` }
        : {},
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    const data = await res.json();
    if (!data || !Array.isArray(data.keys)) {
      throw new Error('Keystore response missing keys array');
    }
    const keys = Array.isArray(data.keys) ? (data.keys as unknown[]) : [];
    return keys
      .filter((key: unknown): key is string => typeof key === 'string')
      .map((key: string) => key.trim())
      .filter((key: string) => key.length > 0);
  } catch (err: any) {
    clearTimeout(timer);
    if (err.name === 'AbortError' && retry) {
      console.warn('Keystore request timed out, retrying once...');
      return loadWalletKeys(false);
    }
    throw new Error(`Failed to load wallet keys: ${err.message}`);
  }
}

export async function initWallets(): Promise<void> {
  try {
    const keys = await loadWalletKeys();
    if (!keys || keys.length === 0) {
      throw new Error('Keystore returned no wallet keys');
    }

    walletManager = new WalletManager(keys.join(','), provider);

    const availableAddresses = walletManager.list();
    if (!availableAddresses || availableAddresses.length === 0) {
      throw new Error('No wallets were loaded from the provided keys');
    }

    if (BOT_WALLET) {
      const normalisedBot = ethers.getAddress(BOT_WALLET);
      automationWallet = walletManager.get(normalisedBot);
      if (!automationWallet) {
        throw new Error(
          `Configured BOT_WALLET ${normalisedBot} is missing from keystore`
        );
      }
    } else {
      const [first] = availableAddresses;
      automationWallet = first ? walletManager.get(first) : undefined;
    }

    if (!automationWallet) {
      throw new Error(
        'No automation wallet available; ensure the keystore contains at least one key or configure BOT_WALLET'
      );
    }

    if (ORCHESTRATOR_WALLET) {
      const normalisedOrchestrator = ethers.getAddress(ORCHESTRATOR_WALLET);
      orchestratorWallet = walletManager.get(normalisedOrchestrator);
      if (!orchestratorWallet) {
        throw new Error(
          `Configured ORCHESTRATOR_WALLET ${normalisedOrchestrator} is missing from keystore`
        );
      }
    } else {
      orchestratorWallet = automationWallet;
    }

    if (!orchestratorWallet) {
      throw new Error(
        'No orchestrator wallet available; configure ORCHESTRATOR_WALLET or BOT_WALLET so a wallet can be selected'
      );
    }
  } catch (err: any) {
    throw new Error(`Failed to initialize wallets: ${err.message}`);
  }
}

export async function checkEnsSubdomain(address: string): Promise<void> {
  try {
    const name = await provider.lookupAddress(address);
    if (
      name &&
      (name.endsWith('.agent.agi.eth') ||
        name.endsWith('.club.agi.eth') ||
        name.endsWith('.a.agi.eth')) &&
      name.split('.').length > 3
    ) {
      return;
    }
  } catch {
    // ignore lookup errors and fall through to warning
  }
  throw new Error(
    'No valid *.agent.agi.eth or *.club.agi.eth subdomain detected for this address. See docs/ens-identity-setup.md'
  );
}

export async function verifyTokenDecimals(): Promise<void> {
  try {
    const token = new Contract(
      AGIALPHA_ADDRESS,
      [
        'function decimals() view returns (uint8)',
        'function symbol() view returns (string)',
        'function name() view returns (string)',
      ],
      provider
    );
    const [chainDecimals, chainSymbol, chainName] = await Promise.all([
      token.decimals(),
      token.symbol(),
      token.name(),
    ]);
    if (Number(chainDecimals) !== Number(TOKEN_DECIMALS)) {
      throw new Error(
        `AGIALPHA decimals mismatch: config ${TOKEN_DECIMALS} vs chain ${chainDecimals}`
      );
    }
    if (
      typeof chainSymbol !== 'string' ||
      chainSymbol.trim() !== AGIALPHA_SYMBOL.trim()
    ) {
      throw new Error(
        `AGIALPHA symbol mismatch: config ${AGIALPHA_SYMBOL} vs chain ${chainSymbol}`
      );
    }
    if (
      typeof chainName !== 'string' ||
      chainName.trim() !== AGIALPHA_NAME.trim()
    ) {
      throw new Error(
        `AGIALPHA name mismatch: config ${AGIALPHA_NAME} vs chain ${chainName}`
      );
    }
  } catch (err: any) {
    throw new Error(`Unable to verify AGIALPHA token metadata: ${err.message}`);
  }
}

export function queueJob(id: string, job: Job): void {
  if (!pendingJobs.has(id)) pendingJobs.set(id, []);
  pendingJobs.get(id)!.push(job);
}

export async function scheduleExpiration(jobId: string): Promise<void> {
  if (!automationWallet) return;
  try {
    const job = await registry.jobs(jobId);
    const grace = await registry.expirationGracePeriod();
    const deadline = Number(job.deadline) + Number(grace);
    const delay = deadline - Math.floor(Date.now() / 1000);
    if (delay <= 0) {
      await expireJob(jobId);
    } else {
      if (expiryTimers.has(jobId)) clearTimeout(expiryTimers.get(jobId));
      expiryTimers.set(
        jobId,
        setTimeout(() => expireJob(jobId), delay * 1000)
      );
    }
  } catch (err) {
    console.error('scheduleExpiration error', err);
  }
}

export async function expireJob(jobId: string): Promise<void> {
  if (expiryTimers.has(jobId)) {
    clearTimeout(expiryTimers.get(jobId)!);
    expiryTimers.delete(jobId);
  }
  if (finalizeTimers.has(jobId)) {
    clearTimeout(finalizeTimers.get(jobId)!);
    finalizeTimers.delete(jobId);
  }
  if (!automationWallet) return;
  try {
    const signer = registry.connect(automationWallet) as any;
    const policy = await (registry as any).taxPolicy();
    if (policy !== ethers.ZeroAddress) {
      await signer.acknowledgeTaxPolicy();
    }
    const tx = await signer.cancelExpiredJob(jobId);
    await tx.wait();
    console.log('cancelExpired', jobId.toString(), tx.hash);
  } catch (err) {
    console.error('cancelExpired error', err);
  }
}

export async function scheduleFinalize(jobId: string): Promise<void> {
  if (!validation || !automationWallet) return;
  try {
    const round = await validation.rounds(jobId);
    const revealDeadline = Number(round[3] || round.revealDeadline);
    const delay = revealDeadline - Math.floor(Date.now() / 1000);
    if (delay <= 0) {
      await finalizeJob(jobId);
    } else {
      if (finalizeTimers.has(jobId)) clearTimeout(finalizeTimers.get(jobId));
      finalizeTimers.set(
        jobId,
        setTimeout(() => finalizeJob(jobId), delay * 1000)
      );
    }
  } catch (err) {
    console.error('scheduleFinalize error', err);
  }
}

export async function finalizeJob(jobId: string): Promise<void> {
  if (expiryTimers.has(jobId)) {
    clearTimeout(expiryTimers.get(jobId)!);
    expiryTimers.delete(jobId);
  }
  if (finalizeTimers.has(jobId)) {
    clearTimeout(finalizeTimers.get(jobId)!);
    finalizeTimers.delete(jobId);
  }
  if (!validation || !automationWallet) return;
  try {
    const tx = await (validation as any)
      .connect(automationWallet)
      .finalize(jobId);
    await tx.wait();
    console.log('validationFinalized', jobId.toString(), tx.hash);
  } catch (err) {
    console.error('finalize error', err);
  }
}

export function broadcast(
  wss: WebSocketServer | undefined,
  payload: any
): void {
  if (!wss) return;
  wss.clients.forEach((client: WebSocket) => {
    if (client.readyState === 1) {
      client.send(JSON.stringify(payload));
    }
  });
}

export function dispatch(wss: WebSocketServer | undefined, job: Job): void {
  agents.forEach((info, id) => {
    queueJob(id, job);
    if (info.ws && info.ws.readyState === 1) {
      info.ws.send(JSON.stringify({ type: 'job', job }));
    } else if (info.url) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
      fetch(info.url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(job),
        signal: controller.signal,
      })
        .catch((err) => {
          if ((err as any).name === 'AbortError') {
            console.warn(`dispatch to ${info.url} timed out; job queued`);
          } else {
            console.error('dispatch error', err);
          }
        })
        .finally(() => clearTimeout(timer));
    }
  });
}

function normaliseSalt(value: string): string {
  const candidate = value.startsWith('0x') ? value : `0x${value}`;
  const bytes = ethers.getBytes(candidate);
  if (bytes.length !== 32) {
    throw new Error('salt must be a 32-byte hex string');
  }
  return ethers.hexlify(bytes);
}

export async function commitHelper(
  jobId: string,
  wallet: Wallet,
  approve: boolean,
  saltOverride?: string
): Promise<{ tx: string; salt: string; commitHash: string }> {
  if (!validation) throw new Error('validation module not configured');
  await checkEnsSubdomain(wallet.address);
  const nonce = await validation.jobNonce(jobId);
  let salt: string;
  if (saltOverride) {
    try {
      salt = normaliseSalt(saltOverride);
    } catch (err: any) {
      throw new Error(`invalid salt provided: ${err?.message || err}`);
    }
  } else {
    salt = ethers.hexlify(ethers.randomBytes(32));
  }
  const jobBigInt = ethers.getBigInt(jobId);
  const nonceBigInt = ethers.getBigInt(nonce);
  const commitHash = ethers.solidityPackedKeccak256(
    ['uint256', 'uint256', 'bool', 'bytes32'],
    [jobBigInt, nonceBigInt, approve, salt]
  );
  const tx = await (validation as any)
    .connect(wallet)
    .commitValidation(jobId, commitHash, '', []);
  await tx.wait();
  if (!commits.has(jobId)) commits.set(jobId, {});
  const jobCommits = commits.get(jobId)!;
  jobCommits[wallet.address.toLowerCase()] = { approve, salt };

  let validatorEns: string | undefined;
  let validatorLabel: string | undefined;
  try {
    const lookup = await provider.lookupAddress(wallet.address);
    if (lookup) {
      validatorEns = lookup;
      validatorLabel = lookup.split('.')[0];
    }
  } catch (err) {
    console.warn('ENS lookup failed during commitHelper', err);
  }

  try {
    updateCommitRecord(jobId, wallet.address, {
      approve,
      salt,
      commitHash,
      commitTx: tx.hash,
      committedAt: new Date().toISOString(),
      validatorEns,
      validatorLabel,
    });
  } catch (err) {
    console.warn('failed to persist validator commit record', err);
  }

  return { tx: tx.hash, salt, commitHash };
}

export async function revealHelper(
  jobId: string,
  wallet: Wallet,
  approveOverride?: boolean,
  saltOverride?: string
): Promise<{ tx: string }> {
  if (!validation) throw new Error('validation module not configured');
  let jobCommits = commits.get(jobId);
  if (!jobCommits) {
    jobCommits = {};
    commits.set(jobId, jobCommits);
  }
  let data = jobCommits[wallet.address.toLowerCase()];
  let storedRecord = loadCommitRecord(jobId, wallet.address);
  if (!data && storedRecord) {
    data = {
      approve: storedRecord.approve,
      salt: storedRecord.salt,
    };
    jobCommits[wallet.address.toLowerCase()] = { ...data };
  }
  const approve =
    typeof approveOverride === 'boolean' ? approveOverride : data?.approve;
  const saltSource = saltOverride ?? data?.salt;
  if (approve === undefined || !saltSource) {
    throw new Error('no commit found');
  }
  let salt: string;
  try {
    salt = normaliseSalt(saltSource);
  } catch (err: any) {
    throw new Error(`invalid salt provided: ${err?.message || err}`);
  }
  await checkEnsSubdomain(wallet.address);
  const tx = await (validation as any)
    .connect(wallet)
    .revealValidation(jobId, approve, salt, '', []);
  await tx.wait();
  delete jobCommits[wallet.address.toLowerCase()];

  try {
    updateCommitRecord(jobId, wallet.address, {
      revealTx: tx.hash,
      revealedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.warn('failed to update validator commit record on reveal', err);
  }

  return { tx: tx.hash };
}
