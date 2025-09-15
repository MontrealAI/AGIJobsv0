// Minimal agent gateway that listens for job events and auto-applies
// Usage: node examples/agent-gateway.js
// Requires RPC_URL, PRIVATE_KEY, JOB_REGISTRY and STAKE_MANAGER env vars.

const { ethers } = require('ethers');

// Canonical $AGIALPHA token uses fixed decimal configuration
const {
  address: AGIALPHA_ADDRESS,
  decimals: AGIALPHA_DECIMALS,
} = require('../config/agialpha.json');

const TOKEN_DECIMALS = AGIALPHA_DECIMALS;

const RPC_URL = process.env.RPC_URL || 'http://localhost:8545';
const JOB_REGISTRY = process.env.JOB_REGISTRY;
const STAKE_MANAGER =
  process.env.STAKE_MANAGER || process.env.STAKE_MANAGER_ADDRESS;
const ORCHESTRATOR_ENDPOINT =
  process.env.ORCHESTRATOR_ENDPOINT || process.env.ORCHESTRATOR_CALLBACK;
const ORCHESTRATOR_TIMEOUT_MS = Number(
  process.env.ORCHESTRATOR_TIMEOUT_MS || '5000'
);

if (!JOB_REGISTRY) {
  console.error('Set JOB_REGISTRY env variable');
  process.exit(1);
}

if (!process.env.PRIVATE_KEY) {
  console.error('Set PRIVATE_KEY env variable');
  process.exit(1);
}

if (!STAKE_MANAGER) {
  console.error('Set STAKE_MANAGER or STAKE_MANAGER_ADDRESS env variable');
  process.exit(1);
}

if (!ethers.isAddress(JOB_REGISTRY)) {
  console.error('JOB_REGISTRY must be a checksummed address');
  process.exit(1);
}

if (!ethers.isAddress(STAKE_MANAGER)) {
  console.error('STAKE_MANAGER must be a checksummed address');
  process.exit(1);
}

const provider = new ethers.JsonRpcProvider(RPC_URL);
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

const REGISTRY_ABI = [
  'event JobCreated(uint256 indexed jobId, address indexed employer, address indexed agent, uint256 reward, uint256 stake, uint256 fee, bytes32 specHash, string uri)',
  'function applyForJob(uint256 jobId, string subdomain, bytes32[] proof) external',
];

const ERC20_ABI = ['function balanceOf(address owner) view returns (uint256)'];

const STAKE_MANAGER_ABI = [
  'function stakeOf(address user, uint8 role) view returns (uint256)',
  'function lockedStakes(address user) view returns (uint256)',
];

const registry = new ethers.Contract(JOB_REGISTRY, REGISTRY_ABI, wallet);
const stakeManager = new ethers.Contract(
  STAKE_MANAGER,
  STAKE_MANAGER_ABI,
  provider
);
const stakingToken = new ethers.Contract(AGIALPHA_ADDRESS, ERC20_ABI, provider);

let cachedIdentity;
let identityWarningShown = false;

function formatAmount(value) {
  try {
    return ethers.formatUnits(value, TOKEN_DECIMALS);
  } catch {
    return value.toString();
  }
}

async function resolveEnsIdentity(address) {
  try {
    const name = await provider.lookupAddress(address);
    if (!name) return null;
    const suffixes = ['.agent.agi.eth', '.club.agi.eth'];
    for (const suffix of suffixes) {
      if (!name.endsWith(suffix)) continue;
      const prefix = name.slice(0, -suffix.length);
      if (!prefix || prefix.includes('.')) continue;
      return { label: prefix, name };
    }
    return null;
  } catch (err) {
    console.warn('ENS lookup failed', err);
    return null;
  }
}

async function getEnsIdentity(address = wallet.address) {
  const identity = await resolveEnsIdentity(address);
  if (!identity) {
    if (!identityWarningShown) {
      console.warn(
        'No valid *.agent.agi.eth or *.club.agi.eth subdomain detected for this address. See docs/ens-identity-setup.md'
      );
      identityWarningShown = true;
    }
    cachedIdentity = undefined;
    return null;
  }
  identityWarningShown = false;
  if (!cachedIdentity || cachedIdentity.name !== identity.name) {
    console.log(`Resolved ENS identity ${identity.name}`);
  }
  cachedIdentity = identity;
  return identity;
}

async function getTokenBalance(address) {
  try {
    const balance = await stakingToken.balanceOf(address);
    return BigInt(balance.toString());
  } catch (err) {
    console.warn('Token balance query failed', err);
    return 0n;
  }
}

async function getStakeStatus(address) {
  const roles = [0, 1, 2];
  let total = 0n;
  for (const role of roles) {
    try {
      const stake = await stakeManager.stakeOf(address, role);
      total += BigInt(stake.toString());
    } catch (err) {
      console.warn(`stakeOf query failed for role ${role}`, err);
    }
  }
  let locked = 0n;
  try {
    const value = await stakeManager.lockedStakes(address);
    locked = BigInt(value.toString());
  } catch (err) {
    console.warn('lockedStakes query failed', err);
  }
  const available = total > locked ? total - locked : 0n;
  return { total, locked, available };
}

function normalizeProofValue(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const hex = trimmed.startsWith('0x') ? trimmed : `0x${trimmed}`;
  if (!ethers.isHexString(hex)) {
    console.warn('Ignoring non-hex proof entry', value);
    return null;
  }
  return hex;
}

function normalizeProof(proof) {
  if (!proof) return [];
  if (Array.isArray(proof)) {
    return proof
      .map((entry) => normalizeProofValue(entry))
      .filter((entry) => entry !== null);
  }
  if (typeof proof === 'string') {
    const trimmed = proof.trim();
    if (!trimmed || trimmed === '0x' || trimmed === '[]') return [];
    if (trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          return parsed
            .map((entry) => normalizeProofValue(entry))
            .filter((entry) => entry !== null);
        }
      } catch (err) {
        console.warn('Failed to parse proof JSON', err);
        return [];
      }
    }
    const single = normalizeProofValue(trimmed);
    return single ? [single] : [];
  }
  console.warn('Unsupported proof format from orchestrator; ignoring proof');
  return [];
}

function extractProof(payload) {
  if (!payload || typeof payload !== 'object') return [];
  const candidate =
    payload.proof ??
    payload.proofs ??
    payload.merkleProof ??
    payload.merkle_proof ??
    payload.identityProof;
  return normalizeProof(candidate);
}

function extractDecision(payload) {
  if (!payload || typeof payload !== 'object') return true;
  const keys = ['apply', 'shouldApply', 'accept', 'allow', 'ok'];
  for (const key of keys) {
    if (typeof payload[key] === 'boolean') return payload[key];
  }
  return true;
}

async function orchestratorCallback(job) {
  if (!ORCHESTRATOR_ENDPOINT) {
    return { shouldApply: true, proof: [] };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ORCHESTRATOR_TIMEOUT_MS);
  try {
    const res = await fetch(ORCHESTRATOR_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ agent: wallet.address, job }),
      signal: controller.signal,
    });
    if (!res.ok) {
      console.warn(
        `Orchestrator callback responded with HTTP ${res.status} ${res.statusText}`
      );
      return { shouldApply: false, proof: [] };
    }
    let payload = {};
    const text = await res.text();
    if (text) {
      try {
        payload = JSON.parse(text);
      } catch (err) {
        console.warn('Failed to parse orchestrator response JSON', err);
        payload = {};
      }
    }
    return {
      shouldApply: extractDecision(payload),
      proof: extractProof(payload),
    };
  } catch (err) {
    if (err.name === 'AbortError') {
      console.warn('Orchestrator callback timed out');
    } else {
      console.error('Failed to invoke orchestrator callback', err);
    }
    return { shouldApply: false, proof: [] };
  } finally {
    clearTimeout(timer);
  }
}

function buildJobPayload(
  jobId,
  employer,
  agent,
  reward,
  stake,
  fee,
  specHash,
  uri
) {
  return {
    jobId: jobId.toString(),
    employer,
    agent,
    reward: reward.toString(),
    rewardFormatted: formatAmount(reward),
    stake: stake.toString(),
    stakeFormatted: formatAmount(stake),
    fee: fee.toString(),
    feeFormatted: formatAmount(fee),
    specHash,
    uri,
  };
}

getEnsIdentity().catch(() => undefined);

console.log('Agent wallet', wallet.address);
console.log('Listening for jobs...');

registry.on(
  'JobCreated',
  async (jobId, employer, agent, reward, stake, fee, specHash, uri) => {
    const payload = buildJobPayload(
      jobId,
      employer,
      agent,
      reward,
      stake,
      fee,
      specHash,
      uri
    );
    console.log('JobCreated', payload);

    if (agent !== ethers.ZeroAddress) {
      return;
    }

    const decision = await orchestratorCallback(payload);
    if (!decision.shouldApply) {
      console.log(`Skipping job ${payload.jobId} per orchestrator decision`);
      return;
    }

    const identity = await getEnsIdentity();
    if (!identity) return;

    const stakeRequired = BigInt(stake.toString());
    const [stakeStatus, tokenBalance] = await Promise.all([
      getStakeStatus(wallet.address),
      getTokenBalance(wallet.address),
    ]);

    console.log(
      `Stake totals - total: ${formatAmount(
        stakeStatus.total
      )}, locked: ${formatAmount(
        stakeStatus.locked
      )}, available: ${formatAmount(stakeStatus.available)}`
    );
    console.log(
      `Token balance ${formatAmount(
        tokenBalance
      )} $AGIALPHA (required stake ${formatAmount(stakeRequired)})`
    );

    if (stakeRequired > 0n && stakeStatus.available < stakeRequired) {
      console.warn(
        `Insufficient available stake for job ${
          payload.jobId
        }. Required ${formatAmount(stakeRequired)}, available ${formatAmount(
          stakeStatus.available
        )}`
      );
      return;
    }

    if (stakeRequired > 0n && tokenBalance < stakeRequired) {
      console.warn(
        `Token balance below required stake for job ${payload.jobId}; replenish stake when convenient`
      );
    }

    const proof = normalizeProof(decision.proof);

    try {
      console.log(
        `Applying for job ${payload.jobId} with reward ${payload.rewardFormatted} using ENS label ${identity.label}`
      );
      const tx = await registry.applyForJob(jobId, identity.label, proof);
      const receipt = await tx.wait();
      console.log(`Applied in tx ${receipt?.hash ?? tx.hash}`);
    } catch (err) {
      console.error('applyForJob failed', err);
    }
  }
);
