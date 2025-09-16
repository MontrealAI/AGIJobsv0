import { ethers, Contract, Wallet, JsonRpcProvider } from 'ethers';
import { WebSocketServer, WebSocket } from 'ws';
import agialpha from '../config/agialpha.json';
import WalletManager from './wallet';
import { Job, AgentInfo, CommitData } from './types';

// Environment configuration
export const RPC_URL = process.env.RPC_URL || 'http://localhost:8545';
export const JOB_REGISTRY_ADDRESS = process.env.JOB_REGISTRY_ADDRESS || '';
export const STAKE_MANAGER_ADDRESS = process.env.STAKE_MANAGER_ADDRESS || '';
export const VALIDATION_MODULE_ADDRESS =
  process.env.VALIDATION_MODULE_ADDRESS || '';
export const KEYSTORE_URL = process.env.KEYSTORE_URL || '';
export const KEYSTORE_TOKEN = process.env.KEYSTORE_TOKEN || '';
export const BOT_WALLET = process.env.BOT_WALLET || '';
export const ORCHESTRATOR_WALLET = process.env.ORCHESTRATOR_WALLET || '';
export const FETCH_TIMEOUT_MS = Number(process.env.FETCH_TIMEOUT_MS || '5000');
export const PORT = Number(process.env.PORT || 3000);

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
  if (!KEYSTORE_URL) {
    throw new Error('KEYSTORE_URL is required');
  }
  try {
    new URL(KEYSTORE_URL);
  } catch {
    throw new Error(`KEYSTORE_URL is malformed: ${KEYSTORE_URL}`);
  }
}

validateEnvConfig();

// $AGIALPHA token parameters
const { address: AGIALPHA_ADDRESS, decimals: AGIALPHA_DECIMALS } = agialpha;
export const TOKEN_DECIMALS = AGIALPHA_DECIMALS;
export const GATEWAY_API_KEY = process.env.GATEWAY_API_KEY || '';
export const AUTH_MESSAGE = 'Agent Gateway Auth';

// Provider and contracts
export const provider: JsonRpcProvider = new ethers.JsonRpcProvider(RPC_URL);

// Minimal ABI for JobRegistry interactions
const JOB_REGISTRY_ABI = [
  'event JobCreated(uint256 indexed jobId, address indexed employer, address indexed agent, uint256 reward, uint256 stake, uint256 fee, bytes32 specHash, string uri)',
  'event JobApplied(uint256 indexed jobId, address indexed agent, string subdomain)',
  'event JobSubmitted(uint256 indexed jobId, address indexed worker, bytes32 resultHash, string resultURI, string subdomain)',
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

// In-memory stores
export const jobs = new Map<string, Job>();
export const agents = new Map<string, AgentInfo>();
export const commits = new Map<string, Record<string, CommitData>>();
export const pendingJobs = new Map<string, Job[]>();
export const jobTimestamps = new Map<string, number>();
export const STALE_JOB_MS = Number(process.env.STALE_JOB_MS || 60 * 60 * 1000); // 1 hour
const SWEEP_INTERVAL_MS = Number(process.env.SWEEP_INTERVAL_MS || 60 * 1000); // 1 minute
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
    return data.keys || [];
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
    walletManager = new WalletManager(keys.join(','), provider);
    if (BOT_WALLET) {
      automationWallet = walletManager.get(BOT_WALLET);
    } else {
      const [first] = walletManager.list();
      if (first) automationWallet = walletManager.get(first);
    }
    if (ORCHESTRATOR_WALLET) {
      orchestratorWallet = walletManager.get(ORCHESTRATOR_WALLET);
    } else {
      orchestratorWallet = automationWallet;
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
      ['function decimals() view returns (uint8)'],
      provider
    );
    const chainDecimals = await token.decimals();
    if (Number(chainDecimals) !== Number(TOKEN_DECIMALS)) {
      throw new Error(
        `AGIALPHA decimals mismatch: config ${TOKEN_DECIMALS} vs chain ${chainDecimals}`
      );
    }
  } catch (err: any) {
    throw new Error(`Unable to verify AGIALPHA token decimals: ${err.message}`);
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

export async function commitHelper(
  jobId: string,
  wallet: Wallet,
  approve: boolean
): Promise<{ tx: string; salt: string }> {
  if (!validation) throw new Error('validation module not configured');
  await checkEnsSubdomain(wallet.address);
  const nonce = await validation.jobNonce(jobId);
  const salt = ethers.hexlify(ethers.randomBytes(32));
  const commitHash = ethers.solidityPackedKeccak256(
    ['uint256', 'uint256', 'bool', 'bytes32'],
    [BigInt(jobId), nonce, approve, salt]
  );
  const tx = await (validation as any)
    .connect(wallet)
    .commitValidation(jobId, commitHash, '', []);
  await tx.wait();
  if (!commits.has(jobId)) commits.set(jobId, {});
  const jobCommits = commits.get(jobId)!;
  jobCommits[wallet.address.toLowerCase()] = { approve, salt };
  return { tx: tx.hash, salt };
}

export async function revealHelper(
  jobId: string,
  wallet: Wallet
): Promise<{ tx: string }> {
  if (!validation) throw new Error('validation module not configured');
  const jobCommits = commits.get(jobId) || {};
  const data = jobCommits[wallet.address.toLowerCase()];
  if (!data) throw new Error('no commit found');
  await checkEnsSubdomain(wallet.address);
  const tx = await (validation as any)
    .connect(wallet)
    .revealValidation(jobId, data.approve, data.salt, '', []);
  await tx.wait();
  delete jobCommits[wallet.address.toLowerCase()];
  return { tx: tx.hash };
}
